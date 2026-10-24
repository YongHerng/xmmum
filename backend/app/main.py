import logging
from uuid import uuid4
from typing import Literal
from fastapi import FastAPI, Depends, File, Form, HTTPException, Request, UploadFile, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import delete, select
from .config import settings
from .onboarding import onboarding_status
from .security import current_user
from .db import (
    get_db,
    records,
    latest,
    save,
    UserProfile,
    Questionnaire,
    CVProfile,
    CVEvaluation,
    UserSkill,
    CareerMatch,
    LearningPlan,
)
from .schemas import (
    Profile,
    Answers,
    CV,
    ScenarioRequest,
    PathwayRequest,
    ProgressRequest,
)
from .catalog import get_role
from .engine import evaluate, matches, preferences, forecast, pathways, impact, personal_matches
from .demo import demo_snapshot, snapshot
from .documents import parse_document, MAX_SIZE
from .sdg_routes import router as sdg_router
from .hosted_learning import router as learning_router
from .skill_evidence import account_badge_evidence
from .ai_provider import AIUnavailable
from .ai_routes import router as ai_router
from .cv_ai import extract_cv, coverage_notice
from .cv_store import current_cv, persist_cv
from .cv_rating import assess_cv
from .jobs import router as jobs_router, context as matching_context
from .document_layout import evidence


app = FastAPI(
    title="FutureProof AI",
    version="0.1.0",
    description="Career planning prototype with AI CV assessment and source-based vacancy retrieval.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Learning-Session", "Range"],
    expose_headers=["X-Request-ID", "Content-Range", "Accept-Ranges"],
)
logger = logging.getLogger("futureproof")


@app.middleware("http")
async def request_id(request, call_next):
    request.state.request_id = str(uuid4())
    try:
        response = await call_next(request)
    except Exception:
        logger.error(
            "Unhandled request failure request_id=%s path=%s", request.state.request_id, request.url.path
        )
        response = JSONResponse(
            status_code=503,
            content={
                "type": "about:blank",
                "title": "Service unavailable",
                "status": 503,
                "detail": "The request could not be completed. Check database connectivity and migrations, then retry.",
                "request_id": request.state.request_id,
            },
            media_type="application/problem+json",
        )
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        headers=exc.headers,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": {
                401: "Authentication required",
                404: "Not found",
                422: "Invalid request",
                503: "Configuration required",
            }.get(exc.status_code, "Request failed"),
            "status": exc.status_code,
            "detail": exc.detail,
            "request_id": getattr(request.state, "request_id", ""),
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        status_code=422,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": "Invalid request",
            "status": 422,
            "detail": "; ".join(f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors()),
            "request_id": request.state.request_id,
        },
    )


def ok(request, data, mode="deterministic", synthetic=False):
    return {
        "data": data,
        "meta": {"request_id": request.state.request_id, "analysis_mode": mode, "is_synthetic": synthetic},
    }


async def context(db, user):
    p = await latest(db, UserProfile, user)
    q = await latest(db, Questionnaire, user)
    c = await latest(db, CVProfile, user)
    return (
        Profile.model_validate(p.payload) if p else Profile(),
        Answers.model_validate(q.payload["answers"]) if q else Answers(),
        CV.model_validate(c.payload["cv"]) if c else CV(),
    )


@app.get("/api/v1/healthz")
async def health(request: Request):
    return ok(
        request,
        {
            "status": "ok",
            "database_configured": bool(settings.database_url),
            "ai_configured": bool(settings.ai_enabled and settings.ai_api_key and settings.ai_model),
            "demo_available": settings.demo_mode,
        },
    )


@app.get("/api/v1/demo/{persona}")
async def demo(
    request: Request,
    persona: Literal["student", "professional"],
    scenario: Literal["moderate", "rapid"] = "moderate",
    role_id: str | None = None,
    horizon: int = Query(5),
):
    if not settings.demo_mode:
        raise HTTPException(404, "Demo mode is disabled.")
    if role_id and not get_role(role_id):
        raise HTTPException(404, "Unknown role.")
    if horizon not in [3, 5, 10, 15]:
        raise HTTPException(422, "Choose a 5, 10 or 15-year horizon (3 is supported for older demo links).")
    return ok(request, demo_snapshot(persona, scenario, role_id, horizon), "demo", True)


@app.get("/api/v1/profile")
async def get_profile(request: Request, user=Depends(current_user), db=Depends(get_db)):
    profile, _, _ = await context(db, user)
    return ok(request, profile.model_dump())


