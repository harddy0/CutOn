from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.core.config import settings


class DatabaseClient:
    _client: Optional[AsyncIOMotorClient] = None
    _db: Optional[AsyncIOMotorDatabase] = None

    # Collections — exposed like Prisma fields
    users: Optional[AsyncIOMotorCollection] = None
    topics: Optional[AsyncIOMotorCollection] = None
    sources: Optional[AsyncIOMotorCollection] = None
    document_chunks: Optional[AsyncIOMotorCollection] = None
    journal_entries: Optional[AsyncIOMotorCollection] = None
    quizzes: Optional[AsyncIOMotorCollection] = None
    quiz_attempts: Optional[AsyncIOMotorCollection] = None
    notifications: Optional[AsyncIOMotorCollection] = None
    audit_logs: Optional[AsyncIOMotorCollection] = None

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
            ([("topic_id", 1)], {"name": "idx_sources_topic_id"}),
            ([("file_hash", 1)], {"name": "idx_sources_file_hash"}),
        ],
        "document_chunks": [
            ([("user_id", 1)], {"name": "idx_chunks_user_id"}),
            ([("topic_id", 1)], {"name": "idx_chunks_topic_id"}),
            ([("source_id", 1)], {"name": "idx_chunks_source_id"}),
        ],
        "journal_entries": [
            ([("user_id", 1)], {"name": "idx_journals_user_id"}),
            ([("topic_id", 1)], {"name": "idx_journals_topic_id"}),
        ],
        "quizzes": [
            ([("user_id", 1)], {"name": "idx_quizzes_user_id"}),
            ([("topic_id", 1)], {"name": "idx_quizzes_topic_id"}),
        ],
        "quiz_attempts": [
            ([("quiz_id", 1)], {"name": "idx_attempts_quiz_id"}),
            ([("user_id", 1)], {"name": "idx_attempts_user_id"}),
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
        cls._client = AsyncIOMotorClient(settings.mongo_uri)
        cls._db = cls._client[settings.mongo_db_name]

        # Wire up collections
        cls.users = cls._db.get_collection("users")
        cls.topics = cls._db.get_collection("topics")
        cls.sources = cls._db.get_collection("sources")
        cls.document_chunks = cls._db.get_collection("document_chunks")
        cls.journal_entries = cls._db.get_collection("journal_entries")
        cls.quizzes = cls._db.get_collection("quizzes")
        cls.quiz_attempts = cls._db.get_collection("quiz_attempts")
        cls.notifications = cls._db.get_collection("notifications")
        cls.audit_logs = cls._db.get_collection("audit_logs")

    @classmethod
    async def close(cls) -> None:
        """Close the Mongo client connection."""
        if cls._client is not None:
            cls._client.close()
            cls._client = None
            cls._db = None
            cls.users = None
            cls.topics = None
            cls.sources = None
            cls.document_chunks = None
            cls.journal_entries = None
            cls.quizzes = None
            cls.quiz_attempts = None
            cls.notifications = None
            cls.audit_logs = None

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:
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
