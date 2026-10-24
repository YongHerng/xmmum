"""Model-assigned rubric scores. The server validates evidence and adds weights only."""
from datetime import datetime, UTC
from typing import Literal
from pydantic import Field
from .ai_provider import generate, scrub, AIUnavailable
from .config import settings
from .schemas import StrictModel
from .catalog import get_role, label
from .engine import normalize_skills
from .cv_ai import compact
from .skill_grounding import resolve_skill_name

PARAMETERS = {'clarity':('Clarity & readability',20), 'evidence':('Evidence & specificity',20),
              'relevance':('Target-role relevance',20), 'organisation':('Organization',15),
              'skills':('Skills presentation',15), 'completeness':('Completeness',10)}
RUBRIC_VERSION = 'ai-cv-rubric-2'


class Criterion(StrictModel):
    parameter: Literal['clarity','evidence','relevance','organisation','skills','completeness']
    score: int = Field(ge=0, le=100, strict=True)
    explanation: str = Field(min_length=10,max_length=800)
    evidence_line_ids: list[int] = Field(max_length=3)


class CareerDirection(StrictModel):
    title: str = Field(min_length=3,max_length=150)
    explanation: str = Field(min_length=10,max_length=650)
    supporting_skills: list[str] = Field(max_length=6)
    next_steps: list[str] = Field(min_length=1,max_length=3)


class Assessment(StrictModel):
    criteria: list[Criterion] = Field(min_length=6,max_length=6)
    strengths: list[str] = Field(min_length=1,max_length=5)
    suggestions: list[str] = Field(min_length=1,max_length=6)
    summary: str = Field(min_length=10,max_length=1200)
    direction: CareerDirection | None = None


def ground_direction(direction, supplied):
    """Return original evidence labels, or omit the optional direction as a whole.

    A model can use a catalogue synonym (e.g. SQL for PostgreSQL), but must not
    introduce another ability. Restoring the actual supplied label also avoids
    presenting a narrower alias as a new qualification. Free-form direction text
    may repeat unsupported claims, so merely deleting one chip is not sufficient.
    """
    if direction is None:
        return None, None
    grounded = []
    for value in direction.supporting_skills:
        actual = resolve_skill_name(value, supplied)
        if actual is None:
            return None, 'Your CV was assessed. The optional career direction was omitted because its supporting skills could not be verified.'
        if actual not in grounded:
            grounded.append(actual)
    return direction.model_copy(update={'supporting_skills': grounded}).model_dump(), None


async def assess_cv(cv, actor, *, profile=None):
    role = get_role(cv.target_role)
    source = scrub({key:value for key,value in cv.model_dump().items()
                    if key not in ('name','email','phone','ai_consent')}, cv)
    evidence_text = scrub('\n'.join([cv.summary,cv.education,cv.experience,cv.projects,
                                    cv.membership_licensure,cv.certificates_training,*cv.skills,
                                    *[section.content for section in cv.additional_sections]]),cv)
    lines=[line.strip() for line in evidence_text.splitlines() if line.strip()]
    supplied=list(cv.skills)+[label(item['skill_id']) for badge in (profile or {}).get('badges',[]) for item in badge.get('skills',[])]
    result = await generate('cv-rating',
        'Evaluate this CV yourself against ALL six rubric parameters. Assign each 0-100 score using judgment, '
        'not counts of words or numbers. Anchors: 0 absent; 25 weak; 50 adequate but generic; 75 strong and '
        'specific; 90-100 exceptional evidence and presentation. Assess clarity, evidence, target-role relevance, '
        'organisation, skill specificity and completeness. Do not penalise identity/contact fields omitted for privacy. '
        'Assess textual organisation only, not unseen visual layout. Return each parameter exactly once. '
        'Explain each score and cite up to three one-based evidence_line_ids from cv_lines; use [] when a section '
        'is absent. Dates alone are not achievement evidence. Course badges are learning evidence, not employment '
        'experience or official certification. Do not infer demographic traits, hiring chances or ATS results. '
        'Also return direction: the best-supported job DIRECTION for this person, not merely their selected target. '
        'Consider their CV, explicit preferences and earned learning evidence. Use a realistic role-family title, '
        'explain why, quote supporting_skills VERBATIM from available_skill_names, and give up to three '
        'development steps. Do not claim this is an actual vacancy, guaranteed eligibility or a hiring forecast. '
        'When evidence is insufficient, return direction=null instead of guessing.',
        {'cv':source, 'cv_lines':[{'id':index,'text':line} for index,line in enumerate(lines,1)],
         'target_role':role, 'available_skill_names':supplied,
         'profile':{key:value for key,value in (profile or {}).items() if key!='cv'},'rubric':PARAMETERS,'rubric_version':RUBRIC_VERSION},
        Assessment,actor=actor,cv=cv)
    if {item.parameter for item in result.criteria} != set(PARAMETERS):
        raise AIUnavailable('The AI assessment did not cover the complete rubric. No replacement score was saved.')
    by_key = {item.parameter:item for item in result.criteria}
    for criterion in result.criteria:
        if any(index<1 or index>len(lines) for index in criterion.evidence_line_ids):
            raise AIUnavailable('The AI assessment cited unsupported evidence. No replacement score was saved.')
    breakdown = [dict(name=name,weight=weight,score=by_key[key].score,
                      explanation=by_key[key].explanation,evidence=[lines[index-1] for index in by_key[key].evidence_line_ids])
                 for key,(name,weight) in PARAMETERS.items()]
    direction, direction_notice = ground_direction(result.direction, supplied)
    return dict(score=round(sum(row['weight']*row['score']/100 for row in breakdown)),breakdown=breakdown,
                strengths=result.strengths,suggestions=result.suggestions,summary=result.summary,
                direction=direction, direction_notice=direction_notice,
                skills=[{'id':skill,'name':label(skill)} for skill in normalize_skills(cv.skills)],
                analysis_mode='ai-rating',ai_status='Scores assigned by AI against a fixed rubric; weighted total calculated by the server.',
                note='AI CV assessment - not an employer ATS score or a hiring probability.',
                rubric_version=RUBRIC_VERSION,model=settings.ai_model,provider=settings.ai_provider,
                rated_at=datetime.now(UTC).isoformat())
