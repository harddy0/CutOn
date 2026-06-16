import sys

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "cuton",
    broker=settings.resolved_redis_broker_url(),
    # No explicit backend — task results are stored directly in MongoDB
    # by the task itself (see app/tasks/embeddings.py).
)

# ── Explicit named queues (like BullMQ in NestJS) ─────────────────────
# Each task is routed to a dedicated queue, making it crystal clear which
# worker consumes which messages.  Start a worker for a specific queue:
#   celery -A app.celery_app worker -Q embeddings --loglevel=info

celery_app.conf.task_routes = {
    "app.tasks.embeddings.generate_journal_embedding": {"queue": "embeddings"},
}

# ── Configuration ──────────────────────────────────────────────────────
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # ── Execution pool ────────────────────────────────────────────────
    # Windows: use ``solo`` (the default ``prefork`` pool uses ``billiard``
    #          which breaks on Windows — access denied, invalid handles).
    # Linux:   ``prefork`` is efficient and well-tested.
    worker_pool=("solo" if sys.platform == "win32" else "prefork"),
    # Retry policy defaults (overridable per-task)
    task_acks_late=True,             # Re-deliver if worker crashes mid-task
    task_reject_on_worker_lost=True, # Reject + re-queue on abnormal exit
    # Auto-discover tasks in the app.tasks package
    imports=["app.tasks.embeddings"],
)
