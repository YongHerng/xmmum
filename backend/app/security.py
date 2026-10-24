from uuid import UUID
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette.concurrency import run_in_threadpool
from .config import settings

bearer = HTTPBearer(auto_error=False)
jwks = jwt.PyJWKClient(
    settings.supabase_url + "/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=300
) if settings.supabase_url else None


def verify_token(token):
    if jwks is None:
        raise ValueError("Supabase authentication is not configured.")
    key = jwks.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        key.key,
        algorithms=["ES256"],
        audience="authenticated",
        issuer=settings.supabase_url + "/auth/v1",
        options={"require": ["exp", "sub", "iss", "aud"]},
    )
    return str(UUID(claims["sub"]))


async def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(
            401, "Sign in to save and access your profile.", headers={"WWW-Authenticate": "Bearer"}
        )
    try:
        return await run_in_threadpool(verify_token, credentials.credentials)
    except Exception:
        raise HTTPException(
            401,
            "Your session is invalid or expired. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
