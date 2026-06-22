# CutOn Backend

AI-powered study companion — a FastAPI backend with RAG (Retrieval-Augmented Generation), vector search, adaptive quizzes, and a conversational study buddy.

## Features

- **RAG Query Engine** — Dual-index vector search against document chunks AND journal entries with LLM-powered answer synthesis
- **Study Buddy** — Conversational AI tutor that detects journal-worthy moments and suggests quizzes
- **Adaptive Quizzes** — Blind-spot detection via vector delta analysis (compares document vs. journal embeddings) + topic review mode
- **Document Ingestion** — Upload PDF, DOCX, or TXT files; auto-chunking and background embedding via Celery
- **Journal System** — Personal notes with automatic embedding for semantic search
- **Dashboard** — Statistics with tiered Redis caching and transparent in-memory fallback
- **Auth & Security** — JWT authentication, bcrypt password hashing, role-based access (user/admin), rate limiting, forgot-password flow with Brevo email
- **Audit Logging** — Every operation is logged with actor, action, and resource
- **Notifications** — In-app notification system
- **RAG Evaluation** — Quality tracking with user ratings and LLM-as-judge scoring
- **SSE Streaming** — Real-time token streaming from Gemini for chat and query responses

## Architecture

```
apps/backend/
├── app/
│   ├── main.py               # FastAPI app entry point
│   ├── celery_app.py         # Celery configuration
│   ├── core/                 # Config, security, email, GenAI adapter, DTOs
│   ├── db/                   # MongoDB client, Redis client, schema, reset
│   ├── modules/              # Feature modules (auth, users, topics, etc.)
│   │   ├── auth/             # Register, login, JWT, forgot-password
│   │   ├── users/            # User CRUD, admin deactivation
│   │   ├── topics/           # Study topics CRUD
│   │   ├── journals/         # Journal entries with embedding
│   │   ├── documents/        # Upload, chunking, embedding pipeline
│   │   ├── query/            # Hybrid vector search + LLM synthesis
│   │   ├── quizzes/          # Quiz generation (blind-spot/review), grading
│   │   ├── study_buddy/      # Conversational AI study buddy
│   │   ├── dashboard/        # Aggregated stats with Redis cache
│   │   ├── notifications/    # In-app notifications
│   │   ├── audit/            # Audit logging
│   │   ├── rag_evaluation/   # RAG quality metrics
│   │   └── embeddings/       # Embedding service (shared)
│   └── tasks/                # Celery background tasks
├── docs/                     # Documentation
├── .env.example              # Environment variable template
├── requirements.txt          # Python dependencies
└── mypy.ini                  # Type checking configuration
```

**Key design decisions:**
- Modular monolith — each feature is a self-contained module with router/service/DTO
- Async everything — FastAPI async handlers, async MongoDB driver, thread-pooled AI calls
- MongoDB Atlas Vector Search — native $vectorSearch for semantic retrieval
- Celery background workers — non-blocking embedding generation with exponential backoff
- Redis caching — tiered TTLs by data category with zero-downtime in-memory fallback

## Quick Start

### Prerequisites
- Python 3.12+
- MongoDB (local or Atlas)
- Redis (local or cloud, e.g. Upstash)
- Google AI Studio API key
- (Optional) Brevo API key for transactional email

### 1. Set up Python environment
```bash
git clone <repo-url>
cd apps/backend
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
```

### 2. Configure environment
```bash
copy .env.example .env   # Windows
cp .env.example .env     # Linux/Mac
```

Set at minimum:
- `GEMINI_API_KEY` — Get from [Google AI Studio](https://aistudio.google.com/apikey)
- `MONGO_URI` — Your MongoDB connection string

### 3. Start dependencies
```bash
mongod          # Start local MongoDB
redis-server    # Start local Redis
```

### 4. Initialize the database
```bash
python -m app.db.reset
```
This creates collections, indexes, and seeds sample data (admin + test user, a topic, document chunks, and a journal entry with real embeddings).

### 5. Start the server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/docs for the interactive API documentation.

### 6. Start Celery worker (for background embedding)
```bash
celery -A app.celery_app worker -Q embeddings --loglevel=info
```

## API Overview

| Prefix | Module | Description |
|--------|--------|-------------|
| /api/v1/auth | Auth | Register, login, profile, forgot/reset password |
| /api/v1/users | Users | CRUD, admin deactivation |
| /api/v1/topics | Topics | Study topics CRUD |
| /api/v1/journals | Journals | Journal entries with embedding status |
| /api/v1/sources | Documents | Upload PDF/DOCX/TXT, list chunks, progress |
| /api/v1/query | Query | Hybrid vector search with optional LLM synthesis |
| /api/v1/query/stream | Query | SSE streaming version of query |
| /api/v1/quizzes | Quizzes | Generate quiz (blind-spot/review), attempt, grade |
| /api/v1/study-sessions | Study Buddy | Chat sessions, journal confirmations |
| /api/v1/dashboard | Dashboard | Aggregated stats (5 split endpoints) |
| /api/v1/notifications | Notifications | List, mark read, unread count |
| /api/v1/audit | Audit | Admin audit log viewer |
| /api/v1/rag-evaluations | RAG Evaluation | Quality metrics, admin stats |
| /health | Health | Lightweight health check |

## Deployment

### Critical Environment Variables for Production

See `.env.example` for all options. Essential vars:
- **`JWT_SECRET`** — Use a strong random value (`python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- **`GEMINI_API_KEY`** — Required for all AI features
- **`MONGO_URI`** — MongoDB Atlas URI
- **`SENTRY_DSN`** — [Sentry](https://sentry.io) DSN for error monitoring
- **`CORS_ORIGINS`** — Your frontend domain(s)
- **`ENVIRONMENT`** — Set to `production`

### Infrastructure
1. **MongoDB Atlas** (or self-hosted MongoDB 7.0+) with Atlas Vector Search enabled
2. **Redis** (or Upstash, Redis Cloud, etc.)
3. **Celery worker** — Run as a separate process:
   ```bash
   celery -A app.celery_app worker -Q embeddings --loglevel=info --concurrency=2
   ```
4. **Web server** — Run with multiple workers:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
   ```

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | FastAPI (Python 3.12) |
| Database | MongoDB 7.0+ with Atlas Vector Search |
| Cache | Redis (with in-memory fallback) |
| AI | Google Gemini API (text generation + embeddings) |
| Background Jobs | Celery (Redis broker) |
| Auth | JWT (PyJWT) + bcrypt |
| Email | Brevo (SendinBlue) |
| Monitoring | Sentry (optional) |
| Rate Limiting | SlowAPI |
