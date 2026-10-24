import asyncio
import base64
import json
import time
from unicodedata import normalize
from uuid import uuid4
import httpx
import pymupdf as fitz
import pytest
from app import cv_rating,jobs,main,cv_ai,documents
from app.ai_provider import AIUnavailable
from app.config import settings
from app.cv_ai import Rewrite
from app.cv_pdf import render_cv
from app.schemas import CV,CVEntry,CVSection
from test_api import client


def criterion(key,score=77,ids=None):
    return {'parameter':key,'score':score,'explanation':'Specific source evidence supports this judgment.','evidence_line_ids':ids or []}


async def test_ai_assigns_scores_server_only_weights_and_sources(monkeypatch):
    async def result(*args,**kw):
        return cv_rating.Assessment(criteria=[criterion(key,77,[1]) for key in cv_rating.PARAMETERS],
            strengths=['Clear wording.'],suggestions=['Explain your contribution.'],summary='A specific assessment of this CV.')
    monkeypatch.setattr(cv_rating,'generate',result)
    rated=await cv_rating.assess_cv(CV(summary='Built a SQL dashboard.'),'user')
    assert rated['score']==77 and rated['analysis_mode']=='ai-rating'
    assert rated['breakdown'][0]['evidence']==['Built a SQL dashboard.']
    assert rated['rubric_version']==cv_rating.RUBRIC_VERSION and rated['rated_at']


@pytest.mark.parametrize('invalid',['duplicate','source'])
async def test_invalid_rubric_never_creates_replacement_score(monkeypatch,invalid):
    async def result(*args,**kw):
        criteria=[criterion(key,ids=[999] if invalid=='source' else []) for key in cv_rating.PARAMETERS]
        if invalid=='duplicate':criteria[-1]=criteria[0]
        return cv_rating.Assessment(criteria=criteria,strengths=['Good.'],suggestions=['Review.'],summary='Review source information.')
    monkeypatch.setattr(cv_rating,'generate',result)
    with pytest.raises(AIUnavailable):await cv_rating.assess_cv(CV(summary='SQL project.'),'user')


def test_primary_reader_never_uses_legacy_classifier(monkeypatch):
    def forbidden(*args):raise AssertionError('Legacy classifier must not run')
    monkeypatch.setattr(documents,'_classify_cv',forbidden)
    with fitz.open() as doc:
        doc.new_page().insert_text((50,50),'Example Learner\nSkills\nSQL')
        parsed=documents.parse_document(doc.tobytes(),'cv.pdf','application/pdf',True,True)
    assert parsed['cv']['skills']==[] and parsed['cv']['experience']=='' and parsed['_ai_source']['text']


def row(**values):
    return dict(job_title='Network Support',employer_name='Example Company',job_location='Malaysia',job_apply_link='https://example.org/jobs/1',job_description='Networking and SQL required.',**values)


def test_only_valid_real_source_rows_are_displayed():
    rows=[row(),row(),row(job_expiration_timestamp=time.time()-1),row()|{'job_apply_link':'javascript:alert(1)'},
          row()|{'job_apply_link':'https://127.0.0.1/private'},row()|{'job_title':''}]
    normalized=jobs.normalize_jobs(rows)
    assert len(normalized)==1 and normalized[0]['salary'] is None
    assert 'assessment' not in normalized[0]


async def test_search_uses_v2_envelope_cache_and_request_allowance(monkeypatch):
    calls=[]
    def handle(request):
        calls.append(request)
        assert request.headers['x-api-key']=='test-key-not-real'
        return httpx.Response(200,json={'data':{'jobs':[row()],'cursor':None}})
    original=httpx.AsyncClient
    monkeypatch.setattr(jobs.httpx,'AsyncClient',lambda **kw:original(transport=httpx.MockTransport(handle),**kw))
    first,cached=await jobs.fetch_jobs('network in Malaysia','my','user')
    second,cached2=await jobs.fetch_jobs('network in Malaysia','my','user')
    assert first==second and not cached and cached2 and len(calls)==1
    monkeypatch.setattr(settings,'jsearch_max_calls',1)
    with pytest.raises(Exception) as exc:await jobs.fetch_jobs('other query','my','user')
    assert exc.value.status_code==429 and len(calls)==1


async def test_job_scores_cannot_invent_ids_or_profile_skills(monkeypatch):
    source=jobs.normalize_jobs([row()]);job_id=source[0]['id']
    for identifier,skills in [('invented',[]),(job_id,['Python'])]:
        async def fake(*args,**kw):
            return jobs.JobFits(assessments=[jobs.JobFit(job_id=identifier,score=60,explanation='Source-based fit assessment.',matched_skills=skills,missing_requirements=[],unknowns=['Eligibility not checked.'])])
        monkeypatch.setattr(jobs,'generate',fake)
        with pytest.raises(AIUnavailable):await jobs.rate_jobs(source,CV(skills=['SQL']),{'badges':[]},'user')


