from fastapi import APIRouter, Depends, Query

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.dashboard.dto import (
    DashboardActivityResponse,
    DashboardLearningResponse,
    DashboardQuizResponse,
    DashboardRagResponse,
    DashboardStatsResponse,
    DashboardSummaryResponse,
)
from app.modules.dashboard.service import DashboardService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_dashboard_service() -> DashboardService:
    return DashboardService(DatabaseClient)


# ---------------------------------------------------------------------------
# Split endpoints — each category fetched independently with its own cache TTL
# ---------------------------------------------------------------------------


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Lightweight counts that change most frequently.

    Returns total topics, sources, sessions, active sessions,
    and unread notifications for the authenticated user.
    Cached for 30 seconds.
    """
    return await service.get_summary(current_user.id)


@router.get("/learning", response_model=DashboardLearningResponse)
async def get_dashboard_learning(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Journal entries, document chunks, and embedding progress.

    Returns journal counts (total, last 7 days, embedded) and
    chunk counts (total, embedded). Cached for 60 seconds.
    """
    return await service.get_learning(current_user.id)


@router.get("/quizzes", response_model=DashboardQuizResponse)
async def get_dashboard_quizzes(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Quiz statistics — total quizzes created and average score.

    Cached for 5 minutes (quiz scores change infrequently).
    """
    return await service.get_quiz_stats(current_user.id)


@router.get("/rag", response_model=DashboardRagResponse)
async def get_dashboard_rag(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """RAG quality metrics.

    Returns total RAG queries, queries that have been rated,
    and the positive rating percentage. Cached for 5 minutes.
    """
    return await service.get_rag_stats(current_user.id)


@router.get("/activity", response_model=DashboardActivityResponse)
async def get_dashboard_activity(
    limit: int = Query(default=5, ge=1, le=50),
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Recent activity feed from audit logs.

    Returns the last N audit log entries for the user.
    Cached for 30 seconds. Use ``?limit=`` to control how many.
    """
    return await service.get_activity(current_user.id, limit=limit)


# ---------------------------------------------------------------------------
# Legacy aggregate endpoint (deprecated — prefer the split routes above)
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Get aggregate dashboard statistics (deprecated).

    Returns counts across all modules in a single call.
    Internally delegates to the split methods so caching is shared.

    **Prefer the individual endpoints** (``/summary``, ``/learning``,
    ``/quizzes``, ``/rag``, ``/activity``) for better performance
    and granular caching.
    """
    return await service.get_stats(current_user.id)
