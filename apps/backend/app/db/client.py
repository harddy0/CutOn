from typing import Optional

from bson import ObjectId
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import settings


class DatabaseClient:
    _client: Optional[AsyncMongoClient] = None
    _db: Optional[AsyncDatabase] = None

    # Collections — exposed like Prisma fields
    users: Optional[AsyncCollection] = None
    topics: Optional[AsyncCollection] = None
    sources: Optional[AsyncCollection] = None
    document_chunks: Optional[AsyncCollection] = None
    journal_entries: Optional[AsyncCollection] = None
    quizzes: Optional[AsyncCollection] = None
    quiz_attempts: Optional[AsyncCollection] = None
    study_sessions: Optional[AsyncCollection] = None
    study_messages: Optional[AsyncCollection] = None
    rag_evaluations: Optional[AsyncCollection] = None
    notifications: Optional[AsyncCollection] = None
    audit_logs: Optional[AsyncCollection] = None

    # ── Index definitions ────────────────────────────────────────────
    # create_index is idempotent — only creates indexes that don't exist.
    # These run on every app startup so indexes stay in sync with code.

    _INDEXES: dict[str, list[tuple[list, dict]]] = {
        "users": [
            ([("email", 1)], {"unique": True, "name": "uq_users_email"}),
        ],
        "topics": [
            ([("user_id", 1)], {"name": "idx_topics_user_id"}),
            ([("user_id", 1), ("created_at", -1)], {"name": "idx_topics_user_created"}),
        ],
        "sources": [
            ([("user_id", 1)], {"name": "idx_sources_user_id"}),
            ([("user_id", 1), ("ingested_at", -1)], {"name": "idx_sources_user_ingested"}),
            ([("topic_id", 1)], {"name": "idx_sources_topic_id"}),
            ([("user_id", 1), ("topic_id", 1), ("ingested_at", -1)], {"name": "idx_sources_user_topic_ingested"}),
            ([("file_hash", 1)], {"name": "idx_sources_file_hash"}),
        ],
        "document_chunks": [
            ([("user_id", 1)], {"name": "idx_chunks_user_id"}),
            ([("topic_id", 1)], {"name": "idx_chunks_topic_id"}),
            ([("source_id", 1)], {"name": "idx_chunks_source_id"}),
            ([("source_id", 1), ("chunk_index", 1)], {"name": "idx_chunks_source_index"}),
            ([("source_id", 1), ("chunk_hash", 1)], {"name": "uq_chunks_source_hash", "unique": True}),
            ([("embedding_model", 1)], {"name": "idx_chunks_embedding_model"}),
            ([("embedding_status", 1)], {"name": "idx_chunks_embedding_status"}),
            ([("source_id", 1), ("embedding_status", 1)], {"name": "idx_chunks_source_status"}),
        ],
        "journal_entries": [
            ([("user_id", 1)], {"name": "idx_journals_user_id"}),
            ([("user_id", 1), ("created_at", -1)], {"name": "idx_journals_user_created"}),
            ([("topic_id", 1)], {"name": "idx_journals_topic_id"}),
            ([("user_id", 1), ("topic_id", 1), ("created_at", -1)], {"name": "idx_journals_user_topic_created"}),
            ([("embedding_model", 1)], {"name": "idx_journals_embedding_model"}),
            ([("embedding_status", 1)], {"name": "idx_journals_embedding_status"}),
        ],
        "quizzes": [
            ([("user_id", 1)], {"name": "idx_quizzes_user_id"}),
            ([("topic_id", 1)], {"name": "idx_quizzes_topic_id"}),
        ],
        "quiz_attempts": [
            ([("quiz_id", 1)], {"name": "idx_attempts_quiz_id"}),
            ([("user_id", 1)], {"name": "idx_attempts_user_id"}),
        ],
        "study_sessions": [
            ([("user_id", 1), ("created_at", -1)], {"name": "idx_study_sessions_user_created"}),
            ([("user_id", 1), ("status", 1)], {"name": "idx_study_sessions_user_status"}),
        ],
        "study_messages": [
            ([("session_id", 1), ("created_at", 1)], {"name": "idx_study_messages_session_created"}),
        ],
        "rag_evaluations": [
            ([("user_id", 1), ("created_at", -1)], {"name": "idx_rag_eval_user_created"}),
            ([("user_rating", 1)], {"name": "idx_rag_eval_rating"}),
            ([("answer_source", 1)], {"name": "idx_rag_eval_source"}),
        ],
        "notifications": [
            ([("user_id", 1)], {"name": "idx_notifications_user_id"}),
            ([("user_id", 1), ("is_read", 1)], {"name": "idx_notifications_user_read"}),
        ],
        "audit_logs": [
            ([("user_id", 1)], {"name": "idx_audit_user_id"}),
            ([("action", 1)], {"name": "idx_audit_action"}),
            ([("created_at", -1)], {"name": "idx_audit_created_at"}),
        ],
    }

    @classmethod
    async def connect(cls) -> None:
        """Create the Mongo client and assign collection references."""
        cls._client = AsyncMongoClient(settings.mongo_uri)
        cls._db = cls._client[settings.mongo_db_name]

        # Wire up collections
        cls.users = cls._db.get_collection("users")
        cls.topics = cls._db.get_collection("topics")
        cls.sources = cls._db.get_collection("sources")
        cls.document_chunks = cls._db.get_collection("document_chunks")
        cls.journal_entries = cls._db.get_collection("journal_entries")
        cls.quizzes = cls._db.get_collection("quizzes")
        cls.quiz_attempts = cls._db.get_collection("quiz_attempts")
        cls.study_sessions = cls._db.get_collection("study_sessions")
        cls.study_messages = cls._db.get_collection("study_messages")
        cls.rag_evaluations = cls._db.get_collection("rag_evaluations")
        cls.notifications = cls._db.get_collection("notifications")
        cls.audit_logs = cls._db.get_collection("audit_logs")

    @classmethod
    async def close(cls) -> None:
        """Close the Mongo client connection."""
        if cls._client is not None:
            await cls._client.close()
            cls._client = None
            cls._db = None
            cls.users = None
            cls.topics = None
            cls.sources = None
            cls.document_chunks = None
            cls.journal_entries = None
            cls.quizzes = None
            cls.quiz_attempts = None
            cls.study_sessions = None
            cls.study_messages = None
            cls.rag_evaluations = None
            cls.notifications = None
            cls.audit_logs = None

    @classmethod
    def get_db(cls) -> AsyncDatabase:
        """Return the database instance. Raises RuntimeError if not connected."""
        if cls._db is None:
            raise RuntimeError("DatabaseClient has not been connected. Call connect() first.")
        return cls._db

    @classmethod
    async def create_indexes(cls) -> None:
        """Create all required indexes.

        Called automatically on app startup (see lifespan in main.py).
        Each call is idempotent — MongoDB skips indexes that already exist.
        """
        for coll_attr, index_defs in cls._INDEXES.items():
            coll = getattr(cls, coll_attr)
            if coll is None:
                continue
            for keys, kwargs in index_defs:
                await coll.create_index(keys, **kwargs)

    @staticmethod
    def to_object_id(value: str | ObjectId) -> ObjectId:
        """Convert a string id to ObjectId for Mongo lookups and references."""
        return value if isinstance(value, ObjectId) else ObjectId(value)
