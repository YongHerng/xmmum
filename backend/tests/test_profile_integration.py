from uuid import uuid4

from test_api import client as client, upload_confirmed_cv
from test_onboarding import SURVEY


async def test_profile_cv_and_discovery_updates_share_saved_fields_without_losing_cv_sections(client):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    other = {"Authorization": f"Bearer {uuid4()}"}
    education = "BSc Computing\n" + "Completed research and software engineering modules. " * 12
    cv = {"name": "Taylor Lee", "education": education, "skills": ["Python"],
          "summary": "Graduate developer", "experience": "Built accessible forms",
          "email": "taylor@example.invalid", "phone": "+60 12 345 6789",
          "projects": "Built a community dashboard", "certificates_training": "First aid"}
    await upload_confirmed_cv(client, headers, cv)
    async def dashboard():
        return (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    initial = await dashboard()
    assert initial["profile"]["education"] == initial["cv"]["education"] == education.strip()
    assert (await client.put("/api/v1/questionnaire", headers=headers, json=SURVEY)).status_code == 200
    data = await dashboard()
    assert data["profile"]["goal"] == data["questionnaire"]["career_goal"] == SURVEY["career_goal"]
    assert data["profile"]["location"] == data["questionnaire"]["location"] == SURVEY["location"]
    # This is the save used by Discover Yourself's shared name/education fields.
    response = await client.put("/api/v1/profile", headers=headers, json={"name": "Taylor Wong", "education": "MSc Software Engineering"})
    assert response.status_code == 200
    data = await dashboard()
    assert data["profile"]["name"] == data["cv"]["name"] == "Taylor Wong"
    assert data["profile"]["education"] == data["cv"]["education"] == "MSc Software Engineering"
    for field in ("email", "phone", "summary", "experience", "projects", "certificates_training", "skills"):
        assert data["cv"][field] == cv[field]
    assert data["onboarding"]["cv_confirmed"] and data["onboarding"]["discover_complete"]
    await client.put("/api/v1/profile", headers=headers, json={"location": "Singapore", "goal": "Build healthcare software", "category": "professional"})
    data = await dashboard()
    assert data["questionnaire"]["location"] == "Singapore"
    assert data["questionnaire"]["career_goal"] == "Build healthcare software"
    assert data["questionnaire"]["category"] == "professional"
    assert data["questionnaire"]["strengths"] == SURVEY["strengths"]
    await client.put("/api/v1/cv", headers=headers, json={**data["cv"], "name": "Taylor Tan", "education": education})
    data = await dashboard()
    assert data["profile"]["name"] == data["cv"]["name"] == "Taylor Tan"
    assert data["profile"]["education"] == data["cv"]["education"] == education.strip()
    assert data["questionnaire"]["career_goal"] == "Build healthcare software"
    isolated = (await client.get("/api/v1/dashboard", headers=other)).json()["data"]
    assert isolated["profile"]["name"] == "" and isolated["cv"]["skills"] == []
    assert not isolated["onboarding"]["feature_guide_pending"]


async def test_profile_edit_never_turns_an_unconfirmed_cv_into_a_completed_setup(client,ai_extraction_stub):
    import pymupdf
    headers = {"Authorization": f"Bearer {uuid4()}"}
    with pymupdf.open() as document:
        document.new_page().insert_text((50, 55), "Taylor Lee\nEducation\nBSc Computing\nSkills\nPython")
        content = document.tobytes()
    await client.post("/api/v1/cv/parse", headers=headers, files={"file": ("cv.pdf", content, "application/pdf")},data={"ai_consent":"true"})
    await client.put("/api/v1/profile", headers=headers, json={"name": "Taylor Wong", "onboarding_complete": True, "feature_guide_seen": True})
    data = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    assert data["cv"]["name"] == "Taylor Wong"
    assert data["onboarding"]["required_step"] == "cv" and not data["onboarding"]["cv_confirmed"]
    assert not data["profile"]["onboarding_complete"] and data["profile"]["feature_guide_seen"] is None
