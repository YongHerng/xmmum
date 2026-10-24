"""Persistent SDG progress and authenticated community routes."""
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .catalog import get_role
from .db import (
    CVProfile, CommunityComment, CommunityLike, CommunityPost, CommunityReport, ConsentEvent,
    LearningPlan, Questionnaire, SDGContribution, SDGTrackerState, UserProfile,
    get_db, latest, records, save,
)
from .schemas import (
    Answers, CV, CommunityReportRequest, ContributionRequest, EquipTitleRequest,
    ForumCommentRequest, ForumPostRequest, NewsDigestRequest, Profile,
    ReskillSyncRequest, SDGMappingRequest, SDGSummaryRequest,
)
from .sdg_service import allocate_project_xp, build_tracker_snapshot, generate_live_or_fallback_sdg_mapping, get_news_for_context
from .sdg_news import live_news
from .security import current_user
from . import sdg_ai
from .engine import impact

router = APIRouter(prefix="/api/v1")


def response(request, data):
    return {"data": data, "meta": {"request_id": request.state.request_id, "analysis_mode": "curated", "is_synthetic": False}}


async def user_context(db, user):
    profile = await latest(db, UserProfile, user)
    answers = await latest(db, Questionnaire, user)
    cv = await latest(db, CVProfile, user)
    return (Profile.model_validate(profile.payload) if profile else Profile(),
            Answers.model_validate(answers.payload["answers"]) if answers else Answers(),
            CV.model_validate(cv.payload["cv"]) if cv else CV())


async def tracker_for(db, user):
    profile, _, cv = await user_context(db, user)
    plans = await records(db, LearningPlan, user)
    selected = next((p for p in plans if p.payload.get("selected")), None)
    state = await latest(db, SDGTrackerState, user)
    contributions = await records(db, SDGContribution, user)
    custom = {**(state.payload if state else {}), "contributions": [{**c.payload, "id": c.id} for c in contributions]}
    return build_tracker_snapshot(profile.model_dump(), cv.model_dump(),
                                  [{**p.payload, "id": p.id} for p in plans],
                                  selected.payload["role_id"] if selected else cv.target_role, custom)


async def limit_writes(db, model, user, limit):
    since = datetime.now(timezone.utc) - timedelta(minutes=1)
    count = await db.scalar(select(func.count()).select_from(model).where(model.user_id == user, model.created_at >= since))
    if count >= limit:
        raise HTTPException(429, "Please wait a minute before posting again.")


@router.post("/sdg/mapping")
async def mapping(request: Request, body: SDGMappingRequest):
    if not get_role(body.role_id):
        raise HTTPException(404, "Unknown role.")
    return response(request, generate_live_or_fallback_sdg_mapping(body.role_id, body.skills))


@router.post("/sdg/simulate")
async def simulate(request: Request, body: SDGMappingRequest):
    if not get_role(body.role_id):
        raise HTTPException(404, "Unknown role.")
    result = impact(body.role_id, CV(skills=body.skills), demo=True)
    payload = response(request, {**result, "simulation": True, "note": "What-if simulation only. These skills have not been added to your CV."})
    payload["meta"]["is_synthetic"] = True
    return payload


@router.get("/sdg/summary/status")
async def summary_status(request: Request):
    return response(request, {"available": sdg_ai.available()})


@router.post("/sdg/summary")
async def summary(request: Request, body: SDGSummaryRequest, user=Depends(current_user), db=Depends(get_db)):
    role = get_role(body.role_id)
    if not role:
        raise HTTPException(404, "Unknown role.")
    if not sdg_ai.available():
        raise HTTPException(503, "Optional SDG wording is not configured. Curated connections remain available.")
    since = datetime.now(timezone.utc) - timedelta(minutes=1)
    count = await db.scalar(select(func.count()).select_from(ConsentEvent).where(
        ConsentEvent.user_id == user, ConsentEvent.created_at >= since,
        ConsentEvent.payload["purpose"].as_string() == "sdg_role_summary"))
    if count >= 3:
        raise HTTPException(429, "Please wait a minute before requesting more wording.")
    # This row tracks the request quota, not a new or inferred consent event.
    # Historical consent records are left unchanged.
    db.add(ConsentEvent(user_id=user, payload={"purpose": "sdg_role_summary", "event": "ai_request", "provider": "Gemini"}))
    await db.flush()
    wording = await sdg_ai.summarize(role["title"], body.skills)
    curated = generate_live_or_fallback_sdg_mapping(body.role_id, body.skills)
    return response(request, {"role_summary": wording or curated["role_summary"],
                              "generation_engine": "gemini" if wording else "curated",
                              "notice": "AI wording · not verified impact" if wording else "AI wording unavailable. Showing the curated explanation."})


