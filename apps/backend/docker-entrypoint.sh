#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  docker-entrypoint.sh — CutOn Backend
#  ──────────────────────────────────────────────────────────────────────────────
#  Entrypoint that runs either the FastAPI server (default) or the Celery
#  worker, controlled by the $SERVICE environment variable.
#
#  Three ways to run:
#    docker run cuton-backend                               # FastAPI (default)
#    docker run -e SERVICE=worker cuton-backend              # Celery worker
#    docker run -e SERVICE=both cuton-backend                # FastAPI + Celery worker
#    docker run cuton-backend celery -A app.celery_app worker -Q embeddings  # CMD override
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── If arguments are passed, exec them directly (CMD override pattern) ───────
# This supports: docker run cuton-backend celery -A app.celery_app worker ...
if [ $# -gt 0 ]; then
    exec "$@"
fi

# ── Config ────────────────────────────────────────────────────────────────────
SERVICE="${SERVICE:-api}"
PORT="${PORT:-8000}"
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
CELERY_LOGLEVEL="${CELERY_LOGLEVEL:-info}"
CELERY_QUEUES="${CELERY_QUEUES:-embeddings}"

# ── Run ───────────────────────────────────────────────────────────────────────
start_api() {
  exec uvicorn \
    app.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers "$UVICORN_WORKERS" \
    --proxy-headers \
    --forwarded-allow-ips "*"
}

start_worker() {
  exec celery \
    -A app.celery_app \
    worker \
    -Q "$CELERY_QUEUES" \
    --loglevel="$CELERY_LOGLEVEL"
}

case "$SERVICE" in
  api)
    start_api
    ;;
  worker)
    start_worker
    ;;
  both)
    celery \
      -A app.celery_app \
      worker \
      -Q "$CELERY_QUEUES" \
      --loglevel="$CELERY_LOGLEVEL" &
    worker_pid=$!

    cleanup() {
      kill "$worker_pid" 2>/dev/null || true
      wait "$worker_pid" 2>/dev/null || true
    }

    trap cleanup INT TERM EXIT
    start_api
    ;;
  *)
    echo "ERROR: Unknown SERVICE '$SERVICE'. Use 'api', 'worker', or 'both'." >&2
    exit 1
    ;;
esac
