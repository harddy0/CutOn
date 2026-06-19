from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.modules.audit.dto import AuditLogResponse


class DashboardStatsResponse(BaseModel):
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
    rag_positive_rate: float

    # Recent activity (last 5 actions)
    recent_activity: list[AuditLogResponse]

    # Timestamp of when this report was generated
    generated_at: datetime
