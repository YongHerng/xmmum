from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import httpx
import jwt
import pymupdf
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import ec
from docx import Document
from fastapi import Header, HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app import security
from app.config import Settings
from app.db import Base, get_db
from app.demo import demo_snapshot
from app.main import app
from app.security import current_user, verify_token


async def upload_confirmed_cv(client, headers, cv):
    with pymupdf.open() as document:
        document.new_page().insert_text((50, 55), "\n".join([cv["name"], "Education", cv["education"], "Skills", " ".join(cv["skills"])]))
        content = document.tobytes()
    from unittest.mock import patch
    from app.schemas import CV
    async def extraction(*args):return CV.model_validate(cv)
    with patch('app.main.extract_cv',extraction):
        response = await client.post("/api/v1/cv/parse", headers=headers, files={"file": ("cv.pdf", content, "application/pdf")},data={"ai_consent":"true"})
    assert response.status_code == 200
    assert (await client.put("/api/v1/cv", headers=headers, json=cv)).status_code == 200


@pytest.mark.parametrize("kind", ["pdf", "docx"])
async def test_cv_upload_contract_save_and_analyze(client, kind, monkeypatch, ai_assessment_stub):
    from app import main
    from app.schemas import CV
    async def extraction(source,cv,user):
        assert cv.summary=='' and cv.skills==[]  # The legacy classifier did not run.
        return CV(name='Aisha Rahman',email=cv.email,phone=cv.phone,education='Computer Science',skills=['Python','SQL'],
                  projects='Built 3 energy dashboards.',membership_licensure='Student Member, Engineering Society',
                  certificates_training='First Aid Certificate\nAWS Cloud Practitioner',structure_version=2)
    monkeypatch.setattr(main,'extract_cv',extraction)
    headers = {"Authorization": f"Bearer {uuid4()}"}
    text = ["Aisha Rahman", "aisha@example.invalid", "Phone: +60 12-345 6789", "Education", "Computer Science", "Skills", "Python SQL", "Projects", "Built 3 energy dashboards.", "Memberships", "Student Member, Engineering Society", "Certificates and Training", "First Aid Certificate", "AWS Cloud Practitioner"]
    if kind == "pdf":
        with pymupdf.open() as doc:
            doc.new_page().insert_text((50, 55), "\n".join(text))
            content = doc.tobytes()
        mime = "application/pdf"
    else:
        doc = Document()
        for line in text:
            doc.add_paragraph(line)
        stream = BytesIO()
        doc.save(stream)
        content = stream.getvalue()
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    response = await client.post("/api/v1/cv/parse", headers=headers, files={"file": (f"cv.{kind}", content, mime)},data={'ai_consent':'true'})
    assert response.status_code == 200
    parsed = response.json()["data"]
    assert parsed["cv"]["name"] == "Aisha Rahman"
    assert parsed["document"]["pages"]
    fields = {field["key"]: field for field in parsed["document"]["fields"]}
    assert {"name", "email", "phone", "skills", "membership_licensure", "certificates_training"} <= fields.keys()
    assert fields["name"]["sources"]
    assert bool(parsed["document"]["pdf_base64"]) == (kind == "docx")
    assert parsed["cv"]["phone"] == "+60 12-345 6789"
    assert parsed["cv"]["certificates_training"] == "First Aid Certificate\nAWS Cloud Practitioner"
    assert "Built 3 energy dashboards." in parsed["cv"]["projects"]
    saved = await client.put("/api/v1/cv", headers=headers, json=parsed["cv"])
    assert saved.status_code == 200
    dashboard = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    for field in ("phone", "membership_licensure", "certificates_training", "target_role"):
        assert dashboard["cv"][field] == parsed["cv"][field]
    analysis = await client.post("/api/v1/cv/analyze", headers=headers,json={'ai_consent':True})
    assert analysis.status_code == 200
    assert analysis.json()["data"]["score"] > 0