async def test_jobs_are_owner_scoped_and_badges_invalidate_matching(client,monkeypatch):
    owner={'Authorization':f'Bearer {uuid4()}'};other={'Authorization':f'Bearer {uuid4()}'}
    awards=[];fetched=[]
    async def badges(*args):return awards
    async def provider(*args):
        fetched.append(args)
        return {'jobs':jobs.normalize_jobs([row()]),'query':'network Malaysia','country':'my','fetched_at':jobs.now(),'provider':'Test'},False
    async def ranking(rows,*args):
        return [item|{'assessment':{'score':60,'explanation':'Supported assessment.','matched_skills':['SQL'],'missing_requirements':[],'unknowns':[]}} for item in rows]
    monkeypatch.setattr(jobs,'account_badge_evidence',badges);monkeypatch.setattr(jobs,'fetch_jobs',provider);monkeypatch.setattr(jobs,'rate_jobs',ranking)
    await client.put('/api/v1/cv',headers=owner,json={'skills':['SQL']})
    assert (await client.post('/api/v1/jobs/search',json={'query':'network Malaysia'})).status_code==401
    response=await client.post('/api/v1/jobs/search',headers=owner,json={'query':'network Malaysia','auto_refresh':True})
    assert response.status_code==200,response.text
    assert (await client.get('/api/v1/jobs',headers=other)).json()['data']['search'] is None
    assert not (await client.get('/api/v1/jobs',headers=owner)).json()['data']['stale']
    awards.append({'badge_code':'FP-NEW','skills':[{'skill_id':'networking','level':'foundation'}]})
    assert (await client.get('/api/v1/jobs',headers=owner)).json()['data']['stale']
    refreshed=await client.post('/api/v1/jobs/rematch',headers=owner,json={})
    assert refreshed.status_code==200 and not refreshed.json()['data']['stale']
    assert len(fetched)==1  # Reassessment does not consume another job-search request.
    await client.post('/api/v1/jobs/pause-updates',headers=owner)
    assert not (await client.get('/api/v1/jobs',headers=owner)).json()['data']['search']['auto_refresh']


async def test_pdf_preview_does_not_save_and_obeys_ownership_and_versions(client,monkeypatch):
    owner={'Authorization':f'Bearer {uuid4()}'};other={'Authorization':f'Bearer {uuid4()}'}
    await client.put('/api/v1/cv',headers=owner,json={'name':'Example Candidate','summary':'Built 3 SQL dashboards.'})
    async def fake(*args,**kw):return Rewrite(changes=[{'field':'summary','before':'Built 3 SQL dashboards.','after':'Created 3 SQL dashboards.','reason':'Clearer wording.'}])
    monkeypatch.setattr(cv_ai,'generate',fake)
    preview=(await client.post('/api/v1/cv/ai/preview',headers=owner,json={'ai_consent':True,'fields':['summary']})).json()['data']
    body={'preview_id':preview['preview_id'],'fields':['summary'],'edits':{'summary':'Delivered 3 SQL dashboards.'}}
    assert (await client.post('/api/v1/cv/pdf',headers=other,json=body)).status_code==422
    response=await client.post('/api/v1/cv/pdf',headers=owner,json=body)
    assert response.status_code==200,response.text
    with fitz.open(stream=base64.b64decode(response.json()['data']['pdf_base64']),filetype='pdf') as document:
        assert 'Delivered 3 SQL dashboards.' in ''.join(page.get_text() for page in document)
    assert (await client.get('/api/v1/dashboard',headers=owner)).json()['data']['cv']['summary']=='Built 3 SQL dashboards.'
    await client.put('/api/v1/cv',headers=owner,json={'summary':'Newer CV.'})
    assert (await client.post('/api/v1/cv/pdf',headers=owner,json=body)).status_code==409


def test_pdf_preserves_unicode_extra_lines_and_paginates():
    cv=CV(name='Example 陈',education='Degree\nInstitute\nAdditional qualification.',
        entries=[CVEntry(section='education',title='Degree',organisation='Institute',bullets=[])],
        experience='\n'.join(f'Project {index}: configured a network and documented results.' for index in range(90)))
    with fitz.open(stream=render_cv(cv),filetype='pdf') as document:
        text=normalize('NFKC',''.join(page.get_text() for page in document))
        assert len(document)>1 and 'Additional qualification.' in text and 'Project 89' in text


