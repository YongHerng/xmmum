"""Source vacancies, earned skills and runtime course mappings work together."""
import sqlite3
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app import jobs
from app.config import settings
from app.db import CourseEnrollment, HostedCourse, get_db
from app.engine import normalize_skills
from app.main import app
from app.schemas import CV
from test_api import client


def vacancy():
    return {
        'job_title': 'Infrastructure Support', 'employer_name': 'Example Company',
        'job_location': 'Malaysia', 'job_apply_link': 'https://example.org/jobs/infrastructure',
        'job_description': 'Networking, data centre operations and SQL are required.',
    }


def assessment():
    return {'score': 55, 'explanation': 'The source requires skills not yet in this profile.',
            'matched_skills': ['SQL'], 'missing_requirements': ['Networking', 'data centre operations'],
            'unknowns': ['Experience level is not established.']}


async def add_course(owner, title, skill=None, **metadata):
    identifier = str(uuid4())
    payload = {'title': title, 'published': True, 'assessed_skills':
               [{'skill_id': skill, 'level': 'foundation'}] if skill else [], **metadata}
    async for db in app.dependency_overrides[get_db]():
        db.add(HostedCourse(id=identifier, user_id=owner, payload=payload))
    return identifier


async def award(owner, skill):
    identifier = str(uuid4())
    completion = {'badge_code': f'FP-{identifier}', 'attempt_id': str(uuid4()),
                  'completed_at': '2026-10-25T00:00:00Z', 'badge_title': f'{skill} course',
                  'badge_provider': 'Example provider', 'badge_skills':
                  [{'skill_id': skill, 'level': 'foundation'}]}
    async for db in app.dependency_overrides[get_db]():
        db.add(CourseEnrollment(user_id=owner, course_id=identifier,
                               payload={'course_id': identifier, 'completion': completion}))


async def test_saved_job_gaps_use_runtime_courses_and_earned_badges_without_more_ai(client, monkeypatch):
    owner = str(uuid4())
    headers = {'Authorization': f'Bearer {owner}'}
    network_id = await add_course(owner, 'An authored networking course', 'networking')
    center_id = await add_course(owner, 'An authored infrastructure course', 'data-center')
    await add_course(owner, 'Unpublished network course', 'networking', published=False)
    await add_course(owner, 'Deleted network course', 'networking', deleted_at='2026-10-25')
    await add_course(owner, 'Networking and data centre title alone')
    calls = {'search': 0, 'rank': 0}

    async def provider(*args):
        calls['search'] += 1
        return {'jobs': jobs.normalize_jobs([vacancy()]), 'query': 'Infrastructure Malaysia',
                'country': 'my', 'fetched_at': jobs.now(), 'provider': 'Test source'}, False

    async def ranking(rows, *args):
        calls['rank'] += 1
        return [row | {'assessment': assessment()} for row in rows]

    monkeypatch.setattr(jobs, 'fetch_jobs', provider)
    monkeypatch.setattr(jobs, 'rate_jobs', ranking)
    await client.put('/api/v1/cv', headers=headers, json={'skills': ['SQL']})
    response = await client.post('/api/v1/jobs/search', headers=headers,
                                 json={'query': 'Infrastructure Malaysia'})
    assert response.status_code == 200, response.text
    gaps = response.json()['data']['search']['jobs'][0]['assessment']['skill_gaps']
    by_skill = {gap['skill_id']: gap for gap in gaps}
    assert by_skill['networking']['courses'] == [{'id': network_id, 'title': 'An authored networking course'}]
    assert by_skill['data-center']['label'] == 'Data Center'
    assert by_skill['data-center']['courses'] == [{'id': center_id, 'title': 'An authored infrastructure course'}]
    assert calls == {'search': 1, 'rank': 1}

    # A badge is skill evidence immediately, even with an unchanged CV.
    await award(owner, 'networking')
    saved = (await client.get('/api/v1/jobs', headers=headers)).json()['data']
    assert saved['stale']  # Previous AI score remains explicitly stale.
    assert [gap['skill_id'] for gap in saved['search']['jobs'][0]['assessment']['skill_gaps']] == ['data-center']
    await award(owner, 'data-center')
    saved = (await client.get('/api/v1/jobs', headers=headers)).json()['data']
    assert saved['search']['jobs'][0]['assessment']['skill_gaps'] == []
    assert set(saved['search']['jobs'][0]['assessment']['current_matched_skills']) == {'SQL','Networking','Data Center'}
    assert calls == {'search': 1, 'rank': 1}
    assert (await client.get('/api/v1/dashboard', headers=headers)).json()['data']['cv']['skills'] == ['SQL']

    rematched = await client.post('/api/v1/jobs/rematch', headers=headers, json={})
    assert rematched.status_code == 200 and not rematched.json()['data']['stale']
    assert rematched.json()['data']['search']['jobs'][0]['assessment']['skill_gaps'] == []
    assert calls == {'search': 1, 'rank': 2}


