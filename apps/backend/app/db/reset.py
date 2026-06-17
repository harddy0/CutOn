"""
Database reset — clears all data, seeds sample records, and creates indexes.

This script:
- Drops every collection in the target database.
- Seeds a test user, topic, source document with chunks, and journal entry
  (all with **real embeddings** via the Gemini Embedding API).
- Creates all regular MongoDB application indexes.

After this, you must create Atlas ``$vectorSearch`` indexes **manually**
via the Atlas UI (not possible programmatically on M0 free tier).
See ``docs/INDEXES.md`` for the exact JSON definitions to paste.

Usage
-----
    python -m app.db.reset

Requirements
------------
- A running MongoDB instance (local or Atlas) reachable via ``MONGO_URI``.
- A valid ``GEMINI_API_KEY`` environment variable set in ``.env``.
- All project dependencies installed (``pip install -r requirements.txt``).
"""

import asyncio
import hashlib
import logging
from datetime import datetime

from pymongo import AsyncMongoClient

from app.core.config import settings
from app.core.security import hash_password
from app.db.client import DatabaseClient
from app.modules.embeddings.service import EmbeddingsService

logger = logging.getLogger("app.db.reset")

# ── Seed data ──────────────────────────────────────────────────────────

SEED_USER = {
    "email": "test@cuton.app",
    "password": "TestPassword123!",
    "first_name": "Test",
    "last_name": "User",
}

SEED_TOPIC = {
    "name": "React State Management",
    "description": (
        "Learning React state management patterns including useState, "
        "useReducer, and Context API"
    ),
}

SEED_CHUNKS: list[str] = [
    (
        "React's useState hook is the most basic building block for managing "
        "component state. It allows functional components to hold and update "
        "local state. When the state updates, React re-renders the component "
        "to reflect the new values in the UI. useState returns a pair: the "
        "current state value and a function that lets you update it."
    ),
    (
        "The useReducer hook is an alternative to useState for more complex "
        "state logic. It works similarly to Redux by dispatching actions to a "
        "reducer function. This pattern is ideal when state transitions depend "
        "on previous state or when multiple sub-values need to be updated "
        "together in a predictable way."
    ),
    (
        "React Context API provides a way to pass data through the component "
        "tree without having to pass props down manually at every level. It "
        "solves the prop-drilling problem by creating a provider at the top "
        "level and consuming the context anywhere in the tree. However, it's "
        "not optimized for high-frequency updates."
    ),
]

SEED_JOURNAL = (
    "Finally understood React's useReducer today! I was struggling with a "
    "complex form that had multiple interdependent fields. useState was a mess "
    "with so many individual setters. I refactored everything into a single "
    "reducer with action types like 'UPDATE_FIELD', 'RESET_FORM', and "
    "'SET_VALIDATION_ERRORS'. The code is so much cleaner now and I can trace "
    "every state change through the reducer. Next I need to learn how Context "
    "API works with useReducer for global app state."
)