async def test_cv_keeps_supported_career_ids_and_accepts_credentials_only(client,ai_assessment_stub):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    assert (await client.put("/api/v1/cv", headers=headers, json={"target_role": "Data & Analytics"})).status_code == 422
    saved = await client.put("/api/v1/cv", headers=headers, json={"name": "Learner", "certificates_training": "First Aid Certificate"})
    assert saved.status_code == 200
    assert saved.json()["data"]["cv"]["target_role"] == ""
    assert (await client.post("/api/v1/cv/analyze", headers=headers)).status_code == 200
    assert (await client.post("/api/v1/cv/analyze", headers=headers,json={'ai_consent':True})).status_code == 200


async def test_cv_ai_review_omits_contact_fields_and_includes_credentials(monkeypatch):
    from app import ai
    from app.schemas import CV

    monkeypatch.setattr(ai.settings, "ai_enabled", True)
    monkeypatch.setattr(ai.settings, "ai_api_key", "test-only")
    monkeypatch.setattr(ai.settings, "ai_model", "test-only")
    requests = []
    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"summary":"Review your credential dates.","suggestions":[]}'}}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(ai.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    cv = CV(name="Private Person", email="private@example.invalid", phone="+60 12-345 6789",
            certificates_training="First Aid Certificate", membership_licensure="Student Member", ai_consent=True)
    result = await ai.review_cv(cv)
    assert result and len(requests) == 1
    content = requests[0].content.decode()
    assert "First Aid Certificate" in content and "Student Member" in content
    assert "Private Person" not in content and "private@example.invalid" not in content and "+60 12-345 6789" not in content
    cv.ai_consent = False
    assert await ai.review_cv(cv) is not None  # Explicit review, not a saved-CV permission flag.
    assert len(requests) == 1
    monkeypatch.setattr(ai.settings, "ai_enabled", False)
    assert await ai.review_cv(cv) is None
    assert len(requests) == 1


async def test_cv_parse_rejects_invalid_files_and_requires_auth(client):
    files = {"file": ("cv.pdf", b"not a PDF", "application/pdf")}
    assert (await client.post("/api/v1/cv/parse", files=files)).status_code == 401
    response = await client.post("/api/v1/cv/parse", headers={"Authorization": f"Bearer {uuid4()}"}, files=files,data={'ai_consent':'true'})
    assert response.status_code == 422
    assert "signature" in response.json()["detail"]


async def test_completing_a_step_activates_only_that_plan_and_persists_without_select(client):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    plans = (await client.post("/api/v1/pathways/generate", headers=headers, json={"role_id": "data-analyst"})).json()["data"]["pathways"]
    for plan in plans:
        response = await client.patch(f"/api/v1/pathways/{plan['id']}/progress", headers=headers, json={"step_id": plan["steps"][0]["id"], "complete": True})
        assert response.status_code == 200
        assert response.json()["data"]["selected"] is True
        saved = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]["pathways"]
        assert [p["id"] for p in saved if p.get("selected")] == [plan["id"]]
        assert next(p for p in saved if p["id"] == plan["id"])["completed_steps"] == [plan["steps"][0]["id"]]


@pytest_asyncio.fixture
async def client():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session = async_sessionmaker(engine, expire_on_commit=False)

    async def database():
        async with session() as db:
            yield db
            await db.commit()

    async def test_identity(authorization: str | None = Header(None)):
        if not authorization:
            raise HTTPException(401, "Sign in.")
        return authorization.removeprefix("Bearer ")

    app.dependency_overrides[get_db] = database
    app.dependency_overrides[current_user] = test_identity
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


