"""Course-assessment evidence, separate from user-authored CV claims.

Credits are transparent prototype coverage weights, not calibrated proficiency
or employer verification. No author/admin approval gate is imposed yet.
"""
from sqlalchemy import select
from .catalog import SKILLS, label
from .db import CourseEnrollment

LEVEL_CREDIT = {'foundation': 0.5, 'intermediate': 0.75, 'advanced': 1.0}
EVIDENCE_MODEL = 'skills-and-badges-1'


def assessed_skills(values):
    """Validate controlled IDs; never infer skills from a course title/category."""
    if not isinstance(values, list) or len(values) > 12:
        raise ValueError('Choose up to 12 assessed skills.')
    result = []
    seen = set()
    for value in values:
        if not isinstance(value, dict) or set(value) != {'skill_id', 'level'}:
            raise ValueError('Each assessed skill needs a skill ID and level.')
        skill, level = value['skill_id'], value['level']
        if not isinstance(skill, str) or not isinstance(level, str) or skill not in SKILLS or level not in LEVEL_CREDIT:
            raise ValueError('Choose a listed skill and a valid assessment level.')
        if skill in seen:
            raise ValueError('Each assessed skill can be selected only once.')
        seen.add(skill)
        result.append({'skill_id': skill, 'level': level})
    return result


def badge_evidence(enrollments):
    """Read only award-time snapshots, including archived/deleted courses.

    Legacy awards without a snapshot remain completion-only. Demo practice and
    sample awards are never imported into a personal career score.
    """
    badges = []
    for enrollment in enrollments:
        completion = enrollment.get('completion') or {}
        if not completion.get('badge_code') or not completion.get('attempt_id'):
            continue
        if completion.get('badge_sample') or completion.get('badge_practice'):
            continue
        try:
            skills = assessed_skills(completion.get('badge_skills', []))
        except (ValueError, TypeError):
            continue
        if not skills:
            continue
        badges.append(dict(
            badge_code=completion['badge_code'], course_id=enrollment['course_id'],
            title=completion.get('badge_title', 'Completed course'),
            provider=completion.get('badge_provider', ''),
            completed_at=completion['completed_at'], attempt_id=completion['attempt_id'],
            course_revision=completion.get('badge_course_revision'), skills=skills,
        ))
    return sorted(badges, key=lambda badge: (badge['completed_at'], badge['badge_code']))


async def account_badge_evidence(db, user):
    rows = await db.scalars(select(CourseEnrollment).where(CourseEnrollment.user_id == user))
    return badge_evidence([row.payload for row in rows])


def skill_profile(cv_skill_ids, badges=None):
    """Use the strongest contribution once per skill, retain all provenance."""
    result = {skill: dict(id=skill, name=label(skill), credit=1.0,
                          cv_claimed=True, level=None, badges=[]) for skill in cv_skill_ids}
    for badge in badges or []:
        for mapping in badge.get('skills', []):
            skill, level = mapping['skill_id'], mapping['level']
            if skill not in SKILLS or level not in LEVEL_CREDIT:
                continue
            item = result.setdefault(skill, dict(id=skill, name=label(skill), credit=0,
                                                cv_claimed=False, level=None, badges=[]))
            if item['level'] is None or LEVEL_CREDIT[level] > LEVEL_CREDIT[item['level']]:
                item['level'] = level
            item['credit'] = max(item['credit'], LEVEL_CREDIT[level])
            if not any(source['badge_code'] == badge['badge_code'] for source in item['badges']):
                item['badges'].append({key: value for key, value in badge.items() if key != 'skills'} | {'level': level})
    return [result[skill] for skill in sorted(result)]
