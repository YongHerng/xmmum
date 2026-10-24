from copy import deepcopy
from uuid import uuid4
import pytest

from app.engine import matches, evaluate
from app.schemas import CV, Answers
from app.hosted_learning import Entry, PRACTICE
from app.skill_evidence import badge_evidence, skill_profile, assessed_skills
from test_hosted_learning import learning_client, create_course, responses


def evidence(level='foundation', code='FP-TEST'):
    return [dict(badge_code=code, course_id='course', title='Network basics', provider='Test',
                 completed_at='2026-10-24T00:00:00Z', attempt_id='final-pass', course_revision=1,
                 skills=[dict(skill_id='networking', level=level)])]


def role(results, key='cloud-support'):
    return next(item for item in results if item['id'] == key)


def test_badges_extend_skills_not_cv_or_global_score_bonus():
    cv, answers = CV(), Answers()
    before = deepcopy(cv.model_dump())
    base = matches(cv, answers)
    learned = matches(cv, answers, badge_evidence=evidence())
    cloud = role(learned)
    assert cloud['components'][0]['score'] == 17  # 0.5 / 3 technical requirements
    assert cloud['matched_skills'] == [{'id':'networking','name':'Networking'}]
    assert next(g for g in cloud['gaps'] if g['id'] == 'networking')['partial']
    assert 'foundation' == cloud['skill_evidence'][0]['level']
    unrelated = role(learned, 'data-analyst')
    assert unrelated['score'] == role(base, 'data-analyst')['score']
    assert cv.model_dump() == before and evaluate(cv)['score'] == 0


def test_strongest_skill_once_and_cv_claim_gets_provenance_not_bonus():
    cv, answers = CV(skills=['Computer networks']), Answers()
    claimed = role(matches(cv, answers))
    backed = role(matches(cv, answers, badge_evidence=evidence()))
    assert claimed['score'] == backed['score']
    assert backed['skill_evidence'][0]['cv_claimed']
    assert backed['skill_evidence'][0]['badges'][0]['badge_code'] == 'FP-TEST'
    many = evidence() + evidence('intermediate', 'FP-SECOND') + evidence('foundation', 'FP-THIRD')
    profile = skill_profile([], many)
    assert len(profile) == 1 and profile[0]['credit'] == .75
    assert len(profile[0]['badges']) == 3
    assert role(matches(CV(), answers, badge_evidence=many))['components'][0]['score'] == 25
    assert skill_profile([], many + evidence('advanced', 'FP-FOURTH'))[0]['credit'] == 1


@pytest.mark.parametrize('mapping', [
    [{'skill_id':'invented','level':'foundation'}], [{'skill_id':'networking','level':'expert'}],
    [{'skill_id':'networking','level':[]}], [{'skill_id':'networking','level':'foundation','credit':100}],
    [{'skill_id':'networking','level':'foundation'}]*2,
])
def test_author_mapping_is_controlled_not_free_text_or_client_credit(mapping):
    with pytest.raises(ValueError):
        Entry(title='Course', provider='Provider', description='Description', assessed_skills=mapping)


def test_legacy_sample_and_practice_badges_do_not_affect_personal_matches():
    completion = dict(badge_code='FP-TEST', attempt_id='attempt', completed_at='2026-10-24',
                      badge_skills=[dict(skill_id='networking', level='foundation')])
    def enrollment(**changes):
        return dict(course_id='course', completion=completion | changes)
    assert len(badge_evidence([enrollment()])) == 1
    assert badge_evidence([enrollment(badge_sample=True), enrollment(badge_practice=True), enrollment(badge_skills=[])]) == []
    assert assessed_skills([]) == []  # Completion-only courses remain valid.


