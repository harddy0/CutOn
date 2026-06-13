from contextlib import asynccontextmanager

from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import settings
from app.db.client import DatabaseClient
from app.modules.auth.router import router as auth_router
from app.modules.auth.middleware import AuthRouteMiddleware
from app.modules.users.router import router as users_router


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

app.add_middleware(AuthRouteMiddleware)

# -- Routers --
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    try:
        db: AsyncIOMotorDatabase = DatabaseClient.get_db()
        await db.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "unavailable"

    return {
        "status": "ok",
        "project": settings.project_name,
        "database": db_status,
    }