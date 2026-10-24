"""Verify real Supabase Storage RLS in a transaction that is always rolled back.

--preview-migration tests migration 004 without persisting its policies. No
Storage object rows or bytes are created/deleted. Temporary enrollment/course
metadata edits are visible only inside this verification transaction.
"""
import argparse
import asyncio
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from uuid import uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from app.db import engine


async def verify_connection(conn):
    bucket = (await conn.execute(text("SELECT public FROM storage.buckets WHERE id='learning-materials'"))).scalar_one()
    assert bucket is False, 'Create a private learning-materials bucket first.'
    candidate = (await conn.execute(text("""
      SELECT c.id, c.user_id, c.payload, o.name
      FROM public.hosted_courses c
      CROSS JOIN LATERAL jsonb_array_elements(c.payload->'chapters') ch
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ch->'materials','[]'::jsonb)) m
      JOIN storage.objects o ON o.bucket_id='learning-materials' AND o.name=m->>'storage_path'
      WHERE m->>'storage_provider'='supabase' LIMIT 1
    """))).mappings().one()
    course_id, owner, path = candidate['id'], candidate['user_id'], candidate['name']
    learner, outsider, enrollment_id = str(uuid4()), str(uuid4()), str(uuid4())
    chapter_id = path.split('/')[2]
    original = deepcopy(candidate['payload'])
    active = deepcopy(original)
    active['published'] = True
    active.pop('deleted_at', None)
    chapter = next(c for c in active['chapters'] if c['id'] == chapter_id)
    material = next(m for m in chapter['materials'] if m.get('storage_path') == path)
    material.pop('removed_at', None)
    for section in chapter.get('subsections', []):
        section.pop('removed_at', None)

    async def payload(value):
        await conn.execute(text('SET LOCAL ROLE NONE'))
        await conn.execute(text('UPDATE public.hosted_courses SET payload=CAST(:payload AS jsonb) WHERE id=:id'),
                           {'payload':json.dumps(value), 'id':course_id})

    async def identity(user, role='authenticated'):
        assert role in ('authenticated','anon')
        await conn.execute(text('SET LOCAL ROLE NONE'))
        await conn.execute(text(f'SET LOCAL ROLE {role}'))
        await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:sub,true)"), {'sub':user or ''})
        await conn.execute(text("SELECT set_config('request.jwt.claims',:claims,true)"),
                           {'claims':json.dumps({'sub':user,'role':role} if user else {'role':role})})

    async def visible():
        return (await conn.execute(text("SELECT count(*) FROM storage.objects WHERE bucket_id='learning-materials' AND name=:path"), {'path':path})).scalar_one()

    async def writable(test_path=path):
        return (await conn.execute(text("SELECT learning_private.can_write_material('learning-materials',:path)"), {'path':test_path})).scalar_one()

    await payload(active)
    await conn.execute(text("INSERT INTO public.course_enrollments(id,user_id,course_id,payload) VALUES (:id,:user,:course,'{}'::jsonb)"),
                       {'id':enrollment_id,'user':learner,'course':course_id})
    await identity(owner)
    assert await visible() == 1 and await writable() is False
    await identity(outsider)
    assert await visible() == 0 and await writable() is False
    assert (await conn.execute(text('SELECT count(*) FROM public.hosted_courses WHERE id=:id'), {'id':course_id})).scalar_one() == 0, 'Course answer keys leaked.'
    await identity(learner)
    assert await visible() == 1 and await writable() is False
    assert (await conn.execute(text('SELECT count(*) FROM public.hosted_courses WHERE id=:id'), {'id':course_id})).scalar_one() == 0
    await identity(None, 'anon')
    assert await visible() == 0 and await writable() is False

    removed = deepcopy(active)
    target = next(c for c in removed['chapters'] if c['id'] == chapter_id)
    next(m for m in target['materials'] if m.get('storage_path') == path)['removed_at'] = 'verification-only'
    await payload(removed)
    await identity(learner)
    assert await visible() == 0
    await identity(owner)
    assert await visible() == 1  # Recoverable author removals remain inspectable.

    if material.get('subsection_id'):
        hidden = deepcopy(active)
        target = next(c for c in hidden['chapters'] if c['id'] == chapter_id)
        next(s for s in target['subsections'] if s['id'] == material['subsection_id'])['removed_at'] = 'verification-only'
        await payload(hidden)
        await identity(learner)
        assert await visible() == 0

    draft = deepcopy(active)
    draft['published'] = False
    await payload(draft)
    await identity(learner)
    assert await visible() == 0 and await writable() is False
    await identity(owner)
    assert await visible() == 1 and await writable() is True
    assert await writable(path.replace(chapter_id, str(uuid4()))) is False
    assert await writable('../../private.pdf') is False

    deleted = deepcopy(draft)
    deleted['deleted_at'] = 'verification-only'
    await payload(deleted)
    await identity(owner)
    assert await visible() == 0 and await writable() is False
    await conn.execute(text('SET LOCAL ROLE NONE'))
    print('PASS: owner/enrolled reads, outsider/guest denial, draft-only owner writes, removed/deleted files, answer-key isolation.')


def preview_migration(sync_connection):
    source = Path(__file__).parent / 'migrations/versions/004_user_learning_storage.py'
    spec = importlib.util.spec_from_file_location('learning_storage_004', source)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with Operations.context(MigrationContext.configure(sync_connection)):
        migration.upgrade()


async def main(preview=False):
    async with engine.connect() as conn:
        transaction = await conn.begin()
        try:
            if preview:
                await conn.run_sync(preview_migration)
            await verify_connection(conn)
        finally:
            await transaction.rollback()
            print('Verification rolled back; no test records or course edits retained.')
    await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview-migration', action='store_true')
    args = parser.parse_args()
    asyncio.run(main(args.preview_migration))
