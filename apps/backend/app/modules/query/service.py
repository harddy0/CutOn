import asyncio
import logging
import time
from datetime import datetime
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from google import genai
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.core.genai_adapter import generate_text_async, get_client, with_thinking
from app.db.client import DatabaseClient
from app.modules.embeddings.service import EmbeddingsService
from app.modules.query.dto import QueryRequest, QueryResultItem, QueryResponse
from app.modules.rag_evaluation.service import RAGEvaluationService

logger = logging.getLogger(__name__)

VECTOR_INDEX_CHUNKS = "vector_index_chunks"
VECTOR_INDEX_JOURNALS = "vector_index_journals"

CONTEXT_SYNTHESIS_PROMPT = """\
You are a friendly student tutor — part study buddy, part smart assistant.
Your job is to help the user learn better using their own materials first,
and your general knowledge second.

---
USER'S PERSONAL DATA (documents & journals they uploaded/wrote):
{context}
---

User question: {query}


INSTRUCTIONS:

1. **DATA-FIRST** 🎯
   Always start your answer anchored in the user's own data.
   Cite sources using these tags:
   • [Doc: filename, p.X] = from an uploaded document
   • [Journal: YYYY-MM-DD] = from a journal entry

2. **SUPPLEMENT, DON'T REFUSE** 💡
   If the user's data is sparse, incomplete, or doesn't fully cover the question:
   — Use what you have from their data.
   — Then supplement with your general knowledge to give a complete, helpful answer.
   — Label supplemented parts casually: "Based on general study techniques…" or
     "A general tip that complements this…"
   — NEVER say you can't answer or that there isn't enough data.

3. **STUDENT-FRIENDLY TONE** 😊
   • Warm and encouraging — like a supportive tutor
   • Use occasional emojis (📚 🎯 💡 ✨ ✅ ⭐) — 1 to 3 per answer max, don't overdo it
   • Use "you" and conversational language
   • Keep answers concise (2–4 paragraphs) but thorough enough to actually help

4. **BLEND NATURALLY** 🔗
   Smoothly mix document facts, journal reflections, and general advice so the
   answer feels cohesive — not like separate sections pasted together."""


