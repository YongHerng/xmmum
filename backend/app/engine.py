import math
import re
from copy import deepcopy
from .catalog import CATALOG_VERSION, RESOURCES, ROLES, SDGS, SKILLS, SKILL_EVIDENCE, SOURCES, get_role, label
from .sdg_service import enrich_impact_data
from .currency import currency_for_location
from .skill_evidence import skill_profile, EVIDENCE_MODEL


def normalize_skills(values):
    found = set()
    for value in values:
        text = value.lower().strip()
        for key, (name, aliases) in SKILLS.items():
            if text == key or any(
                re.search(r"(?<!\w)" + re.escape(alias.lower()) + r"(?!\w)", text)
                for alias in [name, *aliases]
            ):
                found.add(key)
    return sorted(found)


def preferences(answers):
    if answers.completed_step == 0:
        return {"summary": "Complete Discover Yourself to describe your preferences.",
                "note": "No personality type has been assigned."}
    return {
        "style": answers.work_style,
        "environment": answers.environment,
        "interests": answers.interests,
        "motivation": answers.motivation,
        "weekly_hours": answers.weekly_hours,
        "budget": answers.budget,
        "currency": currency_for_location(answers.location),
        "summary": f"You prefer {answers.work_style} work in a {answers.environment} environment, "
        f"with {answers.weekly_hours} study hours per week. Your current motivation is {answers.motivation}.",
        "note": "Editable preferences, not a psychological assessment or prediction of career success.",
    }


def evaluate(cv):
    skills = normalize_skills(cv.skills)
    text = "\n".join([cv.summary, cv.education, cv.experience, cv.projects,
                      cv.membership_licensure, cv.certificates_training])
    sentences = [s.strip(" -•") for s in re.split(r"[\n.!?]+", text) if s.strip()]
    words = text.split()
    long = sum(len(s.split()) > 30 for s in sentences)
    evidence = len(re.findall(r"\b\d+(?:\.\d+)?\s*%?", cv.experience + " " + cv.projects))
    role = get_role(cv.target_role)
    required = role["technical"] if role else []
    overlap = len(set(required) & set(skills)) / len(required) if required else 0
    sections = [cv.name, cv.email, cv.summary, cv.education, cv.experience or cv.projects, cv.skills]
    scores = {
        "Clarity & readability": min(100, max(0, 100 - 15 * long - max(0, 35 - len(words)))) if words else 0,
        "Evidence & specificity": min(100, (30 if cv.experience or cv.projects else 0) + evidence * 14),
        "Target-role relevance": round(overlap * 100),
        "Organization": round(
            sum(bool(x) for x in [cv.summary, cv.education, cv.experience or cv.projects, cv.skills])
            / 4
            * 100
        ),
        "Skills presentation": min(100, len(skills) * 12),
        "Completeness": round(sum(bool(x) for x in sections) / 6 * 100),
    }
    weights = [20, 20, 20, 15, 15, 10]
    breakdown = [
        dict(name=name, score=score, weight=weight) for (name, score), weight in zip(scores.items(), weights)
    ]
    strengths = [f"{name}: {score}/100" for name, score in scores.items() if score >= 70]
    suggestions = []
    if not cv.education:
        suggestions.append("Add your education, qualification and expected graduation date.")
    if not cv.projects and not cv.experience:
        suggestions.append("Add a project, volunteering or work example with your own contribution.")
    if evidence < 2:
        suggestions.append(
            "Describe a real outcome with a number where you can verify it. Never invent metrics."
        )
    if overlap < 0.6:
        suggestions.append(
            "Make relevant existing skills easier to find; develop missing skills before claiming them."
        )
    if long:
        suggestions.append("Split long sentences into short, focused achievement bullets.")
    if not suggestions:
        suggestions.append("Tailor your summary and strongest project to the selected target role.")
    return dict(
        score=round(sum(b["score"] * b["weight"] / 100 for b in breakdown)),
        breakdown=breakdown,
        strengths=strengths or ["A starting point for your next CV revision."],
        suggestions=suggestions,
        skills=[dict(id=s, name=label(s)) for s in skills],
        analysis_mode="deterministic",
        ai_status="AI review unavailable — deterministic assessment used.",
        rubric_version="cv-1.0",
        note="FutureProof CV Quality Score. Not an employer ATS score.",
    )


