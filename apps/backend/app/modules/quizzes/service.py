import json
import logging
import math
import random
from datetime import datetime
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from google import genai
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.embeddings.service import EmbeddingsService
from app.modules.quizzes.dto import (
    AnswerSubmission,
    GenerateQuizRequest,
    GradedAnswerResponse,
    QuizAttemptResponse,
    QuizQuestionResponse,
    QuizOptionResponse,
    QuizResponse,
    QuizSummaryResponse,
    SubmitAttemptRequest,
)

logger = logging.getLogger(__name__)

# ── Pass threshold ─────────────────────────────────────────────────────
PASS_THRESHOLD_PCT = 60  # Score >= 60% counts as passed

# ── LLM prompt for quiz generation ────────────────────────────────────

QUIZ_GENERATION_PROMPT = """\
You are a learning assessment engine. Generate a {num_questions}-question multiple-choice quiz \
that tests the user's understanding of concepts they have READ about but NOT yet written about.

Below are two sets of context:

--- SOURCE DOCUMENT CHUNKS (the user has read these, but likely hasn't mastered them) ---
{blind_spot_chunks}

--- JOURNAL ENTRIES (the user HAS written about these — they already know this) ---
{journal_samples}

INSTRUCTIONS:
1. Generate a quiz with approximately {num_questions} questions (a bit more or less is fine).
2. Focus the quiz on concepts that appear in the SOURCE DOCUMENTS but are ABSENT from the journal entries.
3. Each question must be genuinely answerable from the provided source document context.
4. Each question must have exactly 4 options with exactly one correct answer.
5. Assign "source_type" as "document_chunk" for all questions (they come from the docs).
6. For "source_reference", use a short citation like "filename.pdf, p.5" from the chunk metadata.
7. Make questions challenging but fair — they should expose real knowledge gaps.

Return ONLY valid JSON in this exact structure (no markdown, no backticks):
{{
  "title": "A short, descriptive title for this quiz",
  "questions": [
    {{
      "id": "q1",
      "type": "multiple_choice",
      "question": "The question text here?",
      "options": [
        {{"id": "a", "text": "First option"}},
        {{"id": "b", "text": "Second option"}},
        {{"id": "c", "text": "Third option"}},
        {{"id": "d", "text": "Fourth option"}}
      ],
      "correct_answer": "a",
      "points": 1,
      "source_type": "document_chunk",
      "source_reference": "filename.pdf, p.5"
    }}
  ]
}}
"""


# ═══════════════════════════════════════════════════════════════════════
# Pure-Python vector helpers (no numpy needed)
# ═══════════════════════════════════════════════════════════════════════


def _dot(a: list[float], b: list[float]) -> float:
    """Dot product of two vectors."""
    return sum(x * y for x, y in zip(a, b))


