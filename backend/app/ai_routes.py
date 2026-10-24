"""Authenticated AI previews. Only explicit approval writes user data."""
import time
import base64
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field

from .ai_provider import AIUnavailable, configured, generate
from .catalog import SKILLS, label
from .config import settings
from .cv_ai import Change, TextField, Personalisation, MatchExplanations, rewrite_cv, coverage_notice
from .cv_store import current_cv, persist_cv
from .db import get_db, latest, Questionnaire, CVEvaluation
from .cv_pdf import render_cv
from .engine import evaluate, matches, normalize_skills, preferences
from .schemas import StrictModel, CV, Answers
from .security import current_user
from .skill_evidence import account_badge_evidence

router = APIRouter(prefix="/api/v1", tags=["AI assistance"])
_previews = {}


class AIActionRequest(StrictModel):
    # Accepted only for older clients. AI actions remain button-triggered;
    # applying generated CV edits still requires a separate approval request.
    ai_consent: bool = Field(default=False, deprecated=True)


class PreviewRequest(AIActionRequest):
    fields: list[TextField] = Field(default_factory=lambda: ["summary", "experience", "projects"], min_length=1, max_length=6)
    badge_code: str | None = Field(default=None, max_length=100)


class Approve(StrictModel):
    preview_id: str = Field(max_length=100)
    fields: list[TextField] = Field(min_length=1, max_length=6)
    edits: dict[TextField, str] = Field(default_factory=dict)


class PersonaliseRequest(AIActionRequest):
    answers: Answers
    notes: str = Field(min_length=10, max_length=2500)


def output(data):
    return {"data": data}


@router.get("/ai/status")
async def status(user=Depends(current_user)):
    return output({"configured": configured(), "provider": settings.ai_provider,
                   "model": settings.ai_model, "max_calls": settings.ai_max_calls,
                   "notice": "AI requests are optional and bounded. Request limits are not a dollar spending cap."})


@router.get("/cv/ai/context")
async def cv_context(user=Depends(current_user), db=Depends(get_db)):
    row = await current_cv(db, user)
    cv = CV.model_validate(row.payload["cv"]) if row else CV()
    badges = await account_badge_evidence(db, user)
    return output({"version": row.payload.get("version", 0) if row else 0,
                   "badges": badges, "coverage": coverage_notice(cv),
                   "history": [{"version": item["version"], "saved_at": item.get("saved_at")}
                               for item in (row.payload.get("history", []) if row else [])]})


@router.post("/cv/ai/preview")
async def preview(body: PreviewRequest, user=Depends(current_user), db=Depends(get_db)):
    row = await current_cv(db, user)
    if not row:
        raise HTTPException(422, "Save your CV before creating an improvement preview.")
    cv = CV.model_validate(row.payload["cv"])
    version = row.payload.get("version", 0)
    course_skills = []
    if body.badge_code:
        badges = await account_badge_evidence(db, user)
        badge = next((item for item in badges if item["badge_code"] == body.badge_code), None)
        if not badge:
            raise HTTPException(404, "No skill-bearing course award was found for this account.")
        descriptions = [f"{label(item['skill_id'])} ({item['level']})" for item in badge["skills"]]
        entry = (f"Completed {badge['title']} — {badge['provider']} ({badge['completed_at'][:10]}). "
                 f"Platform completion badge {badge['badge_code']}. Assessed learning: {', '.join(descriptions)}.")
        if badge["badge_code"] in cv.certificates_training:
            raise HTTPException(422, "This badge is already included in your CV.")
        changes = [Change(field="certificates_training", before=cv.certificates_training,
                          after=(cv.certificates_training + "\n" + entry).strip(),
                          reason="From your saved course-award snapshot; not an official industry certification.")]
        course_skills = [item["skill_id"] for item in badge["skills"]
                         if item["skill_id"] not in normalize_skills(cv.skills)]
        # Skills are appended by the server only when this course entry is approved.
        mode = "verified badge template"
    else:
        try:
            changes = await rewrite_cv(cv, user, body.fields)
        except AIUnavailable as exc:
            raise HTTPException(503, str(exc))
        mode = "AI wording draft"
    candidate = cv.model_copy(update={item.field: item.after for item in changes})
    if course_skills:
        candidate.skills = list(dict.fromkeys(candidate.skills + [label(skill) for skill in course_skills]))
        candidate.course_skill_ids = sorted(set(candidate.course_skill_ids) | set(course_skills))
    CV.model_validate(candidate.model_dump())
    now = time.monotonic()
    for key in list(_previews):
        if now-_previews[key]["created"] > 900:
            _previews.pop(key, None)
    if len(_previews) >= 128:
        raise HTTPException(503, "Too many pending previews. Try again later.")
    preview_id = str(uuid4())
    _previews[preview_id] = {"user": user, "version": version, "created": now,
                             "changes": [item.model_dump() for item in changes],
                             "course_skills": course_skills, "badge_code": body.badge_code}
    previous = await latest(db,CVEvaluation,user)
    before_rating = previous.payload if previous and previous.payload.get('cv_version') == version and previous.payload.get('analysis_mode')=='ai-rating' else None
    return output({"preview_id": preview_id, "base_version": version,
                   "changes": [item.model_dump() for item in changes], "mode": mode,
                   "added_skills": [label(skill) for skill in course_skills],
                   "before_rating": before_rating, "after_rating": None,
                   "notice": "Draft only. Check every fact. Only selected changes are saved after approval. Preview expires in 15 minutes."})


