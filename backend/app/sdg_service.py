"""Curated SDG interpretations and fictional demo data. No live demand or verification claims."""
import re
from copy import deepcopy
from .catalog import ROLES, SDGS, SKILLS, get_role, label
from .sdg_goals import ALL_SDGS, sdg_color, sdg_title

AI_DISCLOSURE_BADGE = "Curated interpretation · potential alignment, not measured impact or certification"
TITLE_TIERS = [
    {"min_xp": 0, "title": "SDG Explorer", "badge_target": "Discover your direction", "perk": "An in-app progress title"},
    {"min_xp": 350, "title": "Purposeful Builder", "badge_target": "Build through practice", "perk": "An in-app progress title"},
    {"min_xp": 600, "title": "Community Contributor", "badge_target": "Learn and share", "perk": "An in-app progress title"},
    {"min_xp": 850, "title": "Impact Pathfinder", "badge_target": "Keep putting skills into practice", "perk": "An in-app progress title"},
]
SKILL_SDG_FALLBACK = {'python': {'sdg_number': 8,
            'sdg_title': 'Decent Work and Economic Growth',
            'un_target': 'Target 4.4 & 8.2',
            'mapping_rationale': 'Automates repetitive data processing and powers reproducible analytics '
                                 'pipelines, raising technical worker productivity and innovation capacity.'},
 'sql': {'sdg_number': 9,
         'sdg_title': 'Industry, Innovation and Infrastructure',
         'un_target': 'Target 8.2 & 9.5',
         'mapping_rationale': 'Enables structured querying and auditability across operational, financial, '
                              'and resource-efficiency databases.'},
 'data-analysis': {'sdg_number': 8,
                   'sdg_title': 'Decent Work and Economic Growth',
                   'un_target': 'Target 4.4, 8.2 & 9.5',
                   'mapping_rationale': 'Transforms raw operational and environmental telemetry into '
                                        'actionable evidence for waste reduction and inclusive service '
                                        'delivery.'},
 'excel': {'sdg_number': 4,
           'sdg_title': 'Quality Education',
           'un_target': 'Target 4.4 & 8.2',
           'mapping_rationale': 'Provides universal spreadsheet modeling for operational tracking, quality '
                                'audits, and carbon inventory sheets.'},
 'statistics': {'sdg_number': 9,
                'sdg_title': 'Industry, Innovation and Infrastructure',
                'un_target': 'Target 8.2 & 9.5',
                'mapping_rationale': 'Grounds forecasting, quality control, and AI model validation in '
                                     'rigorous uncertainty quantification.'},
 'machine-learning': {'sdg_number': 9,
                      'sdg_title': 'Industry, Innovation and Infrastructure',
                      'un_target': 'Target 8.2, 9.4 & 9.5',
                      'mapping_rationale': 'Powers predictive maintenance, energy load forecasting, and '
                                           'anomaly detection when paired with transparent human oversight.'},
 'communication': {'sdg_number': 4,
                   'sdg_title': 'Quality Education',
                   'un_target': 'Target 4.4 & 8.5',
                   'mapping_rationale': 'Bridges technical findings and non-technical stakeholders to ensure '
                                        'inclusive, transparent organizational decision-making.'},
 'problem-solving': {'sdg_number': 8,
                     'sdg_title': 'Decent Work and Economic Growth',
                     'un_target': 'Target 4.4 & 8.2',
                     'mapping_rationale': 'Equips workers to diagnose root causes in complex digital and '
                                          'physical systems that automated routines cannot resolve alone.'},
 'teamwork': {'sdg_number': 8,
              'sdg_title': 'Decent Work and Economic Growth',
              'un_target': 'Target 8.5 & 10.2',
              'mapping_rationale': 'Supports cross-functional collaboration across engineering, '
                                   'sustainability, and product teams in inclusive workplaces.'},
 'javascript': {'sdg_number': 9,
                'sdg_title': 'Industry, Innovation and Infrastructure',
                'un_target': 'Target 8.2 & 9.5',
                'mapping_rationale': 'Builds accessible, responsive web interfaces that broaden digital '
                                     'public and enterprise service reach.'},
 'git': {'sdg_number': 9,
         'sdg_title': 'Industry, Innovation and Infrastructure',
         'un_target': 'Target 4.4 & 9.5',
         'mapping_rationale': 'Ensures reproducible version control, peer code review, and traceable '
                              'engineering governance.'},
 'cybersecurity': {'sdg_number': 16,
                   'sdg_title': 'Peace, Justice and Strong Institutions',
                   'un_target': 'Target 9.1 & 16.6',
                   'mapping_rationale': 'Safeguards critical infrastructure, citizen data privacy, and '
                                        'institutional accountability against cyber threats.'},
 'networking': {'sdg_number': 9,
                'sdg_title': 'Industry, Innovation and Infrastructure',
                'un_target': 'Target 9.1 & 9.c',
                'mapping_rationale': 'Maintains reliable, secure connectivity across cloud, campus, and '
                                     'industrial sensor networks.'},
 'cloud': {'sdg_number': 9,
           'sdg_title': 'Industry, Innovation and Infrastructure',
           'un_target': 'Target 8.2 & 9.4',
           'mapping_rationale': 'Enables scalable, energy-optimized compute infrastructure and resilient '
                                'digital service delivery.'},
 'linux': {'sdg_number': 9,
           'sdg_title': 'Industry, Innovation and Infrastructure',
           'un_target': 'Target 4.4 & 9.5',
           'mapping_rationale': 'Powers open-source servers, cybersecurity appliances, and edge IoT '
                                'gateways.'},
 'user-research': {'sdg_number': 10,
                   'sdg_title': 'Reduced Inequalities',
                   'un_target': 'Target 4.3 & 10.2',
                   'mapping_rationale': 'Uncovers accessibility barriers so digital tools serve diverse, '
                                        'underserved, and non-technical communities equitably.'},
 'design': {'sdg_number': 10,
            'sdg_title': 'Reduced Inequalities',
            'un_target': 'Target 4.4 & 10.2',
            'mapping_rationale': 'Translates complex workflows into clear, accessible interfaces that '
                                 'empower all users.'},
 'product': {'sdg_number': 8,
             'sdg_title': 'Decent Work and Economic Growth',
             'un_target': 'Target 8.2 & 9.5',
             'mapping_rationale': 'Aligns engineering execution with measurable user value, ethical '
                                  'guardrails, and sustainable business outcomes.'},
 'sustainability': {'sdg_number': 12,
                    'sdg_title': 'Responsible Consumption and Production',
                    'un_target': 'Target 12.2, 12.6 & 13.3',
                    'mapping_rationale': 'Embeds circular resource management, lifecycle assessment, and '
                                         'climate resilience into operational planning.'},
 'carbon': {'sdg_number': 13,
            'sdg_title': 'Climate Action',
            'un_target': 'Target 4.4, 12.6 & 13.3',
            'mapping_rationale': 'Quantifies Scope 1, 2, and 3 greenhouse gas inventories under GHG Protocol '
                                 'standards for verifiable decarbonization.'},
 'reporting': {'sdg_number': 12,
               'sdg_title': 'Responsible Consumption and Production',
               'un_target': 'Target 12.6 & 16.6',
               'mapping_rationale': 'Communicates transparent, auditable sustainability and operational '
                                    'metrics without greenwashing.'},
 'energy': {'sdg_number': 7,
            'sdg_title': 'Affordable and Clean Energy',
            'un_target': 'Target 7.2 & 7.3',
            'mapping_rationale': 'Optimizes renewable generation, solar integration, and building/industrial '
                                 'energy efficiency.'},
 'iot': {'sdg_number': 9,
         'sdg_title': 'Industry, Innovation and Infrastructure',
         'un_target': 'Target 8.2, 9.4 & 12.2',
         'mapping_rationale': 'Connects industrial sensors and equipment telemetry to detect faults early, '
                              'reducing scrap waste and unplanned downtime.'},
 'quality': {'sdg_number': 12,
             'sdg_title': 'Responsible Consumption and Production',
             'un_target': 'Target 8.2, 9.4 & 12.2',
             'mapping_rationale': 'Prevents defective production batches, material waste, and safety hazards '
                                  'on manufacturing lines.'},
 'gis': {'sdg_number': 15,
         'sdg_title': 'Life on Land',
         'un_target': 'Target 6.3, 13.3 & 15.1',
         'mapping_rationale': 'Maps watershed quality, deforestation risk, flood resilience, and terrestrial '
                              'biodiversity corridors.'}}

