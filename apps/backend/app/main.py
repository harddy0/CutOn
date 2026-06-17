from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.asynchronous.database import AsyncDatabase
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.db.client import DatabaseClient
from app.modules.auth.limiter import limiter
from app.modules.auth.router import router as auth_router
from app.modules.auth.middleware import AuthRouteMiddleware
from app.modules.users.router import router as users_router
from app.modules.topics.router import router as topics_router
from app.modules.journal.router import router as journal_router
from app.modules.documents.router import router as documents_router

# -- Rate limiter (keyed by IP, shared with auth router) --


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Opens the MongoDB connection on startup and closes it on shutdown."""
    await DatabaseClient.connect()
    yield
    await DatabaseClient.close()


app = FastAPI(
    title=settings.project_name,
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)  # type: ignore[arg-type]
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:  # type: ignore[valid-type]
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
        headers={"Retry-After": "60"},
    )

# -- CORS (allow all origins for now, lock down in production) --
origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthRouteMiddleware)
app.add_middleware(SlowAPIMiddleware)

# -- Routers --
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(topics_router, prefix="/api/v1")
app.include_router(journal_router, prefix="/api/v1")
app.include_router(documents_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
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