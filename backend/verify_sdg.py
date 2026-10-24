"""Check migration 002 and its RLS boundaries; all temporary writes are rolled back."""
import asyncio
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.db import async_url


async def main():
    url = make_url(async_url(settings.database_url))
    if url.host and "pooler.supabase.com" in url.host:
        url = url.set(port=5432)
    engine = create_async_engine(url, connect_args={"ssl": "require", "statement_cache_size": 0, "prepared_statement_cache_size": 0})
    try:
        async with engine.connect() as conn:
            transaction = await conn.begin()
            try:
                version = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
                assert version == "002"
                tables = (await conn.execute(text("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='public' AND relname IN ('sdg_contributions','sdg_tracker_state','community_posts','community_comments','community_likes','community_reports')"))).all()
                assert len(tables) == 6 and all(row.relrowsecurity for row in tables)
                assert not (await conn.execute(text("SELECT has_table_privilege('anon','public.community_posts','SELECT')"))).scalar()
                assert not (await conn.execute(text("SELECT has_table_privilege('authenticated','public.community_posts','INSERT')"))).scalar()
                author, other, post, contribution = (str(uuid4()) for _ in range(4))
                await conn.execute(text("INSERT INTO community_posts (id,user_id,payload) VALUES (:id,:user,'{}'::jsonb)"), {"id": post, "user": author})
                await conn.execute(text("INSERT INTO sdg_contributions (id,user_id,dedupe_key,payload) VALUES (:id,:user,:key,'{}'::jsonb)"), {"id": contribution, "user": author, "key": contribution})
                await conn.execute(text("SET LOCAL ROLE authenticated"))
                await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {"user": other})
                assert (await conn.execute(text("SELECT count(*) FROM community_posts WHERE id=:id"), {"id": post})).scalar() == 1
                assert (await conn.execute(text("SELECT count(*) FROM sdg_contributions WHERE id=:id"), {"id": contribution})).scalar() == 0
                await conn.execute(text("SELECT set_config('request.jwt.claim.sub',:user,true)"), {"user": author})
                assert (await conn.execute(text("SELECT count(*) FROM sdg_contributions WHERE id=:id"), {"id": contribution})).scalar() == 1
                denied = False
                try:
                    async with conn.begin_nested():
                        await conn.execute(text("INSERT INTO community_posts (id,user_id,payload) VALUES (:id,:user,'{}'::jsonb)"), {"id": str(uuid4()), "user": author})
                except DBAPIError:
                    denied = True
                assert denied
                print("PASS: migration 002, six RLS-enabled SDG tables, private practice logs, authenticated community reads and API-only community writes.")
            finally:
                await transaction.rollback()
                print("Temporary verification rows rolled back; no community post or project retained.")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