def resolve_skill_id(value):
    text = value.strip().lower()
    for sid, (name, aliases) in SKILLS.items():
        if text == sid or text == name.lower() or text in [a.lower() for a in aliases]:
            return sid
    return text


def build_skill_mapping(value, acquired=True):
    sid = resolve_skill_id(value)
    metadata = SKILL_SDG_FALLBACK.get(sid)
    if metadata is None:
        metadata = {"sdg_number": 4, "sdg_title": SDGS[4][0], "un_target": "Target 4.4",
                    "mapping_rationale": "Practising this skill can support learning for work. A specific impact connection needs project evidence."}
    number = metadata["sdg_number"]
    return {"skill_id": sid, "skill_name": label(sid) if sid in SKILLS else value.strip(),
            "acquired": acquired, **metadata, "source_citation": f"UN Sustainable Development Goal {number}",
            "source_url": f"https://sdgs.un.org/goals/goal{number}", "disclosure_badge": AI_DISCLOSURE_BADGE}


def enrich_impact_data(role_id, cv_skills, normalized_current):
    role = get_role(role_id) or ROLES[0]
    current = {resolve_skill_id(s) for s in cv_skills} | set(normalized_current)
    # Show all confirmed skills, then potential skills for the selected role.
    skills = list(dict.fromkeys([resolve_skill_id(s) for s in cv_skills if s.strip()] + role["technical"]))[:100]
    goals = [{"number": n, "title": SDGS[n][0], "target": SDGS[n][1], "un_target": f"Target {SDGS[n][1]}",
              "description": SDGS[n][2], "color": SDGS[n][3], "url": f"https://sdgs.un.org/goals/goal{n}",
              "source_citation": f"UN Sustainable Development Goal {n}", "source_url": f"https://sdgs.un.org/goals/goal{n}"}
             for n in role["sdgs"]]
    return {"role_summary": f"Your work as a {role['title']} could support sustainability through practical activities. Connect your skills to projects, then document what you actually did.",
            "disclosure_badge": AI_DISCLOSURE_BADGE, "generation_engine": "curated",
            "goal_citations": goals, "skill_mappings": [build_skill_mapping(s, s in current) for s in skills],
            "un_framework_targets": [{"code": f"Target {g['target']}", "title": g["title"], "alignment": g["description"]} for g in goals]}


