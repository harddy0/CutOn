from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Create Session ─────────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    topic_id: Optional[str] = None
    title: Optional[str] = None


# ── Chat ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str


class JournalSuggestion(BaseModel):
    message_id: str
    content: str


class QuizSuggestion(BaseModel):
    topic: str
    reason: str


class ChatResponse(BaseModel):
    reply: str
    journal_suggestion: Optional[JournalSuggestion] = None
    quiz_suggestion: Optional[QuizSuggestion] = None


# ── Confirm Journal ────────────────────────────────────────────────────

class ConfirmJournalResponse(BaseModel):
    journal_id: str
    content: str
    status: str  # "pending_embedding"


# ── Session Responses ──────────────────────────────────────────────────

class StudySessionResponse(BaseModel):
    id: str
    topic_id: Optional[str] = None
    title: str
    status: str
    message_count: int
    journal_count: int
    created_at: datetime
    updated_at: datetime


class StudyMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    metadata: dict
    created_at: datetime


class StudySessionDetailResponse(BaseModel):
    id: str
    topic_id: Optional[str] = None
    title: str
    status: str
    message_count: int
    journal_count: int
    messages: list[StudyMessageResponse]
    created_at: datetime
    updated_at: datetime


# ── Update Session ─────────────────────────────────────────────────────

class UpdateSessionRequest(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
