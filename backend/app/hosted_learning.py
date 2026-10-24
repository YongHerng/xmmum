"""Native learning API: authenticated Supabase persistence + isolated demo practice.

No writes to CV, SDG or existing pathway records. Award snapshots supply matching
evidence. Courses are authored data, never bundled application samples.
"""
from copy import deepcopy
from datetime import datetime, timezone
from math import ceil
from random import SystemRandom
from threading import RLock
from time import monotonic
from uuid import uuid4
from urllib.parse import urlsplit
import json
import secrets
import base64
import binascii
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, or_
from .config import settings
from .db import HostedCourse, CourseEnrollment, CourseAttempt, get_db
from .security import current_user
from .learning_questions import author_values, normalize_response, answer_is_correct, display_answer, key_for, QUESTION_TYPES
from . import learning_media
from .catalog import SKILLS
from .skill_evidence import assessed_skills, LEVEL_CREDIT

router = APIRouter(prefix='/api/v1/learning', tags=['Hosted learning'])
router.include_router(learning_media.router)
PRACTICE = {}
LOCK = RLock()


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


def envelope(request, data):
    return JSONResponse({'data': data, 'meta': {'request_id': getattr(request.state, 'request_id', ''), 'analysis_mode': 'assessment', 'is_synthetic': bool(request.headers.get('X-Learning-Session'))}}, headers={'Cache-Control':'private, no-store', 'Vary':'Authorization, X-Learning-Session'})


class Entry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=120)
    provider: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1200)
    category: str = Field(default='Networking', max_length=50)
    provider_logo: str = Field(default='', max_length=350000)
    assessed_skills: list[dict] = Field(default_factory=list, max_length=12)

    @field_validator('assessed_skills')
    @classmethod
    def valid_assessed_skills(cls, value):
        return assessed_skills(value)

    @field_validator('provider_logo')
    @classmethod
    def safe_provider_logo(cls, value):
        value = value.strip()
        if not value:
            return ''
        if value.startswith('data:'):
            prefix, separator, encoded = value.partition(',')
            mime = prefix.removeprefix('data:').removesuffix(';base64')
            if not separator or prefix != f'data:{mime};base64' or mime not in ('image/png', 'image/jpeg', 'image/webp'):
                raise ValueError('Upload a PNG, JPG or WEBP logo. SVG and other data formats are not supported.')
            try:
                image = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                raise ValueError('The logo image is not valid base64.') from None
            signatures = {
                'image/png': image.startswith(b'\x89PNG\r\n\x1a\n'),
                'image/jpeg': image.startswith(b'\xff\xd8\xff'),
                'image/webp': image.startswith(b'RIFF') and image[8:12] == b'WEBP',
            }
            if not 12 <= len(image) <= 256 * 1024 or not signatures[mime]:
                raise ValueError('Use a valid PNG, JPG or WEBP image no larger than 256 KB.')
            return value
        parsed = urlsplit(value)
        if len(value) > 2000 or parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Use an HTTPS image URL without embedded credentials, or upload a logo.')
        return value


class ChapterEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default='', max_length=20000)
    skill: str = Field(default='', max_length=100)
    minutes: int = Field(default=10, ge=1, le=600)
    video_url: str = Field(default='', max_length=2000)

    @field_validator('title')
    @classmethod
    def named_chapter(cls, value):
        if not value.strip():
            raise ValueError('Enter a chapter name.')
        return value.strip()

    @field_validator('video_url')
    @classmethod
    def authorized_video(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or not parsed.path.lower().endswith(('.mp4', '.webm', '.ogg')):
                raise ValueError('Use an authorized, direct HTTPS .mp4, .webm or .ogg URL.')
        return value


class SubsectionEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default='', max_length=20000)
    video_url: str = Field(default='', max_length=2000)

    @field_validator('title')
    @classmethod
    def named_subsection(cls, value):
        if not value.strip():
            raise ValueError('Enter a subsection name.')
        return value.strip()

    @field_validator('video_url')
    @classmethod
    def authorized_video(cls, value):
        return ChapterEntry.authorized_video(value)


class ResumeEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    seconds: float = Field(ge=0, le=86400, allow_inf_nan=False)
    material_id: str = Field(default='', max_length=32)
    subsection_id: str = Field(default='', max_length=36)