@app.put("/api/v1/profile")
async def put_profile(request: Request, profile: Profile, user=Depends(current_user), db=Depends(get_db)):
    saved, answers, cv = await context(db, user)
    cv_row = await latest(db, CVProfile, user)
    cv_payload = cv_row.payload if cv_row else None
    was_complete = onboarding_status(saved, answers, cv, cv_payload)["required_step"] is None
    # Completion and guide state belong to the server, never a stale/client flag.
    updated = saved.model_copy(update={field: getattr(profile, field) for field in profile.model_fields_set
                                      if field not in ("onboarding_complete", "feature_guide_seen")})
    if was_complete and updated.feature_guide_seen is None:
        updated.feature_guide_seen = True
    survey_changes = {target: getattr(updated, source) for source, target in
                      (("category", "category"), ("location", "location"), ("goal", "career_goal"))
                      if getattr(updated, source) != getattr(saved, source)}
    if survey_changes:
        answers = answers.model_copy(update=survey_changes)
        await save(db, Questionnaire, user, {"version": 1, "answers": answers.model_dump(), "preferences": preferences(answers)})
    shared = {field: getattr(updated, field) for field in ("name", "education")
              if getattr(updated, field) != getattr(saved, field)}
    if cv_row and shared:
        cv = cv.model_copy(update={**shared, "ai_consent": False})
        await persist_cv(db,user,cv,source='profile',confirmed=cv_payload.get('confirmed',True))
        cv_payload=(await current_cv(db,user)).payload
    updated.onboarding_complete = onboarding_status(updated, answers, cv, cv_payload)["required_step"] is None
    await save(db, UserProfile, user, updated.model_dump())
    return ok(request, updated.model_dump())


@app.post("/api/v1/onboarding/guide/complete")
async def complete_feature_guide(request: Request, user=Depends(current_user), db=Depends(get_db)):
    profile, answers, cv = await context(db, user)
    cv_row = await latest(db, CVProfile, user)
    status = onboarding_status(profile, answers, cv, cv_row.payload if cv_row else None)
    if status["required_step"]:
        raise HTTPException(409, "Complete your CV and Discover Yourself before exploring your workspace.")
    profile.feature_guide_seen = True
    await save(db, UserProfile, user, profile.model_dump())
    return ok(request, onboarding_status(profile, answers, cv, cv_row.payload if cv_row else None))


@app.get("/api/v1/questionnaire")
async def get_questionnaire(request: Request, user=Depends(current_user), db=Depends(get_db)):
    _, answers, _ = await context(db, user)
    return ok(request, {"answers": answers.model_dump(), "preferences": preferences(answers)})


@app.put("/api/v1/questionnaire")
async def put_questionnaire(
    request: Request, answers: Answers, user=Depends(current_user), db=Depends(get_db)
):
    profile, previous_answers, cv = await context(db, user)
    cv_row = await latest(db, CVProfile, user)
    was_complete = onboarding_status(profile, previous_answers, cv, cv_row.payload if cv_row else None)["required_step"] is None
    if was_complete and profile.feature_guide_seen is None:
        profile.feature_guide_seen = True
    if answers.completed_step == 5:
        missing = answers.missing_fields()
        missing += [field for field in ("name", "education") if not getattr(profile, field).strip()]
        if missing:
            raise HTTPException(422, "Complete every Discover Yourself field: " + ", ".join(missing) + ".")
        if not onboarding_status(profile, answers, cv, cv_row.payload if cv_row else None)["cv_confirmed"]:
            raise HTTPException(422, "Upload and confirm your CV before completing Discover Yourself.")
    await save(
        db,
        Questionnaire,
        user,
        {"version": 1, "answers": answers.model_dump(), "preferences": preferences(answers)},
    )
    profile.category = answers.category
    profile.location = answers.location
    profile.goal = answers.career_goal
    profile.onboarding_complete = onboarding_status(profile, answers, cv, cv_row.payload if cv_row else None)["required_step"] is None
    if profile.onboarding_complete and profile.feature_guide_seen is None:
        profile.feature_guide_seen = False
    await save(db, UserProfile, user, profile.model_dump())
    return ok(request, {"answers": answers.model_dump(), "preferences": preferences(answers)})


