from uuid import uuid4

from test_api import client as client

from app.sdg_service import build_tracker_snapshot, generate_live_or_fallback_sdg_mapping


def identity():
    return {"Authorization": f"Bearer {uuid4()}"}


def project(title="Energy notebook", skill="Python"):
    return {"project_title": title, "description": "Explored synthetic energy readings and documented the assumptions.",
            "linked_skill": skill, "sdg_goal": "SDG 8", "un_target": "Target 8.2", "evidence_url": "https://example.org/project"}


def test_curated_mapping_has_no_unverified_demand_or_impact_scores():
    result = generate_live_or_fallback_sdg_mapping("data-analyst", ["Python", "an unusual skill"])
    assert result["generation_engine"] == "curated"
    assert "Gemini" not in result["disclosure_badge"]
    assert all("impact_score" not in goal for goal in result["goal_citations"])
    assert all("workforce_demand_signal" not in skill for skill in result["skill_mappings"])
    assert result["skill_mappings"][0]["acquired"]
    assert any(skill["skill_name"] == "an unusual skill" for skill in result["skill_mappings"])
    real = build_tracker_snapshot({}, {"skills": []}, [], "data-analyst")
    assert real["xp_points"] == 0 and real["progress_percent"] == 0 and not real["contributions"]
    plan = {"steps": [{"id": "same-course"}], "completed_steps": ["same-course"]}
    deduped = build_tracker_snapshot({}, {"skills": ["Python", "python"]}, [plan, plan], "data-analyst")
    assert deduped["xp_points"] == 80 and deduped["completed_steps"] == deduped["total_steps"] == 1


async def test_reading_and_digest_are_accurately_labelled(client):
    reading = (await client.get("/api/v1/sdg/news?role_id=data-analyst&skills=Python")).json()["data"]
    assert reading["items"][0]["is_recommended"]
    assert all(item["publication_date"] is None and item["source_url"].startswith("https://sdgs.un.org/") for item in reading["items"])
    digest = await client.post("/api/v1/sdg/news/digest", json={"role_id": "data-analyst", "selected_news_ids": [4]})
    assert digest.status_code == 200
    assert digest.json()["data"]["status"] == "preview"
    assert [item["id"] for item in digest.json()["data"]["digest_preview"]] == [4]
    assert "recipient_email" not in digest.json()["data"]


async def test_personal_projects_persist_without_fictional_defaults_or_duplicate_xp(client):
    a, b = identity(), identity()
    fresh = (await client.get("/api/v1/tracker", headers=a)).json()["data"]
    assert fresh["contributions"] == [] and fresh["xp_points"] == 0
    first = await client.post("/api/v1/tracker/contributions", headers=a, json=project())
    assert first.status_code == 200
    assert first.json()["data"]["xp_points"] == 150
    assert first.json()["data"]["contributions"][0]["verified_status"] == "Self-reported"
    assert (await client.post("/api/v1/tracker/contributions", headers=a, json=project())).status_code == 409
    second = await client.post("/api/v1/tracker/contributions", headers=a, json=project("Resource notebook", "Excel"))
    assert second.json()["data"]["xp_points"] == 300
    reloaded = (await client.get("/api/v1/tracker", headers=a)).json()["data"]
    assert reloaded["xp_points"] == 300 and len(reloaded["contributions"]) == 2
    assert (await client.get("/api/v1/tracker", headers=b)).json()["data"]["contributions"] == []
    assert (await client.post("/api/v1/tracker/equip-title", headers=a, json={"title": "Impact Pathfinder"})).status_code == 422
    bad = project("Unsafe link");bad["evidence_url"] = "javascript:alert(1)"
    assert (await client.post("/api/v1/tracker/contributions", headers=a, json=bad)).status_code == 422


