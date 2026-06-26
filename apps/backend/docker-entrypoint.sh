#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  docker-entrypoint.sh — CutOn Backend
#  ──────────────────────────────────────────────────────────────────────────────
#  Entrypoint that runs either the FastAPI server (default) or the Celery
#  worker, controlled by the $SERVICE environment variable.
#
#  Three ways to run:
#    docker run cuton-backend                              # FastAPI (default)
#    docker run -e SERVICE=worker cuton-backend             # Celery worker
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
UVICORN_WORKERS="${UVICORN_WORKERS:-1}"
CELERY_LOGLEVEL="${CELERY_LOGLEVEL:-info}"
CELERY_QUEUES="${CELERY_QUEUES:-embeddings}"

# ── Run ───────────────────────────────────────────────────────────────────────
case "$SERVICE" in
  api)
    exec uvicorn \
      app.main:app \
      --host 0.0.0.0 \
      --port 8000 \
      --workers "$UVICORN_WORKERS" \
      --proxy-headers \
      --forwarded-allow-ips "*"
    ;;
  worker)
    exec celery \
      -A app.celery_app \
      worker \
      -Q "$CELERY_QUEUES" \
      --loglevel="$CELERY_LOGLEVEL"
    ;;
  *)
    echo "ERROR: Unknown SERVICE '$SERVICE'. Use 'api' or 'worker'." >&2
    exit 1
    ;;
esac