class QuestionsEntry(BaseModel):
    model_config = ConfigDict(extra='forbid')
    questions: list[dict] = Field(min_length=1, max_length=20)


class Submission(BaseModel):
    model_config = ConfigDict(extra='forbid')
    answers: dict = Field(max_length=200)


class Actor:
    def __init__(self, user, db=None, practice=None, access_token=''):
        self.user, self.db, self.practice = user, db, practice
        self.access_token = access_token

    def media_store(self):
        if self.practice is not None:
            raise HTTPException(403, 'Sign in and use your personal workspace for PDF/video uploads and private course files. Guest practice supports text lessons and quizzes.')
        return learning_media.storage.for_user(self.access_token)

    async def courses(self):
        if self.practice is not None:
            courses = list(self.practice['courses'].values())
            return deepcopy([course for course in courses if not course.get('deleted_at')])
        rows = list(await self.db.scalars(select(HostedCourse).where(or_(HostedCourse.user_id == self.user, HostedCourse.payload['published'].as_boolean() == True))))
        courses = [dict(row.payload, id=row.id, owned=row.user_id == self.user) for row in rows if row.user_id == self.user or row.payload.get('published')]
        return deepcopy([course for course in courses if not course.get('deleted_at')])

    async def course(self, course_id, owner=False):
        course = next((c for c in await self.courses() if c['id'] == course_id), None)
        if not course or owner and (course.get('sample') or not course.get('owned')):
            raise HTTPException(404, 'Course not found.')
        return course

    async def save_course(self, course):
        if self.practice is not None:
            self.practice['courses'][course['id']] = deepcopy(course)
        else:
            row = await self.db.scalar(select(HostedCourse).where(HostedCourse.id == course['id'], HostedCourse.user_id == self.user))
            if row:
                row.payload = deepcopy(course)
            else:
                self.db.add(HostedCourse(id=course['id'], user_id=self.user, payload=deepcopy(course)))
            await self.db.flush()

    async def enrollments(self):
        if self.practice is not None:
            return deepcopy(list(self.practice['enrollments'].values()))
        rows = await self.db.scalars(select(CourseEnrollment).where(CourseEnrollment.user_id == self.user))
        return [deepcopy(row.payload) for row in rows]

    async def enrollment(self, course_id, lock=False):
        if self.practice is not None:
            return deepcopy(self.practice['enrollments'].get(course_id))
        query = select(CourseEnrollment).where(CourseEnrollment.user_id == self.user, CourseEnrollment.course_id == course_id)
        row = await self.db.scalar(query.with_for_update() if lock else query)
        return deepcopy(row.payload) if row else None

    async def save_enrollment(self, enrollment):
        if self.practice is not None:
            self.practice['enrollments'][enrollment['course_id']] = deepcopy(enrollment)
        else:
            row = await self.db.scalar(select(CourseEnrollment).where(CourseEnrollment.user_id == self.user, CourseEnrollment.course_id == enrollment['course_id']))
            if row:
                row.payload = deepcopy(enrollment)
            else:
                self.db.add(CourseEnrollment(user_id=self.user, course_id=enrollment['course_id'], payload=deepcopy(enrollment)))
            await self.db.flush()

    async def save_attempt(self, attempt):
        if self.practice is not None:
            self.practice['attempts'][attempt['id']] = deepcopy(attempt)
        else:
            self.db.add(CourseAttempt(id=attempt['id'], user_id=self.user, payload=deepcopy(attempt)))
            await self.db.flush()

    async def attempt(self, attempt_id):
        if self.practice is not None:
            value = self.practice['attempts'].get(attempt_id)
        else:
            row = await self.db.scalar(select(CourseAttempt).where(CourseAttempt.id == attempt_id, CourseAttempt.user_id == self.user))
            value = row.payload if row else None
        if not value:
            raise HTTPException(404, 'Attempt not found.')
        return deepcopy(value)


async def authenticated_actor(request: Request, user=Depends(current_user), db=Depends(get_db)):
    # current_user validates this bearer token before it is forwarded to Storage.
    return Actor(user, db, access_token=request.headers.get('Authorization', '').partition(' ')[2])


