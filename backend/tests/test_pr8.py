from uuid import uuid4

import httpx
import pytest
from test_api import client as client

from app import sdg_ai
from app.config import settings


async def test_simulator_is_public_bounded_and_never_changes_cv(client):
    user = {"Authorization": f"Bearer {uuid4()}"}
    cv = {"name": "Learner", "skills": ["Excel"], "projects": "Original project."}
    await client.put("/api/v1/cv", headers=user, json=cv)
    simulated = await client.post("/api/v1/sdg/simulate", json={"role_id": "data-analyst", "skills": ["Python", "SQL"]})
    assert simulated.status_code == 200 and simulated.json()["data"]["simulation"]
    assert any(item["skill_name"] == "SQL" and item["acquired"] for item in simulated.json()["data"]["skill_mappings"])
    after = (await client.get("/api/v1/dashboard", headers=user)).json()["data"]
    assert after["cv"]["skills"] == ["Excel"] and after["cv"]["projects"] == "Original project."
    for body in ({"role_id": "unknown"}, {"skills": ["x"] * 101}, {"skills": ["x" * 101]}):
        assert (await client.post("/api/v1/sdg/simulate", json=body)).status_code in (404, 422)


async def test_ai_requires_auth_configuration_and_limits_explicit_requests(client, monkeypatch):
    user = {"Authorization": f"Bearer {uuid4()}"}
    body = {"role_id": "data-analyst", "skills": ["Python"]}
    assert (await client.post("/api/v1/sdg/summary", json=body)).status_code == 401
    monkeypatch.setattr(settings, "sdg_ai_enabled", False)
    assert not (await client.get("/api/v1/sdg/summary/status")).json()["data"]["available"]
    assert (await client.post("/api/v1/sdg/summary", headers=user, json=body)).status_code == 503
    monkeypatch.setattr(settings, "sdg_ai_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "test-placeholder")
    monkeypatch.setattr(settings, "gemini_model", "test-model")
    async def unavailable(*args):
        return None
    monkeypatch.setattr(sdg_ai, "summarize", unavailable)
    for _ in range(3):
        result = (await client.post("/api/v1/sdg/summary", headers=user, json=body)).json()["data"]
        assert result["generation_engine"] == "curated" and "unavailable" in result["notice"]
    assert (await client.post("/api/v1/sdg/summary", headers=user, json=body)).status_code == 429


@pytest.mark.parametrize("valid", [True, False])
async def test_gemini_adapter_validates_output_and_omits_contact_data(monkeypatch, valid):
    monkeypatch.setattr(settings, "sdg_ai_enabled", True)
    monkeypatch.setattr(settings, "gemini_api_key", "test-placeholder")
    monkeypatch.setattr(settings, "gemini_model", "test-model")
    original = httpx.AsyncClient
    requests = []
    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": '{"role_summary":"Practise analysis to explore resource use."}' if valid else '{"unexpected":true}'}]}}]})
    monkeypatch.setattr(sdg_ai.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    result = await sdg_ai.summarize("Data Analyst", ["Python"])
    assert bool(result) == valid
    assert len(requests) == 1 and requests[0].headers["x-goog-api-key"] == "test-placeholder"
    assert b'"skills":' in requests[0].content.replace(b'\\"', b'"')
    assert b'email' not in requests[0].content and b'candidate_name' not in requests[0].content
