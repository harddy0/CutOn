"""CutOn Backend — FastAPI Application.

Initialises Sentry (if configured), logging, database connections,
middleware, and all route handlers.
"""

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pymongo.asynchronous.database import AsyncDatabase
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.db.client import DatabaseClient
from app.db.redis_client import RedisClient
from app.modules.auth.limiter import limiter
from app.modules.auth.middleware import AuthRouteMiddleware
from app.modules.auth.router import router as auth_router
from app.modules.users.router import router as users_router
from app.modules.topics.router import router as topics_router
from app.modules.journal.router import router as journal_router
from app.modules.documents.router import router as documents_router
from app.modules.query.router import router as query_router
from app.modules.quizzes.router import router as quizzes_router
from app.modules.study_buddy.router import router as study_buddy_router
from app.modules.rag_evaluation.router import router as rag_evaluation_router
from app.modules.audit.router import router as audit_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.notifications.router import router as notifications_router

# ---------------------------------------------------------------------------
# Logging — configure early so startup messages are captured
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)

logger = logging.getLogger("cuton")

# ---------------------------------------------------------------------------
# Sentry — initialise before anything else so we capture startup crashes
# ---------------------------------------------------------------------------

# Strip accidental quote wrapping from env values & validate DSN looks plausible
def _valid_sentry_dsn(dsn: str) -> str | None:
    """Return the DSN stripped of quotes+whitespace, or None if invalid."""
    cleaned = dsn.strip("'\" \t\n") if dsn else ""
    if not cleaned:
        return None
    if not cleaned.startswith("https://"):
        return None
    return cleaned


sentry_dsn = _valid_sentry_dsn(settings.sentry_dsn)
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    logger.info("Sentry initialised (env=%s)", settings.environment)
else:
    logger.info("Sentry DSN not set — error monitoring disabled")

# ---------------------------------------------------------------------------
# Startup validation — warn on missing critical configuration
# ---------------------------------------------------------------------------

_CRITICAL_ENV_VARS: dict[str, str] = {
    "JWT_SECRET": settings.jwt_secret,
    "GEMINI_API_KEY": settings.gemini_api_key,
    "MONGO_URI": settings.mongo_uri,
}

for var_name, var_value in _CRITICAL_ENV_VARS.items():
    if not var_value or var_value == "change-me-in-production":
        logger.warning(
            "%s is not properly configured (value=%r). "
            "Set it in your .env file or environment before deploying to production.",
            var_name,
            var_value,
        )

# ---------------------------------------------------------------------------
# Lifespan — open / close connections
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Open database and cache connections on startup, close them on shutdown."""
    logger.info("Starting CutOn Backend — connecting to MongoDB and Redis...")
    await DatabaseClient.connect()
    await RedisClient.connect()
    await DatabaseClient.create_indexes()
    logger.info("Startup complete — ready to accept requests.")
    yield
    logger.info("Shutting down — closing connections...")
    await RedisClient.close()
    await DatabaseClient.close()
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title=settings.project_name,
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(RateLimitExceeded)  # type: ignore[arg-type]
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:  # type: ignore[valid-type]
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
        headers={"Retry-After": str(settings.rate_limit_retry_after_sec)},
    )


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthRouteMiddleware)
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(topics_router, prefix="/api/v1")
app.include_router(journal_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")
app.include_router(query_router, prefix="/api/v1")
app.include_router(quizzes_router, prefix="/api/v1")
app.include_router(study_buddy_router, prefix="/api/v1")
app.include_router(rag_evaluation_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Lightweight health-check endpoint — also confirms database connectivity."""
    try:
        db: AsyncDatabase = DatabaseClient.get_db()
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "ok",
        "project": settings.project_name,
        "database": db_status,
    }


# ---------------------------------------------------------------------------
# Root redirect to docs
# ---------------------------------------------------------------------------


@app.get("/")
async def root() -> RedirectResponse:
    """Redirect the root path to the interactive API docs."""
    return RedirectResponse(url="/docs")