async def test_outlook_is_source_constrained_not_a_numeric_forecast(client,monkeypatch):
    owner={'Authorization':f'Bearer {uuid4()}'}
    async def fake(*args,**kw):return jobs.Outlook(summary='Research does not establish future local vacancy counts.',drivers=['Technology changes.'],
        uncertainties=['Local demand is unknown.'],source_ids=['wef-2025'],future_roles=[])
    monkeypatch.setattr(jobs,'generate',fake)
    response=await client.post('/api/v1/jobs/outlook',headers=owner,json={'role':'Network support in Malaysia'})
    assert response.status_code==200,response.text
    report=response.json()['data']
    assert report['horizon_years']==5 and report['target_year']>=2031 and 'Insufficient evidence' in report['evidence_quality']
    assert report['sources'][0]['period']=='2025-2030'
    async def invalid(*args,**kw):return jobs.Outlook(summary='There will be 20000 vacancies in five years.',drivers=[],uncertainties=['Unknown.'],source_ids=[],future_roles=[])
    monkeypatch.setattr(jobs,'generate',invalid)
    assert (await client.post('/api/v1/jobs/outlook',headers=owner,json={'role':'Network support'})).status_code==503


async def test_extraction_preserves_nonstandard_sections_and_unassigned_content(monkeypatch):
    source='Example Learner\nSummary\nIT graduate.\nVolunteering\nSupported a community lab.\nAwards\nStudent project prize.\nAvailable evenings.'
    async def fake(*args,**kwargs):
        return cv_ai.Extraction(name_quote='Example Learner',sections=[{'field':'summary','line_ids':[3]}],skills=[],
            other_sections=[{'title':'Volunteering','line_ids':[5]},{'title':'Awards','line_ids':[7]}])
    monkeypatch.setattr(cv_ai,'generate',fake)
    cv=await cv_ai.extract_cv(source,CV(),'user')
    assert cv.additional_sections[0].title=='Volunteering' and cv.additional_sections[1].content=='Student project prize.'
    assert cv.additional_sections[2].content=='Available evenings.'
    with fitz.open(stream=render_cv(cv),filetype='pdf') as document:
        text=normalize('NFKC',''.join(page.get_text() for page in document))
        assert 'Volunteering' in text and 'Student project prize.' in text and 'Available evenings.' in text


async def test_custom_sections_roundtrip_and_direction_becomes_stale_on_profile_changes(client,monkeypatch):
    owner={'Authorization':f'Bearer {uuid4()}'}
    async def assess(cv,user,**kwargs):
        return {'score':70,'skills':[],'analysis_mode':'ai-rating','direction':{'title':'Support technician','explanation':'A practical direction based on the supplied evidence.','supporting_skills':['Networking'],'next_steps':['Practice a lab.']}}
    monkeypatch.setattr(main,'assess_cv',assess)
    cv={'name':'Example Learner','skills':['Networking'],'additional_sections':[{'title':'Volunteering','content':'Supported a community lab.'}]}
    assert (await client.put('/api/v1/cv',headers=owner,json=cv)).status_code==200
    response=await client.post('/api/v1/cv/analyze',headers=owner,json={'ai_consent':True})
    assert response.status_code==200,response.text
    state=(await client.get('/api/v1/jobs',headers=owner)).json()['data']
    assert state['direction']['title']=='Support technician' and not state['direction_stale']
    dashboard=(await client.get('/api/v1/dashboard',headers=owner)).json()['data']
    assert dashboard['cv']['additional_sections']==cv['additional_sections']
    await client.put('/api/v1/cv',headers=owner,json={**cv,'skills':['SQL']})
    state=(await client.get('/api/v1/jobs',headers=owner)).json()['data']
    assert state['direction'] is None and state['direction_stale']


async def test_recommended_direction_cannot_invent_supported_skills(monkeypatch):
    async def result(*args,**kw):
        return cv_rating.Assessment(criteria=[criterion(key) for key in cv_rating.PARAMETERS],strengths=['Clear.'],suggestions=['Review.'],summary='A source-based assessment.',
            direction={'title':'Network support','explanation':'This direction connects with your current learning.','supporting_skills':['Networking'],'next_steps':['Practice a lab.']})
    monkeypatch.setattr(cv_rating,'generate',result)
    rated=await cv_rating.assess_cv(CV(skills=['SQL']),'user')
    assert rated['score']==77 and rated['direction'] is None
    assert 'could not be verified' in rated['direction_notice']


async def test_every_ai_identified_skill_line_is_retained_even_without_a_duplicate_quote(monkeypatch):
    async def fake(*args,**kwargs):return cv_ai.Extraction(sections=[],skills=[],skill_line_ids=[2,3])
    monkeypatch.setattr(cv_ai,'generate',fake)
    cv=await cv_ai.extract_cv('Skills\nNetworking\nSQL',CV(),'user')
    assert cv.skills==['Networking','SQL'] and not cv.additional_sections


async def test_structured_entries_are_visible_even_when_the_model_omits_the_flat_group(monkeypatch):
    async def fake(*args,**kwargs):return cv_ai.Extraction(sections=[],skills=[],entries=[{'section':'education','title':'Diploma in IT','organisation':'Example College','line_ids':[]}])
    monkeypatch.setattr(cv_ai,'generate',fake)
    cv=await cv_ai.extract_cv('Education\nDiploma in IT\nExample College',CV(),'user')
    assert cv.education=='Diploma in IT\nExample College'