def generate_live_or_fallback_sdg_mapping(role_id, skills):
    role = get_role(role_id) or ROLES[0]
    return {**enrich_impact_data(role["id"], skills, {resolve_skill_id(s) for s in skills}),
            "role": role["title"], "role_id": role["id"], "activity": role["activity"]}


# Curated links to official goal overviews for all 17 goals, not news articles or a live market feed.
READING_TOPICS = [
    (1, "Work that lifts people up", "Explore the UN goal on ending poverty and how fair opportunities change lives.", [], ["product"]),
    (2, "Feeding a growing world", "Read about food security, nutrition and sustainable agriculture.", ["environmental-data"], ["iot", "gis"]),
    (3, "Health and well-being for all", "Explore the goal on healthy lives and well-being at every age.", ["ux-researcher"], ["user-research"]),
    (4, "Skills that open doors", "Explore the UN goal on education, access to learning and skills for work.", ["data-analyst", "ai-evaluator"], ["python", "communication"]),
    (5, "Equal chances to lead", "Understand the goal on gender equality and empowering women and girls.", [], ["teamwork", "communication"]),
    (6, "Clean water, measured well", "Explore water quality, sanitation and how data supports water management.", ["environmental-data"], ["gis", "data-analysis"]),
    (7, "Energy that lasts", "Read about affordable, reliable and clean energy for everyone.", ["energy-data-analyst"], ["energy", "iot"]),
    (8, "Good work, better ways of working", "Read about decent work and the role of innovation in productivity.", ["data-analyst", "smart-manufacturing"], ["data-analysis", "excel", "python"]),
    (9, "Ideas into stronger systems", "Explore industry, infrastructure, research and technological capabilities.", ["smart-manufacturing", "cloud-support"], ["sql", "iot", "machine-learning"]),
    (10, "Designing for everyone", "Understand the goal on reducing inequality and including everyone.", ["ux-researcher"], ["user-research", "design"]),
    (11, "Cities that work for people", "Explore sustainable, safe and resilient cities and communities.", [], ["gis", "iot"]),
    (12, "Make resources go further", "Understand the goal on responsible consumption and resource use.", ["esg-associate", "smart-manufacturing"], ["quality", "sustainability", "reporting"]),
    (13, "Climate action starts with understanding", "Explore climate awareness and capacity building, then consider how your skills could help.", ["esg-associate", "energy-data-analyst"], ["carbon", "energy", "sustainability"]),
    (14, "Life below water", "Read about protecting oceans, seas and marine resources.", ["environmental-data"], ["gis"]),
    (15, "Protecting life on land", "Explore forests, biodiversity and how land is monitored and restored.", ["environmental-data", "sustainability-analyst"], ["gis", "sustainability"]),
    (16, "Trust in strong institutions", "Understand peace, justice, accountable institutions and secure systems.", ["cybersecurity-analyst"], ["cybersecurity", "networking"]),
    (17, "Better together", "Explore partnerships, shared data and collaboration for the goals.", [], ["teamwork", "communication"]),
]