class QueryService:
    """Executes dual concurrent ``$vectorSearch`` against both document chunks
    and journal entries, then optionally synthesises a natural-language answer
    via the Gemini LLM.

    **Robustness note**
    If the journal vector search returns fewer than ``top_k`` results, the
    remaining slots are filled with the user's most recent journal entries
    so journals are *always* represented in the context sent to the LLM.
    """

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._embedder = EmbeddingsService()
        self._rag_eval = RAGEvaluationService(db_client)

    # ------------------------------------------------------------------ helpers

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

    # ------------------------------------------------------------------ topic resolution

    async def _resolve_topic_by_query(self, user_id: str, topic_query: str) -> str:
        """Embed the user's natural-language topic description and find the
        closest matching topic by name+description similarity.

        Always returns the closest topic (no hard rejection threshold).
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
                detail="You have no topics yet. Create a topic first before scoping a query to one.",
            )

        # 2. Embed the topic query
        query_vector = await self._embedder.embed_text(topic_query)

        # 3. Score each topic by cosine similarity
        best_match: Optional[tuple[float, dict]] = None
        for topic in topics:
            topic_text = topic["name"]
            if topic.get("description"):
                topic_text += " " + topic["description"]
            topic_vector = await self._embedder.embed_text(topic_text)
            score = self._cosine_similarity(query_vector, topic_vector)

            if best_match is None or score > best_match[0]:
                best_match = (score, topic)

        # 4. Always return the closest match
        assert best_match is not None
        score, topic = best_match
        logger.info(
            "Resolved topic_query '%s' to topic '%s' (similarity: %.3f)",
            topic_query, topic["name"], score,
        )
        return str(topic["_id"])

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        """Cosine similarity between two vectors."""
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a * norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    # ------------------------------------------------------------------ search

    async def search(self, user_id: str, payload: QueryRequest) -> QueryResponse:
        """Run a hybrid dual-index vector search with optional LLM synthesis.

        **Flow**
        1. Embed the user's query via the shared ``EmbeddingsService``.
        2. Resolve ``topic_query`` to a ``topic_id`` if provided (natural language).
        3. Fire two ``$vectorSearch`` aggregations **concurrently**:
           - ``vector_index_chunks`` on ``document_chunks``
           - ``vector_index_journals`` on ``journal_entries``
        4. Merge all results, sort descending by ``score``.
        5. If ``synthesize=True`` (default), format results with provenance
           tags and call Gemini to produce a natural-language answer with
           citations.
        """
        # 1. Vectorize the query --------------------------------------------
        _start = time.monotonic()
        query_vector = await self._embedder.embed_text(payload.query)

        # 2. Build filter — always scoped to user, optionally to a topic
        mongo_filter: dict = {
            "user_id": ObjectId(user_id),
        }

        # Resolve topic scope: topic_id (explicit) > topic_query (natural language) > all topics
        resolved_topic_id = payload.topic_id
        if not resolved_topic_id and payload.topic_query:
            resolved_topic_id = await self._resolve_topic_by_query(user_id, payload.topic_query)

        if resolved_topic_id:
            try:
                mongo_filter["topic_id"] = ObjectId(resolved_topic_id)
            except InvalidId:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid topic_id: '{resolved_topic_id}' is not a valid ObjectId. It must be a 24-character hex string.",
                )

        top_k = max(1, min(payload.top_k or 7, 50))  # Sanity clamp

        # 3. Concurrent searches --------------------------------------------

        async def _search_chunks() -> list[QueryResultItem]:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": VECTOR_INDEX_CHUNKS,
                        "queryVector": query_vector,
                        "path": "embedding",
                        "numCandidates": top_k * 20,
                        "limit": top_k,
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
                        "_id": 0,
                        "text": 1,
                        "score": {"$meta": "vectorSearchScore"},
                        "source_id": 1,
                        "chunk_index": 1,
                        "original_filename": {"$ifNull": ["$_source.original_filename", "unknown"]},
                        "page_number": {"$ifNull": ["$metadata.page_number", 1]},
                    }
                },
            ]
            cursor = await self._chunks_collection.aggregate(pipeline)
            results: list[QueryResultItem] = []
            async for doc in cursor:
                results.append(
                    QueryResultItem(
                        source_type="document_chunk",
                        text=doc["text"],
                        score=round(doc["score"], 4),
                        metadata={
                            "source_id": str(doc["source_id"]),
                            "chunk_index": doc["chunk_index"],
                            "original_filename": doc["original_filename"],
                            "page_number": doc["page_number"],
                        },
                    )
                )
            return results

        async def _search_journals() -> list[QueryResultItem]:
            # ── Primary: vector search ─────────────────────────────────
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": VECTOR_INDEX_JOURNALS,
                        "queryVector": query_vector,
                        "path": "embedding",
                        "numCandidates": top_k * 20,
                        "limit": top_k,
                        "filter": mongo_filter,
                    }
                },
                {
                    "$project": {
                        "_id": 1,
                        "text": "$content",
                        "score": {"$meta": "vectorSearchScore"},
                        "created_at": 1,
                    }
                },
            ]
            cursor = await self._journals_collection.aggregate(pipeline)
            seen_ids: set[str] = set()
            results: list[QueryResultItem] = []
            async for doc in cursor:
                doc_id = str(doc["_id"])
                seen_ids.add(doc_id)
                created_at = doc.get("created_at")
                if isinstance(created_at, datetime):
                    created_at = created_at.isoformat()
                else:
                    created_at = str(created_at) if created_at else ""
                results.append(
                    QueryResultItem(
                        source_type="journal_entry",
                        text=doc["text"],
                        score=round(doc["score"], 4),
                        metadata={"created_at": created_at},
                    )
                )

            # ── Fallback: pad with recent entries if short ────────────
            if len(results) < top_k:
                missing = top_k - len(results)
                fallback_filter = dict(mongo_filter)
                if seen_ids:
                    fallback_filter["_id"] = {"$nin": list(seen_ids)}
                cursor = (
                    self._journals_collection.find(fallback_filter)
                    .sort("created_at", -1)
                    .limit(missing)
                )
                async for doc in cursor:
                    created_at = doc.get("created_at")
                    if isinstance(created_at, datetime):
                        created_at = created_at.isoformat()
                    else:
                        created_at = str(created_at) if created_at else ""
                    results.append(
                        QueryResultItem(
                            source_type="journal_entry",
                            text=doc["content"],
                            score=0.01,  # Low score — stays at bottom of merged list
                            metadata={"created_at": created_at},
                        )
                    )

            return results

        # 4. Run both searches concurrently
        chunk_results, journal_results = await asyncio.gather(
            _search_chunks(), _search_journals()
        )

        # 5. Merge & sort by score descending
        all_results = chunk_results + journal_results
        all_results.sort(key=lambda r: r.score, reverse=True)

        # 6. Optional LLM synthesis -----------------------------------------
        answer: Optional[str] = None
        if payload.synthesize and all_results:
            answer = await self._synthesize(payload.query, all_results)

        # Calculate latency
        latency_ms = int((time.monotonic() - _start) * 1000)

        # 7. Auto-log RAG evaluation (fire-and-forget) -----------------------
        try:
            await self._log_rag_evaluation(
                user_id=user_id,
                query=payload.query,
                answer=answer or "",
                results=all_results,
                latency_ms=latency_ms,
            )
        except Exception as exc:
            logger.warning("Failed to log RAG evaluation: %s", exc)

        return QueryResponse(query=payload.query, results=all_results, answer=answer)

    # ------------------------------------------------------------------ RAG evaluation

    async def _log_rag_evaluation(
        self,
        user_id: str,
        query: str,
        answer: str,
        results: list[QueryResultItem],
        latency_ms: int,
    ) -> None:
        """Auto-log the RAG interaction for quality tracking."""
        chunks_for_eval = [
            {"text": r.text, "score": r.score, "source_type": r.source_type}
            for r in results[:5]  # Top 5 chunks
        ]
        await self._rag_eval.log_evaluation(
            user_id=user_id,
            query=query,
            answer=answer or "",
            answer_source="query",
            retrieved_chunks=chunks_for_eval,
            latency_ms=latency_ms,
        )

    # ------------------------------------------------------------------ synthesis

    def _format_context(self, results: list[QueryResultItem]) -> str:
        """Format search results into a tagged context block for the LLM."""
        lines: list[str] = []
        for i, r in enumerate(results, 1):
            if r.source_type == "document_chunk":
                filename = r.metadata.get("original_filename", "unknown")
                page = r.metadata.get("page_number", "?")
                tag = f"[Doc: {filename}, p.{page}]"
            else:
                date = r.metadata.get("created_at", "unknown date")
                tag = f"[Journal: {date[:10] if len(date) > 10 else date}]"

            # Truncate very long texts to stay within token budget
            text = r.text[:2000] if len(r.text) > 2000 else r.text
            lines.append(f"{tag}\n{text}\n")
        return "\n".join(lines)

    async def _synthesize(self, query: str, results: list[QueryResultItem]) -> str:
        """Send the search results + query to Gemini and return a cited answer.

        Runs the synchronous SDK call on a thread pool so the event loop
        stays free for other requests.
        """
        context = self._format_context(results)
        prompt = CONTEXT_SYNTHESIS_PROMPT.format(context=context, query=query)

        answer = await generate_text_async(
            prompt,
            model=settings.gemini_model,
            config=with_thinking(),  # type: ignore[arg-type]
        )
        return answer if answer else "I couldn't generate an answer from the retrieved context."
