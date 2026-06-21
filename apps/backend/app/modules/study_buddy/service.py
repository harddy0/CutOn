import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from google import genai
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.core.genai_adapter import (
    generate_text_async,
    get_client,
    with_thinking,
)
from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.embeddings.service import EmbeddingsService
from app.modules.study_buddy.dto import (
    ChatRequest,
    ChatResponse,
    ConfirmJournalResponse,
    CreateSessionRequest,
    JournalSuggestion,
    QuizSuggestion,
    StudyMessageResponse,
    StudySessionDetailResponse,
    StudySessionResponse,
    UpdateSessionRequest,
)
from app.tasks.embeddings import EMBEDDINGS_QUEUE, generate_journal_embedding

logger = logging.getLogger(__name__)

VECTOR_INDEX_CHUNKS = "vector_index_chunks"
VECTOR_INDEX_JOURNALS = "vector_index_journals"

# ── Study Buddy System Prompt ──────────────────────────────────────────

STUDY_BUDDY_PROMPT = """\
You are a friendly, encouraging study buddy — like a personal tutor who knows \
the user's uploaded documents and journals inside out.

## PERSONALITY
- Warm and encouraging — use occasional emojis (📚 💡 🎯 ✨ ✅)
- Ask Socratic questions to deepen understanding: "What do you think?" \
"Can you explain that in your own words?"
- Celebrate "aha!" moments genuinely
- Be concise but thorough — 2-4 paragraphs max

## DATA-FIRST APPROACH
The user has uploaded documents and written journal entries about their studies.
Below is the relevant context pulled from their personal data:

--- RELEVANT DOCUMENT CHUNKS ---
{context_chunks}

--- RELEVANT JOURNAL ENTRIES ---
{context_journals}

--- CONVERSATION HISTORY (last 20 messages) ---
{history}

### HOW TO USE EACH DATA TYPE
1. **JOURNAL ENTRIES** (most important) — These are the user's personal notes,\n   reflections, and insights. They represent what the user has already thought\
   about and understood. **Weight these more heavily** than document chunks.\
   Always connect your answer back to the user's own journal entries first.\
   Use citations: [Journal: YYYY-MM-DD]

2. **DOCUMENT CHUNKS** — These are from uploaded reference materials (PDFs,\n   text files). Use them to fill gaps or provide deeper explanations.\
   Use citations: [Doc: filename]

3. **CONVERSATION HISTORY** — The ongoing chat. Maintain continuity by\
   referencing what was discussed earlier.

4. **GENERAL KNOWLEDGE** — Supplement ONLY when the user's data doesn't fully\
   cover the question. Label supplemented parts with "Based on general study\
   techniques…"

## RESPONSE RULES
1. Always start your answer anchored in the user's OWN journal entries — this\
   shows you value their personal notes above all else.
2. Ask yourself: "What did the user write in their journals that relates to\
   this?" and surface those connections explicitly.
3. NEVER say you can't answer — always help them learn using what you have.

## DETECT JOURNAL-WORTHY MOMENTS
Journal-worthy moments include:
- When the user says "I understand/learned/realized X"
- When the user explains a concept in their own words
- When the user connects two concepts together
- When the user asks a particularly deep question
- When the user summarizes what they learned

When you detect a journal-worthy moment, include a journal_suggestion with a \
well-written, concise summary of the insight.
IMPORTANT: Only suggest journals 1-3 times per session at most.

## DETECT QUIZ-WORTHY MOMENTS
- User seems confused about a concept → suggest a quick quiz
- User just learned a major concept → suggest a quiz to solidify
- User has been studying a while → suggest a topic_review quiz

## OUTPUT FORMAT
Respond in this exact JSON structure (no markdown, no backticks):
{{
  "message": "Your warm, natural language response here...",
  "journal_suggestion": null or {{
    "content": "A concise, well-written summary of the insight to save as a journal"
  }},
  "quiz_suggestion": null or {{
    "topic": "The specific topic name",
    "reason": "Brief reason why a quiz would help now"
  }}
}}
"""