def get_news_for_context(role_id=None, skills=None):
    current = {resolve_skill_id(s) for s in (skills or [])}
    role = get_role(role_id)
    items = []
    for n, title, summary, roles, skill_ids in READING_TOPICS:
        recommended = bool(role_id in roles or current.intersection(skill_ids) or role and n in role["sdgs"])
        items.append({"id": n, "title": title, "summary": summary, "source_name": "United Nations",
                      "source_url": f"https://sdgs.un.org/goals/goal{n}", "publication_date": None,
                      "source_kind": f"SDG {n} · {sdg_title(n)}", "sdg_tags": [f"SDG {n}"],
                      "skill_tags": [label(s) for s in skill_ids], "is_recommended": recommended,
                      "recommendation_reason": "Connected to your selected direction or skills" if recommended else "Explore another perspective"})
    return {"items": sorted(items, key=lambda item: not item["is_recommended"]), "disclosure_badge": "Curated reading · official sources · no live news feed"}


def compute_unlocked_titles(xp):
    return [tier["title"] for tier in TITLE_TIERS if xp >= tier["min_xp"]]


def default_contributions_for_persona(profile_name, role_id):
    professional = role_id == "smart-manufacturing"
    return [{"id": "demo-project-1", "project_title": "Production quality notebook" if professional else "Campus energy dashboard",
             "description": "Organized fictional quality observations and explored recurring issues." if professional else "Explored synthetic energy readings and presented the patterns in a Python dashboard.",
             "linked_skill": "Excel" if professional else "Python", "sdg_goal": "SDG 9" if professional else "SDG 8",
             "un_target": "Target 9.5" if professional else "Target 8.2", "evidence_url": "", "xp_awarded": 150,
             "verified_status": "Fictional example", "created_at": "2026-10-01"}]


INITIAL_FORUM_POSTS = [
    {"id": "demo-post-1", "author_name": "Aisha Rahman", "author_role": "Data Analyst", "author_sdg_title": "Purposeful Builder", "author_avatar": "AR",
     "content": "I used synthetic campus energy readings to practise Python and explain patterns in a dashboard. Next, I want to learn how to document the limits of my analysis.",
     "sdg_badge": "SDG 8 · Innovation", "skill_tag": "Python", "likes_count": 12, "liked": False, "is_owner": False,
     "comments": [{"id": "demo-comment-1", "author": "Daniel Lim", "text": "Clear documentation is a great next step. What did you learn about the data?", "timestamp": "Fictional example"}], "created_at_label": "Fictional example"},
    {"id": "demo-post-2", "author_name": "Daniel Lim", "author_role": "Smart Manufacturing Analyst", "author_sdg_title": "SDG Explorer", "author_avatar": "DL",
     "content": "I am exploring how quality-control experience connects to resource efficiency. My next project is a small notebook that makes recurring observations easier to compare.",
     "sdg_badge": "SDG 9 · Industry", "skill_tag": "Quality control", "likes_count": 8, "liked": False, "is_owner": False, "comments": [], "created_at_label": "Fictional example"},
    {"id": "demo-post-3", "author_name": "Nurul Izzah", "author_role": "ESG Reporting Associate", "author_sdg_title": "Purposeful Builder", "author_avatar": "NI",
     "content": "Practising spreadsheet reporting helped me understand why recording assumptions matters. I am keeping a project journal alongside my learning pathway.",
     "sdg_badge": "SDG 13 · Learning", "skill_tag": "Excel", "likes_count": 6, "liked": False, "is_owner": False, "comments": [], "created_at_label": "Fictional example"},
]