@router.get("/sdg/news")
async def reading(request: Request, role_id: str | None = None, skill: str | None = None, skills: list[str] = Query(default=[])):
    if role_id and not get_role(role_id):
        raise HTTPException(404, "Unknown role.")
    if len(skills) > 100:
        raise HTTPException(422, "Choose at most 100 skills.")
    return response(request, get_news_for_context(role_id, skills + ([skill] if skill else [])))


@router.get("/sdg/live-news")
async def live_news_feed(request: Request, role_id: str | None = None, skills: list[str] = Query(default=[])):
    if role_id and not get_role(role_id):
        raise HTTPException(404, "Unknown role.")
    if len(skills) > 100:
        raise HTTPException(422, "Choose at most 100 skills.")
    return response(request, await live_news(role_id, skills))


@router.post("/sdg/news/digest")
async def digest(request: Request, body: NewsDigestRequest):
    if not get_role(body.role_id):
        raise HTTPException(404, "Unknown role.")
    items = get_news_for_context(body.role_id, body.skills)["items"]
    selected = [item for item in items if item["id"] in body.selected_news_ids] if body.selected_news_ids else [item for item in items if item["is_recommended"]]
    return response(request, {"status": "preview", "notice": "Reading preview only. No email has been sent or scheduled.", "digest_preview": selected})


@router.get("/tracker")
async def tracker(request: Request, user=Depends(current_user), db=Depends(get_db)):
    return response(request, await tracker_for(db, user))


@router.post("/tracker/contributions")
async def contribute(request: Request, body: ContributionRequest, user=Depends(current_user), db=Depends(get_db)):
    await limit_writes(db, SDGContribution, user, 5)
    key = sha256((body.project_title.casefold() + "|" + body.evidence_url).encode()).hexdigest()
    # The SDGs and XP come from an AI reading of the project, never from the user's own pick.
    assessment = await sdg_ai.assess_project(body.project_title, body.description, body.linked_skill)
    payload = {**body.model_dump(), **allocate_project_xp(body.project_title, body.description, body.linked_skill, assessment),
               "verified_status": "Self-reported", "created_at": datetime.now(timezone.utc).date().isoformat()}
    try:
        async with db.begin_nested():
            db.add(SDGContribution(user_id=user, dedupe_key=key, payload=payload))
            await db.flush()
    except IntegrityError:
        raise HTTPException(409, "This project is already in your practice log.") from None
    return response(request, await tracker_for(db, user))


@router.post("/tracker/equip-title")
async def equip(request: Request, body: EquipTitleRequest, user=Depends(current_user), db=Depends(get_db)):
    tracker = await tracker_for(db, user)
    if body.title not in tracker["unlocked_titles"]:
        raise HTTPException(422, "This progress title has not been unlocked yet.")
    previous = await latest(db, SDGTrackerState, user)
    await save(db, SDGTrackerState, user, {**(previous.payload if previous else {}), "earned_sdg_title": body.title})
    return response(request, await tracker_for(db, user))


@router.post("/tracker/reskill-done")
async def preview_cv(request: Request, body: ReskillSyncRequest, user=Depends(current_user), db=Depends(get_db)):
    # Preview only: confirmation uses the same PUT /cv and analysis flow as the CV reader.
    if not get_role(body.role_id):
        raise HTTPException(404, "Unknown role.")
    original = await latest(db, CVProfile, user)
    cv = CV.model_validate(original.payload["cv"]) if original else CV()
    ids = list(dict.fromkeys(body.contribution_ids))
    rows = list(await db.scalars(select(SDGContribution).where(SDGContribution.user_id == user, SDGContribution.id.in_(ids)))) if ids else []
    if len(rows) != len(ids):
        raise HTTPException(404, "One of these projects is no longer available in your practice log.")
    if original is None or not cv.name:
        raise HTTPException(422, "Complete your CV details in Your CV before bringing in project work.")
    skills = list(cv.skills)
    projects = cv.projects
    additions = []
    for row in rows:
        item = row.payload
        skill = item["linked_skill"]
        if skill.casefold() not in {s.casefold() for s in skills}:
            skills.append(skill)
        line = f"{item['project_title']}: {item['description']}"
        if line not in projects:
            projects = (projects + "\n" + line).strip()
            additions.append(line)
    if len(skills) > 100 or len(projects) > 10000:
        raise HTTPException(422, "These additions exceed the CV size limit. Select fewer projects or shorten your existing CV first.")
    proposed = CV.model_validate({**cv.model_dump(), "skills": skills, "projects": projects,
                                  "ai_consent": False})
    return response(request, {"mode": "preview", "cv": proposed.model_dump(), "base_version": original.payload.get("version", 0) if original else 0, "added_projects": additions,
                              "notice": "Check every addition. Your saved CV has not changed."})


async def get_post(db, post_id):
    post = await db.get(CommunityPost, post_id)
    if post is None:
        raise HTTPException(404, "Community post not found.")
    return post