async def test_gaps_only_use_quoted_requirements_and_empty_catalogues_stay_empty(client):
    assert normalize_skills(['Data centre operations', 'data centers']) == ['data-center']
    rows = jobs.normalize_jobs([vacancy()])
    rows[0]['assessment'] = assessment() | {'missing_requirements': ['Networking', 'invented Linux requirement']}
    rows.append(rows[0] | {'id': 'unassessed', 'assessment': None})
    async for db in app.dependency_overrides[get_db]():
        result = await jobs.learning_gaps({'jobs': rows}, CV(skills=['SQL']), {'badges': []}, db)
    assert result['jobs'][0]['assessment']['skill_gaps'] == [
        {'skill_id': 'networking', 'label': 'Networking', 'courses': []}]
    assert result['jobs'][1]['assessment'] is None


async def test_saved_get_refreshes_course_publication_without_provider_requests(client, monkeypatch):
    owner = str(uuid4())
    headers = {'Authorization': f'Bearer {owner}'}
    identifier = await add_course(owner, 'A newly authored course', 'networking')

    async def provider(*args):
        return {'jobs': jobs.normalize_jobs([vacancy()]), 'query': 'Infrastructure Malaysia',
                'country': 'my', 'fetched_at': jobs.now(), 'provider': 'Test source'}, False

    async def ranking(rows, *args):
        return [row | {'assessment': assessment()} for row in rows]

    monkeypatch.setattr(jobs, 'fetch_jobs', provider)
    monkeypatch.setattr(jobs, 'rate_jobs', ranking)
    await client.put('/api/v1/cv', headers=headers, json={'skills': ['SQL']})
    assert (await client.post('/api/v1/jobs/search', headers=headers,
                              json={'query': 'Infrastructure Malaysia'})).status_code == 200
    async for db in app.dependency_overrides[get_db]():
        row = await db.scalar(select(HostedCourse).where(HostedCourse.id == identifier))
        row.payload = row.payload | {'published': False}

    async def forbidden(*args):
        raise AssertionError('Refreshing saved course links must not call a provider.')

    monkeypatch.setattr(jobs, 'fetch_jobs', forbidden)
    monkeypatch.setattr(jobs, 'rate_jobs', forbidden)
    result = (await client.get('/api/v1/jobs', headers=headers)).json()['data']
    assert not result['stale']
    assert all(gap['courses'] == [] for gap in result['search']['jobs'][0]['assessment']['skill_gaps'])


@pytest.mark.parametrize('years', [5, 10, 15])
async def test_outlook_horizon_is_validated_and_sent_to_the_model(client, monkeypatch, years):
    contexts = []

    async def generated(task, instructions, context, schema, **kwargs):
        contexts.append(context)
        assert f'{years}-year' in instructions
        assert 'not a vacancy-count forecast' in instructions
        return jobs.Outlook(summary='Current evidence cannot establish future local availability.',
                            drivers=['Infrastructure evolves.'], uncertainties=['Long-term local demand is unknown.'],
                            source_ids=['wef-2025'], future_roles=[])

    monkeypatch.setattr(jobs, 'generate', generated)
    headers = {'Authorization': f'Bearer {uuid4()}'}
    response = await client.post('/api/v1/jobs/outlook', headers=headers,
                                 json={'role': 'Data centre support', 'years': years})
    assert response.status_code == 200, response.text
    report = response.json()['data']
    assert report['horizon_years'] == contexts[0]['horizon_years'] == years
    assert report['target_year'] == contexts[0]['target_year'] == datetime.now(UTC).year + years
    assert 'Insufficient evidence' in report['evidence_quality']
    saved = (await client.get('/api/v1/jobs', headers=headers)).json()['data']['outlook']
    assert saved['horizon_years'] == years