def build_tracker_snapshot(profile_dict, cv_dict, plans_list, role_id, custom_state=None, *, demo=False):
    custom = custom_state or {}
    contributions = custom.get("contributions", default_contributions_for_persona(profile_dict.get("name", ""), role_id) if demo else [])
    steps = {step["id"] for plan in (plans_list or []) for step in plan.get("steps", [])}
    completed_ids = {step for plan in (plans_list or []) for step in plan.get("completed_steps", [])}
    completed = len(completed_ids & steps)
    total = len(steps)
    skills = {resolve_skill_id(skill) for skill in cv_dict.get("skills", []) if skill.strip()}
    xp = sum(int(c.get("xp_awarded", 150)) for c in contributions) + completed * 60 + len(skills) * 20
    titles = compute_unlocked_titles(xp)
    title = custom.get("earned_sdg_title")
    if title not in titles:
        title = titles[-1]
    next_tier = next((tier for tier in TITLE_TIERS if tier["min_xp"] > xp), None)
    return {"xp_points": xp, "progress_percent": round(completed / total * 100) if total else 0,
            "completed_steps": completed, "total_steps": total, "earned_sdg_title": title,
            "unlocked_titles": titles, "title_tiers": deepcopy(TITLE_TIERS), "next_tier": next_tier,
            "contributions": deepcopy(contributions), "sdg_xp": sdg_xp_breakdown(contributions), "reskill_done": False,
            "last_cv_sync_at": custom.get("last_cv_sync_at"), "last_cv_payload": None,
            "disclosure_badge": "Self-reported practice · SDG XP is assessed from your project description · XP and titles are in-app milestones, not qualifications"}


def sdg_xp_breakdown(contributions):
    """Total XP per SDG across all logged projects (older entries count fully toward their single goal)."""
    totals = {}
    for item in contributions:
        allocations = item.get("sdg_allocations")
        if not allocations:
            digits = "".join(ch for ch in str(item.get("sdg_goal", "")).split(",")[0] if ch.isdigit())
            allocations = [{"sdg": int(digits), "xp": item.get("xp_awarded", 150)}] if digits and int(digits) in ALL_SDGS else []
        for allocation in allocations:
            totals[allocation["sdg"]] = totals.get(allocation["sdg"], 0) + int(allocation["xp"])
    return [{"number": n, "title": sdg_title(n), "color": sdg_color(n), "xp": xp}
            for n, xp in sorted(totals.items(), key=lambda pair: (-pair[1], pair[0]))]


def allocate_project_xp(title, description, skill, assessment=None):
    """Turn an AI assessment (or a keyword fallback) into per-SDG XP for one project.

    Project budget: 100 (small), 150 (moderate) or 200 (substantial) XP, split by weight.
    """
    if assessment and assessment.get("allocations"):
        budget = {1: 100, 2: 150, 3: 200}.get(int(assessment.get("level", 2)), 150)
        picks = [a for a in assessment["allocations"] if int(a["sdg"]) in ALL_SDGS][:3]
        engine = "ai"
    else:
        budget, picks, engine = 150, keyword_assessment(title, description, skill), "keywords"
    total_weight = sum(max(1, int(p["weight"])) for p in picks) or 1
    allocations = []
    for p in picks:
        n = int(p["sdg"])
        xp = int(round(budget * max(1, int(p["weight"])) / total_weight / 5) * 5)
        allocations.append({"sdg": n, "title": sdg_title(n), "target": p.get("target") or ALL_SDGS[n][1],
                            "xp": xp, "reason": str(p.get("reason", ""))[:300]})
    if allocations:  # rounding remainder goes to the strongest goal
        allocations[0]["xp"] += budget - sum(a["xp"] for a in allocations)
    return {"xp_awarded": budget, "sdg_allocations": allocations, "assessed_by": engine,
            "sdg_goal": ", ".join(f"SDG {a['sdg']}" for a in allocations),
            "un_target": ", ".join(f"Target {a['target']}" for a in allocations)}


def keyword_assessment(title, description, skill):
    text = f" {title} {description} {skill} ".lower()
    def hits(word):  # whole word for short terms ("ai"), prefix match otherwise ("recycl" -> recycling)
        pattern = rf"\b{re.escape(word)}\b" if len(word) <= 3 else rf"\b{re.escape(word)}"
        return len(re.findall(pattern, text))
    scores = {n: sum(hits(word) for word in values[5]) for n, values in ALL_SDGS.items()}
    mapped = SKILL_SDG_FALLBACK.get(resolve_skill_id(skill or ""))
    if mapped:
        scores[mapped["sdg_number"]] = scores.get(mapped["sdg_number"], 0) + 1
    ranked = [(n, score) for n, score in sorted(scores.items(), key=lambda pair: (-pair[1], pair[0])) if score > 0][:3]
    if not ranked:
        ranked = [(4, 1)]
    return [{"sdg": n, "weight": score, "reason": "Matched keywords in your project description." if n != 4 or score > 1 else "Practising skills supports learning for work."}
            for n, score in ranked]
