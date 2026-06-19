from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.routes import router
from app.api.billing import router as billing_router
from app.api.webhooks.clerk_webhooks import router as clerk_router
from app.api.admin import router as admin_router
from app.db import create_db_and_tables
from app.middleware.error_handler import GlobalErrorHandlerMiddleware
from app.middleware.rate_limit import limiter


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="WealthTrack AU — API",
    description="Australian FI/RE Personal Wealth Management SaaS",
    version="2.0.0",
    lifespan=lifespan,
)

# State required by slowapi.
app.state.limiter = limiter

# ---------------------------------------------------------------------------
# Middleware  (order matters: outermost = first to handle request)
# ---------------------------------------------------------------------------

# 1. Global error handler — catches anything that escapes route handlers.
app.add_middleware(GlobalErrorHandlerMiddleware)

# 2. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://192.168.50.226:3000",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Rate limiting
app.add_middleware(SlowAPIMiddleware)

# Custom 429 response body so the frontend can display a helpful message.
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": "RATE_LIMIT_EXCEEDED",
            "message": "Too many requests. Please slow down.",
            "retry_after": str(exc.retry_after) if hasattr(exc, "retry_after") else "60",
        },
    )

# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(router)
app.include_router(billing_router)
app.include_router(clerk_router)
app.include_router(admin_router)