def matches(cv, answers, scenario="moderate", badge_evidence=None):
    evidence = skill_profile(sorted(set(normalize_skills(cv.skills)) - set(cv.course_skill_ids)), badge_evidence)
    coverage = {item['id']: item['credit'] for item in evidence}
    skills = set(coverage)
    strengths = set(normalize_skills(answers.strengths))
    result = []
    for role in ROLES:
        technical = set(role["technical"])
        transferable = set(role["transferable"])
        interests = set(answers.interests)
        components = [
            dict(
                name="Skill coverage", weight=45, score=round(sum(coverage.get(s, 0) for s in technical) / len(technical) * 100)
            ),
            dict(
                name="Transferable skills",
                weight=20,
                score=round(sum(max(coverage.get(s, 0), 1 if s in strengths else 0) for s in transferable) / len(transferable) * 100),
            ),
            dict(
                name="Interests",
                weight=15,
                score=round(len(interests & set(role["interests"])) / len(role["interests"]) * 100),
            ),
            dict(
                name="Work preferences",
                weight=10,
                score=100 if answers.work_style and answers.work_style in role["preferences"] else 50,
            ),
            dict(name="Practical constraints", weight=10, score=50),
        ]
        # Location/qualification requirements are not verified. Neutral contribution is disclosed.
        result.append(
            {
                **deepcopy(role),
                "score": round(sum(c["weight"] * c["score"] / 100 for c in components)),
                "components": components,
                "matched_skills": [
                    dict(id=s, name=label(s)) for s in sorted(skills & (technical | transferable))
                ],
                "gaps": [dict(id=s, name=label(s), partial=coverage.get(s, 0) > 0) for s in role["technical"] if coverage.get(s, 0) < 1],
                "skill_evidence": [item for item in evidence if item['id'] in technical | transferable],
                "evidence_model": EVIDENCE_MODEL,
                "explanation": f"{len(skills & technical)} of {len(technical)} curated technical skills have CV claims or course-assessment evidence. "
                "CV claims retain the existing coverage credit; new badge-only skills receive Foundation 50%, Intermediate 75%, or Advanced 100% credit. "
                "The strongest contribution counts once per skill, never once per badge. These are prototype coverage weights, not verified job proficiency. "
                "The fit score compares skills and preferences, not a probability of employment. "
                "Constraints contribute a neutral 50/100 because local job eligibility is unverified.",
                "transition": "Focused development"
                if sum(1 - coverage.get(s, 0) for s in technical) <= 2
                else "Broader development",
                "scenario": scenario,
            }
        )
    return sorted(result, key=lambda r: (-r["score"], r["title"]))[:5]


def personal_matches(cv, answers, scenario="moderate", badge_evidence=None):
    # A curated catalogue role becomes a personal direction only with supporting evidence.
    return [item for item in matches(cv, answers, scenario, badge_evidence) if item["matched_skills"]]


def forecast(cv, role_id, scenario, horizon=5):
    role = get_role(role_id) or ROLES[0]
    skills = normalize_skills(cv.skills)
    records = []
    for skill in skills:
        group = SKILL_EVIDENCE.get(skill)
        if group:
            direction = "Growing skill group"
            why = f"Mapped to {group}, a broad group employers expect to use more by 2030 in the WEF 2025 survey. This mapping does not establish demand for {label(skill)} in your country or target role."
        else:
            direction = "Insufficient evidence"
            why = "No reviewed source supports an individual-skill demand trend for this tool or capability. No growth or decline is inferred."
        records.append(dict(id=skill, name=label(skill), direction=direction, explanation=why, source=SOURCES[3] if group else None, evidence_group=group))
    return dict(
        scenario=scenario,
        horizon=horizon,
        skills=records,
        label="Research context · illustrative scenario",
        confidence="Broad global survey evidence; individual-skill and local-demand confidence is insufficient.",
        assumptions=[
            f"Target role: {role['title']}. Related occupational references do not establish local hiring demand.",
            f"{'Rapid' if scenario == 'rapid' else 'Moderate'} adoption is an exploration setting, not observed evidence; it does not change the published findings or personal fit.",
            f"The selected {horizon}-year horizon is illustrative. The cited survey covers 2025–2030 only; findings are not extrapolated to this horizon.",
        ],
        limitation="Source scope: global employer expectations, not measured vacancies, salaries or a prediction for an individual. No live skill-demand feed is connected.",
        sources=SOURCES,
        version=CATALOG_VERSION,
    )


