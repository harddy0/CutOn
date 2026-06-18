from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator


# ── Generate ───────────────────────────────────────────────────────────

class GenerateQuizRequest(BaseModel):
    topic_id: Optional[str] = None
    query: Optional[str] = None
    num_questions: int = 10
    mode: str = "blind_spot"  # "blind_spot" | "topic_review"

    @model_validator(mode="after")
    def _validate(self) -> "GenerateQuizRequest":
        if not self.topic_id and not self.query:
            raise ValueError("Provide either 'topic_id' or 'query'")
        if self.mode not in ("blind_spot", "topic_review"):
            raise ValueError("mode must be 'blind_spot' or 'topic_review'")
        return self


# ── Question / Option (returned to the client) ─────────────────────────

class QuizOptionResponse(BaseModel):
    id: str
    text: str


class QuizQuestionResponse(BaseModel):
    id: str
    type: str  # "multiple_choice"
    question: str
    options: list[QuizOptionResponse]
    source_type: str  # "document_chunk" | "journal_entry"
    source_reference: str  # Formatted citation e.g. "react_guide.pdf, p.14"


class QuizResponse(BaseModel):
    id: str
    topic_id: str
    title: str
    mode: str  # "blind_spot" | "topic_review"
    generated_at: datetime
    questions: list[QuizQuestionResponse]
    blind_spot_count: int  # Number of blind-spot chunks detected
    has_journal_data: bool  # Whether journals existed for delta analysis
    created_at: datetime


class QuizSummaryResponse(BaseModel):
    """Lighter version for list views — no questions included."""
    id: str
    topic_id: str
    title: str
    mode: str  # "blind_spot" | "topic_review"
    question_count: int
    generated_at: datetime
    blind_spot_count: int
    has_journal_data: bool
    created_at: datetime


# ── Attempt ────────────────────────────────────────────────────────────

class AnswerSubmission(BaseModel):
    question_id: str
    selected_option_id: str


class SubmitAttemptRequest(BaseModel):
    answers: list[AnswerSubmission]


class GradedAnswerResponse(BaseModel):
    question_id: str
    selected_option_id: str
    correct_option_id: str
    is_correct: bool


class QuizAttemptResponse(BaseModel):
    id: str
    quiz_id: str
    topic_id: str
    score: int
    max_score: int
    passed: bool
    answers: list[GradedAnswerResponse]
    completed_at: datetime