async def test_full_journey_and_cross_user_isolation(client,ai_assessment_stub):
    a = {"Authorization": f"Bearer {uuid4()}"}
    b = {"Authorization": f"Bearer {uuid4()}"}
    sample = demo_snapshot("student")
    assert (await client.get("/api/v1/dashboard")).status_code == 401
    assert (await client.put("/api/v1/profile", headers=a, json=sample["profile"])).status_code == 200
    await upload_confirmed_cv(client, a, sample["cv"])
    assert (
        await client.put("/api/v1/questionnaire", headers=a, json=sample["questionnaire"])
    ).status_code == 200
    assert (await client.put("/api/v1/cv", headers=a, json=sample["cv"])).status_code == 200
    response = await client.post("/api/v1/cv/analyze", headers=a,json={'ai_consent':True})
    assert response.status_code == 200
    assert response.json()["data"]["analysis_mode"] == "ai-rating"
    response = await client.post("/api/v1/careers/match", headers=a, json={"scenario": "rapid", "horizon": 5})
    assert len(response.json()["data"]["matches"]) == 5
    response = await client.post("/api/v1/pathways/generate", headers=a, json={"role_id": "data-analyst"})
    plan = response.json()["data"]["pathways"][0]
    step = plan["steps"][0]["id"]
    assert (
        await client.patch(
            f"/api/v1/pathways/{plan['id']}/progress", headers=b, json={"step_id": step, "complete": True}
        )
    ).status_code == 404
    assert (await client.post(f"/api/v1/pathways/{plan['id']}/select", headers=b)).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/pathways/{plan['id']}/progress", headers=a, json={"step_id": step, "complete": True}
        )
    ).status_code == 200
    assert (await client.post(f"/api/v1/pathways/{plan['id']}/select", headers=a)).status_code == 200
    own = (await client.get("/api/v1/dashboard", headers=a)).json()["data"]
    other = (await client.get("/api/v1/dashboard", headers=b)).json()["data"]
    assert own["profile"]["name"] == "Aisha Rahman" and other["profile"]["name"] == ""
    assert (
        next(p for p in own["pathways"] if p["id"] == plan["id"])["completed_steps"]
        and other["pathways"] == []
    )
    assert other["cv"]["name"] == ""


async def test_request_validation_and_public_demo_never_use_db(client):
    a = {"Authorization": f"Bearer {uuid4()}"}
    response = await client.put("/api/v1/profile", headers=a, json={"user_id": "injected"})
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")

    async def forbidden_db():
        raise AssertionError("Demo must not use a database")

    app.dependency_overrides[get_db] = forbidden_db
    for persona in ["student", "professional"]:
        response = await client.get(f"/api/v1/demo/{persona}?scenario=rapid&horizon=5")
        assert response.status_code == 200
        assert response.json()["meta"]["is_synthetic"] is True
        assert response.json()["data"]["read_only"]
    assert (await client.get("/api/v1/demo/student?horizon=7")).status_code == 422
    wrong_method = await client.post("/api/v1/demo/student")
    assert wrong_method.status_code == 405
    assert wrong_method.headers["content-type"].startswith("application/problem+json")


@pytest.mark.parametrize("configured_url", [
    "https://test.supabase.co", "https://test.supabase.co/", " https://test.supabase.co/// ",
])
def test_jwt_verification_rejects_wrong_claims(monkeypatch, configured_url):
    monkeypatch.setattr(security, "settings", Settings(supabase_url=configured_url, _env_file=None))
    key = ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setattr(
        security, "jwks", SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key()))
    )
    user = str(uuid4())
    claims = {
        "sub": user,
        "exp": datetime.now(UTC) + timedelta(minutes=5),
        "iss": "https://test.supabase.co/auth/v1",
        "aud": "authenticated",
    }
    assert verify_token(jwt.encode(claims, key, algorithm="ES256")) == user
    for invalid in [{**claims, "aud": "anon"}, {**claims, "iss": "https://other"}, {**claims, "exp": 0}]:
        with pytest.raises(jwt.PyJWTError):
            verify_token(jwt.encode(invalid, key, algorithm="ES256"))


