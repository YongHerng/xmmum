from uuid import uuid4
import pytest
import pytest_asyncio
import httpx
from fastapi import Header, HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.db import Base, get_db
from app.security import current_user
from app.hosted_learning import PRACTICE
from app.learning_questions import key_for
from app.learning_questions import author_fields, author_values, answer_is_correct, normalize_response
import base64
from copy import deepcopy
from app import learning_media
from app.config import Settings
from storage_fakes import AppAndStorageTransport, FakeStorage, KEY, ORIGIN


@pytest_asyncio.fixture
async def learning_client(tmp_path, monkeypatch):
    # The only file store in API tests is a mocked remote HTTP service.
    cloud = FakeStorage()
    config = Settings(_env_file=None, supabase_url=ORIGIN, supabase_publishable_key=KEY)
    monkeypatch.setattr(learning_media, 'storage', learning_media.SupabaseMediaStore(config, httpx.MockTransport(cloud.handle)))
    monkeypatch.setattr(learning_media, 'test_cloud', cloud, raising=False)
    engine = create_async_engine('sqlite+aiosqlite://', poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async def database():
        async with factory() as db:
            yield db
            await db.commit()
    async def identity(authorization: str | None = Header(None)):
        if not authorization:
            raise HTTPException(401, 'Sign in.')
        return authorization.removeprefix('Bearer ')
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[current_user] = identity
    PRACTICE.clear()
    async with AsyncClient(transport=AppAndStorageTransport(app, cloud), base_url='http://test') as client:
        yield client
    app.dependency_overrides.clear()
    PRACTICE.clear()
    await engine.dispose()


def mixed_questions():
    single = dict(question_type='single', prompt='Choose a router.', option_0='Router', option_1='Monitor', option_2='Keyboard', option_3='Printer', correct_index='0', explanation='A router forwards packets.')
    return [single, dict(single, question_type='multiple', prompt='Select two answers.', correct_indices=[0, 2]),
            dict(question_type='fill', prompt='IP means ____.', accepted_answers='Internet Protocol\nIP', explanation='IP is Internet Protocol.'),
            dict(question_type='matching', prompt='Match devices and functions.', match_left_0='Router', match_right_0='Connects networks', match_left_1='Switch', match_right_1='Connects LAN devices', explanation='Each device has a specific function.')]


async def create_course(client, prefix, headers):
    response = await client.post(prefix+'/studio/courses', headers=headers, json=dict(title='Hosted networking', provider='Original demo partner', description='Original test content.', category='Networking'))
    assert response.status_code == 200, response.text
    course = response.json()['data']
    for number in (1, 2):
        response = await client.post(f'{prefix}/studio/courses/{course["id"]}/chapters', headers=headers, json=dict(title=f'Chapter {number}', body='Learning material.', skill='Networking', minutes=10))
        assert response.status_code == 200, response.text
        course = response.json()['data']
    for target in [chapter['id'] for chapter in course['chapters']] + ['final']:
        response = await client.post(f'{prefix}/studio/courses/{course["id"]}/questions/{target}', headers=headers, json={'questions': mixed_questions()})
        assert response.status_code == 200, response.text
    return (await client.get(f'{prefix}/studio/courses/{course["id"]}', headers=headers)).json()['data']


def responses(questions, correct=True):
    answers = {}
    for question in questions:
        key = key_for(question)
        if question['question_type'] == 'matching':
            answers[question['id']] = {str(index): value for index, value in enumerate(key)}
        elif question['question_type'] == 'fill':
            answers[question['id']] = ' ' + key[0].swapcase().replace(' ', '   ') + ' ' if correct else 'Wrong spelling'
        elif question['question_type'] == 'multiple':
            answers[question['id']] = list(reversed(key)) if correct else [1]
        else:
            answers[question['id']] = key if correct else (key+1)%4
    return {'answers': answers}


@pytest.mark.asyncio
@pytest.mark.parametrize('practice', [False, True])
async def test_named_chapters_subsections_order_materials_and_publish_gate(learning_client, practice):
    client = learning_client
    prefix = '/api/v1/learning'
    headers = {'Authorization': f'Bearer {uuid4()}'}
    if practice:
        headers = {'X-Learning-Session': (await client.post(prefix+'/sandbox/sessions')).json()['data']['token']}
        prefix += '/sandbox'
    course = await create_course(client, prefix, headers)
    cid, chapter_id = course['id'], course['chapters'][0]['id']
    base = f'{prefix}/studio/courses/{cid}/chapters/{chapter_id}/subsections'
    assert (await client.post(base, headers=headers, json={'title':'   '})).status_code == 422
    for title, body in [('Course overview','First lesson content.'), ('Key concepts',''), ('Removed lesson','Recoverable lesson.')]:
        response = await client.post(base, headers=headers, json={'title':title,'body':body})
        assert response.status_code == 200, response.text
    chapter = response.json()['data']['chapters'][0]
    first, second, removed = chapter['subsections']
    assert first['body'] == 'First lesson content.'
    uploaded = await client.post(f'{prefix}/studio/courses/{cid}/chapters/{chapter_id}/materials', params={'filename':'lesson.pdf','subsection_id':removed['id']}, headers=dict(headers, **{'Content-Type':'application/pdf'}), content=b'%PDF-1.4\nOriginal handout\n%%EOF')
    assert uploaded.status_code == (403 if practice else 200), uploaded.text
    if not practice:
        assert uploaded.json()['data']['subsection_id'] == removed['id']
    assert (await client.post(base+'/'+second['id']+'/up', headers=headers)).status_code == 200
    ordered = (await client.get(f'{prefix}/studio/courses/{cid}', headers=headers)).json()['data']['chapters'][0]['subsections']
    assert [s['id'] for s in ordered] == [second['id'],first['id'],removed['id']]
    assert (await client.post(base+'/'+removed['id']+'/remove', headers=headers)).status_code == 200
    assert (await client.post(base+'/'+removed['id']+'/restore', headers=headers)).status_code == 200
    assert (await client.post(base+'/'+removed['id']+'/remove', headers=headers)).status_code == 200
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=headers)).status_code == 422
    assert (await client.put(base+'/'+second['id'], headers=headers, json={'title':'Key concepts','body':'Second lesson content.'})).status_code == 200
    # A subsection ID must belong to the chapter named in its URL.
    wrong = f'{prefix}/studio/courses/{cid}/chapters/{course["chapters"][1]["id"]}/subsections/{first["id"]}'
    assert (await client.put(wrong, headers=headers, json={'title':'Wrong chapter'})).status_code == 404
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=headers)).status_code == 200
    assert (await client.post(f'{prefix}/courses/{cid}/enroll', headers=headers)).status_code == 200
    public = (await client.get(f'{prefix}/courses/{cid}', headers=headers)).json()['data']
    assert [s['title'] for s in public['chapters'][0]['subsections']] == ['Key concepts','Course overview']
    assert public['chapters'][0]['body'] == 'Learning material.'  # Existing content is not overwritten.
    assert public['chapters'][0]['materials'] == []
    access = await client.get(f'{prefix}/courses/{cid}/chapters/{chapter_id}/materials', headers=headers)
    assert access.status_code == (403 if practice else 200)
    if not practice:
        assert access.json()['data'] == []
    assert public['percent'] == 0 and not public['final_unlocked']
    assert (await client.put(base+'/'+first['id'], headers=headers, json={'title':'Change live content'})).status_code == 409


