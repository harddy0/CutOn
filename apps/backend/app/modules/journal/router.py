from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.journal.dto import (
    CreateJournalEntryRequest,
    UpdateJournalEntryRequest,
    JournalEntryResponse,
)
from app.modules.journal.service import JournalEntriesService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/journal-entries", tags=["journal-entries"])


def get_journal_service() -> JournalEntriesService:
    return JournalEntriesService(DatabaseClient)


@router.post("/", response_model=JournalEntryResponse, status_code=202)
async def create_journal_entry(
    payload: CreateJournalEntryRequest,
    service: JournalEntriesService = Depends(get_journal_service),
    current_user: UserResponse = Depends(require_user),
):
    """Create a journal entry and enqueue background embedding generation.

    Returns **202 Accepted** immediately.  The ``embedding_status`` field
    starts as ``"PENDING"`` and the entry is updated asynchronously once
    the Celery worker finishes calling the Gemini Embedding API.
    """
    return await service.create(current_user.id, payload)


@router.get("/", response_model=list[JournalEntryResponse])
async def list_journal_entries(
    topic_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    service: JournalEntriesService = Depends(get_journal_service),
    current_user: UserResponse = Depends(require_user),
):
    if topic_id:
        return await service.list_by_topic(current_user.id, topic_id, skip, limit)
    return await service.list_by_user(current_user.id, skip, limit)


@router.get("/{entry_id}", response_model=JournalEntryResponse)
async def get_journal_entry(
    entry_id: str,
    service: JournalEntriesService = Depends(get_journal_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.find_by_id_for_user(entry_id, current_user.id)


@router.patch("/{entry_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    entry_id: str,
    payload: UpdateJournalEntryRequest,
    service: JournalEntriesService = Depends(get_journal_service),
    current_user: UserResponse = Depends(require_user),
):
    return await service.update(entry_id, current_user.id, payload)


@router.delete("/{entry_id}", status_code=204)
async def delete_journal_entry(
    entry_id: str,
    service: JournalEntriesService = Depends(get_journal_service),
    current_user: UserResponse = Depends(require_user),
):
    await service.delete(entry_id, current_user.id)