async def test_ai_failure_never_substitutes_heuristic_analysis(client, monkeypatch):
    from app import ai
    from app.config import settings

    monkeypatch.setattr(settings, "ai_enabled", True)
    monkeypatch.setattr(settings, "ai_api_key", "test-only")
    monkeypatch.setattr(settings, "ai_model", "test-only")
    original_post = ai.httpx.AsyncClient.post

    async def fail(self, url, *args, **kwargs):
        if str(url).startswith("/api/"):
            return await original_post(self, url, *args, **kwargs)
        raise RuntimeError("simulated provider outage")

    monkeypatch.setattr(ai.httpx.AsyncClient, "post", fail)
    sample = demo_snapshot("student")["cv"]
    sample["ai_consent"] = True
    a = {"Authorization": f"Bearer {uuid4()}"}
    await client.put("/api/v1/cv", headers=a, json=sample)
    response = await client.post("/api/v1/cv/analyze", headers=a)
    assert response.status_code == 503
    dashboard=(await client.get('/api/v1/dashboard',headers=a)).json()['data']
    assert dashboard['cv']==sample
    assert dashboard['evaluation'] is None


async def test_new_user_has_no_fictional_personalization(client):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    data = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    assert data["selected_role"] == ""
    assert data["matches"] == []
    assert data["impact"]["goals"] == []
    assert data["impact"]["skills"] == []
    assert data["questionnaire"]["completed_step"] == 0
    assert (await client.get("/api/v1/sdg/impact-path", headers=headers)).json()["data"]["goals"] == []


async def test_processed_cv_persists_profile_and_latest_fields_without_confirmation(client,ai_extraction_stub):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    other = {"Authorization": f"Bearer {uuid4()}"}
    await client.put("/api/v1/profile", headers=headers, json={"goal": "Keep my independent goal"})
    for skills, education in [("Python SQL", "BSc Mathematics"), ("Excel", "Diploma in Business")]:
        with pymupdf.open() as doc:
            doc.new_page().insert_text((50,55), "\n".join(["Jordan Lee", "Education", education, "Experience", "Prepared quarterly reports", "Skills", skills]))
            content = doc.tobytes()
        response = await client.post("/api/v1/cv/parse", headers=headers, files={"file": ("cv.pdf", content, "application/pdf")},data={"ai_consent":"true"})
        assert response.status_code == 200
        data = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
        assert data["profile"]["name"] == "Jordan Lee"
        assert education in data["profile"]["education"]
        assert data["profile"]["goal"] == "Keep my independent goal"
        assert data["cv"]["experience"] == "Prepared quarterly reports"
        assert data["cv"]["email"] == ""
        assert data["cv"]["ai_consent"] is False
    assert "Python" not in data["cv"]["skills"]
    assert all(m["acquired"] for m in data["impact"]["skill_mappings"])
    isolated = (await client.get("/api/v1/dashboard", headers=other)).json()["data"]
    assert isolated["profile"]["name"] == ""
    assert isolated["cv"]["skills"] == []


async def test_survey_details_persist_and_updates_remain_completed(client):
    headers = {"Authorization": f"Bearer {uuid4()}"}
    sample = demo_snapshot("student")
    await upload_confirmed_cv(client, headers, sample["cv"])
    body = {**sample["questionnaire"], "interests": ["technology"], "strengths": ["Communication"], "social_energy": "mixed", "decision_style": "both", "learning_style": "practice", "career_goal": "Build accessible tools", "completed_step": 5}
    assert (await client.put("/api/v1/questionnaire", headers=headers, json=body)).status_code == 200
    body["career_goal"] = "Improve public services"
    await client.put("/api/v1/questionnaire", headers=headers, json=body)
    data = (await client.get("/api/v1/dashboard", headers=headers)).json()["data"]
    assert data["profile"]["onboarding_complete"] is True
    assert data["questionnaire"]["career_goal"] == "Improve public services"
    assert data["questionnaire"]["strengths"] == ["Communication"]
    assert "personality_type" not in data["preferences"]