@pytest.mark.asyncio
async def test_chapter_name_only_creation_and_subsection_owner_validation(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    owner, other = {'Authorization':f'Bearer {uuid4()}'}, {'Authorization':f'Bearer {uuid4()}'}
    course = await create_course(client, prefix, owner)
    cid = course['id']
    named = await client.post(f'{prefix}/studio/courses/{cid}/chapters', headers=owner, json={'title':'  New named chapter  '})
    assert named.status_code == 200
    chapter = named.json()['data']['chapters'][-1]
    assert chapter['title'] == 'New named chapter' and chapter['body'] == '' and chapter['subsections'] == []
    base = f'{prefix}/studio/courses/{cid}/chapters/{chapter["id"]}/subsections'
    assert (await client.post(base, headers=other, json={'title':'Unauthorized'})).status_code == 404
    assert (await client.post(base, headers=owner, json={'title':'Invalid video','video_url':'javascript:alert(1)'})).status_code == 422
    assert (await client.post(f'{prefix}/studio/courses/{cid}/chapters/{chapter["id"]}/materials', params={'filename':'lesson.pdf','subsection_id':'not-a-subsection'}, headers=dict(owner, **{'Content-Type':'application/pdf'}), content=b'%PDF-1.4\n%%EOF')).status_code == 404


@pytest.mark.asyncio
async def test_direct_subsection_videos_resume_independently_without_completion(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    owner = {'Authorization':f'Bearer {uuid4()}'}
    course = await create_course(client, prefix, owner)
    cid, chapter_id = course['id'], course['chapters'][0]['id']
    base = f'{prefix}/studio/courses/{cid}/chapters/{chapter_id}/subsections'
    for title in ['Introduction video','Demonstration']:
        response = await client.post(base, headers=owner, json={'title':title,'video_url':'https://example.org/lesson.mp4'})
        assert response.status_code == 200
    sections = response.json()['data']['chapters'][0]['subsections']
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=owner)).status_code == 200
    assert (await client.post(f'{prefix}/courses/{cid}/enroll', headers=owner)).status_code == 200
    for section, seconds in zip(sections,[12,27]):
        assert (await client.post(f'{prefix}/courses/{cid}/chapters/{chapter_id}/resume', headers=owner, json={'seconds':seconds,'subsection_id':section['id']})).status_code == 200
    public = (await client.get(f'{prefix}/courses/{cid}', headers=owner)).json()['data']
    assert public['enrollment']['resume'] == {f'{chapter_id}:subsection:{sections[0]["id"]}':12,f'{chapter_id}:subsection:{sections[1]["id"]}':27}
    assert public['percent'] == 0 and public['enrollment']['chapter_passes'] == {}