async def author_for(db, user):
    profile, _, cv = await user_context(db, user)
    tracker = await tracker_for(db, user)
    name = profile.name or cv.name or "FutureProof learner"
    role = get_role(cv.target_role)
    return {"author_name": name, "author_role": role["title"] if role else "Learning and exploring",
            "author_sdg_title": tracker["earned_sdg_title"],
            "author_avatar": "".join(word[0] for word in name.split()[:2]).upper()}


async def post_view(db, post, user):
    return (await post_views(db, [post], user))[0]


async def post_views(db, posts, user):
    if not posts:
        return []
    ids = [post.id for post in posts]
    ranking = select(CommunityComment.id, func.row_number().over(
        partition_by=CommunityComment.post_id,
        order_by=(CommunityComment.created_at.desc(), CommunityComment.id),
    ).label("position")).where(CommunityComment.post_id.in_(ids)).subquery()
    comments = list(await db.scalars(select(CommunityComment).join(ranking, ranking.c.id == CommunityComment.id).where(ranking.c.position <= 5).order_by(CommunityComment.created_at)))
    counts = dict((await db.execute(select(CommunityLike.post_id, func.count()).where(CommunityLike.post_id.in_(ids)).group_by(CommunityLike.post_id))).all())
    liked = set(await db.scalars(select(CommunityLike.post_id).where(CommunityLike.post_id.in_(ids), CommunityLike.user_id == user)))
    return [{**post.payload, "id": post.id, "is_owner": post.user_id == user,
             "created_at_label": post.created_at.date().isoformat(), "likes_count": counts.get(post.id, 0), "liked": post.id in liked,
             "comments": [{**c.payload, "id": c.id, "is_owner": c.user_id == user, "timestamp": c.created_at.date().isoformat()} for c in comments if c.post_id == post.id]} for post in posts]


@router.get("/community/posts")
async def posts(request: Request, offset: int = Query(0, ge=0, le=10000), user=Depends(current_user), db=Depends(get_db)):
    reported = select(CommunityReport.post_id).where(CommunityReport.user_id == user)
    rows = list(await db.scalars(select(CommunityPost).where(CommunityPost.id.not_in(reported)).order_by(CommunityPost.created_at.desc(), CommunityPost.id).offset(offset).limit(11)))
    return response(request, {"posts": await post_views(db, rows[:10], user), "next_offset": offset + 10 if len(rows) > 10 else None})


@router.post("/community/posts")
async def publish(request: Request, body: ForumPostRequest, user=Depends(current_user), db=Depends(get_db)):
    await limit_writes(db, CommunityPost, user, 5)
    post = CommunityPost(user_id=user, payload={**body.model_dump(), **await author_for(db, user)})
    db.add(post)
    await db.flush()
    return response(request, await post_view(db, post, user))


@router.delete("/community/posts/{post_id}")
async def remove_post(request: Request, post_id: str, user=Depends(current_user), db=Depends(get_db)):
    post = await get_post(db, post_id)
    if post.user_id != user:
        raise HTTPException(404, "Community post not found.")
    for model in (CommunityLike, CommunityComment, CommunityReport):
        await db.execute(delete(model).where(model.post_id == post_id))
    await db.delete(post)
    return response(request, {"deleted": True})


@router.post("/community/posts/{post_id}/like")
async def like(request: Request, post_id: str, user=Depends(current_user), db=Depends(get_db)):
    post = await get_post(db, post_id)
    try:
        async with db.begin_nested():
            db.add(CommunityLike(post_id=post_id, user_id=user))
            await db.flush()
    except IntegrityError:
        pass  # The unique key makes retries idempotent.
    return response(request, await post_view(db, post, user))


@router.delete("/community/posts/{post_id}/like")
async def unlike(request: Request, post_id: str, user=Depends(current_user), db=Depends(get_db)):
    post = await get_post(db, post_id)
    await db.execute(delete(CommunityLike).where(CommunityLike.post_id == post_id, CommunityLike.user_id == user))
    return response(request, await post_view(db, post, user))


@router.post("/community/posts/{post_id}/comment")
async def comment(request: Request, post_id: str, body: ForumCommentRequest, user=Depends(current_user), db=Depends(get_db)):
    post = await get_post(db, post_id)
    await limit_writes(db, CommunityComment, user, 10)
    author = await author_for(db, user)
    db.add(CommunityComment(user_id=user, post_id=post_id, payload={"author": author["author_name"], "text": body.text}))
    await db.flush()
    return response(request, await post_view(db, post, user))


@router.post("/community/posts/{post_id}/report")
async def report(request: Request, post_id: str, body: CommunityReportRequest, user=Depends(current_user), db=Depends(get_db)):
    await get_post(db, post_id)
    await limit_writes(db, CommunityReport, user, 5)
    try:
        async with db.begin_nested():
            db.add(CommunityReport(user_id=user, post_id=post_id, payload={"reason": body.reason}))
            await db.flush()
    except IntegrityError:
        pass
    return response(request, {"reported": True, "notice": "Report saved for project-owner review. This post is hidden from your feed."})
