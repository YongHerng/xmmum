import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.engine import make_url
from app.config import settings
from app.db import Base, async_url

config = context.config
target_metadata = Base.metadata
url = settings.migration_database_url or settings.database_url
if context.get_x_argument(as_dictionary=True).get("use_runtime") == "true":
    parsed = make_url(settings.database_url)
    if parsed.host and "pooler.supabase.com" in parsed.host:
        parsed = parsed.set(port=5432)
    url = parsed.render_as_string(hide_password=False)
if not url:
    raise RuntimeError("Set MIGRATION_DATABASE_URL or DATABASE_URL in the root .env.")


def run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


async def online():
    engine = create_async_engine(
        async_url(url),
        connect_args={"ssl": "require", "statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    async with engine.connect() as connection:
        await connection.run_sync(run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=url, literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(online())