@pytest.mark.asyncio
async def test_native_learning_owner_isolation_and_full_assessment_flow(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    owner = {'Authorization': f'Bearer {uuid4()}'}
    other = {'Authorization': f'Bearer {uuid4()}'}
    assert (await client.get(prefix+'/courses')).status_code == 401
    course = await create_course(client, prefix, owner)
    cid = course['id']
    assert (await client.get(f'{prefix}/studio/courses/{cid}', headers=other)).status_code == 404
    assert (await client.post(f'{prefix}/courses/{cid}/enroll', headers=owner)).status_code == 409
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=owner)).status_code == 200
    assert (await client.post(f'{prefix}/studio/courses/{cid}/chapters', headers=owner, json={'title':'No','body':'No','skill':'No','minutes':1})).status_code == 409
    for headers in (owner, other):
        assert (await client.post(f'{prefix}/courses/{cid}/enroll', headers=headers)).status_code == 200
    public = (await client.get(f'{prefix}/courses/{cid}', headers=other)).json()['data']
    assert 'answer_key' not in str(public) and 'correct_index' not in str(public)
    assert public['final_questions'] == []
    second = course['chapters'][1]
    submit = f'{prefix}/courses/{cid}/assessments/'
    assert (await client.post(submit+'final/submit', headers=owner, json=responses(course['final_questions']))).status_code == 403
    assert (await client.post(submit+second['id']+'/submit', headers=owner, json={'answers':{}})).status_code == 422
    response = await client.post(submit+second['id']+'/submit', headers=owner, json=responses(second['questions']))
    assert response.status_code == 200, response.text
    attempt = response.json()['data']
    assert attempt['score'] == 100 and attempt['passed']
    assert 'Router → Connects networks' in attempt['details'][3]['expected']
    assert (await client.get(f'{prefix}/attempts/{attempt["id"]}', headers=other)).status_code == 404
    state = (await client.get(f'{prefix}/courses/{cid}', headers=owner)).json()['data']
    assert [(event['number'], event['title']) for event in state['milestones']] == [(2, 'Chapter 2')]
    assert not state['final_unlocked']
    first = course['chapters'][0]
    await client.post(submit+first['id']+'/submit', headers=owner, json=responses(first['questions']))
    state = (await client.get(f'{prefix}/courses/{cid}', headers=owner)).json()['data']
    assert [event['number'] for event in state['milestones']] == [2, 1]
    assert state['final_unlocked'] and not state['complete']
    await client.post(submit+'final/submit', headers=owner, json=responses(course['final_questions']))
    badge = (await client.get(prefix+'/badges', headers=owner)).json()['data'][0]
    await client.post(submit+'final/submit', headers=owner, json=responses(course['final_questions'], False))
    await client.post(submit+second['id']+'/submit', headers=owner, json=responses(second['questions'], False))
    assert (await client.get(prefix+'/badges', headers=owner)).json()['data'] == [badge]
    state = (await client.get(f'{prefix}/courses/{cid}', headers=owner)).json()['data']
    assert state['complete'] and state['percent'] == 100
    assert [event['number'] for event in state['milestones']] == [2, 1]
    other_state = (await client.get(f'{prefix}/courses/{cid}', headers=other)).json()['data']
    assert other_state['percent'] == 0 and other_state['milestones'] == []

    # Publishing is reversible for authors: taking a course offline unlocks the
    # editor, while deletion removes access without erasing earned badge data.
    assert (await client.post(f'{prefix}/studio/courses/{cid}/unpublish', headers=other)).status_code == 404
    offline = await client.post(f'{prefix}/studio/courses/{cid}/unpublish', headers=owner)
    assert offline.status_code == 200 and not offline.json()['data']['published']
    assert (await client.get(f'{prefix}/courses/{cid}', headers=other)).status_code == 404
    renamed = await client.put(f'{prefix}/studio/courses/{cid}', headers=owner, json={
        'title':'Updated hosted networking', 'provider':'Original demo partner',
        'description':'Updated after publication.', 'category':'Networking',
    })
    assert renamed.status_code == 200 and renamed.json()['data']['title'] == 'Updated hosted networking'
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=owner)).status_code == 200
    assert (await client.delete(f'{prefix}/studio/courses/{cid}', headers=other)).status_code == 404
    deleted = await client.delete(f'{prefix}/studio/courses/{cid}', headers=owner)
    assert deleted.status_code == 200 and deleted.json()['data']['deleted']
    assert (await client.get(f'{prefix}/studio/courses/{cid}', headers=owner)).status_code == 404
    saved_badge = (await client.get(prefix+'/badges', headers=owner)).json()['data'][0]
    assert saved_badge['badge_code'] == badge['badge_code']
    assert saved_badge['title'] == 'Hosted networking'


