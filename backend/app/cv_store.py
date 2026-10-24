"""Versioned owner-scoped CV writes; preserve history and dependent records."""
from datetime import datetime, UTC

from fastapi import HTTPException
from sqlalchemy import select

from .db import CVProfile, save, latest, UserProfile, Questionnaire
from .schemas import Profile, Answers, CV
from .onboarding import onboarding_status
from .engine import normalize_skills


async def current_cv(db, user, *, lock=False):
    query = select(CVProfile).where(CVProfile.user_id == user).order_by(CVProfile.created_at.desc()).limit(1).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    return await db.scalar(query)


async def persist_cv(db, user, cv, expected_version=None, *, source="manual", course_skills=None, uploaded=False, confirmed=True):
    old = await current_cv(db, user, lock=True)
    payload = old.payload if old else {}
    version = payload.get("version", 0)
    if expected_version is not None and expected_version != version:
        raise HTTPException(409, "Your CV changed after this preview. Create a fresh preview before saving.")
    retained = set(cv.course_skill_ids if source == "restored" else payload.get("cv", {}).get("course_skill_ids", []))
    retained.update(course_skills or [])
    cv = cv.model_copy(update={"course_skill_ids": sorted(retained & set(normalize_skills(cv.skills)))})
    # Structured entries are secondary to the reviewed section text. Drop a
    # stale group when a flat editor/AI rewrite changes its section independently.
    if old and source != 'restored':
        old_cv = payload.get('cv',{})
        old_entries = old_cv.get('entries',[])
        if [item.model_dump() for item in cv.entries] == old_entries:
            changed = {key for key in ('education','experience','projects','membership_licensure','certificates_training')
                       if old_cv.get(key,'') != getattr(cv,key)}
            cv.entries = [item for item in cv.entries if item.section not in changed]
    history = list(payload.get("history", []))
    saved_at = datetime.now(UTC).isoformat()
    if old:
        history.append({"version": version, "cv": payload["cv"],
                        "saved_at": payload.get("saved_at") or old.created_at.isoformat()})
    profile_row=await latest(db,UserProfile,user)
    profile=Profile.model_validate(profile_row.payload) if profile_row else Profile()
    survey=await latest(db,Questionnaire,user)
    answers=Answers.model_validate(survey.payload['answers']) if survey else Answers()
    previous=payload.get('cv',{})
    was_complete=onboarding_status(profile,answers,CV.model_validate(previous),payload or None)['required_step'] is None
    if was_complete and profile.feature_guide_seen is None:
        profile.feature_guide_seen=True
    for field in ('name','education'):
        value=getattr(cv,field)
        if confirmed or value or getattr(profile,field)==previous.get(field,''):
            setattr(profile,field,value)
    updated={"cv":cv.model_dump(),"version":version+1,"history":history[-5:],"source":source,"saved_at":saved_at,
             "uploaded":uploaded or payload.get('uploaded',bool(old)),"confirmed":confirmed}
    await save(db,CVProfile,user,updated)
    profile.onboarding_complete=onboarding_status(profile,answers,cv,updated)['required_step'] is None
    await save(db,UserProfile,user,profile.model_dump())
    # Existing evaluations/plans are retained. Consumers compare cv_version.
    return {"cv": cv.model_dump(), "version": version+1}
