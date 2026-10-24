from copy import deepcopy
from .schemas import Profile, Answers, CV
from .engine import evaluate, matches, preferences, forecast, pathways, impact, normalize_skills, personal_matches
from .catalog import ROLES, SOURCES, CATALOG_VERSION
from .skill_evidence import skill_profile
from .demo_outcomes import demo_outcomes, example_assessment
from .sdg_service import (
    INITIAL_FORUM_POSTS,
    build_tracker_snapshot,
    get_news_for_context,
)


def snapshot(
    profile,
    answers,
    cv,
    evaluation=None,
    plans=None,
    role_id=None,
    scenario="moderate",
    horizon=5,
    custom_tracker=None,
    forum_posts=None,
    demo=False,
    badge_evidence=None,
):
    has_cv = bool(cv.summary or cv.projects or cv.experience or cv.skills or cv.additional_sections)
    career_matches = personal_matches(cv, answers, scenario, badge_evidence)
    role_id = (role_id or cv.target_role) if career_matches else ""
    role_id = role_id or (career_matches[0]["id"] if career_matches else "")
    profile_dump = profile.model_dump()
    cv_dump = cv.model_dump()
    plans_list = plans or []
    return dict(
        profile=profile_dump,
        questionnaire=answers.model_dump(),
        preferences=preferences(answers),
        cv=cv_dump,
        evaluation=evaluation or (evaluate(cv) if has_cv and demo else None),
        matches=career_matches,
        skill_evidence=skill_profile(sorted(set(normalize_skills(cv.skills)) - set(cv.course_skill_ids)), badge_evidence),
        forecast=forecast(cv, role_id, scenario, horizon) if role_id else dict(scenario=scenario, horizon=horizon, skills=[], assumptions=[], label="", confidence="", limitation="Add skills to explore an outlook."),
        pathways=plans_list,
        impact=impact(role_id, cv, demo=demo, badge_evidence=badge_evidence),
        news=get_news_for_context(role_id, cv.skills)["items"],
        forum_posts=deepcopy(INITIAL_FORUM_POSTS if demo else forum_posts or []),
        tracker=build_tracker_snapshot(profile_dump, cv_dump, plans_list, role_id, custom_tracker, demo=demo),
        selected_role=role_id,
        roles=ROLES,
        sources=SOURCES,
        catalog_version=CATALOG_VERSION,
        completion=round(
            (int(bool(profile.name)) + int(answers.completed_step == 5) + int(has_cv) + int(bool(plans)))
            / 4
            * 100
        ),
    )


def demo_snapshot(persona, scenario="moderate", role_id=None, horizon=5):
    professional = persona == "professional"
    profile = Profile(
        name="Daniel Lim" if professional else "Aisha Rahman",
        category="professional" if professional else "student",
        location="Penang, Malaysia" if professional else "Kuala Lumpur, Malaysia",
        education="Diploma in Manufacturing Engineering" if professional else "BSc Computer Science · Year 3",
        goal="Move into smart manufacturing"
        if professional
        else "Use data to build a more sustainable future",
        onboarding_complete=True,
    )
    answers = Answers(
        category=profile.category,
        interests=["practical", "technology"] if professional else ["data", "sustainability"],
        work_style="practical" if professional else "analytical",
        environment="structured",
        location=profile.location,
        motivation="growth" if professional else "impact",
        weekly_hours=5 if professional else 8,
        budget=0,
        relocation=False,
        strengths=["Problem solving", "Communication"],
        career_goal=profile.goal,
        social_energy="mixed",
        decision_style="evidence",
        learning_style="practice",
        completed_step=5,
    )
    cv = CV(
        name=profile.name,
        email="daniel@example.invalid" if professional else "aisha@example.invalid",
        summary="Quality technician with 4 years of experience in equipment monitoring and process improvement."
        if professional
        else "Computer science student interested in data, responsible AI and sustainable technology.",
        education=profile.education,
        experience="Monitored 12 production stations. Documented faults and collaborated with a team of 6 to improve inspection workflows."
        if professional
        else "",
        projects="Tracked quality measurements in Excel and presented findings to supervisors."
        if professional
        else "Analyzed 2,000 synthetic energy readings in Python. Built 3 charts and presented recommendations to a student team.",
        skills=[
            "Excel",
            "Quality control",
            "IoT fundamentals",
            "Problem solving",
            "Teamwork",
            "Communication",
        ]
        if professional
        else ["Python", "Excel", "Data analysis", "Git", "Teamwork", "Communication"],
        target_role="smart-manufacturing" if professional else "data-analyst",
    )
    role_id = role_id or cv.target_role
    plans = pathways(cv, answers, role_id)
    for plan in plans:
        if plan["steps"]:
            plan["completed_steps"] = [plan["steps"][0]["id"]]
    data = snapshot(profile, answers, cv, evaluation=example_assessment(professional), plans=plans, role_id=role_id, scenario=scenario, horizon=horizon, demo=True)
    data['cv']['entries'] = [dict(section='education', title=profile.education, organisation='Fictional learning institution', dates='Illustrative profile', bullets=['Education entry shown as a structured extraction result.']), dict(section='projects', title='Quality inspection notebook' if professional else 'Campus energy notebook', organisation='Fictional project', dates='2026', bullets=[cv.projects])]
    data['cv']['additional_sections'] = [dict(title='Languages', content='English and Bahasa Malaysia - self-reported fictional example.'), dict(title='Volunteering', content='Helped a fictional peer-learning group document its project findings.')]
    data['evaluation']['skills'] = [dict(id=item['id'], name=item['name']) for item in data['skill_evidence']]
    data['demo_outcomes'] = demo_outcomes(persona, cv)
    data['cv_version'] = 1
    data['onboarding'] = dict(cv_uploaded=True, cv_confirmed=True, discover_complete=True, required_step=None)
    badge = data['demo_outcomes']['badges'][0]
    data['skill_evidence'].append(dict(id=badge['skills'][0]['skill_id'], name=badge['skills'][0]['name'], credit=0.5, cv_claimed=False, level='foundation', badges=[dict(badge_code=badge['badge_code'], course_id=badge['course_id'], title=badge['title'], provider=badge['provider'], completed_at=badge['completed_at'], level='foundation')]))
    data.update(demo=True, read_only=True, label="Fictional profile · Curated demo data")
    return data