@pytest.mark.parametrize('years', [0, 3, 6, 20, '5'])
async def test_invalid_horizon_never_calls_ai(client, monkeypatch, years):
    async def forbidden(*args, **kwargs):
        raise AssertionError('Invalid horizons must not reach AI.')

    monkeypatch.setattr(jobs, 'generate', forbidden)
    response = await client.post('/api/v1/jobs/outlook', headers={'Authorization': f'Bearer {uuid4()}'},
                                 json={'role': 'Infrastructure support', 'years': years})
    assert response.status_code == 422


async def test_job_matching_grounds_catalog_aliases_in_actual_profile_labels(monkeypatch):
    source = jobs.normalize_jobs([vacancy()])
    profile = {'badges': [{'skills': [{'skill_id': 'data-center', 'level': 'foundation'}]}]}

    async def generated(*args, **kwargs):
        return jobs.JobFits(assessments=[jobs.JobFit(job_id=source[0]['id'], score=60,
            explanation='The supplied skills overlap with the source requirements.',
            matched_skills=['SQL', 'data-centre operations'], missing_requirements=['Networking'], unknowns=[])])

    monkeypatch.setattr(jobs, 'generate', generated)
    result = await jobs.rate_jobs(source, CV(skills=['PostgreSQL']), profile, 'test-owner')
    assert result[0]['assessment']['matched_skills'] == ['PostgreSQL', 'Data Center']


@pytest.mark.parametrize('first_failure', [503, 'connect', 'read'])
async def test_safe_search_retry_is_bounded_and_each_attempt_counts(monkeypatch, first_failure):
    calls = []

    def handle(request):
        calls.append(request)
        if len(calls) == 1:
            if first_failure == 'connect':
                raise httpx.ConnectError('Test connection interruption', request=request)
            if first_failure == 'read':
                raise httpx.ReadTimeout('Test response interruption', request=request)
            return httpx.Response(first_failure)
        return httpx.Response(200, json={'data': {'jobs': [vacancy()]}})

    original = httpx.AsyncClient
    monkeypatch.setattr(jobs.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    result, cached = await jobs.fetch_jobs('Infrastructure Malaysia', 'my', 'test-owner')
    assert not cached and len(result['jobs']) == 1 and len(calls) == 2
    with sqlite3.connect(settings.jsearch_usage_path) as db:
        assert db.execute('SELECT count(*) FROM calls').fetchone()[0] == 2


@pytest.mark.parametrize(('provider_status', 'api_status', 'detail'),
                         [(401, 503, 'API key'), (403, 503, 'API key'), (429, 429, 'quota')])
async def test_invalid_credentials_and_provider_quotas_are_not_retried(monkeypatch, provider_status, api_status, detail):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(provider_status)

    original = httpx.AsyncClient
    monkeypatch.setattr(jobs.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(HTTPException) as error:
        await jobs.fetch_jobs('Infrastructure Malaysia', 'my', 'test-owner')
    assert error.value.status_code == api_status and detail in error.value.detail
    assert len(calls) == 1


async def test_repeated_provider_failure_stops_after_two_attempts(monkeypatch):
    calls = []

    def handle(request):
        calls.append(request)
        return httpx.Response(503)

    original = httpx.AsyncClient
    monkeypatch.setattr(jobs.httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    with pytest.raises(HTTPException) as error:
        await jobs.fetch_jobs('Infrastructure Malaysia', 'my', 'test-owner')
    assert error.value.status_code == 503 and len(calls) == 2
    assert jobs._cache == {}