@router.post("/cv/ai/apply")
async def approve(body: Approve, user=Depends(current_user), db=Depends(get_db)):
    proposal = _previews.get(body.preview_id)
    if not proposal or proposal["user"] != user:
        raise HTTPException(404, "Preview not found for this account. Create a fresh preview.")
    if time.monotonic()-proposal["created"] > 900:
        raise HTTPException(409, "This preview expired. Create a fresh preview.")
    row = await current_cv(db, user, lock=True)
    if not row or row.payload.get("version", 0) != proposal["version"]:
        raise HTTPException(409, "Your CV changed. Create a fresh preview before saving.")
    selected = {item["field"]: item["after"] for item in proposal["changes"] if item["field"] in body.fields}
    if set(selected) != set(body.fields):
        raise HTTPException(422, "Select changes from this preview only.")
    if set(body.edits) - set(selected):
        raise HTTPException(422, "Only selected sections can be edited.")
    selected.update(body.edits)
    cv = CV.model_validate(row.payload["cv"] | selected)
    if proposal["badge_code"]:
        cv.skills = list(dict.fromkeys(cv.skills + [label(skill) for skill in proposal["course_skills"]]))
    result = await persist_cv(db, user, cv, proposal["version"], source="approved-badge" if proposal["badge_code"] else "approved-ai",
                              course_skills=proposal["course_skills"])
    _previews.pop(body.preview_id, None)
    result['evaluation'] = None
    result['notice'] = 'CV saved. Request a fresh AI assessment for this version; no heuristic score was substituted.'
    return output(result)


class PDFRequest(StrictModel):
    preview_id: str | None = Field(default=None,max_length=100)
    fields: list[TextField] = Field(default_factory=list,max_length=6)
    edits: dict[TextField,str] = Field(default_factory=dict)