def pathways(cv, answers, role_id):
    role = get_role(role_id)
    if not role:
        raise ValueError("Unknown career role")
    missing = [s for s in role["technical"] if s not in normalize_skills(cv.skills)]
    plans = []
    for kind in ["fastest", "lowest-cost"]:
        uncovered = set(missing)
        steps = []
        while uncovered:
            candidates = [r for r in RESOURCES if uncovered & set(r["skills"])]
            if not candidates:
                break
            if kind == "fastest":
                best = min(
                    candidates, key=lambda r: (r["hours"] / len(uncovered & set(r["skills"])), r["hours"])
                )
            else:
                best = min(
                    candidates,
                    key=lambda r: (
                        r["cost"],
                        0 if r["focus"] == "comprehensive" else 1,
                        -len(uncovered & set(r["skills"])),
                        r["hours"],
                    ),
                )
            steps.append(
                {
                    **best,
                    "complete": False,
                    "covered_skills": [label(s) for s in best["skills"] if s in uncovered],
                }
            )
            uncovered -= set(best["skills"])
        hours = sum(s["hours"] for s in steps)
        plans.append(
            dict(
                id=f"{role_id}-{kind}",
                role_id=role_id,
                role_title=role["title"],
                kind=kind,
                title="Fastest Transition" if kind == "fastest" else "Lowest-Cost Transition",
                steps=steps,
                hours=hours,
                weeks=math.ceil(hours / (answers.weekly_hours or 6)),
                cost=sum(s["cost"] for s in steps),
                currency=currency_for_location(answers.location),
                weekly_hours=answers.weekly_hours or 6,
                completed_steps=[],
                uncovered_skills=[label(s) for s in sorted(uncovered)],
                note="Both paths use free content; they may have equal cost. Study hours are prototype allocations, not provider promises.",
            )
        )
    return plans


def impact(role_id, cv, *, demo=False, badge_evidence=None):
    role = get_role(role_id)
    current = {item["id"] for item in skill_profile(normalize_skills(cv.skills), badge_evidence)}
    if not role or (not demo and not current.intersection(role["technical"] + role["transferable"])):
        return dict(role="", role_id="", activity="", skills=[], goals=[], skill_mappings=[],
                    note="Add relevant skills to discover supported SDG connections.", source="https://sdgs.un.org/goals")
    enriched = enrich_impact_data(role["id"], [label(skill) for skill in sorted(current)], current)
    if not demo:
        enriched["skill_mappings"] = [item for item in enriched["skill_mappings"]
                                     if item["acquired"] and item["skill_id"] in role["technical"] + role["transferable"]]
        enriched["role_summary"] = f"Explore how your skills could connect to work in {role['title']}."
    supported_goals = {item["sdg_number"] for item in enriched["skill_mappings"]}
    return dict(
        role=role["title"],
        role_id=role["id"],
        activity=role["activity"],
        skills=[dict(id=s, name=label(s), acquired=s in current) for s in role["technical"] + role["transferable"] if demo or s in current],
        goals=[
            dict(
                number=n,
                title=SDGS[n][0],
                target=SDGS[n][1],
                description=SDGS[n][2],
                color=SDGS[n][3],
                url=f"https://sdgs.un.org/goals/goal{n}",
            )
            for n in role["sdgs"] if demo or n in supported_goals
        ],
        note="Potential alignment only. Not measured impact, UN endorsement or a certified credential.",
        source="https://sdgs.un.org/goals",
        **enriched,
    )
