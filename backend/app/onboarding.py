"""Required personal setup, derived from saved CV and survey records."""


def onboarding_status(profile, answers, cv, cv_payload=None):
    payload = cv_payload or {}
    has_cv = bool(cv.summary or cv.projects or cv.experience or cv.skills
                  or cv.membership_licensure or cv.certificates_training or cv.additional_sections)
    # Existing CV records predate these flags; preserve their completed upload.
    uploaded = has_cv and bool(payload.get("uploaded", bool(cv_payload)))
    confirmed = uploaded and bool(payload.get("confirmed", bool(cv_payload)))
    discovered = (answers.completed_step == 5 and not answers.missing_fields()
                  and bool(profile.name.strip() and profile.education.strip()))
    return {"cv_uploaded": uploaded, "cv_confirmed": confirmed, "discover_complete": discovered,
            "required_step": "cv" if not confirmed else "questionnaire" if not discovered else None,
            "feature_guide_pending": confirmed and discovered and profile.feature_guide_seen is False}