@router.post('/cv/pdf')
async def pdf_preview(body: PDFRequest,user=Depends(current_user),db=Depends(get_db)):
    row = await current_cv(db,user)
    if not row:
        raise HTTPException(422,'Save a CV before generating its PDF.')
    cv = CV.model_validate(row.payload['cv'])
    if body.preview_id:
        proposal = _previews.get(body.preview_id)
        if not proposal or proposal['user'] != user:
            raise HTTPException(404,'Preview not found for this account.')
        if time.monotonic()-proposal['created'] > 900 or proposal['version'] != row.payload.get('version',0):
            raise HTTPException(409,'This preview is expired or outdated. Create a fresh preview.')
        changes = {item['field']:item['after'] for item in proposal['changes'] if item['field'] in body.fields}
        if set(changes) != set(body.fields) or set(body.edits)-set(changes):
            raise HTTPException(422,'Choose and edit sections from this preview only.')
        changes.update(body.edits)
        try:
            cv = CV.model_validate(cv.model_dump() | changes)
        except ValueError as exc:
            raise HTTPException(422,'A CV section exceeds its supported length.') from exc
        cv.entries = [entry for entry in cv.entries if entry.section not in changes]
        if proposal['badge_code'] and 'certificates_training' in changes:
            cv.skills = list(dict.fromkeys(cv.skills + [label(skill) for skill in proposal['course_skills']]))
    elif body.fields or body.edits:
        raise HTTPException(422,'Edits require a valid improvement preview.')
    try:
        from starlette.concurrency import run_in_threadpool
        pdf = await run_in_threadpool(render_cv,cv)
    except ValueError as exc:
        raise HTTPException(422,str(exc)) from exc
    return output({'pdf_base64':base64.b64encode(pdf).decode('ascii'),'filename':'futureproof-cv.pdf',
                   'is_draft':bool(body.preview_id),'notice':'PDF generated without changing your saved CV. Review all content before sharing.'})


class Restore(StrictModel):
    version: int = Field(ge=0)
    expected_version: int = Field(ge=1)


@router.post("/cv/history/restore")
async def restore(body: Restore, user=Depends(current_user), db=Depends(get_db)):
    row = await current_cv(db, user, lock=True)
    entry = next((item for item in row.payload.get("history", []) if item["version"] == body.version), None) if row else None
    if not entry:
        raise HTTPException(404, "That CV version is not available for this account.")
    return output(await persist_cv(db, user, CV.model_validate(entry["cv"]), body.expected_version, source="restored"))


@router.post("/questionnaire/ai/preview")
async def personalise(body: PersonaliseRequest, user=Depends(current_user)):
    try:
        result = await generate("personalisation", "Summarise explicit career preferences from the user's notes "
                                "and answers. Keep existing answers when notes do not explicitly say otherwise. "
                                "Do not infer personality, aptitude or demographic traits. Do not change practical "
                                "constraints. Explain any proposed changes; the user must confirm them.",
                                {"notes": body.notes, "answers": body.answers.model_dump()}, Personalisation, actor=user)
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    candidate = body.answers.model_copy(update=result.model_dump(include={"interests", "work_style", "environment", "motivation"}))
    return output({**result.model_dump(), "answers": candidate.model_dump(),
                   "notice": "Not saved. Edit the proposed answers and confirm them using the questionnaire."})


@router.post("/careers/ai/explain")
async def explain(body: AIActionRequest | None = None, user=Depends(current_user), db=Depends(get_db)):
    row = await current_cv(db, user)
    cv = CV.model_validate(row.payload["cv"]) if row else CV()
    questionnaire = await latest(db, Questionnaire, user)
    answers = Answers.model_validate(questionnaire.payload["answers"]) if questionnaire else Answers()
    badges = await account_badge_evidence(db, user)
    if not cv.skills and not badges:
        raise HTTPException(422, "Confirm CV skills or earn a skill-bearing badge before requesting explanations.")
    ranked = matches(cv, answers, badge_evidence=badges)
    context = [{key: item[key] for key in ("id", "title", "score", "components", "matched_skills", "gaps", "skill_evidence")}
               for item in ranked]
    try:
        result = await generate("career-explanations", "Explain ONLY the supplied ranked careers using their "
                                "actual skills, gaps, preferences and badge levels. Do not change scores or "
                                "rankings. No hiring probabilities, live jobs, salaries, unsupported forecasts "
                                "or industry-certification claims. Return one explanation per supplied role ID.",
                                {"matches": context, "preferences": preferences(answers), "coverage": coverage_notice(cv)},
                                MatchExplanations, actor=user)
        if {item.role_id for item in result.explanations} != {item["id"] for item in ranked} or len(result.explanations) != len(ranked):
            raise AIUnavailable("The AI response did not match the supported careers. The existing results are unchanged.")
    except AIUnavailable as exc:
        raise HTTPException(503, str(exc))
    return output({**result.model_dump(), "coverage": coverage_notice(cv),
                   "notice": "AI explanation of existing matching results, not a hiring prediction or live job search."})
