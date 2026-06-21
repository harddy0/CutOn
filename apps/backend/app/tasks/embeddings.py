import asyncio
import logging

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


# ── Explicit named queue ──────────────────────────────────────────────
# Matches the routing key in celery_app.conf.task_routes so the task is
# always published to the ``embeddings`` queue.  Start the worker with:
#   celery -A app.celery_app worker -Q embeddings --loglevel=info

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
def generate_journal_embedding(self, entry_id: str) -> None:
    """Fetch a journal entry from MongoDB, generate its embedding via the
    Gemini Embedding API, and store the result back.

    Behaviour
    ---------
    * On success → ``embedding_status = "COMPLETED"``, vector persisted.
    * On transient failure → retries with **exponential backoff** (Celery
      built-in).  Worker acknowledges the message *after* completion, so
      a crash mid-task re-delivers it.
    * After all retries exhausted → ``embedding_status = "FAILED"`` with
      ``last_error`` set — a **Dead-Letter-Queue** equivalent at the
      database level so no user data is ever lost.
    """
    db_name = settings.mongo_db_name
    client = _get_mongo()
    db = client[db_name]
    collection = db["journal_entries"]

    # 1. Fetch the document --------------------------------------------
    doc = collection.find_one({"_id": ObjectId(entry_id)})
    if doc is None:
        logger.warning("Journal entry %s not found — skipping embed", entry_id)
        return

    # 2. Generate embedding --------------------------------------------
    retries_so_far = self.request.retries
    service = _get_embeddings_service()

    try:
        embedding = asyncio.run(service.embed_text(doc["content"]))
    except Exception as exc:
        logger.exception(
            "Embedding failed for entry %s (attempt %d/%d) — %s: %s",
            entry_id,
            retries_so_far + 1,
            settings.celery_max_retries + 1,
            type(exc).__name__,
            exc,
        )

        if retries_so_far < settings.celery_max_retries:
            # ── will retry (exponential backoff handled by Celery) ──
            raise self.retry(exc=exc) from exc

        # ── all retries exhausted → DLQ at DB level ────────────────
        collection.update_one(
            {"_id": ObjectId(entry_id)},
            {
                "$set": {
                    "embedding_status": "FAILED",
                    "last_error": f"{type(exc).__name__}: {exc}",
                    "retry_count": retries_so_far,
                }
            },
        )
        logger.error(
            "All retries exhausted for entry %s — marked FAILED. Error: %s: %s",
            entry_id,
            type(exc).__name__,
            exc,
        )
        # Re-raise so Celery logs the final failure
        raise

    # 3. Success — store embedding -------------------------------------
    collection.update_one(
        {"_id": ObjectId(entry_id)},
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
    logger.info("Embedding COMPLETED for entry %s (retries: %d)", entry_id, retries_so_far)
