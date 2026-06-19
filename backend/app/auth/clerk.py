from __future__ import annotations
"""
Clerk JWT verification for FastAPI.

Flow:
  1. Client sends `Authorization: Bearer <clerk_session_token>` on every request.
  2. Token is verified against the RSA public key (env: CLERK_JWT_PUBLIC_KEY).
     Falls back to fetching JWKS from CLERK_FRONTEND_API_URL if key not set.
  3. jose.jwt.decode() verifies signature + expiry.
  4. The `sub` claim is the Clerk user ID.
  5. We look up (or lazily create) the matching row in our `users` table.
"""
import os
import time
import logging
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from app.db import get_session
from app.models import Subscription, SubscriptionStatus, SubscriptionTier, User

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)

# ---------------------------------------------------------------------------
# JWKS cache  (fallback when no static public key is configured)
# ---------------------------------------------------------------------------
_jwks_cache: dict[str, Any] = {}
_jwks_fetched_at: float = 0.0
_JWKS_TTL = 3600


def _get_signing_key() -> str | dict[str, Any]:
    """Return the RSA public key string if configured, else the cached JWKS dict."""
    # Check inline env var first (single-line or escaped newlines).
    pem = os.environ.get("CLERK_JWT_PUBLIC_KEY", "").strip()
    if pem:
        return pem

    # Check file path env var (preferred — avoids multi-line systemd env issues).
    pem_file = os.environ.get("CLERK_JWT_PUBLIC_KEY_FILE", "").strip()
    if pem_file:
        try:
            with open(pem_file) as f:
                return f.read().strip()
        except OSError as exc:
            logger.error("Failed to read CLERK_JWT_PUBLIC_KEY_FILE %s: %s", pem_file, exc)
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "JWT public key file could not be read",
            )

    global _jwks_cache, _jwks_fetched_at
    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache

    frontend_api = os.environ.get("CLERK_FRONTEND_API_URL", "")
    if not frontend_api:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Neither CLERK_JWT_PUBLIC_KEY nor CLERK_FRONTEND_API_URL is configured",
        )

    jwks_url = f"{frontend_api.rstrip('/')}/.well-known/jwks.json"
    try:
        resp = httpx.get(jwks_url, timeout=5)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = now
        return _jwks_cache
    except Exception as exc:
        logger.error("Failed to fetch Clerk JWKS: %s", exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Authentication service unavailable",
        )


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def _verify_clerk_token(token: str) -> dict[str, Any]:
    key = _get_signing_key()
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_session),
) -> User:
    payload = _verify_clerk_token(credentials.credentials)
    clerk_user_id: str = payload.get("sub", "")
    if not clerk_user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing sub claim")

    user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()

    if user is None:
        # Lazily provision the user row if it wasn't created via webhook yet.
        email = payload.get("email", "") or payload.get("primary_email_address", "")
        display_name = payload.get("name", "") or email.split("@")[0]
        user = User(
            clerk_user_id=clerk_user_id,
            email=email,
            display_name=display_name,
        )
        db.add(user)
        db.flush()

        # Give every new user a FREE subscription row.
        sub = Subscription(user_id=user.id, tier=SubscriptionTier.FREE, status=SubscriptionStatus.ACTIVE)
        db.add(sub)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is disabled")

    return user