@pytest.mark.asyncio
async def test_sandbox_is_interactive_isolated_and_never_uses_account_database(learning_client):
    async def forbidden():
        raise AssertionError('Practice must not touch the account database.')
    app.dependency_overrides[get_db] = forbidden
    client = learning_client
    prefix = '/api/v1/learning/sandbox'
    token = (await client.post(prefix+'/sessions')).json()['data']['token']
    headers = {'X-Learning-Session': token}
    second_token = (await client.post(prefix+'/sessions')).json()['data']['token']
    other = {'X-Learning-Session': second_token}
    assert (await client.get(prefix+'/courses')).status_code == 410
    sample = await create_course(client, prefix, headers)
    cid = sample['id']
    await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=headers)
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=headers)
    chapter = sample['chapters'][1]
    await client.post(f'{prefix}/courses/{cid}/assessments/{chapter["id"]}/submit', headers=headers, json=responses(chapter['questions']))
    course = (await client.get(f'{prefix}/courses/{cid}', headers=headers)).json()['data']
    assert course['milestones'][0]['number'] == 2 and len(course['milestones']) == 1
    assert (await client.get(f'{prefix}/courses/{cid}', headers=other)).status_code == 404
    draft = await create_course(client, prefix, headers)
    assert (await client.get(f'{prefix}/studio/courses/{draft["id"]}', headers=other)).status_code == 404


