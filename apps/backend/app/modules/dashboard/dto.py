from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.modules.audit.dto import AuditLogResponse


# ---------------------------------------------------------------------------
# Dashboard Summary — quick counts (lightweight)
# ---------------------------------------------------------------------------


class DashboardSummaryResponse(BaseModel):
    """Lightweight counts that change most frequently."""

    total_topics: int
    total_sources: int
    total_sessions: int
    active_sessions: int
    unread_notifications: int


# ---------------------------------------------------------------------------
# Dashboard Learning — journals & embedding progress
# ---------------------------------------------------------------------------


class DashboardLearningResponse(BaseModel):
    """Journal entries, document chunks, and embedding status."""

    total_journals: int
    journals_last_7_days: int
    journals_embedded: int
    total_chunks: int
    chunks_embedded: int


# ---------------------------------------------------------------------------
# Dashboard Quizzes — quiz count & average score
# ---------------------------------------------------------------------------


class DashboardQuizResponse(BaseModel):
    """Quiz statistics — total created and average score."""

    total_quizzes: int
    avg_quiz_score: float


# ---------------------------------------------------------------------------
# Dashboard RAG — evaluation metrics
# ---------------------------------------------------------------------------


class DashboardRagResponse(BaseModel):
    """RAG quality metrics — query count and user rating positive rate."""

    total_rag_queries: int
    total_rag_rated: int
    rag_positive_rate: float


# ---------------------------------------------------------------------------
# Dashboard Activity — recent audit logs
# ---------------------------------------------------------------------------


class DashboardActivityResponse(BaseModel):
    """Recent activity feed (audit logs)."""

    recent_activity: list[AuditLogResponse]


# ---------------------------------------------------------------------------
# Legacy — keep for backward compatibility (deprecated)
# ---------------------------------------------------------------------------


class DashboardStatsResponse(BaseModel):
    """Aggregate dashboard response (deprecated — prefer the split endpoints).

    This type is kept so the old ``/dashboard/stats`` endpoint can still
    return a combined payload without breaking existing consumers.
    """

    # Topics
    total_topics: int

    # Journal entries
    total_journals: int
    journals_last_7_days: int
    journals_embedded: int

    # Documents / sources
    total_sources: int
    total_chunks: int
    chunks_embedded: int

    # Quizzes
    total_quizzes: int
    avg_quiz_score: float

    # Study sessions
    active_sessions: int
    total_sessions: int

    # Notifications
    unread_notifications: int

    # RAG evaluations
    total_rag_queries: int
    total_rag_rated: int
    rag_positive_rate: float

    # Recent activity (last 5 actions)
    recent_activity: list[AuditLogResponse]

    # Timestamp of when this report was generated
    generated_at: datetime
