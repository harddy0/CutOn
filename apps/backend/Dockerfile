# ──────────────────────────────────────────────────────────────────────────────
#  Dockerfile — CutOn Backend
#  ──────────────────────────────────────────────────────────────────────────────
#  Multi-stage build that produces a lean production image (Python 3.13 slim).
#
#  Environment variables are configured via the provider's dashboard or
#  a .env file mounted at runtime.  See app/core/config.py for the full list.
#
#  Usage:
#    docker build -t cuton-backend .
#    docker run -p 8000:8000 cuton-backend                  # FastAPI server
#    docker run -e SERVICE=worker cuton-backend              # Celery worker
#    docker run -e SERVICE=both cuton-backend                # FastAPI + Celery worker
# ──────────────────────────────────────────────────────────────────────────────

# ==============================================================================
#  STAGE 1 — Builder
# ==============================================================================

FROM python:3.13-slim AS builder

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system build dependencies needed for bcrypt (Rust impl), cffi, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc-dev \
    rustc \
    cargo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ==============================================================================
#  STAGE 2 — Runner (lean production image)
# ==============================================================================

FROM python:3.13-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000

# Install ONLY runtime system dependencies — no build tools in the final image
RUN apt-get update && apt-get install -y --no-install-recommends \
    libffi8 \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 --ingroup app app

WORKDIR /app

# Copy installed Python packages from builder stage
COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY app/ ./app/

# Copy entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create runtime directories and set ownership
RUN mkdir -p /app/uploads && \
    chown -R app:app /app

# Switch to non-root user
USER app

# Expose the FastAPI port
EXPOSE 8000

# Health check — pings the /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Use the entrypoint so SERVICE=worker runs Celery instead
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default: run the FastAPI server (single worker — providers scale horizontally)
CMD []
