"""Read-only configuration check. Never prints credentials or connection strings."""

import asyncio
from pathlib import Path
import httpx
from dotenv import dotenv_values
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import settings
from app.db import async_url


async def main():
    frontend = dotenv_values(Path(__file__).resolve().parents[1] / "frontend" / ".env.local")
    frontend_key = (
        frontend.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "") or settings.supabase_publishable_key
    )
    print("Project URL:", settings.supabase_url)
    print("Frontend URL matches:", frontend.get("NEXT_PUBLIC_SUPABASE_URL") == settings.supabase_url)
    print("Frontend publishable key configured:", bool(frontend_key))
    print("Backend publishable key configured:", bool(settings.supabase_publishable_key))
    print(
        "Frontend/backend key matches:",
        bool(frontend_key and frontend_key == settings.supabase_publishable_key),
    )
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            response = await client.get(settings.supabase_url + "/auth/v1/.well-known/jwks.json")
            print("Public JWKS HTTP status:", response.status_code)
            print("Public signing algorithms:", [k.get("alg") for k in response.json().get("keys", [])])
        except Exception as exc:
            print("JWKS connection failed:", type(exc).__name__)
        for source, key in [("Frontend", frontend_key), ("Backend", settings.supabase_publishable_key)]:
            if not key:
                continue
            try:
                response = await client.get(
                    settings.supabase_url + "/auth/v1/settings", headers={"apikey": key}
                )
                print(source + " Auth settings HTTP status:", response.status_code)
                if response.status_code == 200:
                    print(source + " email auth enabled:", response.json().get("external", {}).get("email"))
            except Exception as exc:
                print(source + " auth connection failed:", type(exc).__name__)
    if not settings.database_url:
        print("Database: not configured")
    else:
        engine = None
        try:
            engine = create_async_engine(
                async_url(settings.database_url), connect_args={"ssl": "require", "timeout": 15}
            )
            async with engine.connect() as conn:
                print("Database SELECT 1:", (await conn.execute(text("SELECT 1"))).scalar() == 1)
                names = (
                    (
                        await conn.execute(
                            text(
                                "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('user_profiles','questionnaire_submissions','cv_profiles','cv_evaluations','user_skills','career_matches','learning_plans','consent_events')"
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                print(
                    "Prototype tables currently present:", ", ".join(names) or "none (migrations not applied)"
                )
        except Exception as exc:
            reason = str(getattr(exc, "orig", exc)).lower()
            known = [
                ("password authentication", "Incorrect database password"),
                ("getaddrinfo", "Database hostname does not resolve"),
                ("tenant or user not found", "Pooler username/project reference is incorrect"),
                ("timed out", "Connection timed out"),
                (
                    "sslmode",
                    "Connection URL includes unsupported sslmode; remove it (TLS is configured by the app)",
                ),
                ("certificate", "TLS certificate validation failed"),
                ("ipv6", "IPv6 connectivity is unavailable"),
            ]
            description = next(
                (message for token, message in known if token in reason),
                "Connection rejected; inspect connection URL format/host in the Supabase Connect panel",
            )
            print("Database connection failed:", type(getattr(exc, "orig", exc)).__name__, description)
        finally:
            if engine:
                await engine.dispose()


asyncio.run(main())
