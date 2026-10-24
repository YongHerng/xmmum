import asyncio
import json
import sqlite3
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select

from app import ai_provider, ai_routes, cv_ai
from app.config import settings
from app.cv_ai import Rewrite, Personalisation, MatchExplanations, Extraction
from app.engine import evaluate, matches
from app.schemas import CV, Answers, AIReview
from app.skill_evidence import skill_profile
from test_api import client


def enable(monkeypatch):
    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "ai_model", "test-model")


async def test_runpod_submits_once_polls_and_caches(monkeypatch):
    enable(monkeypatch)
    monkeypatch.setattr(settings, "ai_provider", "runpod")
    monkeypatch.setattr(settings, "ai_base_url", "https://api.runpod.ai/v2/test")
    calls = []
    def handle(request):
        calls.append(request)
        if request.url.path.endswith('/run'):
            return httpx.Response(200, json={"id":"job-1", "status":"IN_QUEUE"})
        return httpx.Response(200, json={"status":"COMPLETED", "output":[{"cost":0.0001,"result":{
            "choices":[{"message":{"content":json.dumps({"summary":"Clear summary", "suggestions":[]})}}]}}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", lambda **kw:original(transport=httpx.MockTransport(handle), **kw))
    for _ in range(2):
        result = await ai_provider.generate('test','Review only',{'text':'Python'}, AIReview, actor='user')
        assert result.summary == 'Clear summary'
    assert len(calls) == 2
    request = json.loads(calls[0].content)
    assert request['input']['model'] == 'test-model'
    assert request['input']['sampling_params']['temperature'] == 0
    assert request['policy']['executionTimeout'] <= 180000
    with sqlite3.connect(settings.ai_usage_path) as db:
        assert db.execute('SELECT count(*) FROM calls').fetchone()[0] == 1


async def test_invalid_ai_output_is_not_saved_or_retried(monkeypatch):
    enable(monkeypatch)
    calls=[]
    async def bad(*args):
        calls.append(args)
        return '{"summary":"text", "suggestions":[], "score":100}'
    monkeypatch.setattr(ai_provider,'transport',bad)
    with pytest.raises(ai_provider.AIUnavailable):
        await ai_provider.generate('review','',{},AIReview,actor='user')
    assert len(calls)==1


async def test_ai_call_limit_and_disabled_make_no_network_requests(monkeypatch):
    async def forbidden(*args):
        raise AssertionError('Network should not be called')
    monkeypatch.setattr(ai_provider,'transport',forbidden)
    with pytest.raises(ai_provider.AIUnavailable,match='disabled'):
        await ai_provider.generate('test','',{},AIReview,actor='user')
    enable(monkeypatch)
    monkeypatch.setattr(settings,'ai_max_calls',1)
    ai_provider.reserve_call('already-recorded','test')
    with pytest.raises(ai_provider.AIUnavailable,match='allowance'):
        await ai_provider.generate('test','',{},AIReview,actor='user')


async def test_extraction_requires_actual_source_line_ids(monkeypatch):
    async def fake(*args,**kwargs):
        return Extraction(sections=[{'field':'education','line_ids':[999]}],skills=[])
    monkeypatch.setattr(cv_ai,'generate',fake)
    with pytest.raises(ai_provider.AIUnavailable,match='unsupported'):
        await cv_ai.extract_cv('Education: Computer Science',CV(),'user')


async def test_rewrite_preview_approval_versions_history_and_isolation(client,monkeypatch):
    owner={'Authorization':f'Bearer {uuid4()}'}
    other={'Authorization':f'Bearer {uuid4()}'}
    cv=CV(name='Test Learner',summary='I built 3 dashboards with SQL.',skills=['SQL'])
    await client.put('/api/v1/cv',headers=owner,json=cv.model_dump())
    async def fake(*args,**kwargs):
        return Rewrite(changes=[dict(field='summary',before=cv.summary,after='Built 3 dashboards using SQL.',reason='More concise wording.')])
    monkeypatch.setattr(cv_ai,'generate',fake)
    response=await client.post('/api/v1/cv/ai/preview',headers=owner,json={'fields':['summary']})
    assert response.status_code==200,response.text
    proposal=response.json()['data']
    assert (await client.get('/api/v1/dashboard',headers=owner)).json()['data']['cv']['summary']==cv.summary
    body={'preview_id':proposal['preview_id'],'fields':['summary'],'edits':{'summary':'Built 3 SQL dashboards.'}}
    assert (await client.post('/api/v1/cv/ai/apply',headers=other,json=body)).status_code==404
    applied=await client.post('/api/v1/cv/ai/apply',headers=owner,json=body)
    assert applied.status_code==200,applied.text
    assert applied.json()['data']['version']==2
    new_cv=CV.model_validate(applied.json()['data']['cv'])
    assert applied.json()['data']['evaluation'] is None  # Explicit AI assessment is separate.
    assert (await client.post('/api/v1/cv/ai/apply',headers=owner,json=body)).status_code==404
    history=(await client.get('/api/v1/cv/ai/context',headers=owner)).json()['data']['history']
    assert history[0]['version']==1
    restored=await client.post('/api/v1/cv/history/restore',headers=owner,json={'version':1,'expected_version':2})
    assert restored.status_code==200
    assert restored.json()['data']['cv']['summary']==cv.summary
    assert restored.json()['data']['version']==3


async def test_stale_preview_cannot_overwrite_new_cv(client,monkeypatch):
    headers={'Authorization':f'Bearer {uuid4()}'}
    await client.put('/api/v1/cv',headers=headers,json={'summary':'Original summary.'})
    async def fake(*args,**kwargs):
        return Rewrite(changes=[dict(field='summary',before='Original summary.',after='Concise summary.',reason='Clarity')])
    monkeypatch.setattr(cv_ai,'generate',fake)
    proposal=(await client.post('/api/v1/cv/ai/preview',headers=headers,json={'ai_consent':True})).json()['data']
    await client.put('/api/v1/cv',headers=headers,json={'summary':'Newer manual edit.'})
    response=await client.post('/api/v1/cv/ai/apply',headers=headers,json={'preview_id':proposal['preview_id'],'fields':['summary']})
    assert response.status_code==409
    assert (await client.get('/api/v1/dashboard',headers=headers)).json()['data']['cv']['summary']=='Newer manual edit.'


async def test_rewrite_rejects_fabricated_numbers_and_skills(monkeypatch):
    for after in ('Built 100 dashboards with SQL.','Built 3 dashboards with Python.'):
        async def fake(*args,**kwargs):
            return Rewrite(changes=[dict(field='summary',before='Built 3 dashboards with SQL.',after=after,reason='Clarity')])
        monkeypatch.setattr(cv_ai,'generate',fake)
        with pytest.raises(ai_provider.AIUnavailable,match='numbers|unsupported'):
            await cv_ai.rewrite_cv(CV(summary='Built 3 dashboards with SQL.'),'user',['summary'])


async def test_extraction_reconstructs_source_and_omits_unsupported_skills(monkeypatch):
    async def fake(*args,**kwargs):
        return Extraction(sections=[{'field':'experience','line_ids':[2,1,2]}],skills=[
            {'skill':'SQL','quote':'Used SQL for reports.'},
            {'skill':'Invented ability','quote':'Used SQL for reports.'},
            {'skill':'A long sentence ' * 9,'quote':'Used SQL for reports.'},
            {'skill':'Python','quote':'A nonexistent source quote.'}])
    monkeypatch.setattr(cv_ai,'generate',fake)
    result = await cv_ai.extract_cv('Used SQL for reports.\nBuilt 3 dashboards.',CV(),'user')
    assert result.experience == 'Used SQL for reports.\nBuilt 3 dashboards.'
    assert result.skills == ['SQL']


async def test_parse_action_needs_no_checkbox_and_internal_source_never_leaks(client,monkeypatch):
    from app import main
    calls=[]
    def local(content,filename,mime,include_ai_source=False,ai_primary=False):
        assert ai_primary
        result={'cv':CV(summary='Local summary.').model_dump(),'document':{'fields':[]}}
        if include_ai_source:
            result['_ai_source']={'text':'Source-only text','lines':[]}
        return result
    async def assisted(source,cv,actor):
        calls.append(source)
        return CV(summary='Source-only text')
    monkeypatch.setattr(main,'parse_document',local)
    monkeypatch.setattr(main,'extract_cv',assisted)
    headers={'Authorization':f'Bearer {uuid4()}'}
    for legacy_fields in ({},{'ai_consent':'false'},{'ai_consent':'true'}):
        response=await client.post('/api/v1/cv/parse',headers=headers,
            files={'file':('test.pdf',b'test','application/pdf')},data=legacy_fields)
        assert response.status_code == 200,response.text
        assert '_ai_source' not in response.json()['data']
        assert response.json()['data']['cv']['summary'] == 'Source-only text'
    assert calls == ['Source-only text'] * 3


def test_contact_minimisation_preserves_year_ranges():
    text=ai_provider.scrub('Example Person test@example.invalid +60 12 345 6789 https://example.invalid 2020-2024',CV(name='Example Person'))
    assert 'Example Person' not in text and 'test@example.invalid' not in text and 'https://' not in text
    assert '2020-2024' in text


async def test_personalisation_is_preview_and_preserves_constraints(client,monkeypatch):
    headers={'Authorization':f'Bearer {uuid4()}'}
    async def fake(*args,**kwargs):
        return Personalisation(summary='You enjoy solving problems.',interests=['technology'],work_style='practical',environment='structured',motivation='growth',explanation='From your notes.')
    monkeypatch.setattr(ai_routes,'generate',fake)
    answers=Answers(budget=100,weekly_hours=3,location='Malaysia')
    response=await client.post('/api/v1/questionnaire/ai/preview',headers=headers,json={'answers':answers.model_dump(),'notes':'I enjoy troubleshooting networks.'})
    assert response.status_code==200
    candidate=response.json()['data']['answers']
    assert candidate['budget']==100 and candidate['weekly_hours']==3 and candidate['location']=='Malaysia'
    assert (await client.get('/api/v1/questionnaire',headers=headers)).json()['data']['answers']['work_style']==''


async def test_match_ai_cannot_change_scores_or_add_roles(client,monkeypatch):
    headers={'Authorization':f'Bearer {uuid4()}'}
    await client.put('/api/v1/cv',headers=headers,json={'skills':['SQL','Unmapped expertise']})
    before=(await client.post('/api/v1/careers/match',headers=headers,json={})).json()['data']['matches']
    async def fake(*args,**kwargs):
        return MatchExplanations(explanations=[{'role_id':'invented','explanation':'Unsupported career.'}])
    monkeypatch.setattr(ai_routes,'generate',fake)
    assert (await client.post('/api/v1/careers/ai/explain',headers=headers,json={})).status_code==503
    after=(await client.post('/api/v1/careers/match',headers=headers,json={})).json()['data']['matches']
    assert before==after


def test_badge_skill_in_cv_is_not_promoted_to_full_credit():
    from test_badge_matching import evidence
    cv=CV(skills=['Networking'],course_skill_ids=['networking'])
    career=next(item for item in matches(cv,Answers(),badge_evidence=evidence()) if item['id']=='cloud-support')
    skill=career['skill_evidence'][0]
    assert skill['credit']==.5 and not skill['cv_claimed']


async def test_approved_badge_updates_cv_without_ai_or_inflating_matching(client,monkeypatch):
    from app import main
    from test_badge_matching import evidence
    async def awards(*args):
        return evidence()
    monkeypatch.setattr(ai_routes,'account_badge_evidence',awards)
    monkeypatch.setattr(main,'account_badge_evidence',awards)
    headers={'Authorization':f'Bearer {uuid4()}'}
    await client.put('/api/v1/cv',headers=headers,json={'skills':['SQL']})
    response=await client.post('/api/v1/cv/ai/preview',headers=headers,json={'badge_code':'FP-TEST'})
    assert response.status_code == 200,response.text
    proposal=response.json()['data']
    assert proposal['added_skills'] == ['Networking']
    assert (await client.get('/api/v1/dashboard',headers=headers)).json()['data']['cv']['skills'] == ['SQL']
    applied=await client.post('/api/v1/cv/ai/apply',headers=headers,json={
        'preview_id':proposal['preview_id'],'fields':['certificates_training']})
    assert applied.status_code == 200,applied.text
    data=applied.json()['data']
    assert data['cv']['skills'] == ['SQL','Networking']
    assert data['cv']['course_skill_ids'] == ['networking']
    assert data['evaluation'] is None and proposal['after_rating'] is None
    dashboard=(await client.get('/api/v1/dashboard',headers=headers)).json()['data']
    cloud=next(item for item in dashboard['matches'] if item['id']=='cloud-support')
    skill=next(item for item in cloud['skill_evidence'] if item['id']=='networking')
    assert skill['credit'] == .5 and not skill['cv_claimed']
    restored=await client.post('/api/v1/cv/history/restore',headers=headers,json={'version':1,'expected_version':2})
    assert restored.json()['data']['cv']['course_skill_ids'] == []
    assert restored.json()['data']['cv']['skills'] == ['SQL']


@pytest.mark.parametrize('route',['/ai/status','/cv/ai/context'])
async def test_ai_private_routes_require_auth(client,route):
    assert (await client.get('/api/v1'+route)).status_code==401