@app.post("/api/v1/cv/parse")
async def parse_cv(request: Request, file: UploadFile = File(...), ai_consent: bool = Form(False, deprecated=True), user=Depends(current_user), db=Depends(get_db)):
    # Upload explicitly starts AI extraction; ordinary saves do not call AI.
    # Accept the old form field for compatibility, not as a permission gate.
    content = await file.read(MAX_SIZE + 1)
    await file.close()
    try:
        result = await run_in_threadpool(
            parse_document, content, file.filename or "", file.content_type or "", True, True
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    source = result.pop("_ai_source", None)
    result["ai_status"] = "AI extraction pending."
    if source:
        try:
            structured = await extract_cv(source["text"], CV.model_validate(result["cv"]), user)
            result["cv"] = structured.model_dump()
            result["document"]["fields"] = evidence(structured.model_dump(), source["lines"])
            for field in result["document"]["fields"]:
                if field["key"] not in ("name", "email", "phone"):
                    field.update(needs_review=False, reason="Editable source-checked extraction; saved together with your CV.")
            result["ai_status"] = "AI-assisted extraction with source-checked quotations. Review every field."
        except (AIUnavailable, ValueError) as exc:
            raise HTTPException(503, 'AI extraction could not be validated. Retry or enter your CV manually; no old extraction was substituted.') from exc
    _, _, previous = await context(db,user)
    extracted = CV.model_validate(result["cv"])
    extracted.target_role = previous.target_role
    extracted.ai_consent = False
    result["cv"] = extracted.model_dump()
    result["coverage"] = coverage_notice(extracted)
    result["version"] = await store_cv(db,user,extracted,uploaded=True,confirmed=False)
    return ok(request, result)


async def store_cv(db, user, cv, *, uploaded=False, confirmed=True):
    result = await persist_cv(db,user,cv,source="extracted" if uploaded else "manual",uploaded=uploaded,confirmed=confirmed)
    return result["version"]


@app.put("/api/v1/cv")
async def put_cv(request: Request, cv: CV, expected_version: int | None = Query(default=None, ge=0), user=Depends(current_user), db=Depends(get_db)):
    if cv.target_role and not get_role(cv.target_role):
        raise HTTPException(422, "Choose a supported target role.")
    return ok(request, await persist_cv(db, user, cv, expected_version))


@app.post("/api/v1/cv/analyze")
async def analyze_cv(request: Request, body: dict | None = None, user=Depends(current_user), db=Depends(get_db)):
    _, _, cv = await context(db, user)
    cv_row = await current_cv(db, user)
    cv_version = cv_row.payload.get("version", 0) if cv_row else 0
    if not (cv.skills or cv.projects or cv.experience or cv.summary or cv.membership_licensure or cv.certificates_training or cv.additional_sections):
        raise HTTPException(422, "Save your CV details first.")
    # The user explicitly requests assessment here; no background assessment
    # is triggered by profile, CV or Discover Yourself updates.
    _,profile,fingerprint = await matching_context(db,user)
    try:
        result = await assess_cv(cv,user,profile=profile)
    except AIUnavailable as exc:
        raise HTTPException(503,str(exc)) from exc
    latest_cv = await current_cv(db, user, lock=True)
    if latest_cv and latest_cv.payload.get("version", 0) != cv_version:
        raise HTTPException(409, "Your CV changed during analysis. Analyse the current version instead.")
    _,_,current_fingerprint = await matching_context(db,user)
    if current_fingerprint != fingerprint:
        raise HTTPException(409,'Your preferences or badge evidence changed during analysis. Please analyse again.')
    result["cv_version"] = cv_version
    result['profile_fingerprint'] = fingerprint
    result["coverage"] = coverage_notice(cv)
    await save(db, CVEvaluation, user, result)
    await db.execute(delete(UserSkill).where(UserSkill.user_id == user))
    for skill in result["skills"]:
        db.add(
            UserSkill(
                user_id=user, payload={**skill, "source": "user-confirmed CV", "confidence": "self-reported"}
            )
        )
    return ok(request, result, result["analysis_mode"])


@app.post("/api/v1/careers/match")
async def career_matches(
    request: Request, scenario: ScenarioRequest, user=Depends(current_user), db=Depends(get_db)
):
    _, answers, cv = await context(db, user)
    badges = await account_badge_evidence(db, user)
    if not cv.skills and not badges:
        raise HTTPException(422, "Confirm your CV skills or earn a badge with assessed skills first.")
    result = personal_matches(cv, answers, scenario.scenario, badges)
    previous = await latest(db,CareerMatch,user)
    await save(db, CareerMatch, user, {**(previous.payload if previous else {}),"matches": result, "scenario": scenario.scenario})
    return ok(request, {"matches": result})


@app.post("/api/v1/forecasts/scenarios")
async def scenarios(
    request: Request, scenario: ScenarioRequest, user=Depends(current_user), db=Depends(get_db)
):
    _, answers, cv = await context(db, user)
    if scenario.role_id and not get_role(scenario.role_id):
        raise HTTPException(404, "Unknown role.")
    return ok(
        request,
        {
            "forecast": forecast(cv, scenario.role_id or cv.target_role, scenario.scenario, scenario.horizon),
            "matches": personal_matches(cv, answers, scenario.scenario, await account_badge_evidence(db, user)),
        },
        synthetic=True,
    )


@app.post("/api/v1/pathways/generate")
async def generate_paths(
    request: Request, body: PathwayRequest, user=Depends(current_user), db=Depends(get_db)
):
    _, answers, cv = await context(db, user)
    if not get_role(body.role_id):
        raise HTTPException(404, "Unknown career role.")
    existing = await records(db, LearningPlan, user)
    plans = pathways(cv, answers, body.role_id)
    result = []
    for plan in plans:
        old = next(
            (
                r
                for r in existing
                if r.payload.get("role_id") == body.role_id and r.payload.get("kind") == plan["kind"]
            ),
            None,
        )
        if old:
            plan["completed_steps"] = old.payload.get("completed_steps", [])
            plan["selected"] = old.payload.get("selected", False)
            row = await save(db, LearningPlan, user, plan, old.id)
        else:
            row = LearningPlan(user_id=user, payload=plan)
            db.add(row)
            await db.flush()
        result.append({**plan, "id": row.id})
    return ok(request, {"pathways": result})


@app.post("/api/v1/pathways/{plan_id}/select")
async def select_path(request: Request, plan_id: str, user=Depends(current_user), db=Depends(get_db)):
    plans = await records(db, LearningPlan, user)
    target = next((p for p in plans if p.id == plan_id), None)
    if not target:
        raise HTTPException(404, "Pathway not found.")
    for plan in plans:
        plan.payload = {**plan.payload, "selected": plan.id == plan_id}
    return ok(request, {**target.payload, "id": target.id})


@app.patch("/api/v1/pathways/{plan_id}/progress")
async def progress(
    request: Request, plan_id: str, body: ProgressRequest, user=Depends(current_user), db=Depends(get_db)
):
    plans = await records(db, LearningPlan, user)
    plan = next((p for p in plans if p.id == plan_id), None)
    if not plan:
        raise HTTPException(404, "Pathway not found.")
    if body.step_id not in [s["id"] for s in plan.payload["steps"]]:
        raise HTTPException(422, "Unknown step.")
    completed = set(plan.payload.get("completed_steps", []))
    completed.add(body.step_id) if body.complete else completed.discard(body.step_id)
    # Completing a step starts this plan; no second "choose" action is needed.
    if body.complete:
        for other in plans:
            if other.id != plan.id and other.payload.get("selected"):
                other.payload = {**other.payload, "selected": False}
    plan.payload = {**plan.payload, "completed_steps": sorted(completed), "selected": True if body.complete else plan.payload.get("selected", False)}
    return ok(request, {**plan.payload, "id": plan.id})


@app.get("/api/v1/sdg/impact-path")
async def sdg_path(
    request: Request, role_id: str = "", user=Depends(current_user), db=Depends(get_db)
):
    if role_id and not get_role(role_id):
        raise HTTPException(404, "Unknown role.")
    _, answers, cv = await context(db, user)
    badges = await account_badge_evidence(db, user)
    candidates = personal_matches(cv, answers, badge_evidence=badges)
    direction = (role_id or cv.target_role or candidates[0]["id"]) if candidates else ""
    return ok(request, impact(direction, cv, badge_evidence=badges))


@app.get("/api/v1/dashboard")
async def dashboard(request: Request, user=Depends(current_user), db=Depends(get_db)):
    profile, answers, cv = await context(db, user)
    cv_row = await latest(db, CVProfile, user)
    evaluation = await latest(db, CVEvaluation, user)
    cv_row = await current_cv(db, user)
    cv_version = cv_row.payload.get("version", 0) if cv_row else 0
    current_evaluation = evaluation.payload if evaluation and evaluation.payload.get("cv_version") == cv_version and evaluation.payload.get('analysis_mode')=='ai-rating' else None
    plans = await records(db, LearningPlan, user)
    selected = next((p for p in plans if p.payload.get("selected")), None)
    role = selected.payload["role_id"] if selected else cv.target_role
    data = snapshot(
        profile,
        answers,
        cv,
        current_evaluation,
        [{**p.payload, "id": p.id} for p in plans],
        role,
        badge_evidence=await account_badge_evidence(db, user),
    )
    data["cv_version"] = cv_version
    data["onboarding"] = onboarding_status(profile, answers, cv, cv_row.payload if cv_row else None)
    return ok(request, data)


app.include_router(sdg_router)
app.include_router(learning_router)
app.include_router(ai_router)
app.include_router(jobs_router)
