from datetime import datetime
from typing import Any, Annotated, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def validate_object_id(value: Any) -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str):
        return ObjectId(value)
    raise TypeError("ObjectId or str required")


MongoObjectId = Annotated[ObjectId, BeforeValidator(validate_object_id)]


class BaseDocument(BaseModel):
    """Base model for all MongoDB documents. Handles the _id -> id alias."""

    id: Optional[MongoObjectId] = Field(default=None, alias="_id")

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        populate_by_name=True,
        from_attributes=True,
        json_encoders={ObjectId: str},
    )


class UserPreferences(BaseModel):
    email_notifications: bool = True


class UserDocument(BaseDocument):
    email: str
    first_name: str
    last_name: str
    password_hash: str
    role: str = "user"  # "user" | "admin"
    is_active: bool = True
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None


class TopicDocument(BaseDocument):
    user_id: MongoObjectId
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SourceDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: MongoObjectId
    original_filename: str
    file_type: str  # pdf, txt, etc.
    file_size: int  # Bytes
    filename: str  # Original filename (display purposes)
    file_hash: str
    total_chunks: int
    chunking_status: str = "PENDING"  # PENDING → PROCESSING → COMPLETED | FAILED
    ingested_at: datetime = Field(default_factory=datetime.utcnow)


class ChunkMetadata(BaseModel):
    page_number: int
    page_range: str
    tokens: int | None = None  # Token count for LLM context budgeting


class DocumentChunkDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: MongoObjectId
    source_id: MongoObjectId
    chunk_index: int
    metadata: ChunkMetadata
    text: str
    embedding: list[float]

    # ── Deduplication & versioning ──────────────────────────────────
    chunk_hash: str  # SHA-256 hex digest of text — enables idempotent re-ingestion
    embedding_model: str  # Model/version used to generate the embedding vector

    # ── Background embedding pipeline state ──────────────────────────
    # PENDING → COMPLETED | FAILED  (managed by background worker)
    embedding_status: str = "PENDING"
    retry_count: int = 0
    last_error: Optional[str] = None

    # ── Precise traceability ────────────────────────────────────────
    start_char: Optional[int] = None  # Character offset in the source document
    end_char: Optional[int] = None    # Exclusive character offset

    created_at: datetime = Field(default_factory=datetime.utcnow)


class JournalEntryDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: MongoObjectId
    content: str
    embedding: list[float]

    # ── Embedding pipeline state ─────────────────────────────────────
    # PENDING → COMPLETED | FAILED  (managed by background worker)
    embedding_status: str = "PENDING"
    embedding_model: str  # Model used to generate the embedding vector
    retry_count: int = 0
    last_error: Optional[str] = None

    # ── Versioning & traceability ────────────────────────────────────
    start_char: Optional[int] = None  # Character offset in the source (if sourced)
    end_char: Optional[int] = None    # Exclusive character offset

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class QuizOption(BaseModel):
    id: str
    text: str


class QuizQuestion(BaseModel):
    id: str
    type: str
    question: str
    options: list[QuizOption]
    correct_answer: str
    points: int
    source_type: str
    source_reference_id: MongoObjectId


class QuizDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: MongoObjectId
    title: str
    mode: str = "blind_spot"  # "blind_spot" | "topic_review"
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    questions: list[QuizQuestion]


class QuizAnswer(BaseModel):
    question_id: str
    selected_option_id: str
    is_correct: bool


class QuizAttemptDocument(BaseDocument):
    quiz_id: MongoObjectId
    user_id: MongoObjectId
    topic_id: MongoObjectId
    score: int
    max_score: int
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    answers: list[QuizAnswer]


class NotificationDocument(BaseDocument):
    user_id: MongoObjectId
    type: str
    title: str
    message: str
    is_read: bool = False
    action_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StudySessionDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: Optional[MongoObjectId] = None
    title: str
    status: str = "active"  # "active" | "ended"
    message_count: int = 0
    journal_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StudyMessageDocument(BaseDocument):
    session_id: MongoObjectId
    role: str  # "user" | "assistant"
    content: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RAGEvaluationDocument(BaseDocument):
    """Logs every RAG interaction for quality tracking and evaluation."""
    user_id: MongoObjectId
    query: str
    answer: str
    answer_source: str  # "query" | "study_buddy"
    retrieved_chunks: list[dict] = Field(default_factory=list)
    latency_ms: int = 0
    user_rating: Optional[int] = None  # 1 (up) | -1 (down) | None
    user_feedback: Optional[str] = None
    faithfulness_score: Optional[float] = None  # 0.0-1.0 (LLM-as-judge)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AuditLogDocument(BaseDocument):
    user_id: MongoObjectId
    action: str
    resource_type: str
    resource_id: MongoObjectId
    metadata: dict[str, Any]
    created_at: datetime = Field(default_factory=datetime.utcnow)
