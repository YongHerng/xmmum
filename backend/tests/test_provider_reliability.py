"""All provider traffic is mocked: these tests never consume provider credits."""
import asyncio
import json

import httpx
import pytest

from app import ai_provider, cv_rating
from app.config import settings
from app.schemas import AIReview, CV
from app.skill_grounding import resolve_skill_name


def assessment(skills):
    return cv_rating.Assessment(
        criteria=[dict(parameter=key, score=77, explanation='Evidence supports this rubric judgment.',
                       evidence_line_ids=[]) for key in cv_rating.PARAMETERS],
        strengths=['Clear source information.'], suggestions=['Clarify your contribution.'],
        summary='A source-based assessment of this CV.',
        direction=dict(title='IT support technician', explanation='This direction draws on the supplied skills.',
                       supporting_skills=skills, next_steps=['Practise a support scenario.']))


@pytest.mark.parametrize('value,supplied,expected', [
    ('SQL', ['PostgreSQL'], 'PostgreSQL'),
    ('Networking', ['Computer networks'], 'Computer networks'),
    ('networking', ['Networking and quantum computing'], None),
    ('Python', ['Pythonic writing'], None),
    ('Unmapped expertise', ['Other expertise'], None),
    ('Data Center', [], None),
])
def test_shared_skill_grounding_is_exact_or_catalogue_alias_only(value, supplied, expected):
    assert resolve_skill_name(value, supplied) == expected


@pytest.mark.parametrize('source,model', [
    ('PostgreSQL', 'SQL'), ('SQL', ' sql '), ('Problem solving', 'problem-solving'),
    ('Custom skill', ' CUSTOM   SKILL '), ('Computer networks', 'Networking'),
])
async def test_direction_aliases_restore_actual_supplied_skill_labels(monkeypatch, source, model):
    async def fake(*args, **kwargs):
        assert args[2]['available_skill_names'] == [source]
        return assessment([model])
    monkeypatch.setattr(cv_rating, 'generate', fake)
    result = await cv_rating.assess_cv(CV(skills=[source]), 'test-user')
    assert result['direction']['supporting_skills'] == [source]
    assert result['direction_notice'] is None and result['score'] == 77


async def test_badge_direction_is_grounded_without_adding_skill_to_cv(monkeypatch):
    async def fake(*args, **kwargs):
        return assessment(['networking', 'Networking'])
    monkeypatch.setattr(cv_rating, 'generate', fake)
    cv = CV(skills=['SQL'])
    result = await cv_rating.assess_cv(cv, 'test-user', profile={
        'badges': [{'skills': [{'skill_id': 'networking', 'level': 'foundation'}]}]})
    assert result['direction']['supporting_skills'] == ['Networking']
    assert cv.skills == ['SQL']


async def test_one_invented_direction_claim_does_not_discard_valid_rating(monkeypatch):
    async def fake(*args, **kwargs):
        return assessment(['SQL', 'Quantum computing'])
    monkeypatch.setattr(cv_rating, 'generate', fake)
    result = await cv_rating.assess_cv(CV(skills=['SQL']), 'test-user')
    assert result['direction'] is None and result['direction_notice']
    assert result['score'] == 77 and len(result['breakdown']) == 6
    assert 'Quantum computing' not in json.dumps(result)


def runpod(monkeypatch, handle):
    monkeypatch.setattr(settings, 'ai_provider', 'runpod')
    monkeypatch.setattr(settings, 'ai_enabled', True)
    monkeypatch.setattr(settings, 'ai_model', 'test-model')
    monkeypatch.setattr(settings, 'ai_base_url', 'https://api.runpod.ai/v2/test')
    original = httpx.AsyncClient
    monkeypatch.setattr(ai_provider.httpx, 'AsyncClient',
                        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))


@pytest.fixture
def no_poll_delay(monkeypatch):
    delays = []
    async def fast_sleep(delay):
        delays.append(delay)
    monkeypatch.setattr(ai_provider.asyncio, 'sleep', fast_sleep)
    return delays


async def test_transient_poll_failures_retry_same_job_not_billable_submission(monkeypatch, no_poll_delay):
    calls = []
    def handle(request):
        calls.append((request.method, request.url.path))
        if request.url.path.endswith('/run'):
            return httpx.Response(200, json={'id': 'job-1', 'status': 'IN_QUEUE'})
        count = sum(method == 'GET' for method, _ in calls)
        if count == 1:
            return httpx.Response(503)
        if count == 2:
            raise httpx.ReadTimeout('private provider detail', request=request)
        return httpx.Response(200, json={'status': 'COMPLETED', 'output': '{"summary":"A clear response","suggestions":[]}'})
    runpod(monkeypatch, handle)
    result = await ai_provider.generate('test-retry', 'Review', {}, AIReview, actor='test-user')
    assert result.summary == 'A clear response'
    assert calls == [('POST', '/v2/test/run')] + [('GET', '/v2/test/status/job-1')] * 3
    assert len(no_poll_delay) == 3


