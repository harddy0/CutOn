from typing import Optional

from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.quizzes.dto import (
    GenerateQuizRequest,
    QuizAttemptResponse,
    QuizResponse,
    QuizSummaryResponse,
    SubmitAttemptRequest,
)
from app.modules.quizzes.service import QuizzesService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


def get_quizzes_service() -> QuizzesService:
    return QuizzesService(DatabaseClient)


@router.post("/generate", response_model=QuizResponse, status_code=201)
async def generate_quiz(
    payload: GenerateQuizRequest,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """Generate a quiz in one of two modes.

    Accepts either a ``topic_id`` (direct MongoDB ObjectId) or a ``query``
    (natural language, e.g. "I want a quiz on React state management").
    If a ``query`` is provided, the closest topic is found via vector
    similarity search against your topic names.

    **Modes**

    1. ``blind_spot`` (default) — Vector delta analysis between document
       chunks and journal entries identifies knowledge gaps. The LLM focuses
       on those gaps and supplements with general knowledge when data is
       sparse. Best for uncovering what you haven't mastered yet.

    2. ``topic_review`` — General comprehension quiz using all document
       chunks directly. Supplements with general knowledge when materials
       are limited. Best for studying and reinforcing what you've learned.

    **Data-first philosophy**
    Both modes follow the same principle as the query engine: use the
    user's own data as the primary source, **supplement don't refuse**
    when data is limited.
    """
    return await service.generate(current_user.id, payload)


@router.get("/", response_model=list[QuizSummaryResponse])
async def list_quizzes(
    topic_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """List quizzes for the authenticated user, optionally filtered by topic."""
    return await service.list_quizzes(current_user.id, topic_id, skip, limit)


@router.get("/{quiz_id}", response_model=QuizResponse)
async def get_quiz(
    quiz_id: str,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """Get a single quiz with all questions (for rendering in the UI)."""
    return await service.get_quiz(quiz_id, current_user.id)


@router.delete("/{quiz_id}", status_code=204)
async def delete_quiz(
    quiz_id: str,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """Delete a quiz and all its attempts."""
    await service.delete_quiz(quiz_id, current_user.id)


@router.post("/{quiz_id}/attempts", response_model=QuizAttemptResponse, status_code=201)
async def submit_attempt(
    quiz_id: str,
    payload: SubmitAttemptRequest,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """Submit answers for a quiz and receive a graded result."""
    return await service.submit_attempt(quiz_id, current_user.id, payload)


@router.get("/{quiz_id}/attempts", response_model=list[QuizAttemptResponse])
async def list_attempts(
    quiz_id: str,
    skip: int = 0,
    limit: int = 100,
    service: QuizzesService = Depends(get_quizzes_service),
    current_user: UserResponse = Depends(require_user),
):
    """List previous attempts for a quiz, most recent first."""
    return await service.list_attempts(quiz_id, current_user.id, skip, limit)
