from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreateJournalEntryRequest(BaseModel):
    topic_id: str
    content: str


class UpdateJournalEntryRequest(BaseModel):
    content: Optional[str] = None


class JournalEntryResponse(BaseModel):
    id: str
    user_id: str
    topic_id: str
    content: str
    embedding: list[float] = []
    embedding_status: str = "PENDING"
    created_at: datetime
    updated_at: datetime