async def test_poll_retry_after_is_respected_and_capped(monkeypatch, no_poll_delay):
    reads = []
    def handle(request):
        if request.method == 'POST':
            return httpx.Response(200, json={'id': 'job-1', 'status': 'IN_QUEUE'})
        reads.append(request)
        if len(reads) == 1:
            return httpx.Response(429, headers={'Retry-After': '9999'})
        return httpx.Response(200, json={'status': 'COMPLETED', 'output': '{}'})
    runpod(monkeypatch, handle)
    await ai_provider.transport([], {})
    assert 5 <= no_poll_delay[1] <= 5.2 and len(reads) == 2


async def test_submission_timeout_is_not_automatically_retried(monkeypatch, no_poll_delay):
    calls = []
    def handle(request):
        calls.append(request)
        raise httpx.ReadTimeout('private credentials must not appear', request=request)
    runpod(monkeypatch, handle)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.transport([], {})
    assert error.value.code == 'submission_uncertain'
    assert 'private credentials' not in str(error.value)
    assert len(calls) == 1 and calls[0].method == 'POST'


@pytest.mark.parametrize('status,code', [(401, 'provider_auth'), (403, 'provider_auth'),
    (402, 'provider_billing'), (404, 'endpoint_not_found'), (429, 'provider_rate_limit'),
    (503, 'provider_unavailable')])
async def test_submission_http_errors_have_safe_specific_categories(monkeypatch, status, code):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(status, text='private CV and key material')
    runpod(monkeypatch, handle)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.transport([], {})
    assert error.value.code == code and 'private CV' not in str(error.value)
    assert len(calls) == 1


async def test_poll_auth_failure_is_not_retried_and_known_job_is_cancelled(monkeypatch, no_poll_delay):
    calls = []
    def handle(request):
        calls.append(request.url.path)
        if request.url.path.endswith('/run'):
            return httpx.Response(200, json={'id': 'job-1', 'status': 'IN_QUEUE'})
        if '/cancel/' in request.url.path:
            return httpx.Response(200, json={'status': 'CANCELLED'})
        return httpx.Response(401, text='private error material')
    runpod(monkeypatch, handle)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.transport([], {})
    assert error.value.code == 'provider_auth'
    assert calls == ['/v2/test/run', '/v2/test/status/job-1', '/v2/test/cancel/job-1']


async def test_untrusted_job_reference_is_not_polled_or_cancelled(monkeypatch, no_poll_delay):
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={'id': '../../other-job', 'status': 'IN_QUEUE'})
    runpod(monkeypatch, handle)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.transport([], {})
    assert error.value.code == 'provider_format' and len(calls) == 1


@pytest.mark.parametrize('status,code', [('FAILED', 'worker_failed'), ('TIMED_OUT', 'worker_timeout'),
                                      ('CANCELLED', 'job_cancelled')])
async def test_worker_failure_is_not_misreported_as_connection_failure(monkeypatch, no_poll_delay, status, code):
    def handle(request):
        return httpx.Response(200, json={'id': 'job-1', 'status': status, 'error': 'private worker details'})
    runpod(monkeypatch, handle)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.transport([], {})
    assert error.value.code == code and 'private worker' not in str(error.value)


async def test_total_timeout_is_distinct_from_invalid_model_output(monkeypatch):
    monkeypatch.setattr(settings, 'ai_enabled', True)
    monkeypatch.setattr(settings, 'ai_model', 'test-model')
    monkeypatch.setattr(settings, 'ai_timeout_seconds', .01)
    calls = []
    async def stalled(*args):
        calls.append(args)
        await asyncio.sleep(10)
    monkeypatch.setattr(ai_provider, 'transport', stalled)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.generate('test-timeout', '', {}, AIReview, actor='test-user')
    assert error.value.code == 'request_timeout' and len(calls) == 1


async def test_invalid_json_is_distinct_from_provider_connection_failure(monkeypatch):
    monkeypatch.setattr(settings, 'ai_enabled', True)
    monkeypatch.setattr(settings, 'ai_model', 'test-model')
    async def malformed(*args):
        return 'not JSON containing private CV details'
    monkeypatch.setattr(ai_provider, 'transport', malformed)
    with pytest.raises(ai_provider.AIUnavailable) as error:
        await ai_provider.generate('test-format', '', {}, AIReview, actor='test-user')
    assert error.value.code == 'invalid_output' and 'private CV' not in str(error.value)
