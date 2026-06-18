from typing import Optional

from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
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
