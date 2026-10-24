"""Fresh clones must serve demos before Supabase credentials are supplied."""
import os
import subprocess
import sys
from pathlib import Path


def test_backend_starts_with_no_supabase_credentials():
    script = '''
import asyncio
from httpx import ASGITransport, AsyncClient
from app.main import app

async def check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        health = await client.get("/api/v1/healthz")
        assert health.status_code == 200
        assert not health.json()["data"]["database_configured"]
        assert (await client.get("/api/v1/demo/student")).status_code == 200
        assert (await client.get("/api/v1/dashboard")).status_code == 401
        assert (await client.get("/api/v1/dashboard", headers={"Authorization":"Bearer invalid"})).status_code == 401

asyncio.run(check())
'''
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "DATABASE_URL": "", "SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": "", "DEMO_MODE": "true", "AI_ENABLED": "false"},
        capture_output=True, text=True, timeout=20, check=False,
    )
    assert result.returncode == 0, result.stderr
