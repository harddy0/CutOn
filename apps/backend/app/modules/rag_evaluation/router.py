from typing import Optional

from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_admin, require_user
from app.modules.rag_evaluation.dto import (
    RAGEvaluationResponse,
    RAGStatsResponse,
    RateAnswerRequest,
)
from app.modules.rag_evaluation.service import RAGEvaluationService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/rag-evaluations", tags=["rag-evaluations"])


def get_rag_eval_service() -> RAGEvaluationService:
    return RAGEvaluationService(DatabaseClient)


@router.get("/stats", response_model=RAGStatsResponse)
async def get_rag_stats(
    service: RAGEvaluationService = Depends(get_rag_eval_service),
    current_user: UserResponse = Depends(require_user),
):
    """Get RAG quality metrics for the authenticated user.

    Returns aggregate stats: total queries, user rating rate, average
    latency, average faithfulness score, and source breakdown.
    """
    return await service.get_stats(current_user.id)


@router.get("/", response_model=list[RAGEvaluationResponse])
async def list_evaluations(
    skip: int = 0,
    limit: int = 50,
    min_rating: Optional[int] = None,
    service: RAGEvaluationService = Depends(get_rag_eval_service),
    current_user: UserResponse = Depends(require_user),
):
    """List RAG evaluation history.

    Filter by ``min_rating`` (1 for thumbs up, -1 for thumbs down) to
    see only positively or negatively rated interactions.
    """
    return await service.list_evaluations(
        current_user.id, skip, limit, min_rating
    )


@router.patch("/{eval_id}/rate", response_model=RAGEvaluationResponse)
async def rate_answer(
    eval_id: str,
    payload: RateAnswerRequest,
    service: RAGEvaluationService = Depends(get_rag_eval_service),
    current_user: UserResponse = Depends(require_user),
):
    """Rate a past RAG interaction.

    Use ``rating`` = 1 for thumbs up, -1 for thumbs down.
    Optionally include ``feedback`` text.
    """
    return await service.rate_answer(eval_id, current_user.id, payload)


# ---------------------------------------------------------------------------
# Admin-only — system-wide RAG quality monitoring
# ---------------------------------------------------------------------------


@router.get("/admin/stats", response_model=RAGStatsResponse)
async def get_admin_rag_stats(
    service: RAGEvaluationService = Depends(get_rag_eval_service),
    _: UserResponse = Depends(require_admin),
):
    """Get RAG quality metrics across **all** users.

    Admin-only.  Returns the same aggregate stats as the user-level
    endpoint but unfiltered — total queries, rating rates, average
    latency, average faithfulness, and source breakdown for the
    entire system.
    """
    return await service.get_admin_stats()


@router.get("/admin/", response_model=list[RAGEvaluationResponse])
async def list_admin_evaluations(
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    min_rating: Optional[int] = None,
    service: RAGEvaluationService = Depends(get_rag_eval_service),
    _: UserResponse = Depends(require_admin),
):
    """List RAG evaluations across all users (admin only).

    Optionally filter by ``user_id`` to scope to a single user,
    or ``min_rating`` (1 for thumbs up, -1 for thumbs down) to
    see only positively or negatively rated interactions.
    """
    return await service.list_admin_evaluations(
        user_id=user_id, skip=skip, limit=limit, min_rating=min_rating
    )
