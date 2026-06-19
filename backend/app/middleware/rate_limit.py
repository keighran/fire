from __future__ import annotations
"""
Rate limiting via slowapi (Starlette-native limiter backed by in-process memory).

Limits are applied per authenticated user (by Clerk JWT sub) with an IP fallback
for unauthenticated endpoints (e.g. the health check and pricing page).

Default limits:
  - Authenticated:    300 requests / minute
  - Unauthenticated:   30 requests / minute
  - Price refresh:      5 requests / minute  (expensive yfinance calls)
  - Billing checkout:  10 requests / minute  (prevent checkout spam)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request


def _key_func(request: Request) -> str:
    """Use Clerk user ID from JWT if present, otherwise fall back to IP."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            from jose import jwt as jose_jwt
            token = auth.split(" ", 1)[1]
            # Decode without verification just to extract the sub claim for rate-key.
            payload = jose_jwt.get_unverified_claims(token)
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_key_func, default_limits=["300/minute"])

# Named limit strings used in route decorators.
LIMIT_DEFAULT = "300/minute"
LIMIT_ANON = "30/minute"
LIMIT_PRICE_REFRESH = "5/minute"
LIMIT_BILLING = "10/minute"
LIMIT_WRITE = "60/minute"
