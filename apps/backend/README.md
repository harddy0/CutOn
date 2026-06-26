# CutOn Backend — Operations Guide

Operations reference for the FastAPI backend. Covers local development, Docker,
CLI commands, and deployment.

---

## Table of Contents

- [CLI Quick Reference](#cli-quick-reference)
- [Local Development](#local-development)
- [Docker](#docker)
- [Render Deployment](#render-deployment)
- [Other Providers](#other-providers)
- [Environment Variables](#environment-variables)
- [Database Operations](#database-operations)
- [Common Tasks](#common-tasks)

---

## CLI Quick Reference

```bash
npm run dev              # Start dev server with hot reload (port 8000)
npm run dev:worker       # Start Celery worker for background embeddings
npm run start            # Start production server
npm run start:worker     # Start production Celery worker
npm run db:reset         # Drop all data + reseed with sample records
npm run db:indexes       # Create Atlas Search vector indexes (M2+ clusters)
```

All scripts assume a Windows environment with `.venv`. On Linux/Mac, replace
`.venv\\Scripts\\activate.bat` with `source .venv/bin/activate`.

---

## Local Development

### Prerequisites

- Python 3.13+
- MongoDB (local or Atlas)
- Redis (local or cloud, e.g. Upstash)
- Google AI Studio API key (for Gemini)

### Setup

```bash
# 1. Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Linux/Mac
.venv\Scripts\activate             # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env               # Linux/Mac
copy .env.example .env             # Windows
# Edit .env — set at minimum: GEMINI_API_KEY, MONGO_URI

# 4. Start dependencies
mongod                             # Terminal 1
redis-server                       # Terminal 2

# 5. Initialize database (creates collections, indexes, sample data)
python -m app.db.reset

# 6. Start API server
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs

# 7. (Optional) Start Celery worker for background embedding
celery -A app.celery_app worker -Q embeddings --loglevel=info
```

---

## Docker

The Docker image is **one image, two purposes**. The same image can run either
the API server, the Celery worker, or both together — controlled by the
`SERVICE` env var.

### Build

```bash
docker build -t cuton-backend .
```

### Run — API server

```bash
docker run -p 8000:8000 \
  -e MONGO_URI="mongodb+srv://..." \
  -e GEMINI_API_KEY="..." \
  -e JWT_SECRET="..." \
  cuton-backend
```

This starts the FastAPI server on port 8000 with a health check at `/health`.

### Run — Celery worker

```bash
docker run \
  -e SERVICE=worker \
  -e MONGO_URI="mongodb+srv://..." \
  -e GEMINI_API_KEY="..." \
  -e REDIS_URL="redis://..." \
  cuton-backend
```

### Run — API server + Celery worker

```bash
docker run \
  -e SERVICE=both \
  -e MONGO_URI="mongodb+srv://..." \
  -e GEMINI_API_KEY="..." \
  -e REDIS_URL="redis://..." \
  cuton-backend
```

This is the portfolio-friendly mode: one container runs the FastAPI server in
the foreground and starts the Celery worker alongside it.

### How it works

`docker-entrypoint.sh` checks the `SERVICE` env var:

- `SERVICE=api` (default) → runs `uvicorn app.main:app`
- `SERVICE=worker` → runs `celery -A app.celery_app worker`
- `SERVICE=both` → runs uvicorn and Celery worker in the same container

No separate images needed. One build, two run modes.

### Available env vars at runtime

| Env var           | Default      | For                        |
| ----------------- | ------------ | -------------------------- |
| `SERVICE`         | `api`        | `api`, `worker`, or `both` |
| `UVICORN_WORKERS` | `1`          | Number of uvicorn workers  |
| `CELERY_LOGLEVEL` | `info`       | Worker log level           |
| `CELERY_QUEUES`   | `embeddings` | Celery queues to consume   |

---

## Render Deployment

[Render](https://render.com) supports running **multiple services** from the
**same Docker image**. You create two services in the same Render project:

### 1. Web Service (API)

| Setting               | Value                                                              |
| --------------------- | ------------------------------------------------------------------ |
| **Source**            | Your Git repo                                                      |
| **Build Command**     | `docker build -t cuton-backend .` (Render auto-detects Dockerfile) |
| **Start Command**     | (Leave empty — entrypoint handles it)                              |
| **Service Type**      | Web Service                                                        |
| **Health Check Path** | `/health`                                                          |
| **Environment**       | Add all env vars from `.env.example`                               |

Render will run the container with default `SERVICE=api`, which starts uvicorn.
The API must bind to Render's assigned `PORT`, which the entrypoint now reads
automatically.

### 2. Worker (Celery)

| Setting           | Value                                 |
| ----------------- | ------------------------------------- |
| **Source**        | Same repo, same Dockerfile            |
| **Service Type**  | Background Worker                     |
| **Start Command** | (Leave empty — entrypoint handles it) |
| **Environment**   | Add same env vars + `SERVICE=worker`  |

Render runs the **same Docker image**, but the `SERVICE=worker` env var tells
the entrypoint to start Celery instead of uvicorn.
Use a **Background Worker** service here; a Web Service will fail with "no port
detected" because Celery does not listen on HTTP ports.

> **Why not one container with both?** The API and worker have different resource
> profiles. The API needs memory for HTTP connections; the worker needs CPU for
> embedding generation. Separate containers let you scale them independently
> (e.g., 2 API instances + 1 worker). If a worker crashes, the API stays up.

---

## Other Providers

### Railway

Same pattern — create two services from the same image:

```
railway service: web     → SERVICE=api
railway service: worker  → SERVICE=worker
```

### Fly.io

```toml
# fly.toml (web)
[env]
  SERVICE = "api"

# Separate fly.toml or process group for worker:
# fly deploy --config fly.worker.toml
```

```toml
# fly.worker.toml
[env]
  SERVICE = "worker"
```

### Docker Compose (local dev)

```yaml
services:
  api:
    build: .
    ports: ["8000:8000"]
    environment:
      SERVICE: api
      MONGO_URI: mongodb://mongo:27017/cuton_db
      REDIS_URL: redis://redis:6379/0

  worker:
    build: .
    environment:
      SERVICE: worker
      MONGO_URI: mongodb://mongo:27017/cuton_db
      REDIS_URL: redis://redis:6379/0
    depends_on: [api]

  mongo:
    image: mongo:7
  redis:
    image: redis:7-alpine
```

---

## Environment Variables

See `.env.example` for the full list with defaults. Minimum required for
production:

| Variable         | Why it's required                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `MONGO_URI`      | Database connection                                                                               |
| `GEMINI_API_KEY` | All AI features (query, study buddy, quizzes, embeddings)                                         |
| `JWT_SECRET`     | Auth token signing — generate with `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `CORS_ORIGINS`   | Your frontend domain(s), comma-separated                                                          |

Important optional ones:

| Variable                   | Default                 | Purpose                               |
| -------------------------- | ----------------------- | ------------------------------------- |
| `REDIS_HOST` / `REDIS_URL` | `localhost` / —         | Redis for Celery + dashboard cache    |
| `SENTRY_DSN`               | —                       | Error monitoring                      |
| `BREVO_API_KEY`            | —                       | Transactional email (forgot password) |
| `ENVIRONMENT`              | `development`           | Set to `production` in production     |
| `FRONTEND_URL`             | `http://localhost:5173` | Used in password reset emails         |

---

## Database Operations

### Reset database

Drops all collections and reseeds with sample data:

```bash
npm run db:reset
# or
python -m app.db.reset
```

To only drop data without seeding:

```bash
python -m app.db.reset -- --clear-only
```

### Create Atlas Search vector indexes

Creates the `vector_index_chunks` and `vector_index_journals` indexes needed
for semantic search. Works on **M2+ Atlas clusters** (not M0 free tier).

```bash
npm run db:indexes
# or
python -m app.db.create_indexes
```

If you're on M0, create these indexes manually via the Atlas UI using the
definitions in [`docs/INDEXES.md`](docs/INDEXES.md).

### What gets seeded

| Data          | Details                                                 |
| ------------- | ------------------------------------------------------- |
| Admin user    | `admin@cuton.app` / `AdminPassword123!`                 |
| Test user     | `test@cuton.app` / `TestPassword123!`                   |
| Topic         | "React State Management"                                |
| Source doc    | 3 chunks about useState, useReducer, Context API        |
| Journal entry | Personal reflection on useReducer (with real embedding) |

---

## Common Tasks

### Check health

```bash
curl http://localhost:8000/health
# → {"status":"ok","project":"CutOn Backend","database":"connected"}
```

### View API docs

```
http://localhost:8000/docs      # Swagger UI
http://localhost:8000/redoc     # ReDoc
```

### Run type checking

```bash
mypy app/
```

### Run the Celery worker standalone (outside Docker)

```bash
celery -A app.celery_app worker -Q embeddings --loglevel=info
```

The worker processes two task types:

- `generate_journal_embedding` — embeds journal entries
- `generate_document_chunk_embedding` — embeds document chunks

On Windows, Celery uses the `solo` pool (forced in `celery_app.py`). On Linux,
it uses `prefork` for multi-process parallelism.

### Generate a secure JWT_SECRET

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
