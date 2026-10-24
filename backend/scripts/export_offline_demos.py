"""Export fictional profiles and authored expected outcomes; never read accounts."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.catalog import ROLES, SKILLS
from app.demo import demo_snapshot
from app.sdg_service import build_skill_mapping


def export():
    result = {"skills": {sid: {"mapping": build_skill_mapping(sid), "aliases": [sid, name, *aliases]}
                         for sid, (name, aliases) in SKILLS.items()}, "personas": {}}
    for persona in ("student", "professional"):
        base = demo_snapshot(persona)
        contexts = {}
        for role in ROLES:
            snap = demo_snapshot(persona, role_id=role["id"])
            contexts[role["id"]] = {key: snap[key] for key in ("impact", "news", "pathways", "tracker")}
            contexts[role["id"]]["forecasts"] = {
                f"{scenario}-{horizon}": demo_snapshot(persona, scenario=scenario, role_id=role["id"], horizon=horizon)["forecast"]
                for scenario in ("moderate", "rapid") for horizon in (3, 5, 10, 15)}
        result["personas"][persona] = {"base": base, "contexts": contexts, "matches": {
            scenario: demo_snapshot(persona, scenario=scenario)["matches"] for scenario in ("moderate", "rapid")}}
    return json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[2] / "frontend/src/lib/data/offline-demos.json"
    content = export()
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            raise SystemExit("Offline demo bundle is stale. Run backend/scripts/export_offline_demos.py.")
        print("Offline demo bundle matches the authored backend examples.")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        print("Exported fictional offline demos; no account data or credentials included.")