def practice_actor(x_learning_session: str = Header(default='')):
    with LOCK:
        session = PRACTICE.get(x_learning_session)
        if not settings.demo_mode or not session or monotonic() - session['created'] > 43200:
            raise HTTPException(410, 'This practice session expired. Start a new practice session.', headers={'Cache-Control':'private, no-store'})
        return Actor('practice', practice=session)


@router.post('/sandbox/sessions')
def start_practice(request: Request):
    if not settings.demo_mode:
        raise HTTPException(404, 'Learning practice is disabled.')
    with LOCK:
        for token in list(PRACTICE):
            if monotonic() - PRACTICE[token]['created'] > 43200:
                PRACTICE.pop(token)
        if len(PRACTICE) >= 256:
            raise HTTPException(429, 'Practice capacity reached. Try again later.')
        token = secrets.token_urlsafe(32)
        PRACTICE[token] = {'created': monotonic(), 'courses': {}, 'enrollments': {}, 'attempts': {}}
    return envelope(request, {'token': token})


def public_question(question):
    result = {key: deepcopy(question[key]) for key in ('id', 'prompt', 'options', 'question_type')}
    if question['question_type'] == 'matching':
        order = list(range(len(question['options']['right'])))
        SystemRandom().shuffle(order)
        result['matching_choices'] = [{'value': i, 'label': question['options']['right'][i]} for i in order]
    return result


def decorate(course, enrollment=None, author=False):
    result = deepcopy(course)
    result['enrollment'] = enrollment
    result['minutes'] = sum(chapter['minutes'] for chapter in course['chapters'])
    result['chapter_count'] = len(course['chapters'])
    result['final_question_count'] = sum(not q.get('deleted_at') for q in course['final_questions'])
    result['final_unlocked'] = bool(enrollment) and bool(course['chapters']) and all(chapter['id'] in enrollment['chapter_passes'] for chapter in course['chapters'])
    result['complete'] = bool(enrollment and enrollment.get('completion'))
    result['percent'] = round(100 * (len(enrollment['chapter_passes']) + int(result['complete'])) / (len(course['chapters']) + 1)) if enrollment else 0
    milestones = []
    for number, chapter in enumerate(course['chapters'], start=1):
        if enrollment and chapter['id'] in enrollment['chapter_passes']:
            milestones.append(dict(enrollment['chapter_passes'][chapter['id']], chapter_id=chapter['id'], number=number, title=chapter['title']))
    result['milestones'] = sorted(milestones, key=lambda event: (event['completed_at'], event['order']))
    for chapter in result['chapters']:
        chapter['subsections'] = chapter.get('subsections', []) if author else [s for s in chapter.get('subsections', []) if not s.get('removed_at')]
        chapter['materials'] = chapter.get('materials', []) if author else [m for m in chapter.get('materials', []) if visible_material(chapter, m)]
        chapter['question_count'] = sum(not q.get('deleted_at') for q in chapter['questions'])
        chapter['questions'] = chapter['questions'] if author else [public_question(q) for q in chapter['questions'] if not q.get('deleted_at')]
    result['final_questions'] = result['final_questions'] if author else [public_question(q) for q in course['final_questions']] if result['final_unlocked'] else []
    return result


def editable(course):
    if course['published']:
        raise HTTPException(409, 'Published courses are read-only to preserve learner records.')


def bank(course, target):
    if target == 'final':
        return course['final_questions']
    chapter = next((c for c in course['chapters'] if c['id'] == target), None)
    if not chapter:
        raise HTTPException(404, 'Chapter not found in this course.')
    return chapter['questions']


def learning_chapter(course, chapter_id):
    chapter = next((chapter for chapter in course['chapters'] if chapter['id'] == chapter_id), None)
    if not chapter:
        raise HTTPException(404, 'Chapter not found in this course.')
    return chapter


def has_learning_content(chapter):
    sections = [s for s in chapter.get('subsections', []) if not s.get('removed_at')]
    materials = [m for m in chapter.get('materials', []) if visible_material(chapter, m)]
    if any(not (s.get('body', '').strip() or s.get('video_url') or any(m.get('subsection_id') == s['id'] for m in materials)) for s in sections):
        return False
    return bool(sections or chapter.get('body', '').strip() or chapter.get('video_url') or materials)


