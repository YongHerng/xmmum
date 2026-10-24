from uuid import uuid4

import pymupdf
from test_api import client as client

from app.schemas import Answers


SURVEY = {"category": "student", "interests": ["technology"], "strengths": ["Communication"],
          "career_goal": "Build accessible software", "work_style": "analytical", "environment": "flexible",
          "social_energy": "mixed", "decision_style": "both", "motivation": "growth", "weekly_hours": 4,
          "budget": 0, "location": "Malaysia", "relocation": False, "learning_style": "practice", "completed_step": 5}


def test_new_survey_has_no_assumed_time_budget_or_relocation_answers():
    answers = Answers()
    assert answers.weekly_hours is answers.budget is answers.relocation is None
    assert {"weekly_hours", "budget", "relocation", "strengths", "career_goal"} <= set(answers.missing_fields())


async def test_compulsory_upload_confirmation_then_complete_survey_survives_reload(client,ai_extraction_stub):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    async def dashboard():
        return (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    assert (await dashboard())["onboarding"]["required_step"] == "cv"
    with pymupdf.open() as document:
        document.new_page().insert_text((50, 55), "Taylor Lee\nEducation\nBSc Computing\nSkills\nPython\nProjects\nBuilt 2 dashboards.")
        content = document.tobytes()
    parsed = await client.post("/api/v1/cv/parse", headers=headers, files={"file": ("cv.pdf", content, "application/pdf")},data={"ai_consent":"true"})
    assert parsed.status_code == 200
    status = (await dashboard())["onboarding"]
    assert status["cv_uploaded"] and not status["cv_confirmed"] and status["required_step"] == "cv"
    assert (await client.put("/api/v1/questionnaire", headers=headers, json=SURVEY)).status_code == 422
    assert (await client.put("/api/v1/cv", headers=headers, json=parsed.json()["data"]["cv"])).status_code == 200
    assert (await dashboard())["onboarding"]["required_step"] == "questionnaire"
    for field in SURVEY.keys() - {"completed_step"}:
        incomplete = {**SURVEY, field: None if field in ("weekly_hours", "budget", "relocation") else [] if field in ("interests", "strengths") else ""}
        assert (await client.put("/api/v1/questionnaire", headers=headers, json=incomplete)).status_code == 422, field
    assert (await client.put("/api/v1/questionnaire", headers=headers, json=SURVEY)).status_code == 200
    complete = await dashboard()
    assert complete["onboarding"]["required_step"] is None
    assert complete["profile"]["onboarding_complete"]
    assert complete["questionnaire"]["budget"] == 0 and complete["questionnaire"]["relocation"] is False
    assert complete["onboarding"]["feature_guide_pending"]
    assert (await client.post("/api/v1/onboarding/guide/complete", headers=headers)).status_code == 200
    assert not (await dashboard())["onboarding"]["feature_guide_pending"]
    # A later survey edit or re-login must not restart the feature introduction.
    await client.put("/api/v1/questionnaire", headers=headers, json={**SURVEY, "career_goal": "Build useful tools"})
    assert not (await dashboard())["onboarding"]["feature_guide_pending"]
    assert (await client.post("/api/v1/onboarding/guide/complete", headers=headers)).status_code == 200


async def test_manual_cv_or_client_completion_flag_cannot_skip_upload(client):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    await client.put("/api/v1/profile", headers=headers, json={"name": "Taylor", "education": "Computing", "onboarding_complete": True})
    await client.put("/api/v1/cv", headers=headers, json={"skills": ["Python"]})
    status = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]["onboarding"]
    assert status["required_step"] == "cv" and not status["cv_uploaded"]
    assert (await client.put("/api/v1/questionnaire", headers=headers, json=SURVEY)).status_code == 422
    assert (await client.post("/api/v1/onboarding/guide/complete", headers=headers)).status_code == 409
    assert (await client.post("/api/v1/onboarding/guide/complete")).status_code == 401


def test_legacy_completed_profile_does_not_receive_first_time_guidance():
    from app.onboarding import onboarding_status
    from app.schemas import CV, Profile
    profile = Profile(name="Saved user", education="Saved education", onboarding_complete=True)
    status = onboarding_status(profile, Answers(**SURVEY), CV(skills=["Python"]), {"uploaded": True, "confirmed": True})
    assert status["required_step"] is None and not status["feature_guide_pending"]
