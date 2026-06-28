<div align="center">

<br />

# CutOn

**Your knowledge, deconstructed. Reconstructed.**

Hybrid RAG learning system — ingest PDFs, write journal entries, chat with an AI Study Buddy, 
and generate blind-spot quizzes. Everything stays yours.

<br />

<p>
  <a href="#-features"><strong>Features</strong></a> ·
  <a href="#-quick-start"><strong>Quick Start</strong></a> ·
  <a href="#-architecture"><strong>Architecture</strong></a> ·
  <a href="#%EF%B8%8F-tech-stack"><strong>Tech Stack</strong></a> ·
  <a href="apps/backend/README.md"><strong>Backend Docs</strong></a>
</p>

<br />

</div>

---

## Overview

CutOn turns a folder of PDFs and scattered notes into a living, queryable knowledge base. 
Instead of just collecting files, you actually learn from them.

The engine uses a **hybrid RAG** approach — queries run simultaneously against document chunks 
*and* personal journal entries, then merge results by relevance with full provenance tracking.

> No files stored. Documents are parsed, chunked, embedded into a vector index, then discarded. 
> Zero-storage pipeline. No cloud bills. No privacy risk.

---

## Features

**Ephemeral Ingestion** — Upload PDFs and TXT files. They're parsed, chunked, embedded, then discarded. No lingering bloat.

**Hybrid Semantic Search** — Every query hits your document chunks *and* journal entries simultaneously. Results merged by relevance with source provenance.

**AI Study Buddy** — A tutor that answers exclusively from your own materials. No hallucination, no generic fluff. Suggests journal entries and quizzes as you go.

**Blind-Spot Quizzes** — The engine compares what you've uploaded against what you've journaled. It generates targeted quizzes exposing what you haven't internalized yet.

**Learning Journal** — Personal notes, reflections, and debugging logs. Each entry is embedded alongside source docs, making everything searchable.

**Smart Notifications** — Get notified when document processing completes, embeddings finish, and more.

---

## Workflow

```
Upload → Chunk → Embed → Journal → Query → Quiz
```

| Step | What happens |
|------|-------------|
| **01** — Upload & Ingest | Drop a PDF or TXT into a topic folder. Backend chunks & embeds in the background. No files stored. |
| **02** — Learn & Journal | Study at your own pace. Write journal entries about breakthroughs & bugs. Each entry is embedded. |
| **03** — Search & Master | Query your combined knowledge with AI. Retrieve relevant chunks + journal context. Generate blind-spot quizzes. |

---

## Quick Start

**Prerequisites:** Python 3.13+, MongoDB, Redis, Google AI Studio API key (Gemini)

```bash
# Frontend
npm install
npm run dev -w web

# Backend (separate terminal)
cd apps/backend
python -m venv .venv
# source .venv/bin/activate  (Linux/Mac)
# .venv\Scripts\activate     (Windows)
pip install -r requirements.txt
cp .env.example .env          # Edit with your keys
uvicorn app.main:app --reload --port 8000
```

Minimum env vars: `GEMINI_API_KEY`, `MONGO_URI`, `JWT_SECRET`

---

## Architecture

```
┌──────────────────────────────────────────┐
│            Next.js Frontend               │
│  Dashboard · Study Buddy · Quizzes · etc │
└─────────────────┬────────────────────────┘
                  │ REST + SSE
┌─────────────────▼────────────────────────┐
│            FastAPI Backend                │
│  Auth · Sources · Journal · Query · Chat  │
│  Quizzes · Notifications · RAG · Audit    │
└──────┬─────────────────────┬─────────────┘
       │                     │
┌──────▼──────┐     ┌───────▼───────┐
│   MongoDB   │     │    Redis      │
│  (Primary)  │     │  Cache+Broker │
└─────────────┘     └───────────────┘
       │
┌──────▼──────────────────────────────────┐
│          Gemini AI (Google)             │
│  Embeddings · Chat · Quiz Generation    │
└─────────────────────────────────────────┘
```

### Backend Modules

| Module | Purpose |
|--------|---------|
| `auth` | JWT auth with forgot/reset password flow |
| `users` | Profiles & role management |
| `topics` | Learning topic organization |
| `documents` | File upload, parsing, chunking (PDF/TXT) |
| `journal` | Personal learning journal with embeddings |
| `query` | Hybrid RAG search (documents + journals) |
| `study_buddy` | AI chat with context-aware tutoring |
| `quizzes` | Blind-spot & topic review quiz generation |
| `rag_evaluation` | RAG response quality ratings |
| `notifications` | In-app notifications |
| `dashboard` | Aggregated stats with Redis caching |
| `audit` | Admin audit logging |
| `embeddings` | Background vector embedding via Celery |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Backend** | FastAPI, Pydantic v2, Python 3.13+ |
| **Database** | MongoDB (Atlas Vector Search) |
| **Cache** | Redis (caching + Celery broker) |
| **AI** | Google Gemini (embedding, chat, generation) |
| **Background Jobs** | Celery |
| **Auth** | JWT (HS256) |
| **Email** | Brevo |
| **Monitoring** | Sentry |
| **Deployment** | Docker (single image, multi-purpose) |

---

## Backend Docs

For detailed deployment, environment variables, CLI commands, and database operations:

- [Backend Operations Guide](apps/backend/README.md)
- [Database Indexes — Atlas Vector Search](apps/backend/docs/INDEXES.md)
- [Study Buddy — AI tutor system prompt & behavior](apps/backend/docs/STUDY_BUDDY.md)

---

<div align="center">

<br />

Built with sweat, late-night coffee, and the belief that learning should be systematic.

<br />

<sub>CutOn © 2026</sub>

</div>