async def test_cv_sync_only_previews_selected_owned_projects_until_normal_confirmation(client, ai_assessment_stub):
    a, b = identity(), identity()
    original = {"name": "Example Learner", "summary": "A student practising analysis.", "skills": ["Excel"], "projects": "An existing project.", "target_role": "data-analyst", "phone": "+60 12-345 6789", "membership_licensure": "Student Member", "certificates_training": "First Aid Certificate"}
    await client.put("/api/v1/cv", headers=a, json=original)
    tracker = (await client.post("/api/v1/tracker/contributions", headers=a, json=project())).json()["data"]
    record = tracker["contributions"][0]["id"]
    body = {"role_id": "data-analyst", "contribution_ids": [record]}
    assert (await client.post("/api/v1/tracker/reskill-done", headers=b, json=body)).status_code == 404
    proposal = (await client.post("/api/v1/tracker/reskill-done", headers=a, json=body)).json()["data"]
    assert proposal["mode"] == "preview"
    assert proposal["cv"]["skills"] == ["Excel", "Python"]
    assert "SQL" not in proposal["cv"]["skills"]
    assert proposal["cv"]["projects"].startswith(original["projects"])
    for field in ("phone", "membership_licensure", "certificates_training", "target_role"):
        assert proposal["cv"][field] == original[field]
    dashboard = (await client.get("/api/v1/dashboard", headers=a)).json()["data"]
    assert dashboard["cv"]["skills"] == ["Excel"] and dashboard["cv"]["projects"] == original["projects"]
    saved = await client.put("/api/v1/cv", headers=a, json=proposal["cv"])
    assert saved.json()["data"]["version"] == 2
    assert (await client.post("/api/v1/cv/analyze", headers=a)).status_code == 200
    after = (await client.get("/api/v1/dashboard", headers=a)).json()["data"]
    assert after["cv"]["skills"] == ["Excel", "Python"]
    assert after["cv"]["certificates_training"] == original["certificates_training"]
    stale = await client.put(f"/api/v1/cv?expected_version={proposal['base_version']}", headers=a, json=proposal["cv"])
    assert stale.status_code == 409


async def test_community_authorship_likes_comments_reports_and_ownership(client):
    a, b = identity(), identity()
    await client.put("/api/v1/profile", headers=a, json={"name": "Actual Author"})
    await client.put("/api/v1/profile", headers=b, json={"name": "Actual Reader"})
    assert (await client.get("/api/v1/community/posts")).status_code == 401
    assert (await client.post("/api/v1/community/posts", json={"content": "A reflection"})).status_code == 401
    forged = await client.post("/api/v1/community/posts", headers=a, json={"content": "A reflection", "author_name": "Someone else"})
    assert forged.status_code == 422
    post = (await client.post("/api/v1/community/posts", headers=a, json={"content": "A useful reflection on learning.", "skill_tag": "Python"})).json()["data"]
    assert post["author_name"] == "Actual Author" and post["likes_count"] == 0 and post["is_owner"]
    path = f"/api/v1/community/posts/{post['id']}"
    for _ in range(2):
        liked = await client.post(path + "/like", headers=b)
        assert liked.json()["data"]["likes_count"] == 1 and liked.json()["data"]["liked"]
    reply = await client.post(path + "/comment", headers=b, json={"text": "What did you learn about the dataset?"})
    assert reply.json()["data"]["comments"][0]["author"] == "Actual Reader"
    assert (await client.delete(path, headers=b)).status_code == 404
    await client.post(path + "/report", headers=b, json={"reason": "Needs project-owner review"})
    assert (await client.get("/api/v1/community/posts", headers=b)).json()["data"]["posts"] == []
    assert len((await client.get("/api/v1/community/posts", headers=a)).json()["data"]["posts"]) == 1
    assert (await client.delete(path, headers=a)).status_code == 200
    assert (await client.post(path + "/like", headers=b)).status_code == 404


async def test_community_write_rate_is_bounded(client):
    a = identity()
    for index in range(5):
        assert (await client.post("/api/v1/community/posts", headers=a, json={"content": f"Reflection {index}"})).status_code == 200
    assert (await client.post("/api/v1/community/posts", headers=a, json={"content": "Another reflection"})).status_code == 429
