"""Four optional live checks using synthetic data only; never writes accounts."""
import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.ai import review_cv
from app.ai_provider import AIUnavailable, generate
from app.ai_routes import personalise, PersonaliseRequest
from app.config import settings
from app.cv_ai import rewrite_cv, MatchExplanations
from app.engine import evaluate, matches
from app.schemas import CV, Answers


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Submit four bounded synthetic requests to the configured provider.')
    args = parser.parse_args()
    if not args.live:
        print('No requests submitted. Use --live to run four synthetic checks.')
        return
    settings.ai_enabled = True
    settings.ai_max_output_tokens = 4096
    actor = 'operator-synthetic-workflows'
    cv = CV(summary='I have used SQL to create 3 dashboards for a student project. I want to work with data.',
            projects='Built 3 SQL dashboards for a student project.', skills=['SQL'], ai_consent=True)
    initial = cv.model_dump()
    score = evaluate(cv)
    report = {}
    try:
        review = await review_cv(cv, actor)
        report['review'] = bool(review and review.get('summary'))
    except AIUnavailable:
        report['review'] = False
    try:
        draft = await rewrite_cv(cv, actor, ['summary'])
        report['rewrite'] = bool(draft)
    except AIUnavailable as exc:
        report['rewrite'] = str(exc)
    try:
        preview = await personalise(PersonaliseRequest(ai_consent=True, answers=Answers(budget=100,weekly_hours=3),
            notes='I enjoy analysing data and solving problems with SQL. I prefer structured analytical work and career growth.'), user=actor)
        report['personalisation'] = preview['data']['answers']['budget'] == 100 and preview['data']['answers']['weekly_hours'] == 3
    except Exception as exc:
        report['personalisation'] = str(exc.detail) if hasattr(exc, 'detail') else type(exc).__name__
    try:
        ranked = matches(cv, Answers())
        result = await generate('career-explanations', 'Explain each supplied ranked career using only its existing '
            'skills, gaps and score. Return exactly one explanation per supplied role ID. No vacancies, '
            'certification claims or numerical forecasts.',
            {'matches':[{key:item[key] for key in ('id','title','score','gaps','matched_skills')} for item in ranked]},
            MatchExplanations, actor=actor)
        report['career_explanations'] = {item.role_id for item in result.explanations} == {item['id'] for item in ranked}
    except AIUnavailable as exc:
        report['career_explanations'] = str(exc)
    report['original_unchanged'] = cv.model_dump() == initial and evaluate(cv) == score
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