class StudyBuddyService:
    """Conversational study partner that uses the user's documents and journals
    as context, detects journal-worthy moments, and suggests quizzes.

    **Data-first, supplement only when necessary** — same philosophy as the
    query engine.
    """

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)
        self._embedder = EmbeddingsService()
    # ------------------------------------------------------------------
    # Collection helpers
    # ------------------------------------------------------------------

    @property
    def _sessions_collection(self) -> AsyncCollection:
        coll = self._db.study_sessions
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _messages_collection(self) -> AsyncCollection:
        coll = self._db.study_messages
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _chunks_collection(self) -> AsyncCollection:
        coll = self._db.document_chunks
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _journals_collection(self) -> AsyncCollection:
        coll = self._db.journal_entries
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _topics_collection(self) -> AsyncCollection:
        coll = self._db.topics
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _llm_client(self) -> genai.Client:
        return get_client()

    # ------------------------------------------------------------------
    # Session CRUD
    # ------------------------------------------------------------------

    async def create_session(
        self, user_id: str, payload: CreateSessionRequest
    ) -> StudySessionResponse:
        """Create a new study session, optionally scoped to a topic."""
        now = datetime.now(timezone.utc)

        # Validate topic_id if provided
        topic_oid = None
        if payload.topic_id:
            try:
                topic_oid = ObjectId(payload.topic_id)
            except (InvalidId, TypeError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid topic_id: '{payload.topic_id}' is not a valid ObjectId. It must be a 24-character hex string.",
                )

        # Auto-generate title from topic name if not provided
        title = payload.title
        if not title and topic_oid:
            topic = await self._topics_collection.find_one({"_id": topic_oid})
            if topic:
                title = f"Study: {topic['name']}"
        if not title:
            title = f"Study Session {now.strftime('%b %d, %Y')}"

        doc = {
            "user_id": ObjectId(user_id),
            "topic_id": topic_oid,
            "title": title,
            "status": "active",
            "message_count": 0,
            "journal_count": 0,
            "created_at": now,
            "updated_at": now,
        }

        result = await self._sessions_collection.insert_one(doc)
        session_id = str(result.inserted_id)
        doc["_id"] = result.inserted_id

        await self._audit.log(
            user_id, "study_session.create", "study_session", session_id,
            {"topic_id": payload.topic_id},
        )

        return self._format_session(doc)

    async def get_session(self, session_id: str, user_id: str) -> StudySessionDetailResponse:
        """Get a session with all its messages."""
        doc = await self._assert_session_owner(session_id, user_id)

        # Fetch messages
        cursor = (
            self._messages_collection
            .find({"session_id": ObjectId(session_id)})
            .sort("created_at", 1)
        )
        messages: list[StudyMessageResponse] = []
        async for msg in cursor:
            messages.append(
                StudyMessageResponse(
                    id=str(msg["_id"]),
                    role=msg["role"],
                    content=msg["content"],
                    metadata=msg.get("metadata", {}),
                    created_at=msg["created_at"],
                )
            )

        return StudySessionDetailResponse(
            id=str(doc["_id"]),
            topic_id=str(doc["topic_id"]) if doc.get("topic_id") else None,
            title=doc["title"],
            status=doc["status"],
            message_count=doc["message_count"],
            journal_count=doc.get("journal_count", 0),
            messages=messages,
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    async def list_sessions(
        self, user_id: str, status: Optional[str] = None,
        skip: int = 0, limit: int = 100,
    ) -> list[StudySessionResponse]:
        """List the user's study sessions, most recent first."""
        query: dict = {"user_id": ObjectId(user_id)}
        if status:
            query["status"] = status

        cursor = (
            self._sessions_collection
            .find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )

        return [self._format_session(doc) async for doc in cursor]

    async def update_session(
        self, session_id: str, user_id: str, payload: UpdateSessionRequest
    ) -> StudySessionResponse:
        """Update a session's title or status."""
        await self._assert_session_owner(session_id, user_id)

        set_fields = payload.model_dump(exclude_none=True)
        if not set_fields:
            doc = await self._sessions_collection.find_one({"_id": ObjectId(session_id)})
            assert doc is not None
            return self._format_session(doc)

        set_fields["updated_at"] = datetime.now(timezone.utc)

        result = await self._sessions_collection.find_one_and_update(
            {"_id": ObjectId(session_id)},
            {"$set": set_fields},
            return_document=True,
        )
        assert result is not None
        return self._format_session(result)

    async def delete_session(self, session_id: str, user_id: str) -> None:
        """Delete a session and all its messages."""
        await self._assert_session_owner(session_id, user_id)
        oid = ObjectId(session_id)
        await self._messages_collection.delete_many({"session_id": oid})
        await self._sessions_collection.delete_one({"_id": oid})
        await self._audit.log(
            user_id, "study_session.delete", "study_session", session_id, {},
        )

    # ------------------------------------------------------------------
    # Chat
    # ------------------------------------------------------------------

    async def chat(
        self, session_id: str, user_id: str, payload: ChatRequest
    ) -> ChatResponse:
        """Send a message to the Study Buddy and get a response with context.

        The Study Buddy:
        1. Searches the user's documents + journals for relevant context
        2. Includes conversation history for continuity
        3. Calls Gemini with structured JSON output
        4. Returns the reply + optional journal/quiz suggestions
        """
        # 1. Verify session ownership
        session = await self._assert_session_owner(session_id, user_id)
        topic_id = session.get("topic_id")

        now = datetime.now(timezone.utc)

        # 2. Save the user's message
        user_msg_result = await self._messages_collection.insert_one({
            "session_id": ObjectId(session_id),
            "role": "user",
            "content": payload.message,
            "metadata": {},
            "created_at": now,
        })
        user_msg_id = str(user_msg_result.inserted_id)

        # 3. Fetch conversation history (last 20 messages)
        history_cursor = (
            self._messages_collection
            .find({"session_id": ObjectId(session_id)})
            .sort("created_at", -1)
            .limit(20)
        )
        history_msgs: list[dict] = []
        async for msg in history_cursor:
            history_msgs.append(msg)
        history_msgs.reverse()  # chronological order

        history_lines = []
        for msg in history_msgs:
            role = "User" if msg["role"] == "user" else "You (Study Buddy)"
            history_lines.append(f"{role}: {msg['content'][:500]}")
        history_text = "\n".join(history_lines) if history_lines else "No previous messages."

        # 4. Search for relevant context via vector search
        context_chunks, context_journals = await self._search_context(
            user_id, payload.message, topic_id
        )

        # 5. Build prompt
        prompt = STUDY_BUDDY_PROMPT.format(
            context_chunks=context_chunks,
            context_journals=context_journals,
            history=history_text,
        )

        # 6. Call Gemini with structured JSON output (async, non-blocking)
        raw = await generate_text_async(
            prompt,
            model=settings.gemini_model,
            config=with_thinking({"response_mime_type": "application/json"}),  # type: ignore[arg-type]
        )
        raw = raw.strip() or "{}"
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("LLM returned invalid JSON: %s", raw[:200])
            parsed = {"message": raw, "journal_suggestion": None, "quiz_suggestion": None}

        reply = parsed.get("message", "I couldn't generate a response. Please try again.")
        journal_data = parsed.get("journal_suggestion")
        quiz_data = parsed.get("quiz_suggestion")

        # 7. Save the assistant's message with metadata
        msg_meta: dict = {}
        if journal_data and journal_data.get("content"):
            msg_meta["journal_suggested"] = True
            msg_meta["journal_content"] = journal_data["content"]

        await self._messages_collection.insert_one({
            "session_id": ObjectId(session_id),
            "role": "assistant",
            "content": reply,
            "metadata": msg_meta,
            "created_at": datetime.now(timezone.utc),
        })

        # 8. Update session message count
        await self._sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$inc": {"message_count": 2}, "$set": {"updated_at": datetime.now(timezone.utc)}},
        )

        # 9. Build response — enforce journal suggestion limit per session
        journal_suggestion = None
        if journal_data and journal_data.get("content"):
            # Count previous journal suggestions made in this session
            prev_suggestions = await self._messages_collection.count_documents({
                "session_id": ObjectId(session_id),
                "role": "assistant",
                "metadata.journal_suggested": True,
            })
            if prev_suggestions < self.MAX_JOURNAL_SUGGESTIONS_PER_SESSION:
                journal_suggestion = JournalSuggestion(
                    message_id=user_msg_id,
                    content=journal_data["content"],
                )
            else:
                logger.info(
                    "Journal suggestion suppressed — limit of %d reached for session %s",
                    self.MAX_JOURNAL_SUGGESTIONS_PER_SESSION,
                    session_id,
                )

        quiz_suggestion = None
        if quiz_data and quiz_data.get("topic"):
            quiz_suggestion = QuizSuggestion(
                topic=quiz_data["topic"],
                reason=quiz_data.get("reason", "A quiz would help solidify this concept."),
            )

        return ChatResponse(
            reply=reply,
            journal_suggestion=journal_suggestion,
            quiz_suggestion=quiz_suggestion,
        )

    MAX_JOURNAL_SUGGESTIONS_PER_SESSION = 3



    # ------------------------------------------------------------------
    # Confirm Journal
    # ------------------------------------------------------------------

    async def confirm_journal(
        self, session_id: str, message_id: str, user_id: str,
    ) -> ConfirmJournalResponse:
        """Confirm a journal suggestion from a chat message.

        Creates a journal entry in the ``journal_entries`` collection with
        ``embedding_status = \"PENDING\"`` and enqueues a background Celery
        task to generate the embedding.
        """
        # 1. Verify session ownership
        session = await self._assert_session_owner(session_id, user_id)

        # 2. Find the user message that triggered the suggestion
        msg_doc = await self._messages_collection.find_one({
            "_id": ObjectId(message_id),
            "session_id": ObjectId(session_id),
            "role": "user",
        })
        if msg_doc is None:
            raise HTTPException(
                status_code=404,
                detail="Message not found in this session",
            )

        # 3. Find the assistant response right after this message
        cursor = (
            self._messages_collection
            .find({
                "session_id": ObjectId(session_id),
                "role": "assistant",
                "created_at": {"$gt": msg_doc["created_at"]},
            })
            .sort("created_at", 1)
            .limit(1)
        )
        assistant_msgs = await cursor.to_list(length=1)
        if not assistant_msgs:
            raise HTTPException(
                status_code=400,
                detail="No assistant response found for this message",
            )
        assistant_msg = assistant_msgs[0]

        # 4. Get the journal content from the assistant message's metadata
        assistant_meta = assistant_msg.get("metadata", {})
        journal_content = assistant_meta.get("journal_content", msg_doc["content"])

        # 4. Get topic_id for the journal
        topic_id = session.get("topic_id")
        if topic_id is None:
            # Try to resolve from the message content — search for closest topic
            topic_id = await self._resolve_topic_for_message(
                str(session["user_id"]), journal_content
            )

        # 5. Create journal entry (same pattern as JournalEntriesService.create)
        now = datetime.now(timezone.utc)
        journal_doc = {
            "user_id": ObjectId(str(session["user_id"])),
            "topic_id": topic_id,
            "content": journal_content,
            "embedding": [],
            "embedding_status": "PENDING",
            "embedding_model": settings.embedding_model,
            "retry_count": 0,
            "last_error": None,
            "start_char": None,
            "end_char": None,
            "created_at": now,
            "updated_at": now,
        }

        result = await self._journals_collection.insert_one(journal_doc)
        journal_id = str(result.inserted_id)

        # 6. Enqueue background embedding task
        # type ignore: Celery's @task decorator confuses Pylance's attr inference
        generate_journal_embedding.apply_async(  # type: ignore[attr-defined]
            args=[journal_id],
            queue=EMBEDDINGS_QUEUE,
        )

        # 7. Mark the assistant message as having created a journal
        if assistant_msg:
            await self._messages_collection.update_one(
                {"_id": assistant_msg["_id"]},
                {"$set": {"metadata.journal_created": journal_id}},
            )

        # 8. Increment journal count on session
        await self._sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$inc": {"journal_count": 1}},
        )

        await self._audit.log(
            str(session["user_id"]),
            "study_session.confirm_journal",
            "journal_entry",
            journal_id,
            {"session_id": session_id, "message_id": message_id},
        )

        return ConfirmJournalResponse(
            journal_id=journal_id,
            content=journal_content,
            status="pending_embedding",
        )

    # ------------------------------------------------------------------
    # Context search (reuses vector search from query module pattern)
    # ------------------------------------------------------------------

    async def _search_context(
        self, user_id: str, message: str, topic_id: Optional[ObjectId]
    ) -> tuple[str, str]:
        """Search document chunks and journal entries relevant to the message.

        Returns formatted context strings for the LLM prompt.
        """
        # Embed the user's message
        query_vector = await self._embedder.embed_text(message)

        # Build filter
        mongo_filter: dict = {"user_id": ObjectId(user_id)}
        if topic_id:
            mongo_filter["topic_id"] = topic_id

        top_k_chunks = 5   # Document chunks — fewer, high-precision
        top_k_journals = 12  # Journal entries — more, catch low-match personal notes

        # ── Search chunks (keep top_k tight — docs are supplementary) ────
        chunk_pipeline: list[dict] = [
            {
                "$vectorSearch": {
                    "index": VECTOR_INDEX_CHUNKS,
                    "queryVector": query_vector,
                    "path": "embedding",
                    "numCandidates": top_k_chunks * 20,
                    "limit": top_k_chunks,
                    "filter": mongo_filter,
                }
            },
            {
                "$lookup": {
                    "from": "sources",
                    "localField": "source_id",
                    "foreignField": "_id",
                    "as": "_source",
                }
            },
            {"$unwind": {"path": "$_source", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "text": 1,
                    "original_filename": {"$ifNull": ["$_source.original_filename", "unknown"]},
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        chunk_lines: list[str] = []
        cursor = await self._chunks_collection.aggregate(chunk_pipeline)
        async for doc in cursor:
            chunk_lines.append(
                f"[Doc: {doc['original_filename']} (score: {doc['score']:.3f})]\n"
                f"{doc['text'][:1500]}\n"
            )

        # ── Search journals (wider net + recent fallback) ───────────────
        journal_pipeline: list[dict] = [
            {
                "$vectorSearch": {
                    "index": VECTOR_INDEX_JOURNALS,
                    "queryVector": query_vector,
                    "path": "embedding",
                    "numCandidates": top_k_journals * 20,
                    "limit": top_k_journals,
                    "filter": mongo_filter,
                }
            },
            {
                "$project": {
                    "_id": 1,
                    "content": 1,
                    "created_at": 1,
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
        ]

        # Track seen journal IDs to avoid duplicates
        seen_journal_ids: set[str] = set()

        journal_lines: list[str] = []
        cursor = await self._journals_collection.aggregate(journal_pipeline)
        async for doc in cursor:
            jid = str(doc["_id"])
            seen_journal_ids.add(jid)
            date_str = ""
            if isinstance(doc.get("created_at"), datetime):
                date_str = doc["created_at"].strftime("%Y-%m-%d")
            journal_lines.append(
                f"[Journal: {date_str} (score: {doc['score']:.3f})]\n"
                f"{doc['content'][:1500]}\n"
            )

        # ── Recent-journals fallback ────────────────────────────────
        # Also fetch the 5 most recent journals from this session's topic
        # (or user-wide if no topic). This ensures the Study Buddy always
        # sees the user's latest personal notes, even if vector similarity
        # is low.
        recent_query: dict = {"user_id": ObjectId(user_id)}
        if topic_id:
            recent_query["topic_id"] = topic_id

        recent_cursor = (
            self._journals_collection
            .find(recent_query, {"_id": 1, "content": 1, "created_at": 1})
            .sort("created_at", -1)
            .limit(5)
        )
        async for doc in recent_cursor:
            jid = str(doc["_id"])
            if jid in seen_journal_ids:
                continue  # Already included from vector search
            seen_journal_ids.add(jid)
            date_str = ""
            if isinstance(doc.get("created_at"), datetime):
                date_str = doc["created_at"].strftime("%Y-%m-%d")
            journal_lines.append(
                f"[Journal: {date_str} (recent)]\n"
                f"{doc['content'][:1500]}\n"
            )

        context_chunks = "\n".join(chunk_lines) if chunk_lines else "No relevant documents found."
        context_journals = "\n".join(journal_lines) if journal_lines else "No relevant journals found."

        return context_chunks, context_journals

    # ------------------------------------------------------------------
    # Topic resolution for journal creation
    # ------------------------------------------------------------------

    async def _resolve_topic_for_message(
        self, user_id: str, content: str
    ) -> ObjectId:
        """Find the closest topic for a message when the session has no topic."""
        cursor = self._topics_collection.find(
            {"user_id": ObjectId(user_id)},
            {"name": 1, "description": 1},
        )
        topics = [doc async for doc in cursor]

        if not topics:
            raise HTTPException(
                status_code=400,
                detail="You have no topics. Create a topic first.",
            )

        query_vector = await self._embedder.embed_text(content)

        # Embed all topic names in parallel, then score by cosine similarity
        topic_texts = []
        for topic in topics:
            text = topic["name"]
            if topic.get("description"):
                text += " " + topic["description"]
            topic_texts.append(text)

        topic_vectors = await asyncio.gather(*[
            self._embedder.embed_text(t) for t in topic_texts
        ])

        best_match: Optional[tuple[float, dict]] = None
        for topic, topic_vector in zip(topics, topic_vectors):
            score = self._cosine_similarity(query_vector, topic_vector)
            if best_match is None or score > best_match[0]:
                best_match = (score, topic)

        assert best_match is not None
        assert isinstance(best_match[1]["_id"], ObjectId)
        return best_match[1]["_id"]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_session(doc: dict) -> StudySessionResponse:
        return StudySessionResponse(
            id=str(doc["_id"]),
            topic_id=str(doc["topic_id"]) if doc.get("topic_id") else None,
            title=doc["title"],
            status=doc["status"],
            message_count=doc["message_count"],
            journal_count=doc.get("journal_count", 0),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    async def _assert_session_owner(self, session_id: str, user_id: str) -> dict:
        try:
            oid = ObjectId(session_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid session_id format")

        doc = await self._sessions_collection.find_one({"_id": oid})
        if doc is None:
            raise HTTPException(status_code=404, detail="Study session not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this session",
            )
        return dict(doc)

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a * norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)  # type: ignore[no-any-return]
