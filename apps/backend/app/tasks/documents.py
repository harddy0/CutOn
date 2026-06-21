import asyncio
import logging
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient

from app.celery_app import celery_app
from app.core.config import settings
from app.modules.embeddings.service import EmbeddingsService

logger = logging.getLogger(__name__)

# ── Shared resources (lazy, process-scoped) ───────────────────────────
_mongo_client: MongoClient | None = None
_embeddings_service: EmbeddingsService | None = None


def _get_mongo() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(settings.mongo_uri)
    return _mongo_client


def _get_embeddings_service() -> EmbeddingsService:
    global _embeddings_service
    if _embeddings_service is None:
        _embeddings_service = EmbeddingsService()
    return _embeddings_service


# ── Shared queue with journal embeddings ──────────────────────────────
# Both journal entries and document chunks use the same ``embeddings``
# queue since they consume the same Gemini Embedding API.
EMBEDDINGS_QUEUE = "embeddings"

# ── Task ───────────────────────────────────────────────────────────────


@celery_app.task(
    bind=True,
    queue=EMBEDDINGS_QUEUE,
    max_retries=settings.celery_max_retries,
    default_retry_delay=settings.celery_retry_backoff_sec,
    retry_backoff=True,       # Exponential backoff (60s, 120s, 240s, …)
    retry_backoff_max=settings.celery_retry_backoff_max_sec,  # Cap at N seconds
    retry_jitter=True,        # Add random jitter to avoid thundering herd
    acks_late=True,           # Re-deliver if worker crashes mid-task
    reject_on_worker_lost=True,
)
def generate_document_chunk_embedding(self, chunk_id: str) -> None:
    """Fetch a document chunk from MongoDB, generate its embedding via the
    Gemini Embedding API, and store the result back.

    Behaviour
    ---------
    * On success → ``embedding_status = "COMPLETED"``, vector persisted.
    * On transient failure → retries with **exponential backoff** (Celery
      built-in).  Worker acknowledges the message *after* completion, so
      a crash mid-task re-delivers it.
    * After all retries exhausted → ``embedding_status = "FAILED"`` with
      ``last_error`` set.
    * When all chunks for a source are COMPLETED, the source's
      ``chunking_status`` is updated to ``"COMPLETED"``.
    """
    db_name = settings.mongo_db_name
    client = _get_mongo()
    db = client[db_name]
    chunks_coll = db["document_chunks"]
    sources_coll = db["sources"]

    # 1. Fetch the chunk -----------------------------------------------
    doc = chunks_coll.find_one({"_id": ObjectId(chunk_id)})
    if doc is None:
        logger.warning("Document chunk %s not found — skipping embed", chunk_id)
        return

    source_id = doc["source_id"]

    # 2. Generate embedding --------------------------------------------
    retries_so_far = self.request.retries
    service = _get_embeddings_service()

    try:
        embedding = asyncio.run(service.embed_text(doc["text"]))
    except Exception as exc:
        logger.exception(
            "Embedding failed for chunk %s (attempt %d/%d) — %s: %s",
            chunk_id,
            retries_so_far + 1,
            settings.celery_max_retries + 1,
            type(exc).__name__,
            exc,
        )

        if retries_so_far < settings.celery_max_retries:
            raise self.retry(exc=exc) from exc

        # ── all retries exhausted → DLQ at DB level ────────────────
        chunks_coll.update_one(
            {"_id": ObjectId(chunk_id)},
            {
                "$set": {
                    "embedding_status": "FAILED",
                    "last_error": f"{type(exc).__name__}: {exc}",
                    "retry_count": retries_so_far,
                }
            },
        )
        logger.error(
            "All retries exhausted for chunk %s — marked FAILED. Error: %s: %s",
            chunk_id,
            type(exc).__name__,
            exc,
        )

        # Check if source should be marked FAILED (all chunks failed)
        _update_source_status_if_done(chunks_coll, sources_coll, source_id)
        raise

    # 3. Success — store embedding -------------------------------------
    chunks_coll.update_one(
        {"_id": ObjectId(chunk_id)},
        {
            "$set": {
                "embedding": embedding,
                "embedding_status": "COMPLETED",
                "embedding_model": settings.embedding_model,
                "retry_count": retries_so_far,
                "last_error": None,
            }
        },
    )
    logger.info("Embedding COMPLETED for chunk %s (retries: %d)", chunk_id, retries_so_far)

    # 4. Check if all chunks for this source are done ------------------
    _update_source_status_if_done(chunks_coll, sources_coll, source_id)


def _update_source_status_if_done(
    chunks_coll,
    sources_coll,
    source_id: ObjectId,
) -> None:
    """Update the source's ``chunking_status`` when all chunks have
    reached a terminal state (COMPLETED or FAILED)."""
    source = sources_coll.find_one({"_id": source_id})
    if source is None:
        return

    total = source.get("total_chunks", 0)
    if total == 0:
        return

    done_count = chunks_coll.count_documents({
        "source_id": source_id,
        "embedding_status": {"$in": ["COMPLETED", "FAILED"]},
    })

    if done_count >= total:
        failed_count = chunks_coll.count_documents({
            "source_id": source_id,
            "embedding_status": "FAILED",
        })

        new_status = "FAILED" if failed_count >= total else "COMPLETED"

        sources_coll.update_one(
            {"_id": source_id},
            {"$set": {"chunking_status": new_status}},
        )
        logger.info(
            "Source %s — all chunks done. Status: %s (total=%d, failed=%d)",
            str(source_id),
            new_status,
            total,
            failed_count,
        )

        # ── Notify user when all chunks are successfully embedded ────
        if new_status == "COMPLETED":
            db = chunks_coll.database
            user_id = source.get("user_id")
            filename = source.get("original_filename", "Unknown file")
            notifications_coll = db["notifications"]
            notifications_coll.insert_one({
                "user_id": user_id,
                "type": "document_ready",
                "title": "Document processed",
                "message": f"\u201c{filename}\u201d has been fully ingested and is ready for queries and quizzes.",
                "is_read": False,
                "action_url": None,
                "created_at": datetime.now(timezone.utc),
            })
            logger.info(
                "Notification created for user %s — document '%s' ready",
                str(user_id),
                filename,
            )
