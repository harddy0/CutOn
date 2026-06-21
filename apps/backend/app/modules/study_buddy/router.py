import json
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.study_buddy.dto import (
    ChatRequest,
    ChatResponse,
    ConfirmJournalResponse,
    CreateSessionRequest,
    StudySessionDetailResponse,
    StudySessionResponse,
    UpdateSessionRequest,
)
from app.modules.study_buddy.service import StudyBuddyService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/study-sessions", tags=["study-sessions"])


def get_study_buddy_service() -> StudyBuddyService:
    return StudyBuddyService(DatabaseClient)


@router.post("/", response_model=StudySessionResponse, status_code=201)
async def create_session(
    payload: CreateSessionRequest,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Start a new study session with the Study Buddy.

    Optionally scoped to a ``topic_id`` — the Study Buddy will focus
    responses on that topic's materials.

    Sessions track conversation history so the Study Buddy remembers
    what you discussed earlier.
    """
    return await service.create_session(current_user.id, payload)


@router.post("/{session_id}/chat", response_model=ChatResponse)
async def chat(
    session_id: str,
    payload: ChatRequest,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Send a message to the Study Buddy and get a response.

    The Study Buddy:
    1. Searches your documents + journals for relevant context
    2. Remembers the conversation history
    3. Responds with a natural-language answer
    4. Optionally suggests saving insights as journal entries
    5. Optionally suggests taking a quiz

    **Data-first, supplement only when necessary** — your own materials
    are always the primary source.
    """
    return await service.chat(session_id, current_user.id, payload)


@router.post("/{session_id}/chat/stream")
async def chat_stream(
    session_id: str,
    payload: ChatRequest,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Send a message to the Study Buddy and stream the reply via SSE.

    Same logic as ``POST /{session_id}/chat`` but the response is returned
    as a **Server-Sent Events** stream so the frontend can display tokens
    incrementally as they arrive from Gemini.

    **SSE Event Types**
    * ``token`` — a single text chunk from the model.
    * ``metadata`` — JSON payload with the final reply text, journal
      suggestion, and quiz suggestion.
    * ``error`` — an error occurred during streaming.
    """
    async def event_stream():
        try:
            async for token, metadata in service.chat_stream(
                session_id, current_user.id, payload
            ):
                if token is not None:
                    yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
                elif metadata is not None:
                    # Final metadata event — includes journal/quiz suggestions
                    meta = {
                        "type": "metadata",
                        "journal_suggestion": (
                            metadata["journal_suggestion"].model_dump()
                            if metadata.get("journal_suggestion")
                            else None
                        ),
                        "quiz_suggestion": (
                            metadata["quiz_suggestion"].model_dump()
                            if metadata.get("quiz_suggestion")
                            else None
                        ),
                    }
                    yield f"data: {json.dumps(meta)}\n\n"
                    yield "data: {\"type\": \"done\"}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post(
    "/{session_id}/messages/{message_id}/confirm-journal",
    response_model=ConfirmJournalResponse,
    status_code=201,
)
async def confirm_journal(
    session_id: str,
    message_id: str,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Confirm a journal suggestion from a chat message.

    Creates a journal entry in the ``journal_entries`` collection and
    enqueues background embedding generation. Once embedded, the entry
    becomes searchable and feeds into blind-spot quiz detection.
    """
    return await service.confirm_journal(session_id, message_id, current_user.id)


@router.get("/", response_model=list[StudySessionResponse])
async def list_sessions(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """List the user's study sessions, most recent first.

    Filter by ``status`` (``active`` or ``ended``) to see ongoing or
    completed sessions.
    """
    return await service.list_sessions(current_user.id, status, skip, limit)


@router.get("/{session_id}", response_model=StudySessionDetailResponse)
async def get_session(
    session_id: str,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Get a study session with its full message history."""
    return await service.get_session(session_id, current_user.id)


@router.patch("/{session_id}", response_model=StudySessionResponse)
async def update_session(
    session_id: str,
    payload: UpdateSessionRequest,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Update a session's title or end it (set ``status`` to ``ended``)."""
    return await service.update_session(session_id, current_user.id, payload)


@router.delete("/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    service: StudyBuddyService = Depends(get_study_buddy_service),
    current_user: UserResponse = Depends(require_user),
):
    """Delete a study session and all its messages."""
    await service.delete_session(session_id, current_user.id)