def learning_subsection(chapter, subsection_id, removed=False):
    subsection = next((s for s in chapter.get('subsections', []) if s['id'] == subsection_id and (removed or not s.get('removed_at'))), None)
    if not subsection:
        raise HTTPException(404, 'Subsection not found in this chapter.')
    return subsection


def visible_material(chapter, material):
    return not material.get('removed_at') and (not material.get('subsection_id') or any(s['id'] == material['subsection_id'] and not s.get('removed_at') for s in chapter.get('subsections', [])))


def review(attempt):
    result = {key: deepcopy(value) for key, value in attempt.items() if key not in ('questions', 'answers')}
    result['details'] = [dict(id=q['id'], prompt=q['prompt'], question_type=q['question_type'], correct=answer_is_correct(q, attempt['answers'][q['id']]), selected=display_answer(q, attempt['answers'][q['id']]), expected=display_answer(q, key_for(q), correct=True), explanation=q['explanation']) for q in attempt['questions']]
    return result


def register_routes(prefix, dependency):
    api = APIRouter(prefix=prefix)

    @api.get('/skills')
    async def skill_options(request: Request, actor=Depends(dependency)):
        return envelope(request, dict(skills=[dict(id=key, name=value[0]) for key, value in SKILLS.items()],
                                      levels=[dict(id=key, credit=value) for key, value in LEVEL_CREDIT.items()]))

    @api.get('/courses')
    async def courses(request: Request, actor=Depends(dependency)):
        enrollments = {e['course_id']: e for e in await actor.enrollments()}
        return envelope(request, [decorate(c, enrollments.get(c['id'])) for c in await actor.courses()])

    @api.get('/courses/{course_id}')
    async def course(request: Request, course_id: str, actor=Depends(dependency)):
        return envelope(request, decorate(await actor.course(course_id), await actor.enrollment(course_id)))

    @api.post('/courses/{course_id}/enroll')
    async def enroll(request: Request, course_id: str, actor=Depends(dependency)):
        course = await actor.course(course_id)
        if not course['published'] or not course['chapters']:
            raise HTTPException(409, 'This course is not available for enrollment.')
        enrollment = await actor.enrollment(course_id)
        if not enrollment:
            enrollment = {'course_id': course_id, 'enrolled_at': timestamp(), 'chapter_passes': {}, 'assessments': {}, 'completion': None}
            await actor.save_enrollment(enrollment)
        return envelope(request, decorate(course, enrollment))

    @api.post('/courses/{course_id}/assessments/{target}/submit')
    async def submit(request: Request, course_id: str, target: str, body: Submission, actor=Depends(dependency)):
        course = await actor.course(course_id)
        enrollment = await actor.enrollment(course_id, lock=True)
        if not course['published'] or not enrollment:
            raise HTTPException(403, 'Enroll in this course before taking a quiz.')
        if target == 'final' and not decorate(course, enrollment)['final_unlocked']:
            raise HTTPException(403, 'Pass every chapter quiz to unlock the final test.')
        questions = [q for q in bank(course, target) if not q.get('deleted_at')]
        if not questions:
            raise HTTPException(409, 'This assessment has no questions.')
        try:
            answers = {q['id']: normalize_response(q, body.answers.get(q['id'])) for q in questions}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        correct = sum(answer_is_correct(q, answers[q['id']]) for q in questions)
        threshold = course['final_pass_percent'] if target == 'final' else course['pass_percent']
        passed = correct >= ceil(len(questions) * threshold / 100)
        attempt = dict(id=str(uuid4()), course_id=course_id, target=target, created_at=timestamp(), questions=questions, answers=answers, correct_count=correct, total_count=len(questions), score=round(100 * correct / len(questions)), passed=passed)
        await actor.save_attempt(attempt)
        previous = enrollment['assessments'].get(target, {})
        enrollment['assessments'][target] = dict(count=previous.get('count', 0) + 1, best_score=max(attempt['score'], previous.get('best_score', 0)), latest_id=attempt['id'])
        if passed and target != 'final' and target not in enrollment['chapter_passes']:
            enrollment['chapter_passes'][target] = dict(attempt_id=attempt['id'], completed_at=attempt['created_at'], order=len(enrollment['chapter_passes']))
        if passed and target == 'final' and not enrollment['completion']:
            enrollment['completion'] = dict(
                completed_at=attempt['created_at'], attempt_id=attempt['id'],
                badge_code='FP-' + secrets.token_hex(6).upper(), score=attempt['score'],
                badge_title=course['title'], badge_provider=course['provider'],
                badge_provider_logo=course.get('provider_logo', ''),
                badge_sample=bool(course.get('sample')),
                badge_practice=actor.practice is not None,
                badge_skills=deepcopy(course.get('assessed_skills', [])),
                badge_course_revision=course.get('revision', 1),
            )
        await actor.save_enrollment(enrollment)
        return envelope(request, review(attempt))

    @api.post('/courses/{course_id}/chapters/{chapter_id}/resume')
    async def resume(request: Request, course_id: str, chapter_id: str, body: ResumeEntry, actor=Depends(dependency)):
        course = await actor.course(course_id)
        enrollment = await actor.enrollment(course_id, lock=True)
        chapter = next((chapter for chapter in course['chapters'] if chapter['id'] == chapter_id), None)
        material = next((m for m in chapter.get('materials', []) if m['id'] == body.material_id and m['kind'] == 'video' and not m.get('removed_at')), None) if chapter and body.material_id else None
        subsection = learning_subsection(chapter, body.subsection_id) if chapter and body.subsection_id else None
        if not enrollment or not chapter or (not material or not visible_material(chapter, material) if body.material_id else not (subsection or chapter).get('video_url')):
            raise HTTPException(403, 'Enroll in a chapter with a video before saving playback.')
        resume_key = f'{chapter_id}:{body.material_id}' if body.material_id else f'{chapter_id}:subsection:{body.subsection_id}' if subsection else chapter_id
        enrollment.setdefault('resume', {})[resume_key] = body.seconds
        await actor.save_enrollment(enrollment)
        return envelope(request, {'saved': True})

    @api.get('/attempts/{attempt_id}')
    async def attempt(request: Request, attempt_id: str, actor=Depends(dependency)):
        return envelope(request, review(await actor.attempt(attempt_id)))

    @api.get('/courses/{course_id}/chapters/{chapter_id}/materials')
    async def learner_materials(request: Request, course_id: str, chapter_id: str, actor=Depends(dependency)):
        course = await actor.course(course_id)
        if not course['published'] or not await actor.enrollment(course_id):
            raise HTTPException(403, 'Enroll in this course before opening its learning files.')
        chapter = learning_chapter(course, chapter_id)
        store = actor.media_store()
        return envelope(request, [await store.signed_link(material) for material in chapter.get('materials', []) if visible_material(chapter, material)])

    @api.get('/studio/courses/{course_id}/chapters/{chapter_id}/materials')
    async def author_materials(request: Request, course_id: str, chapter_id: str, actor=Depends(dependency)):
        chapter = learning_chapter(await actor.course(course_id, owner=True), chapter_id)
        store = actor.media_store()
        return envelope(request, [await store.signed_link(material) for material in chapter.get('materials', []) if not material.get('removed_at')])

    @api.post('/studio/courses/{course_id}/chapters/{chapter_id}/materials')
    async def upload_material(request: Request, course_id: str, chapter_id: str, filename: str, subsection_id: str = '', actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        chapter = learning_chapter(course, chapter_id)
        if subsection_id:
            learning_subsection(chapter, subsection_id)
        materials = chapter.setdefault('materials', [])
        if len(materials) >= learning_media.MAX_CHAPTER_FILES:
            raise HTTPException(409, 'A chapter can store up to 20 files, including recoverable removed files.')
        total = sum(material.get('size', 0) for ch in course['chapters'] for material in ch.get('materials', []))
        store = actor.media_store()
        material = await learning_media.store_upload(request, filename, learning_media.MAX_COURSE_BYTES - total,
                                                    course_id=course_id, chapter_id=chapter_id,
                                                    store=store)
        if subsection_id:
            material['subsection_id'] = subsection_id
        materials.append(dict(material, created_at=timestamp()))
        try:
            await actor.save_course(course)
        except Exception:
            try:
                await learning_media.discard_upload(material, store)
            except Exception:
                logging.getLogger(__name__).warning('Cloud lesson upload rollback failed for material %s', material['id'])
            raise
        return envelope(request, material)

    @api.post('/studio/courses/{course_id}/chapters/{chapter_id}/materials/{material_id}/{action}')
    async def remove_restore_material(request: Request, course_id: str, chapter_id: str, material_id: str, action: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        chapter = learning_chapter(course, chapter_id)
        material = next((material for material in chapter.get('materials', []) if material['id'] == material_id), None)
        if not material or action not in ('remove', 'restore'):
            raise HTTPException(404, 'Learning file or action not found.')
        material['removed_at'] = timestamp() if action == 'remove' else None
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.get('/badges')
    async def badges(request: Request, actor=Depends(dependency)):
        courses = {c['id']: c for c in await actor.courses()}
        badges = []
        for enrollment in await actor.enrollments():
            completion = enrollment.get('completion')
            if not completion:
                continue
            course = courses.get(enrollment['course_id'])
            title = completion.get('badge_title') or (course['title'] if course else None)
            provider = completion.get('badge_provider') or (course['provider'] if course else None)
            if not title or not provider:
                continue
            badges.append(dict(
                completed_at=completion['completed_at'], attempt_id=completion['attempt_id'],
                badge_code=completion['badge_code'], score=completion['score'],
                course_id=enrollment['course_id'], title=title, provider=provider,
                provider_logo=completion.get('badge_provider_logo', course.get('provider_logo', '') if course else ''),
                sample=bool(completion.get('badge_sample', course.get('sample') if course else False)),
                skills=[dict(mapping, name=SKILLS.get(mapping['skill_id'], (mapping['skill_id'], []))[0]) for mapping in completion.get('badge_skills', [])], course_revision=completion.get('badge_course_revision'),
                matching_eligible=bool(completion.get('badge_skills')) and not (actor.practice is not None or completion.get('badge_sample') or completion.get('badge_practice')),
            ))
        return envelope(request, badges)

    @api.post('/studio/courses')
    async def create_course(request: Request, body: Entry, actor=Depends(dependency)):
        course = dict(body.model_dump(), id=str(uuid4()), chapters=[], final_questions=[], published=False, pass_percent=100, final_pass_percent=80, owned=True, sample=False)
        if any(not course[key].strip() for key in ('title', 'provider', 'description')):
            raise HTTPException(422, 'Course title, provider and description are required.')
        await actor.save_course(course)
        return envelope(request, course)

    @api.get('/studio/courses/{course_id}')
    async def author_course(request: Request, course_id: str, actor=Depends(dependency)):
        return envelope(request, decorate(await actor.course(course_id, owner=True), author=True))

    @api.put('/studio/courses/{course_id}')
    async def edit_course(request: Request, course_id: str, body: Entry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        course.update(body.model_dump(exclude_unset=True))
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/unpublish')
    async def unpublish_course(request: Request, course_id: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        if not course['published']:
            raise HTTPException(409, 'This course is already a draft.')
        course['published'] = False
        course['unpublished_at'] = timestamp()
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.delete('/studio/courses/{course_id}')
    async def delete_course(request: Request, course_id: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        # Preserve an audit snapshot while removing the course from all author
        # and learner views. Earned badge snapshots remain in enrollments.
        course['published'] = False
        course['deleted_at'] = timestamp()
        await actor.save_course(course)
        return envelope(request, {'deleted': True, 'course_id': course_id})

    @api.post('/studio/courses/{course_id}/chapters')
    async def add_chapter(request: Request, course_id: str, body: ChapterEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        course['chapters'].append(dict(body.model_dump(), id=str(uuid4()), questions=[], materials=[], subsections=[]))
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.put('/studio/courses/{course_id}/chapters/{chapter_id}')
    async def edit_chapter(request: Request, course_id: str, chapter_id: str, body: ChapterEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        chapter = next((chapter for chapter in course['chapters'] if chapter['id'] == chapter_id), None)
        if not chapter:
            raise HTTPException(404, 'Chapter not found.')
        chapter.update(body.model_dump())
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/chapters/{chapter_id}/subsections')
    async def add_subsection(request: Request, course_id: str, chapter_id: str, body: SubsectionEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        chapter = learning_chapter(course, chapter_id)
        sections = chapter.setdefault('subsections', [])
        if len(sections) >= 50:
            raise HTTPException(409, 'A chapter can hold up to 50 subsections, including removed subsections.')
        sections.append(dict(body.model_dump(), id=str(uuid4()), removed_at=None))
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.put('/studio/courses/{course_id}/chapters/{chapter_id}/subsections/{subsection_id}')
    async def edit_subsection(request: Request, course_id: str, chapter_id: str, subsection_id: str, body: SubsectionEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        learning_subsection(learning_chapter(course, chapter_id), subsection_id).update(body.model_dump())
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/chapters/{chapter_id}/subsections/{subsection_id}/{action}')
    async def organize_subsection(request: Request, course_id: str, chapter_id: str, subsection_id: str, action: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        chapter = learning_chapter(course, chapter_id)
        subsection = learning_subsection(chapter, subsection_id, removed=action == 'restore')
        if action in ('remove', 'restore'):
            subsection['removed_at'] = timestamp() if action == 'remove' else None
        elif action in ('up', 'down'):
            sections = chapter['subsections']
            active = [s for s in sections if not s.get('removed_at')]
            current = active.index(subsection)
            target = current + (-1 if action == 'up' else 1)
            if 0 <= target < len(active):
                first, second = sections.index(subsection), sections.index(active[target])
                sections[first], sections[second] = sections[second], sections[first]
        else:
            raise HTTPException(404, 'Subsection action not found.')
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/questions/{target}')
    async def add_questions(request: Request, course_id: str, target: str, body: QuestionsEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        questions = bank(course, target)
        pending = []
        for index, entry in enumerate(body.questions, start=1):
            try:
                prompt, options, correct, explanation, kind, key = author_values(entry)
            except ValueError as exc:
                raise HTTPException(422, f'Question {index}: {exc}') from None
            pending.append(dict(id=str(uuid4()), prompt=prompt, options=json.loads(options), correct_index=correct, explanation=explanation, question_type=kind, answer_key=json.loads(key)))
        questions.extend(pending)
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.put('/studio/courses/{course_id}/questions/{target}/{question_id}')
    async def edit_question(request: Request, course_id: str, target: str, question_id: str, body: QuestionsEntry, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        questions = bank(course, target)
        question = next((q for q in questions if q['id'] == question_id), None)
        if not question or len(body.questions) != 1:
            raise HTTPException(422, 'Choose one existing question to edit.')
        try:
            prompt, options, correct, explanation, kind, key = author_values(body.questions[0])
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        question.update(prompt=prompt, options=json.loads(options), correct_index=correct, explanation=explanation, question_type=kind, answer_key=json.loads(key))
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/questions/{target}/{question_id}/{action}')
    async def delete_restore(request: Request, course_id: str, target: str, question_id: str, action: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        question = next((q for q in bank(course, target) if q['id'] == question_id), None)
        if not question or action not in ('delete', 'restore'):
            raise HTTPException(404, 'Question or action not found.')
        question['deleted_at'] = timestamp() if action == 'delete' else None
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    @api.post('/studio/courses/{course_id}/publish')
    async def publish(request: Request, course_id: str, actor=Depends(dependency)):
        course = await actor.course(course_id, owner=True)
        editable(course)
        course['final_questions'] = [q for q in course['final_questions'] if not q.get('deleted_at')]
        for chapter in course['chapters']:
            chapter['questions'] = [q for q in chapter['questions'] if not q.get('deleted_at')]
            chapter['subsections'] = [s for s in chapter.get('subsections', []) if not s.get('removed_at')]
            chapter['materials'] = [m for m in chapter.get('materials', []) if visible_material(chapter, m)]
        if not course['chapters'] or not course['final_questions'] or any(not c['questions'] for c in course['chapters']):
            raise HTTPException(422, 'Add chapters, a quiz for every chapter, and a final test before publishing.')
        if any(not has_learning_content(chapter) for chapter in course['chapters']):
            raise HTTPException(422, 'Every chapter and subsection needs text, an uploaded PDF/video, or an authorized video URL before publishing.')
        course['published'] = True
        course['revision'] = course.get('revision', 0) + 1
        course.pop('unpublished_at', None)
        await actor.save_course(course)
        return envelope(request, decorate(course, author=True))

    router.include_router(api)


register_routes('', authenticated_actor)
register_routes('/sandbox', practice_actor)