# ── Helpers ────────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    """Rough token estimate (≈4 chars per token)."""
    return max(1, len(text) // 4)


def _chunk_hash(text: str) -> str:
    """SHA-256 hex digest for deduplication."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ── Main reset logic ───────────────────────────────────────────────────

async def reset() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    conn_str = settings.mongo_uri
    db_name = settings.mongo_db_name

    logger.info("Connecting to MongoDB: %s/%s", conn_str, db_name)
    client = AsyncMongoClient(conn_str)
    db = client[db_name]

    # ── 1. Drop all collections (clear data) ──────────────────────────
    logger.info("Dropping all collections in '%s'…", db_name)
    collections = await db.list_collection_names()
    for name in collections:
        await db[name].drop()
        logger.info("  ✓ Dropped: %s", name)
    logger.info("All collections cleared.\n")

    # ── 2. Seed user ──────────────────────────────────────────────────
    logger.info("Seeding user: %s", SEED_USER["email"])
    now = datetime.utcnow()
    user_doc = {
        "email": SEED_USER["email"],
        "first_name": SEED_USER["first_name"],
        "last_name": SEED_USER["last_name"],
        "password_hash": hash_password(SEED_USER["password"]),
        "role": "user",
        "is_active": True,
        "preferences": {"email_notifications": True},
        "created_at": now,
        "last_login": None,
    }
    result = await db["users"].insert_one(user_doc)
    user_id = result.inserted_id
    logger.info("  ✓ User ID: %s\n", user_id)

    # ── 3. Seed topic ─────────────────────────────────────────────────
    logger.info("Seeding topic: %s", SEED_TOPIC["name"])
    topic_doc = {
        "user_id": user_id,
        "name": SEED_TOPIC["name"],
        "description": SEED_TOPIC["description"],
        "created_at": now,
        "updated_at": now,
    }
    result = await db["topics"].insert_one(topic_doc)
    topic_id = result.inserted_id
    logger.info("  ✓ Topic ID: %s\n", topic_id)

    # ── 4. Seed source document ───────────────────────────────────────
    logger.info("Seeding source document (%d chunks)…", len(SEED_CHUNKS))
    source_doc = {
        "user_id": user_id,
        "topic_id": topic_id,
        "original_filename": "react-state-management-guide.pdf",
        "file_type": "pdf",
        "file_size": 45200,
        "filename": "react-state-management-guide.pdf",
        "file_hash": _chunk_hash("seed_demo_source"),
        "total_chunks": len(SEED_CHUNKS),
        "chunking_status": "COMPLETED",
        "ingested_at": now,
    }
    result = await db["sources"].insert_one(source_doc)
    source_id = result.inserted_id
    logger.info("  ✓ Source ID: %s\n", source_id)

    # ── 5. Generate embeddings & seed chunks ──────────────────────────
    logger.info("Initialising EmbeddingsService (Gemini API)…")
    embedder = EmbeddingsService()

    chunk_docs = []
    for i, text in enumerate(SEED_CHUNKS):
        logger.info("  Generating embedding for chunk %d/%d…", i + 1, len(SEED_CHUNKS))
        embedding = embedder.embed_text(text)
        chunk_docs.append(
            {
                "user_id": user_id,
                "topic_id": topic_id,
                "source_id": source_id,
                "chunk_index": i,
                "metadata": {
                    "page_number": 1,
                    "page_range": "1-3",
                    "tokens": _estimate_tokens(text),
                },
                "text": text,
                "embedding": embedding,
                "chunk_hash": _chunk_hash(text),
                "embedding_model": settings.embedding_model,
                "embedding_status": "COMPLETED",
                "retry_count": 0,
                "last_error": None,
                "start_char": 0,
                "end_char": len(text),
                "created_at": now,
            }
        )

    await db["document_chunks"].insert_many(chunk_docs)
    logger.info("  ✓ Inserted %d chunks with embeddings\n", len(chunk_docs))

    # ── 6. Seed journal entry ─────────────────────────────────────────
    logger.info("Seeding journal entry…")
    logger.info("  Generating embedding…")
    journal_embedding = embedder.embed_text(SEED_JOURNAL)
    journal_doc = {
        "user_id": user_id,
        "topic_id": topic_id,
        "content": SEED_JOURNAL,
        "embedding": journal_embedding,
        "embedding_model": settings.embedding_model,
        "embedding_status": "COMPLETED",
        "retry_count": 0,
        "last_error": None,
        "start_char": None,
        "end_char": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db["journal_entries"].insert_one(journal_doc)
    logger.info("  ✓ Journal entry ID: %s\n", result.inserted_id)

    # ── 7. Create regular MongoDB indexes ─────────────────────────────
    logger.info("Creating regular MongoDB indexes…")
    await DatabaseClient.connect()
    await DatabaseClient.create_indexes()
    await DatabaseClient.close()
    logger.info("  ✓ All application indexes created.\n")

    # ── 8. Summary ────────────────────────────────────────────────────
    logger.info("")
    logger.info("═" * 52)
    logger.info("  Database reset complete — summary")
    logger.info("═" * 52)
    logger.info("  Database:  %s", db_name)
    logger.info("  Collections created: %s", await db.list_collection_names())
    logger.info("  User:      %s  (id: %s)", SEED_USER["email"], user_id)
    logger.info("  Topic:     %s  (id: %s)", SEED_TOPIC["name"], topic_id)
    logger.info("  Source:    %s  (id: %s)", source_doc["original_filename"], source_id)
    logger.info("  Chunks:    %d  (all with embeddings)", len(chunk_docs))
    logger.info("  Journal:   %d entry  (with embedding)", 1)
    logger.info("")
    logger.info("  Password:  %s", SEED_USER["password"])
    logger.info("")
    logger.info("  Next step: create Atlas $vectorSearch indexes manually via the UI")
    logger.info("  See docs/INDEXES.md for the JSON definitions to paste.")
    logger.info("═" * 52)

    await client.close()


def main() -> None:
    asyncio.run(reset())


if __name__ == "__main__":
    main()