@pytest.mark.asyncio
async def test_authoring_batch_edit_soft_delete_restore_and_publish_gates(learning_client):
    client = learning_client
    prefix = '/api/v1/learning/sandbox'
    token = (await client.post(prefix+'/sessions')).json()['data']['token']
    headers = {'X-Learning-Session': token}
    course = await create_course(client, prefix, headers)
    base = f'{prefix}/studio/courses/{course["id"]}'
    before = len(course['final_questions'])
    bad = mixed_questions()
    bad[1]['correct_indices'] = [0]
    assert (await client.post(base+'/questions/final', headers=headers, json={'questions': bad})).status_code == 422
    assert len((await client.get(base, headers=headers)).json()['data']['final_questions']) == before
    question = course['final_questions'][2]
    revised = dict(mixed_questions()[2], accepted_answers='IPv4\nIPv6')
    updated = await client.put(base+'/questions/final/'+question['id'], headers=headers, json={'questions':[revised]})
    assert updated.json()['data']['final_questions'][2]['answer_key'] == ['IPv4', 'IPv6']
    await client.post(base+'/questions/final/'+question['id']+'/delete', headers=headers)
    deleted = (await client.get(base, headers=headers)).json()['data']
    assert deleted['final_question_count'] == before - 1
    await client.post(base+'/questions/final/'+question['id']+'/restore', headers=headers)
    assert (await client.get(base, headers=headers)).json()['data']['final_question_count'] == before
    for question in course['chapters'][0]['questions']:
        await client.post(base+'/questions/'+course['chapters'][0]['id']+'/'+question['id']+'/delete', headers=headers)
    assert (await client.post(base+'/publish', headers=headers)).status_code == 422


@pytest.mark.asyncio
async def test_video_resume_validates_urls_and_never_completes_a_chapter(learning_client):
    client = learning_client
    prefix = '/api/v1/learning/sandbox'
    token = (await client.post(prefix+'/sessions')).json()['data']['token']
    headers = {'X-Learning-Session': token}
    course = await create_course(client, prefix, headers)
    chapter = course['chapters'][0]
    path = f'{prefix}/studio/courses/{course["id"]}/chapters/{chapter["id"]}'
    body = {key: chapter[key] for key in ('title', 'body', 'skill', 'minutes')}
    for video in ('http://example.org/video.mp4', 'https://example.org/page', 'https://name:password@example.org/video.mp4'):
        assert (await client.put(path, headers=headers, json=dict(body, video_url=video))).status_code == 422
    assert (await client.put(path, headers=headers, json=dict(body, video_url='https://example.org/authorized.mp4'))).status_code == 200
    await client.post(f'{prefix}/studio/courses/{course["id"]}/publish', headers=headers)
    await client.post(f'{prefix}/courses/{course["id"]}/enroll', headers=headers)
    path = f'{prefix}/courses/{course["id"]}/chapters/{chapter["id"]}/resume'
    assert (await client.post(path, headers=headers, json={'seconds':45})).status_code == 200
    assert (await client.post(path, headers=headers, json={'seconds':-1})).status_code == 422
    current = (await client.get(f'{prefix}/courses/{course["id"]}', headers=headers)).json()['data']
    assert current['enrollment']['resume'][chapter['id']] == 45
    assert current['percent'] == 0 and current['milestones'] == []


@pytest.mark.asyncio
async def test_partner_logo_validation_persistence_edit_and_removal(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    headers = {'Authorization': f'Bearer {uuid4()}'}
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jitcAAAAASUVORK5CYII='
    body = dict(title='Logo test', provider='Demo partner', description='Logo validation test.', category='Cybersecurity', provider_logo=png)
    response = await client.post(prefix+'/studio/courses', headers=headers, json=body)
    assert response.status_code == 200, response.text
    course = response.json()['data']
    path = prefix+'/studio/courses/'+course['id']
    assert (await client.get(path, headers=headers)).json()['data']['provider_logo'] == png
    for unsafe in ('javascript:alert(1)', 'http://example.org/logo.png', 'https://user:password@example.org/logo.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,bm90LWFuLWltYWdl', 'data:image/png;base64,'+base64.b64encode(b'x'*(256*1024+1)).decode()):
        assert (await client.put(path, headers=headers, json=dict(body, provider_logo=unsafe))).status_code == 422
    assert (await client.get(path, headers=headers)).json()['data']['provider_logo'] == png
    remote = 'https://example.org/authorized-logo.png'
    assert (await client.put(path, headers=headers, json=dict(body, provider_logo=remote))).json()['data']['provider_logo'] == remote
    without_logo = {key: value for key, value in body.items() if key != 'provider_logo'}
    assert (await client.put(path, headers=headers, json=without_logo)).json()['data']['provider_logo'] == remote
    assert (await client.put(path, headers=headers, json=dict(body, provider_logo=''))).json()['data']['provider_logo'] == ''


@pytest.mark.asyncio
@pytest.mark.parametrize('sandbox', [False, True])
async def test_empty_catalogue_manual_authoring_and_final_badge(learning_client, sandbox):
    client = learning_client
    prefix = '/api/v1/learning' + ('/sandbox' if sandbox else '')
    headers = {'Authorization': f'Bearer {uuid4()}'}
    if sandbox:
        token = (await client.post(prefix+'/sessions')).json()['data']['token']
        headers = {'X-Learning-Session': token}
    assert (await client.get(prefix+'/courses', headers=headers)).json()['data'] == []
    course = await create_course(client, prefix, headers)
    cid = course['id']
    await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=headers)
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=headers)
    submit = f'{prefix}/courses/{cid}/assessments/'
    assert (await client.post(submit+'final/submit', headers=headers, json=responses(course['final_questions']))).status_code == 403
    for chapter in reversed(course['chapters']):
        result = await client.post(submit+chapter['id']+'/submit', headers=headers, json=responses(chapter['questions']))
        assert result.status_code == 200 and result.json()['data']['passed']
    result = (await client.post(submit+'final/submit', headers=headers, json=responses(course['final_questions']))).json()['data']
    assert result['passed']
    badge = (await client.get(prefix+'/badges', headers=headers)).json()['data'][0]
    assert badge['course_id'] == cid and not badge['sample']
    assert (await client.delete(f'{prefix}/studio/courses/{cid}', headers=headers)).status_code == 200
    assert (await client.get(prefix+'/courses', headers=headers)).json()['data'] == []
    assert (await client.get(prefix+'/badges', headers=headers)).json()['data'][0]['badge_code'] == badge['badge_code']