@pytest.mark.asyncio
async def test_final_award_immediately_changes_all_match_paths_and_preserves_snapshot(learning_client):
    client = learning_client
    prefix = '/api/v1/learning'
    author, learner, other = [{'Authorization':f'Bearer {uuid4()}'} for _ in range(3)]
    catalogue = (await client.get(prefix+'/skills', headers=author)).json()['data']
    assert any(s['id'] == 'networking' for s in catalogue['skills'])
    assert [level['credit'] for level in catalogue['levels']] == [.5,.75,1]
    course = await create_course(client, prefix, author)
    cid = course['id']
    studio = f'{prefix}/studio/courses/{cid}'
    mapping = [{'skill_id':'networking','level':'foundation'}]
    body = {key:course[key] for key in ('title','provider','description')}
    changed = await client.put(studio, headers=author, json=body | {'assessed_skills':mapping})
    assert changed.status_code == 200  # No admin-review gate in this implementation.
    await client.post(studio+'/publish', headers=author)
    assert (await client.post('/api/v1/careers/match', headers=learner, json={})).status_code == 422
    await client.post(f'{prefix}/courses/{cid}/enroll', headers=learner)
    submit = f'{prefix}/courses/{cid}/assessments/'
    for chapter in reversed(course['chapters']):
        await client.post(submit+chapter['id']+'/submit', headers=learner, json=responses(chapter['questions']))
    assert (await client.get(prefix+'/badges', headers=learner)).json()['data'] == []
    failed = await client.post(submit+'final/submit', headers=learner, json=responses(course['final_questions'], False))
    assert not failed.json()['data']['passed']
    assert (await client.get('/api/v1/dashboard', headers=learner)).json()['data']['skill_evidence'] == []
    await client.post(submit+'final/submit', headers=learner, json=responses(course['final_questions']))
    badge = (await client.get(prefix+'/badges', headers=learner)).json()['data'][0]
    assert badge['matching_eligible'] and badge['course_revision'] == 1
    assert badge['skills'] == [mapping[0] | {'name':'Networking'}]
    dashboard = (await client.get('/api/v1/dashboard', headers=learner)).json()['data']
    assert dashboard['cv']['skills'] == [] and dashboard['evaluation'] is None
    direct = (await client.post('/api/v1/careers/match', headers=learner, json={})).json()['data']['matches']
    scenario = (await client.post('/api/v1/forecasts/scenarios', headers=learner, json={})).json()['data']['matches']
    assert direct == scenario == dashboard['matches']
    assert role(direct)['components'][0]['score'] == 17
    assert (await client.get('/api/v1/dashboard', headers=other)).json()['data']['skill_evidence'] == []
    assert (await client.get(prefix+'/badges', headers=author)).json()['data'] == []
    # Repeats, course edits, and deletion never rewrite an issued badge's mapping.
    await client.post(submit+'final/submit', headers=learner, json=responses(course['final_questions']))
    await client.post(studio+'/unpublish', headers=author)
    await client.put(studio, headers=author, json=body | {'title':'Renamed course','assessed_skills':[{'skill_id':'linux','level':'advanced'}]})
    await client.post(studio+'/publish', headers=author)
    assert (await client.get(prefix+'/badges', headers=learner)).json()['data'][0] == badge
    await client.delete(studio, headers=author)
    assert (await client.get(prefix+'/badges', headers=learner)).json()['data'][0] == badge
    after = (await client.get('/api/v1/dashboard', headers=learner)).json()['data']
    assert after['matches'] == direct


@pytest.mark.asyncio
async def test_practice_can_demonstrate_badge_mapping_without_personal_score_credit(learning_client):
    client = learning_client
    token = (await client.post('/api/v1/learning/sandbox/sessions')).json()['data']['token']
    headers = {'X-Learning-Session':token}
    prefix = '/api/v1/learning/sandbox'
    course = await create_course(client, prefix, headers)
    studio = f'{prefix}/studio/courses/{course["id"]}'
    await client.put(studio, headers=headers, json={key:course[key] for key in ('title','provider','description')} | {'assessed_skills':[{'skill_id':'networking','level':'foundation'}]})
    await client.post(studio+'/publish', headers=headers)
    await client.post(f'{prefix}/courses/{course["id"]}/enroll', headers=headers)
    for target in [c['id'] for c in course['chapters']]+['final']:
        questions = course['final_questions'] if target == 'final' else next(c['questions'] for c in course['chapters'] if c['id'] == target)
        await client.post(f'{prefix}/courses/{course["id"]}/assessments/{target}/submit', headers=headers, json=responses(questions))
    badge = (await client.get(prefix+'/badges', headers=headers)).json()['data'][0]
    assert badge['skills'] and not badge['matching_eligible']
    assert badge_evidence(list(PRACTICE[token]['enrollments'].values())) == []
