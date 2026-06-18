# Study Buddy — Continuous Learning Assistant

## Overview

The Study Buddy is a conversational AI study partner that goes beyond single-turn
Q&A. It enables **continuous, multi-turn learning** where the user can have a
natural conversation, and the AI automatically captures insights as journal
entries — which then feed back into the system for smarter queries and quizzes.

This creates a **virtuous learning loop**:

```
Upload docs → chunked → embedded → searchable
                                       ↓
User studies with Study Buddy → AI auto-creates journals
                                       ↓
Journals embedded → feed into blind-spot delta
                                       ↓
Next quiz excludes known concepts → focuses on NEW gaps
                                       ↓
User learns more → deeper conversations → more journals → repeats
```

---

## 1. How AI Auto-Creates Journals

The core mechanism is **structured JSON output** from Gemini (same pattern as the
quiz module's `_call_llm_for_quiz`).

### The Flow

```
User: "I finally understand useEffect dependencies now!"
  │
  ▼
POST /study-sessions/{id}/chat  { "message": "..." }
  │
  ▼
1. Backend builds a prompt containing:
   • System instructions + personality
   • Last ~20 messages of conversation history
   • Relevant document chunks (via $vectorSearch)
   • Relevant journal entries (via $vectorSearch)
  │
  ▼
2. Gemini returns structured JSON:
   {
     "message": "That's awesome! 🎯 You've grasped one of...",
     "journal_suggestion": {
       "content": "Today I learned how useEffect dependencies work..."
     },
     "quiz_suggestion": null
   }
  │
  ▼
3. Backend parses:
   • "message" → sent to user as the reply
   • "journal_suggestion" → returned to frontend for user confirmation
   • "quiz_suggestion" → returned to frontend for optional quiz prompt
  │
  ▼
4. Frontend shows inline prompt:
   ┌─────────────────────────────────────┐
   │  🤖 That's awesome! 🎯 You've...   │
   │                                     │
   │  💡 Great insight! Save as journal? │
   │        [Yes!]  [Not now]            │
   └─────────────────────────────────────┘
  │
  ▼
5. User clicks "Yes!"
   → POST /study-sessions/{id}/chat/{msg_id}/confirm-journal
  │
  ▼
6. Backend creates journal entry:
   • Inserts into "journal_entries" collection
   • Sets embedding_status = "PENDING"
  │
  ▼
7. Existing Celery task picks it up:
   • `generate_journal_embedding()` embeds it
   • embedding_status → "COMPLETED"
   • Vector is now searchable
  │
  ▼
8. Next query or quiz seamlessly includes this new journal
```

### Key Design Decisions

| Decision | Why |
|----------|-----|
| **User confirms before saving** | Avoids noise in journal data. The user owns their learning trace. |
| **Structured JSON from LLM** | Single API call = message + suggestions. No separate tool-calling infra needed. |
| **Reuses existing Celery pipeline** | Zero new infrastructure. Journals get embedded automatically. |
| **Suggestions are optional** | The LLM only suggests journals for genuine "aha!" moments (1-3 per session), not every message. |

---

## 2. Data Model

### Collection: `study_sessions`

```json
{
  "_id": ObjectId,
  "user_id": ObjectId,
  "topic_id": ObjectId | null,       // Optional topic scope
  "title": "React Hooks Study Session",
  "status": "active",                 // "active" | "ended"
  "message_count": 24,
  "journal_count": 3,                 // How many journals were created
  "created_at": ISODate,
  "updated_at": ISODate
}
```

### Collection: `study_messages`

Messages are stored separately to avoid MongoDB's 16MB document limit for long
conversations.

```json
{
  "_id": ObjectId,
  "session_id": ObjectId,            // FK to study_sessions
  "role": "user",                     // "user" | "assistant" | "system"
  "content": "...the message text...",
  "metadata": {
    "journal_created": ObjectId | null, // Link to created journal entry
    "has_quiz_suggestion": false
  },
  "created_at": ISODate
}
```

Indexes:
- `study_sessions`: `user_id` + `created_at` (desc)
- `study_messages`: `session_id` + `created_at` (asc)

### Pydantic Schema (to add to `app/db/schema.py`)

```python
class StudySessionDocument(BaseDocument):
    user_id: MongoObjectId
    topic_id: Optional[MongoObjectId] = None
    title: str
    status: str = "active"
    message_count: int = 0
    journal_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StudyMessageDocument(BaseDocument):
    session_id: MongoObjectId
    role: str
    content: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

---

## 3. API Endpoints

### `POST /study-sessions`

Start a new study session (optionally scoped to a topic).

```
Request:
{
  "topic_id": "..." | null,
  "title": "React Hooks" | null     // Auto-generated if omitted
}

Response (201):
{
  "id": "...",
  "topic_id": "..." | null,
  "title": "React Hooks Study Session",
  "status": "active",
  "message_count": 0,
  "created_at": "..."
}
```

### `POST /study-sessions/{id}/chat`

Send a message and get the Study Buddy's response.

```
Request:
{
  "message": "Can you explain useEffect dependencies?"
}

Response (200):
{
  "reply": "Great question! Based on your study materials...",
  "journal_suggestion": {
    "message_id": "...",
    "content": "Today I learned that useEffect..."
  } | null,
  "quiz_suggestion": {
    "topic": "useEffect dependencies",
    "reason": "You're asking great questions, a quiz would solidify this!"
  } | null
}
```

### `POST /study-sessions/{id}/chat/{message_id}/confirm-journal`

Confirm that the user wants to save a journal suggestion.

```
Request: {}

Response (201):
{
  "journal_id": "...",
  "content": "Today I learned that useEffect...",
  "status": "pending_embedding"
}
```

### `GET /study-sessions`

List sessions with pagination + optional filters.

```
Query: { status?, topic_id?, skip?, limit? }

Response: [
  { id, topic_id, title, status, message_count, journal_count, created_at, updated_at }
]
```

### `GET /study-sessions/{id}`

Get full session details with messages.

```
Response:
{
  "id": "...",
  "title": "...",
  "status": "active",
  "messages": [
    { "role": "user", "content": "...", "created_at": "..." },
    { "role": "assistant", "content": "...", "metadata": {...}, "created_at": "..." }
  ],
  "created_at": "..."
}
```

### `PATCH /study-sessions/{id}`

Update session (change title, end session).

```
Request:
{
  "title": "New Title",
  "status": "ended"
}

Response: updated session
```

### `DELETE /study-sessions/{id}`

Delete session + all its messages.

```
Response: 204
```

---

## 4. The Study Buddy Prompt

This is the core of the feature. The prompt guides Gemini to act as a tutor,
use the user's data, detect journal-worthy moments, and return structured JSON.

```python
STUDY_BUDDY_SYSTEM_PROMPT = """\
You are a friendly, encouraging study buddy — like a personal tutor who knows
the user's uploaded documents and journals inside out.

## PERSONALITY
- Warm and encouraging — use occasional emojis (📚 💡 🎯 ✨ ✅)
- Ask Socratic questions: "What do you think?" "Can you explain that?"
- Celebrate "aha!" moments genuinely
- Be concise but thorough — 2-4 paragraphs max

## DATA-FIRST APPROACH
The user has uploaded documents and written journal entries.
Below is their relevant context pulled from vector search:

--- RELEVANT DOCUMENT CHUNKS ---
{context_chunks}

--- RELEVANT JOURNAL ENTRIES ---
{context_journals}

--- CONVERSATION HISTORY (last 20 messages) ---
{history}

1. Always start your answer anchored in the user's own data.
2. Use citations: [Doc: filename] or [Journal: date]
3. Supplement with general knowledge only when their data is sparse.
4. NEVER say you can't answer — always help them learn.

## DETECT JOURNAL-WORTHY MOMENTS
Journal-worthy moments include:
- "I understand/learned/realized X"
- Explaining a concept in their own words
- Connecting two concepts together ("X is like Y because...")
- Asking a deep/insightful question
- Summarizing what they learned

For these moments, include a journal_suggestion.
IMPORTANT: Only suggest journals 1-3 times per session at most — don't ask on
every message.

## DETECT QUIZ-WORTHY MOMENTS
- User seems confused → suggest a quiz to practice
- User just learned a major concept → suggest a quiz to solidify
- User has been studying a while → suggest a topic_review quiz

## OUTPUT FORMAT
Respond in this exact JSON format:

{
  "message": "Your natural language response here...",
  "journal_suggestion": null or {
    "content": "A concise, well-written summary of the insight to save as a journal entry"
  },
  "quiz_suggestion": null or {
    "topic": "The specific topic name",
    "reason": "Brief reason why a quiz would help now"
  }
}
"""
```

### Context Building

Each chat request builds context via the **existing query engine approach**:

```python
async def _build_chat_context(self, user_id, topic_id, message):
    """Search documents + journals for context relevant to this message."""
    # 1. Embed the user's message
    query_vector = self._embedder.embed_text(message)

    # 2. $vectorSearch against document chunks
    chunks = await self._search_chunks(query_vector, user_id, topic_id)

    # 3. $vectorSearch against journal entries
    journals = await self._search_journals(query_vector, user_id, topic_id)

    return chunks, journals
```

---

## 5. Auto-Journal Creation Pipeline

```
User confirms "Save as journal"
  │
  ▼
Backend creates journal entry:
  db.journal_entries.insert_one({
    "user_id": user_id,
    "topic_id": session.topic_id,
    "content": "Today I learned that useEffect...",
    "embedding": [],
    "embedding_status": "PENDING",
    "embedding_model": settings.embedding_model,
    "created_at": datetime.utcnow()
  })
  │
  ▼
Celery task fires:
  generate_journal_embedding.delay(new_journal_id)
  │
  ▼
Worker processes it:
  1. Fetch journal doc
  2. Call Gemini Embedding API
  3. Store embedding vector
  4. Set embedding_status = "COMPLETED"
  │
  ▼
Journal is now searchable and feeds into:
  • Query module   — semantic search includes this journal
  • Quiz module    — blind-spot delta uses this journal
  • Future Study Buddy sessions — context includes this journal
```

---

## 6. Connection to Existing Modules

| Module | How Study Buddy Connects |
|--------|-------------------------|
| **Query** | Uses the same `$vectorSearch` + `EmbeddingsService` to retrieve context for each message |
| **Journals** | Auto-creates journal entries via user confirmation → existing Celery pipeline embeds them |
| **Quizzes** | Proactively suggests quizzes: "You seem unsure about X. Want a 3-question quiz?" |
| **Topics** | Sessions can be scoped to a topic. The AI tailors responses and journal auto-tags to that topic |
| **Audit** | Logs session creation, chat messages, and journal creations |

---

## 7. Implementation Order

1. **Schema & DTOs** — `StudySessionDocument`, `StudyMessageDocument`, request/response models
2. **Study Buddy prompts** — System prompt + context builders
3. **Service** — `StudyBuddyService` with `chat()`, `create_session()`, `confirm_journal()`
4. **Router** — New endpoints under `/study-sessions`
5. **Auth** — Protect all endpoints with `require_user`
6. **Frontend** — Chat UI component (or document for API consumers)

---

## 8. Open Questions

- Should journals auto-created by the Study Buddy be marked differently
  (e.g., `source: "study_buddy"` metadata field) so users know they were
  AI-generated?
- Should we allow the user to edit the journal content before saving?
- Should the Study Buddy be able to create entries in multiple journals,
  or provide a summary of the entire session as one journal entry?