@pytest.mark.asyncio
async def test_uploaded_pdf_video_access_streaming_resume_and_readonly_publish(learning_client, monkeypatch):
    from app import learning_media
    client = learning_client
    prefix = '/api/v1/learning'
    headers, other = ({'Authorization': f'Bearer {uuid4()}'} for _ in range(2))
    course = await create_course(client, prefix, headers)
    cid, chapter = course['id'], course['chapters'][0]
    author = f'{prefix}/studio/courses/{cid}/chapters/{chapter["id"]}'
    learner = f'{prefix}/courses/{cid}/chapters/{chapter["id"]}'
    # Drafts may be PDF/video-only; saving text must not overwrite attached files.
    fields = dict(title=chapter['title'], body='', skill=chapter['skill'], minutes=10)
    assert (await client.put(author, headers=headers, json=fields)).status_code == 200
    pdf = b'%PDF-1.4\nOriginal test lesson\n%%EOF'
    mp4 = b'\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isommp42'
    materials = []
    for name, mime, content in [('lesson.pdf','application/pdf',pdf), ('demo.mp4','video/mp4',mp4)]:
        response = await client.post(author+'/materials', params={'filename':name}, headers={**headers,'Content-Type':mime}, content=content)
        assert response.status_code == 200, response.text
        materials.append(response.json()['data'])
    assert (await client.post(author+'/materials', params={'filename':'other.pdf'}, headers={**other,'Content-Type':'application/pdf'}, content=pdf)).status_code == 404
    assert (await client.get(author+'/materials', headers=other)).status_code == 404
    assert (await client.get(learner+'/materials', headers=headers)).status_code == 403
    access = (await client.get(author+'/materials', headers=headers)).json()['data']
    response = await client.get(access[0]['url'])
    assert response.status_code == 200 and response.content == pdf
    assert response.headers['content-type'] == 'application/pdf'
    assert response.headers['cache-control'] == 'private, no-store'
    response = await client.get(access[1]['url'], headers={'Range':'bytes=4-11'})
    assert response.status_code == 206 and response.content == mp4[4:12]
    assert response.headers['accept-ranges'] == 'bytes'
    assert 'attachment' in (await client.get(access[0]['download_url'])).headers['content-disposition']
    assert access[0]['url'].startswith(ORIGIN + '/storage/v1/object/sign/')
    assert (await client.get('/api/v1/learning/media/'+materials[0]['id'])).status_code == 404
    assert (await client.get(access[0]['url']+'x')).status_code == 403
    from urllib.parse import urlsplit, parse_qs
    swapped = urlsplit(access[1]['url'])._replace(query=urlsplit(access[0]['url']).query).geturl()
    assert (await client.get(swapped)).status_code == 403
    token = parse_qs(urlsplit(access[0]['url']).query)['token'][0]
    key, _ = learning_media.test_cloud.tokens[token]
    learning_media.test_cloud.tokens[token] = (key, 0)
    assert (await client.get(access[0]['url'])).status_code == 403
    # A different backend instance can issue a fresh working link without a
    # local disk or a process-specific signing key.
    fresh = (await client.get(author+'/materials', headers=headers)).json()['data']
    assert (await client.get(fresh[0]['url'])).content == pdf
    pdf_id, video_id = [material['id'] for material in materials]
    assert (await client.post(author+f'/materials/{pdf_id}/remove', headers=headers)).status_code == 200
    assert [m['id'] for m in (await client.get(author+'/materials', headers=headers)).json()['data']] == [video_id]
    assert (await client.post(author+f'/materials/{pdf_id}/restore', headers=headers)).status_code == 200
    saved = (await client.put(author, headers=headers, json=fields)).json()['data']
    assert len(saved['chapters'][0]['materials']) == 2 and not saved['chapters'][0]['body']
    assert (await client.post(f'{prefix}/studio/courses/{cid}/publish', headers=headers)).status_code == 200
    assert (await client.get(learner+'/materials', headers=other)).status_code in (403,404)
    # Account learners can enroll; practice courses remain isolated from other sessions.
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=headers)
    assert len((await client.get(learner+'/materials', headers=headers)).json()['data']) == 2
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=other)
    assert len((await client.get(learner+'/materials', headers=other)).json()['data']) == 2
    assert learning_media.test_cloud.calls[-1].headers['Authorization'] == other['Authorization']
    assert (await client.post(learner+'/resume', headers=headers, json={'seconds':23,'material_id':video_id})).status_code == 200
    assert (await client.post(learner+'/resume', headers=headers, json={'seconds':23,'material_id':pdf_id})).status_code == 403
    state = (await client.get(f'{prefix}/courses/{cid}', headers=headers)).json()['data']
    assert state['enrollment']['resume'][chapter['id']+':'+video_id] == 23
    assert state['percent'] == 0 and not state['milestones']
    assert (await client.post(author+'/materials', params={'filename':'new.pdf'}, headers={**headers,'Content-Type':'application/pdf'}, content=pdf)).status_code == 409
    assert (await client.post(author+f'/materials/{pdf_id}/remove', headers=headers)).status_code == 409


