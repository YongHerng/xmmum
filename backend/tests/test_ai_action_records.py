"""Ordinary saves must neither trigger AI nor fabricate consent records."""
from uuid import uuid4

from sqlalchemy import select

from app import main, sdg_ai
from app.config import settings
from app.db import ConsentEvent, get_db
from app.main import app
from test_api import client


async def test_cv_and_survey_saves_do_not_create_ai_consent_or_send_to_ai(client, monkeypatch):
    async def forbidden(*args, **kwargs):
        raise AssertionError("Saving ordinary profile data must not trigger AI.")

    monkeypatch.setattr(main, "assess_cv", forbidden)
    monkeypatch.setattr(main, "extract_cv", forbidden)
    owner = str(uuid4())
    headers = {"Authorization": f"Bearer {owner}"}
    for legacy_flag in (False, True):
        response = await client.put("/api/v1/cv", headers=headers,
                                    json={"summary": "An editable saved summary.", "ai_consent": legacy_flag})
        assert response.status_code == 200
    assert (await client.put("/api/v1/questionnaire", headers=headers, json={})).status_code == 200
    async for db in app.dependency_overrides[get_db]():
        assert list(await db.scalars(select(ConsentEvent).where(ConsentEvent.user_id == owner))) == []


async def test_sdg_quota_event_does_not_fabricate_a_new_consent_record(client, monkeypatch):
    monkeypatch.setattr(settings, "sdg_ai_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "test-placeholder")
    monkeypatch.setattr(settings, "gemini_model", "test-model")

    async def unavailable(*args):
        return None

    monkeypatch.setattr(sdg_ai, "summarize", unavailable)
    owner = str(uuid4())
    response = await client.post("/api/v1/sdg/summary", headers={"Authorization": f"Bearer {owner}"},
                                 json={"role_id": "data-analyst", "skills": ["Python"]})
    assert response.status_code == 200
    async for db in app.dependency_overrides[get_db]():
        events = list(await db.scalars(select(ConsentEvent).where(ConsentEvent.user_id == owner)))
        assert len(events) == 1
        assert events[0].payload["event"] == "ai_request"
        assert "granted" not in events[0].payload
