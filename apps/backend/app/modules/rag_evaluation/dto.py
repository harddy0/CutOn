from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RAGEvaluationResponse(BaseModel):
    id: str
    query: str
    answer: str
    answer_source: str  # "query" | "study_buddy"
    latency_ms: int
    user_rating: Optional[int] = None  # 1 (up) | -1 (down) | None
    user_feedback: Optional[str] = None
    faithfulness_score: Optional[float] = None
    created_at: datetime


class RateAnswerRequest(BaseModel):
    rating: int  # 1 (up) or -1 (down)
    feedback: Optional[str] = None


class RAGStatsResponse(BaseModel):
    total_queries: int
    total_rated: int
    positive_rate: float  # percentage 0-100
    negative_rate: float
    avg_latency_ms: float
    avg_faithfulness: Optional[float] = None
    queries_with_answer: int
    no_answer_count: int
    source_breakdown: dict[str, int]  # {"query": 42, "study_buddy": 15}
