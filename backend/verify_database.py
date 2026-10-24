"""Verify tables, RLS and a temporary write. The entire transaction is rolled back."""

import asyncio
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.db import async_url


async def main():
    url = make_url(async_url(settings.database_url))
    if url.host and "pooler.supabase.com" in url.host:
        url = url.set(port=5432)
    engine = create_async_engine(
        url, connect_args={"ssl": "require", "statement_cache_size": 0, "prepared_statement_cache_size": 0}
    )
    async with engine.connect() as conn:
        transaction = await conn.begin()
        try:
            tables = (
                await conn.execute(
                    text(
                        "SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='public' AND relname IN ('user_profiles','questionnaire_submissions','cv_profiles','cv_evaluations','user_skills','career_matches','learning_plans','consent_events')"
                    )
                )
            ).all()
            assert len(tables) == 8 and all(row.relrowsecurity for row in tables)
            policies = (
                await conn.execute(
                    text(
                        "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='own_records' AND tablename IN ('user_profiles','questionnaire_submissions','cv_profiles','cv_evaluations','user_skills','career_matches','learning_plans','consent_events')"
                    )
                )
            ).scalar()
            assert policies == 8
            user = str(uuid4())
            other = str(uuid4())
            record = str(uuid4())
            await conn.execute(
                text(
                    "INSERT INTO public.user_profiles (id,user_id,payload) VALUES (:id,:user,CAST(:payload AS jsonb))"
                ),
                {"id": record, "user": user, "payload": '{"name":"temporary connectivity check"}'},
            )
            await conn.execute(text("SET LOCAL ROLE authenticated"))
            await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {"user": user})
            assert (
                await conn.execute(
                    text("SELECT count(*) FROM public.user_profiles WHERE id=:id"), {"id": record}
                )
            ).scalar() == 1
            await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {"user": other})
            assert (
                await conn.execute(
                    text("SELECT count(*) FROM public.user_profiles WHERE id=:id"), {"id": record}
                )
            ).scalar() == 0
            changed = await conn.execute(
                text("UPDATE public.user_profiles SET payload='{}'::jsonb WHERE id=:id"), {"id": record}
            )
            assert changed.rowcount == 0
            print(
                "PASS: 8 tables, 8 RLS policies, temporary write/read, cross-user RLS read and update isolation."
            )
        finally:
            await transaction.rollback()
            print("Verification transaction rolled back; no test profile retained.")
    await engine.dispose()


asyncio.run(main())