def _norm(v: list[float]) -> float:
    """L2 norm of a vector."""
    return math.sqrt(sum(x * x for x in v))


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors. Returns 0 if either is zero-vector."""
    denom = _norm(a) * _norm(b)
    if denom == 0:
        return 0.0
    return _dot(a, b) / denom


def _cosine_distance(a: list[float], b: list[float]) -> float:
    """Cosine distance = 1 - cosine similarity. Range [0, 2]."""
    return 1.0 - _cosine_similarity(a, b)


def _centroid(vectors: list[list[float]]) -> list[float]:
    """Element-wise average of all vectors. Returns zero-vector if empty."""
    if not vectors:
        return []
    n = len(vectors)
    dim = len(vectors[0])
    result = [0.0] * dim
    for vec in vectors:
        for i, val in enumerate(vec):
            result[i] += val
    return [v / n for v in result]


# ═══════════════════════════════════════════════════════════════════════
# Service
# ═══════════════════════════════════════════════════════════════════════


class QuizzesService:
    """Generates blind-spot quizzes via vector delta analysis, and manages
    quiz CRUD + attempt grading."""

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)
        self._embedder = EmbeddingsService()
        self._llm: Optional[genai.Client] = None

    # ------------------------------------------------------------------
    # Collection helpers
    # ------------------------------------------------------------------

    @property
    def _quizzes_collection(self) -> AsyncCollection:
        coll = self._db.quizzes
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _attempts_collection(self) -> AsyncCollection:
        coll = self._db.quiz_attempts
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
    def _sources_collection(self) -> AsyncCollection:
        coll = self._db.sources
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _topics_collection(self) -> AsyncCollection:
        coll = self._db.topics
        assert coll is not None, "Database not connected"
        return coll

    @property
    def _llm_client(self) -> genai.Client:
        if self._llm is None:
            self._llm = genai.Client(api_key=settings.gemini_api_key)
        return self._llm

    # ------------------------------------------------------------------
    # Topic ownership check (reused pattern from TopicsService)
    # ------------------------------------------------------------------

    async def _assert_topic_owner(self, topic_id: str, user_id: str) -> dict:
        coll = self._db.topics
        assert coll is not None
        try:
            oid = ObjectId(topic_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid topic_id format")
        doc = await coll.find_one({"_id": oid})
        if doc is None:
            raise HTTPException(status_code=404, detail="Topic not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this topic",
            )
        return dict(doc)

    async def _assert_quiz_owner(self, quiz_id: str, user_id: str) -> dict:
        coll = self._quizzes_collection
        try:
            oid = ObjectId(quiz_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid quiz_id format")
        doc = await coll.find_one({"_id": oid})
        if doc is None:
            raise HTTPException(status_code=404, detail="Quiz not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this quiz",
            )
        return dict(doc)

    # ══════════════════════════════════════════════════════════════════
    # Topic resolution from human language query
    # ══════════════════════════════════════════════════════════════════

    async def _resolve_topic_by_query(
        self, user_id: str, query: str
    ) -> str:
        """Embed the user's query and find the closest topic by name+description.

        Returns the matching topic_id string.
        Always returns the closest topic (no hard rejection threshold), similar
        to how the query module always returns results.
        """
        # 1. Fetch all user's topics
        cursor = self._topics_collection.find(
            {"user_id": ObjectId(user_id)},
            {"name": 1, "description": 1},
        )
        topics: list[dict] = []
        async for doc in cursor:
            topics.append(doc)

        if not topics:
            raise HTTPException(
                status_code=400,
                detail="You have no topics yet. Create a topic first before generating a quiz.",
            )

        # 2. Embed the query
        query_vector = self._embedder.embed_text(query)

        # 3. Score each topic by cosine similarity
        best_match: Optional[tuple[float, dict]] = None
        for topic in topics:
            topic_text = topic["name"]
            if topic.get("description"):
                topic_text += " " + topic["description"]
            topic_vector = self._embedder.embed_text(topic_text)
            score = _cosine_similarity(query_vector, topic_vector)

            if best_match is None or score > best_match[0]:
                best_match = (score, topic)

        # 4. Always return the closest match (like query module — no hard threshold)
        assert best_match is not None  # topics list is non-empty
        score, topic = best_match
        logger.info(
            "Resolved query '%s' to topic '%s' (similarity: %.3f)",
            query, topic["name"], score,
        )
        return str(topic["_id"])

    # ══════════════════════════════════════════════════════════════════
    # Blind-spot delta analysis
    # ══════════════════════════════════════════════════════════════════

    async def _run_delta_analysis(
        self,
        topic_id: ObjectId,
        user_id: ObjectId,
        num_blind_spots: int = 10,
        num_journal_samples: int = 3,
    ) -> tuple[list[dict], list[dict], bool]:
        """Compare document chunk vectors vs journal entry vectors for a topic.

        Returns
        -------
        blind_spot_chunks : list[dict]
            Top-K document chunks with text + provenance, sorted by blind-spot severity.
        journal_samples : list[dict]
            A few random journal entries for LLM context (so it knows what the user
            already knows).
        has_journal_data : bool
            Whether journals were available for the delta analysis.
        """
        # 1. Fetch journal embeddings for this topic
        journal_cursor = self._journals_collection.find(
            {
                "user_id": user_id,
                "topic_id": topic_id,
                "embedding_status": "COMPLETED",
                "embedding": {"$ne": []},
            },
            {"embedding": 1, "content": 1, "created_at": 1},
        )
        journal_docs: list[dict] = []
        async for doc in journal_cursor:
            journal_docs.append(doc)

        has_journal_data = len(journal_docs) > 0

        # 2. Fetch document chunk embeddings for this topic
        chunk_cursor = self._chunks_collection.find(
            {
                "user_id": user_id,
                "topic_id": topic_id,
                "embedding_status": "COMPLETED",
                "embedding": {"$ne": []},
            },
            {"embedding": 1, "text": 1, "source_id": 1, "chunk_index": 1},
        )
        chunk_docs: list[dict] = []
        async for doc in chunk_cursor:
            chunk_docs.append(doc)

        if not chunk_docs:
            raise HTTPException(
                status_code=400,
                detail="No processed document chunks found for this topic. Upload documents first.",
            )

        # 3. Resolve source filenames for provenance
        source_ids = {doc["source_id"] for doc in chunk_docs}
        source_map: dict[str, str] = {}
        cursor = self._sources_collection.find(
            {"_id": {"$in": list(source_ids)}},
            {"original_filename": 1},
        )
        async for src in cursor:
            source_map[str(src["_id"])] = src.get("original_filename", "unknown")

        # 4. Build blind-spot ranking
        if has_journal_data:
            # Compute journal centroid
            journal_vectors = [doc["embedding"] for doc in journal_docs]
            journal_centroid = _centroid(journal_vectors)

            # Score each chunk by cosine distance from centroid
            scored_chunks: list[tuple[float, dict]] = []
            for doc in chunk_docs:
                dist = _cosine_distance(doc["embedding"], journal_centroid)
                scored_chunks.append((dist, doc))

            # Sort by distance descending (furthest from journals = biggest blind spot)
            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            top_chunks = [doc for _, doc in scored_chunks[:num_blind_spots]]
        else:
            # No journals — sample random chunks (general knowledge quiz)
            top_chunks = random.sample(
                chunk_docs, min(num_blind_spots, len(chunk_docs))
            )

        # 5. Format blind-spot chunks with provenance
        blind_spot_chunks: list[dict] = []
        for doc in top_chunks:
            sid = str(doc["source_id"])
            filename = source_map.get(sid, "unknown")
            blind_spot_chunks.append({
                "text": doc["text"],
                "source_reference": f"{filename}, chunk {doc['chunk_index']}",
            })

        # 6. Sample journal entries for LLM context
        journal_samples: list[dict] = []
        if journal_docs:
            samples = random.sample(
                journal_docs, min(num_journal_samples, len(journal_docs))
            )
            for j in samples:
                created = j.get("created_at", "")
                date_str = (
                    created.isoformat()[:10]
                    if isinstance(created, datetime)
                    else str(created)[:10]
                )
                journal_samples.append({
                    "text": j["content"][:1000],  # Truncate for token budget
                    "date": date_str,
                })

        return blind_spot_chunks, journal_samples, has_journal_data

    # ══════════════════════════════════════════════════════════════════
    # LLM Quiz generation
    # ══════════════════════════════════════════════════════════════════

    def _format_blind_spot_context(self, chunks: list[dict]) -> str:
        lines: list[str] = []
        for i, c in enumerate(chunks, 1):
            lines.append(
                f"[Chunk {i} — Source: {c['source_reference']}]\n{c['text'][:2000]}\n"
            )
        return "\n".join(lines)

    def _format_journal_context(self, entries: list[dict]) -> str:
        if not entries:
            return "No journal entries available for this topic."
        lines: list[str] = []
        for e in entries:
            lines.append(f"[Journal: {e['date']}]\n{e['text']}\n")
        return "\n".join(lines)

    def _call_llm_for_quiz(
        self, prompt: str, num_questions: int
    ) -> dict:
        """Call Gemini with structured JSON output and return the parsed quiz dict."""
        response = self._llm_client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
            },
        )

        raw = response.text.strip() if response.text else ""
        if not raw:
            raise HTTPException(
                status_code=502,
                detail="LLM returned an empty response during quiz generation",
            )

        try:
            quiz_data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("LLM returned invalid JSON (attempt 1): %s", exc)
            # Retry once with stricter prompt
            retry_prompt = (
                prompt
                + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no backticks, no extra text."
            )
            response = self._llm_client.models.generate_content(
                model=settings.gemini_model,
                contents=retry_prompt,
                config={
                    "response_mime_type": "application/json",
                },
            )
            raw = response.text.strip() if response.text else ""
            try:
                quiz_data = json.loads(raw)
            except json.JSONDecodeError:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to generate a valid quiz after retry. Please try again.",
                )

        # Basic validation
        if "questions" not in quiz_data or not isinstance(quiz_data["questions"], list):
            raise HTTPException(
                status_code=502,
                detail="LLM returned a malformed quiz structure. Please try again.",
            )

        if len(quiz_data["questions"]) != num_questions:
            logger.info(
                "LLM returned %d questions (requested ~%d). Accepting as-is.",
                len(quiz_data["questions"]),
                num_questions,
            )

        return quiz_data

    # ══════════════════════════════════════════════════════════════════
    # Public: generate quiz
    # ══════════════════════════════════════════════════════════════════

    async def generate(
        self, user_id: str, payload: GenerateQuizRequest
    ) -> QuizResponse:
        """Run blind-spot delta analysis, call Gemini, persist quiz, return it.

        Accepts either a ``topic_id`` (direct MongoDB ObjectId) or a ``query``
        (human language, e.g. "I want a quiz on React state management").
        If a ``query`` is provided, the closest matching topic is resolved
        via embedding similarity.
        """
        num_questions = max(1, min(payload.num_questions or 10, 25))

        # ── Resolve topic_id (direct or via query) ─────────────────────
        if payload.topic_id:
            topic_id = payload.topic_id
        elif payload.query:
            topic_id = await self._resolve_topic_by_query(user_id, payload.query)
        else:
            # Should not happen — validated by GenerateQuizRequest model
            raise HTTPException(
                status_code=400,
                detail="Provide either 'topic_id' or 'query'",
            )

        topic_oid = self._resolve_oid(topic_id, "topic_id")
        user_oid = self._resolve_oid(user_id, "user_id")

        # Verify topic ownership
        await self._assert_topic_owner(topic_id, user_id)

        # Run delta analysis
        blind_spot_chunks, journal_samples, has_journal_data = (
            await self._run_delta_analysis(topic_oid, user_oid, num_blind_spots=num_questions * 2)
        )

        # Build prompt
        blind_spot_count = len(blind_spot_chunks)
        blind_spot_context = self._format_blind_spot_context(blind_spot_chunks)
        journal_context = self._format_journal_context(journal_samples)
        prompt = QUIZ_GENERATION_PROMPT.format(
            num_questions=num_questions,
            blind_spot_chunks=blind_spot_context,
            journal_samples=journal_context,
        )

        # Call LLM
        quiz_data = self._call_llm_for_quiz(prompt, num_questions)

        # Build questions for response
        now = datetime.utcnow()
        questions_response = []
        for q in quiz_data.get("questions", []):
            options = [
                QuizOptionResponse(id=opt["id"], text=opt["text"])
                for opt in q.get("options", [])
            ]
            questions_response.append(
                QuizQuestionResponse(
                    id=q.get("id", ""),
                    type=q.get("type", "multiple_choice"),
                    question=q.get("question", ""),
                    options=options,
                    source_type=q.get("source_type", "document_chunk"),
                    source_reference=q.get("source_reference", ""),
                )
            )

        # Persist to MongoDB (store the full structured quiz including correct answers)
        title = quiz_data.get("title", f"Quiz — {topic_id}")

        # Map questions to the schema format (with correct_answer for grading)
        schema_questions = []
        for q in quiz_data.get("questions", []):
            schema_questions.append({
                "id": q.get("id", ""),
                "type": q.get("type", "multiple_choice"),
                "question": q.get("question", ""),
                "options": [{"id": o["id"], "text": o["text"]} for o in q.get("options", [])],
                "correct_answer": q.get("correct_answer", ""),
                "points": q.get("points", 1),
                "source_type": q.get("source_type", "document_chunk"),
                "source_reference": q.get("source_reference", ""),
                # Placeholder — blind-spot quiz aggregates context from multiple chunks
                "source_reference_id": ObjectId(),
            })

        insert_doc = {
            "user_id": user_oid,
            "topic_id": topic_oid,
            "title": title,
            "generated_at": now,
            "blind_spot_count": blind_spot_count,
            "has_journal_data": has_journal_data,
            "questions": schema_questions,
        }

        result = await self._quizzes_collection.insert_one(insert_doc)
        quiz_id = str(result.inserted_id)

        await self._audit.log(
            user_id,
            "quiz.generate",
            "quiz",
            quiz_id,
            {"topic_id": topic_id, "question_count": len(schema_questions)},
        )

        return QuizResponse(
            id=quiz_id,
            topic_id=topic_id,
            title=title,
            generated_at=now,
            questions=questions_response,
            blind_spot_count=blind_spot_count,
            has_journal_data=has_journal_data,
            created_at=now,
        )

    # ══════════════════════════════════════════════════════════════════
    # Public: list quizzes
    # ══════════════════════════════════════════════════════════════════

    async def list_quizzes(
        self, user_id: str, topic_id: Optional[str] = None, skip: int = 0, limit: int = 100
    ) -> list[QuizSummaryResponse]:
        coll = self._quizzes_collection
        query: dict = {"user_id": ObjectId(user_id)}
        if topic_id:
            try:
                query["topic_id"] = ObjectId(topic_id)
            except (InvalidId, TypeError):
                raise HTTPException(status_code=400, detail="Invalid topic_id format")

        cursor = (
            coll.find(query)
            .sort("generated_at", -1)
            .skip(skip)
            .limit(limit)
        )

        results: list[QuizSummaryResponse] = []
        async for doc in cursor:
            questions = doc.get("questions", [])
            results.append(
                QuizSummaryResponse(
                    id=str(doc["_id"]),
                    topic_id=str(doc["topic_id"]),
                    title=doc.get("title", ""),
                    question_count=len(questions),
                    generated_at=doc.get("generated_at", doc["_id"].generation_time),
                    blind_spot_count=doc.get("blind_spot_count", 0),
                    has_journal_data=doc.get("has_journal_data", True),
                    created_at=doc.get("generated_at", datetime.utcnow()),
                )
            )
        return results

    # ══════════════════════════════════════════════════════════════════
    # Public: get single quiz
    # ══════════════════════════════════════════════════════════════════

    async def get_quiz(self, quiz_id: str, user_id: str) -> QuizResponse:
        doc = await self._assert_quiz_owner(quiz_id, user_id)
        questions_raw = doc.get("questions", [])

        questions_response = []
        for q in questions_raw:
            options = [
                QuizOptionResponse(id=o["id"], text=o["text"])
                for o in q.get("options", [])
            ]
            questions_response.append(
                QuizQuestionResponse(
                    id=q.get("id", ""),
                    type=q.get("type", "multiple_choice"),
                    question=q.get("question", ""),
                    options=options,
                    source_type=q.get("source_type", "document_chunk"),
                    source_reference=q.get("source_reference", ""),
                )
            )

        return QuizResponse(
            id=str(doc["_id"]),
            topic_id=str(doc["topic_id"]),
            title=doc.get("title", ""),
            generated_at=doc.get("generated_at", datetime.utcnow()),
            questions=questions_response,
            blind_spot_count=doc.get("blind_spot_count", 0),
            has_journal_data=doc.get("has_journal_data", True),
            created_at=doc.get("generated_at", datetime.utcnow()),
        )

    # ══════════════════════════════════════════════════════════════════
    # Public: delete quiz
    # ══════════════════════════════════════════════════════════════════

    async def delete_quiz(self, quiz_id: str, user_id: str) -> None:
        await self._assert_quiz_owner(quiz_id, user_id)
        oid = ObjectId(quiz_id)
        # Cascade: delete attempts too
        await self._attempts_collection.delete_many({"quiz_id": oid})
        await self._quizzes_collection.delete_one({"_id": oid})
        await self._audit.log(user_id, "quiz.delete", "quiz", quiz_id, {})

    # ══════════════════════════════════════════════════════════════════
    # Public: submit attempt (grade)
    # ══════════════════════════════════════════════════════════════════

    async def submit_attempt(
        self, quiz_id: str, user_id: str, payload: SubmitAttemptRequest
    ) -> QuizAttemptResponse:
        quiz_doc = await self._assert_quiz_owner(quiz_id, user_id)
        questions_raw = quiz_doc.get("questions", [])

        # Build lookup: question_id -> correct_answer
        correct_map: dict[str, str] = {}
        points_map: dict[str, int] = {}
        for q in questions_raw:
            qid = q.get("id", "")
            correct_map[qid] = q.get("correct_answer", "")
            points_map[qid] = q.get("points", 1)

        # Grade each answer
        total_score = 0
        max_score = sum(points_map.values())
        graded_answers: list[GradedAnswerResponse] = []

        for submission in payload.answers:
            qid = submission.question_id
            selected = submission.selected_option_id
            correct = correct_map.get(qid, "")
            is_correct = selected == correct
            if is_correct:
                total_score += points_map.get(qid, 1)

            graded_answers.append(
                GradedAnswerResponse(
                    question_id=qid,
                    selected_option_id=selected,
                    correct_option_id=correct,
                    is_correct=is_correct,
                )
            )

        passed = (total_score / max_score * 100) >= PASS_THRESHOLD_PCT if max_score > 0 else False
        now = datetime.utcnow()

        # Persist attempt
        attempt_doc = {
            "quiz_id": ObjectId(quiz_id),
            "user_id": ObjectId(user_id),
            "topic_id": quiz_doc["topic_id"],
            "score": total_score,
            "max_score": max_score,
            "completed_at": now,
            "answers": [
                {
                    "question_id": a.question_id,
                    "selected_option_id": a.selected_option_id,
                    "correct_option_id": a.correct_option_id,
                    "is_correct": a.is_correct,
                }
                for a in graded_answers
            ],
        }

        result = await self._attempts_collection.insert_one(attempt_doc)

        await self._audit.log(
            user_id,
            "quiz.attempt",
            "quiz_attempt",
            str(result.inserted_id),
            {"quiz_id": quiz_id, "score": total_score, "max_score": max_score},
        )

        return QuizAttemptResponse(
            id=str(result.inserted_id),
            quiz_id=quiz_id,
            topic_id=str(quiz_doc["topic_id"]),
            score=total_score,
            max_score=max_score,
            passed=passed,
            answers=graded_answers,
            completed_at=now,
        )

    # ══════════════════════════════════════════════════════════════════
    # Public: list attempts
    # ══════════════════════════════════════════════════════════════════

    async def list_attempts(
        self, quiz_id: str, user_id: str, skip: int = 0, limit: int = 100
    ) -> list[QuizAttemptResponse]:
        # Verify quiz ownership
        quiz_doc = await self._assert_quiz_owner(quiz_id, user_id)
        topic_id = str(quiz_doc["topic_id"])

        cursor = (
            self._attempts_collection.find({"quiz_id": ObjectId(quiz_id), "user_id": ObjectId(user_id)})
            .sort("completed_at", -1)
            .skip(skip)
            .limit(limit)
        )

        results: list[QuizAttemptResponse] = []
        async for doc in cursor:
            answers_raw = doc.get("answers", [])
            graded = [
                GradedAnswerResponse(
                    question_id=a["question_id"],
                    selected_option_id=a["selected_option_id"],
                    correct_option_id=a.get("correct_option_id", ""),
                    is_correct=a["is_correct"],
                )
                for a in answers_raw
            ]
            max_score = doc.get("max_score", 0)
            score = doc.get("score", 0)
            passed = (score / max_score * 100) >= PASS_THRESHOLD_PCT if max_score > 0 else False

            results.append(
                QuizAttemptResponse(
                    id=str(doc["_id"]),
                    quiz_id=quiz_id,
                    topic_id=topic_id,
                    score=score,
                    max_score=max_score,
                    passed=passed,
                    answers=graded,
                    completed_at=doc.get("completed_at", datetime.utcnow()),
                )
            )
        return results

    # ══════════════════════════════════════════════════════════════════
    # Helpers
    # ══════════════════════════════════════════════════════════════════

    @staticmethod
    def _resolve_oid(value: str, field_name: str) -> ObjectId:
        try:
            return ObjectId(value)
        except (InvalidId, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid {field_name}: '{value}' is not a valid ObjectId",
            )
