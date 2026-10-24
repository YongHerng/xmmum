"""Generic PDF-only course authoring, independent of any bundled course data."""
from uuid import uuid4
import pytest
from test_hosted_learning import learning_client, mixed_questions, responses


@pytest.mark.asyncio
async def test_pdf_only_subsections_author_publish_and_complete(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    author = {'Authorization': f'Bearer {uuid4()}'}
    learner = {'Authorization': f'Bearer {uuid4()}'}
    created = await client.post(prefix+'/studio/courses', headers=author, json={
        'title':'An authored course', 'provider':'Test provider',
        'description':'Course content supplied through authoring endpoints.',
    })
    assert created.status_code == 200
    cid = created.json()['data']['id']
    studio = f'{prefix}/studio/courses/{cid}'
    content = b'%PDF-1.4\nA temporary upload fixture, not a bundled course.\n%%EOF'
    for number in range(1, 4):
        result = await client.post(studio+'/chapters', headers=author, json={'title':f'Topic {number}'})
        chapter = result.json()['data']['chapters'][-1]
        base = f'{studio}/chapters/{chapter["id"]}'
        result = await client.post(base+'/subsections', headers=author, json={'title':'Lesson'})
        section = result.json()['data']['chapters'][-1]['subsections'][0]
        uploaded = await client.post(base+'/materials', headers={**author,'Content-Type':'application/pdf'},
            params={'filename':f'lesson-{number}.pdf','subsection_id':section['id']}, content=content)
        assert uploaded.status_code == 200
        result = await client.post(studio+'/questions/'+chapter['id'], headers=author, json={'questions':mixed_questions()})
        assert result.status_code == 200
    await client.post(studio+'/questions/final', headers=author, json={'questions':mixed_questions()})
    published = await client.post(studio+'/publish', headers=author)
    assert published.status_code == 200
    course = published.json()['data']
    assert course['chapter_count'] == 3
    for chapter in course['chapters']:
        assert chapter['body'] == '' and chapter['subsections'][0]['body'] == ''
        assert {q['question_type'] for q in chapter['questions']} == {'single','multiple','fill','matching'}
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=learner)
    submit = f'{prefix}/courses/{cid}/assessments/'
    assert (await client.post(submit+'final/submit', headers=learner, json=responses(course['final_questions']))).status_code == 403
    # Every request opens a fresh DB session: the course is read from persisted
    # data, not from a source package or an importer's in-memory return value.
    for index in (1, 0, 2):
        chapter = course['chapters'][index]
        access = (await client.get(f'{prefix}/courses/{cid}/chapters/{chapter["id"]}/materials', headers=learner)).json()['data']
        assert len(access) == 1 and access[0]['subsection_id'] == chapter['subsections'][0]['id']
        assert (await client.get(access[0]['url'])).content == content
        passed = await client.post(submit+chapter['id']+'/submit', headers=learner, json=responses(chapter['questions']))
        assert passed.json()['data']['passed']
    state = (await client.get(f'{prefix}/courses/{cid}', headers=learner)).json()['data']
    assert [event['number'] for event in state['milestones']] == [2, 1, 3]
    assert state['final_unlocked'] and not state['complete']
    result = await client.post(submit+'final/submit', headers=learner, json=responses(course['final_questions']))
    assert result.json()['data']['passed']
    badges = (await client.get(prefix+'/badges', headers=learner)).json()['data']
    assert len(badges) == 1 and badges[0]['course_id'] == cid
    assert (await client.get(f'{prefix}/courses/{cid}', headers=learner)).json()['data']['complete']