@pytest.mark.asyncio
async def test_learning_upload_validation_limits_cleanup_and_empty_publish_gate(learning_client, monkeypatch):
    from app import learning_media
    client = learning_client
    prefix = '/api/v1/learning'
    headers = {'Authorization':f'Bearer {uuid4()}'}
    course = await create_course(client, prefix, headers)
    chapter = course['chapters'][0]
    author = f'{prefix}/studio/courses/{course["id"]}/chapters/{chapter["id"]}'
    fields = dict(title=chapter['title'], body='', skill=chapter['skill'])
    await client.put(author, headers=headers, json=fields)
    assert (await client.post(f'{prefix}/studio/courses/{course["id"]}/publish', headers=headers)).status_code == 422
    for name, mime, content, status in [
        ('script.html','text/html',b'<html/>',415),
        ('fake.pdf','application/pdf',b'<script>not a PDF</script>',415),
        ('empty.pdf','application/pdf',b'',415),
        ('bad.mp4','video/mp4',b'not a video',415),
        ('lesson.pdf','text/html',b'%PDF-1.4',415),
        ('../lesson.pdf','application/pdf',b'%PDF-1.4',422),
    ]:
        response = await client.post(author+'/materials', params={'filename':name}, headers={**headers,'Content-Type':mime}, content=content)
        assert response.status_code == status, response.text
    assert not learning_media.test_cloud.objects
    monkeypatch.setitem(learning_media.FILE_TYPES, '.pdf', ('pdf','application/pdf',16))
    assert (await client.post(author+'/materials', params={'filename':'large.pdf'}, headers={**headers,'Content-Type':'application/pdf'}, content=b'%PDF-1.4'+b'x'*30)).status_code == 413
    async def chunks():
        yield b'%PDF-1.4'
        yield b'x'*20
    response = await client.post(author+'/materials', params={'filename':'chunked.pdf'}, headers={**headers,'Content-Type':'application/pdf'}, content=chunks())
    assert response.status_code == 413
    assert not learning_media.test_cloud.objects

