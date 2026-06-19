from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.dashboard.dto import DashboardStatsResponse
from app.modules.dashboard.service import DashboardService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def get_dashboard_service() -> DashboardService:
    return DashboardService(DatabaseClient)


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    service: DashboardService = Depends(get_dashboard_service),
    current_user: UserResponse = Depends(require_user),
):
    """Get aggregate dashboard statistics for the authenticated user.

    Returns counts across all modules in a single call — topics, journals,
    documents, quizzes, study sessions, notifications, and RAG quality
    metrics — plus a recent activity feed.
    """
    return await service.get_stats(current_user.id)
