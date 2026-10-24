from pathlib import Path
import pymupdf as fitz
import pytest
from app.demo import demo_snapshot


@pytest.mark.parametrize('persona,skill', [('student','networking'),('professional','data-center')])
def test_expected_outcomes_are_authored_and_consistent(persona, skill):
    data = demo_snapshot(persona)
    assert data['demo'] and data['read_only']
    assert data['evaluation']['analysis_mode'] == 'demo-ai-rating'
    assert len(data['evaluation']['breakdown']) == 6
    assert sum(row['weight'] for row in data['evaluation']['breakdown']) == 100
    assert abs(data['evaluation']['score'] - sum(row['score']*row['weight']/100 for row in data['evaluation']['breakdown'])) < .5
    outcomes = data['demo_outcomes']
    assert set(outcomes['outlooks']) == {'5','10','15'}
    assert outcomes['badges'][0]['skills'][0]['skill_id'] == skill
    assert not outcomes['badges'][0]['matching_eligible']
    assert outcomes['career']['search']['jobs'] and not outcomes['career']['search']['auto_refresh']
    ids = {course['id'] for course in outcomes['courses']}
    for job in outcomes['career']['search']['jobs']:
        assert not job['apply_url'] and job['company'].startswith('Example ')
        for gap in job['assessment']['skill_gaps']:
            assert all(course['id'] in ids for course in gap['courses'])
    for course in outcomes['courses']:
        assert len(course['chapters']) == 3
        assert len(course['assessed_skills']) == 1
        assert {q['question_type'] for q in course['chapters'][0]['questions']} == {'single','multiple','fill','matching'}
        assert all(len(chapter['subsections']) == 2 for chapter in course['chapters'])
    completed = next(course for course in outcomes['courses'] if course['complete'])
    assert [row['number'] for row in completed['milestones']] == [2,1,3]
    outcomes['courses'].clear()
    assert len(demo_snapshot(persona)['demo_outcomes']['courses']) == 4


def test_bundled_pdfs_are_labelled_and_readable():
    root = Path(__file__).resolve().parents[2] / 'frontend/public/demos'
    paths = list(root.glob('*.pdf'))
    assert len(paths) == 6
    for path in paths:
        with fitz.open(path) as doc:
            assert 1 <= len(doc) <= 3
            assert all('FICTIONAL DEMO' in page.get_text() for page in doc)
            assert all(len(page.get_text()) > 150 for page in doc)
