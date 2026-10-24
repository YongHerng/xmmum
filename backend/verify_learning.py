"""Inspect learning storage or verify RLS using a rolled-back transaction.

Loads the repository's ignored .env and never prints connection strings.
"""
import argparse
import asyncio
import sys
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.db import async_url

TABLES = ('hosted_courses', 'course_enrollments', 'course_attempts')


async def inspect(verify=False):
    if not settings.database_url:
        raise RuntimeError('DATABASE_URL is not configured.')
    url = make_url(async_url(settings.database_url))
    if url.host and 'pooler.supabase.com' in url.host:
        url = url.set(port=5432)
    engine = create_async_engine(url, connect_args={
        'ssl': 'require', 'statement_cache_size': 0,
        'prepared_statement_cache_size': 0, 'timeout': 15,
    })
    try:
        async with engine.connect() as conn:
            transaction = await conn.begin()
            try:
                revision = await conn.execute(text("SELECT version_num FROM alembic_version"))
                print('Database revisions:', ', '.join(revision.scalars()))
                names = set((await conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))).scalars())
                core = {'user_profiles', 'questionnaire_submissions', 'cv_profiles', 'cv_evaluations', 'user_skills', 'career_matches', 'learning_plans', 'consent_events'}
                sdg = {'sdg_contributions', 'sdg_tracker_state', 'community_posts', 'community_comments', 'community_reports', 'community_likes'}
                print('Core tables:', len(core & names), '/ 8')
                print('SDG/community tables:', len(sdg & names), '/ 6')
                for table in TABLES:
                    if table not in names:
                        print(table + ': absent')
                    else:
                        count = (await conn.execute(text(f'SELECT count(*) FROM public.{table}'))).scalar()
                        print(table + ':', count, 'rows')
                if verify:
                    assert set(TABLES) <= names, 'Apply migration 003 before verifying.'
                    rows = (await conn.execute(text("SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='public' AND relname IN ('hosted_courses','course_enrollments','course_attempts')"))).all()
                    assert len(rows) == 3 and all(row.relrowsecurity for row in rows)
                    owner, other, record = str(uuid4()), str(uuid4()), str(uuid4())
                    await conn.execute(text("INSERT INTO public.hosted_courses (id,user_id,payload) VALUES (:id,:owner,'{}'::jsonb)"), {'id':record,'owner':owner})
                    await conn.execute(text('SET LOCAL ROLE authenticated'))
                    for table in TABLES:
                        permissions = (await conn.execute(text("SELECT has_table_privilege(current_user,:table,'SELECT'), has_table_privilege(current_user,:table,'INSERT'), has_table_privilege(current_user,:table,'UPDATE'), has_table_privilege(current_user,:table,'DELETE')"), {'table':'public.'+table})).one()
                        assert tuple(permissions) == (True, False, False, False)
                    await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {'user':owner})
                    assert (await conn.execute(text('SELECT count(*) FROM public.hosted_courses WHERE id=:id'), {'id':record})).scalar() == 1
                    await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {'user':other})
                    assert (await conn.execute(text('SELECT count(*) FROM public.hosted_courses WHERE id=:id'), {'id':record})).scalar() == 0
                    print('PASS: learning RLS, owner isolation, client writes denied.')
            finally:
                await transaction.rollback()
                if verify:
                    print('Verification rolled back; no test records retained.')
    finally:
        await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    try:
        asyncio.run(inspect(args.verify))
    except Exception as exc:
        print('Learning database check failed:', type(exc).__name__)
        sys.exit(1)
