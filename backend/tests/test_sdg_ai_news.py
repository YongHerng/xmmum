import json
from uuid import uuid4

import httpx
from test_api import client as client

from app import sdg_ai
from app.sdg_news import parse_feed
from app.sdg_service import allocate_project_xp, get_news_for_context


def headers():
    return {"Authorization": f"Bearer {uuid4()}"}


SOLAR = {"project_title": "Campus solar dashboard", "linked_skill": "Python", "evidence_url": "",
         "description": "Tracked solar panel output and electricity savings to cut carbon emissions on campus."}


def test_reading_list_covers_all_17_goals():
    assert sorted(item["id"] for item in get_news_for_context("data-analyst", [])["items"]) == list(range(1, 18))


async def test_project_sdgs_are_assessed_not_chosen_by_the_user(client):
    a = headers()
    tracker = (await client.post("/api/v1/tracker/contributions", headers=a, json=SOLAR)).json()["data"]
    item = tracker["contributions"][0]
    assert [g["sdg"] for g in item["sdg_allocations"]][:2] == [7, 13]
    assert sum(g["xp"] for g in item["sdg_allocations"]) == item["xp_awarded"] == tracker["xp_points"]
    assert {g["number"] for g in tracker["sdg_xp"]} >= {7, 13}


async def test_gemini_assessment_sets_budget_and_split(monkeypatch):
    monkeypatch.setattr(sdg_ai, "available", lambda: True)
    reply = {"level": 3, "allocations": [{"sdg": 13, "weight": 60, "target": "13.3", "reason": "Cuts emissions."},
                                         {"sdg": 7, "weight": 40, "target": "7.2", "reason": "Solar output."}]}
    body = {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(reply)}]}}]}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    real_client = httpx.AsyncClient
    monkeypatch.setattr(sdg_ai.httpx, "AsyncClient", lambda **kw: real_client(transport=transport, **kw))
    assessment = await sdg_ai.assess_project(SOLAR["project_title"], SOLAR["description"], "Python")
    result = allocate_project_xp(SOLAR["project_title"], SOLAR["description"], "Python", assessment)
    assert result["assessed_by"] == "ai" and result["xp_awarded"] == 200
    assert [(g["sdg"], g["xp"]) for g in result["sdg_allocations"]] == [(13, 120), (7, 80)]


def test_news_feed_parsing_strips_source_suffix():
    xml = """<rss><channel><item><title>Solar grows fast - The Star</title><link>https://news.google.com/a</link>
    <pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate><source url="https://thestar.com.my">The Star</source></item></channel></rss>"""
    [item] = parse_feed(xml)
    assert item["title"] == "Solar grows fast" and item["source"] == "The Star" and item["published_at"].startswith("2026-10-23")
