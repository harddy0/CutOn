import asyncio
import time
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from pymongo.asynchronous.collection import AsyncCollection

from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.dashboard.dto import DashboardStatsResponse

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache
# ---------------------------------------------------------------------------

_CACHE: dict[str, tuple[float, DashboardStatsResponse]] = {}
_CACHE_TTL_SECONDS = 60


def _cache_get(key: str) -> Optional[DashboardStatsResponse]:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        del _CACHE[key]
        return None
    return value


def _cache_set(key: str, value: DashboardStatsResponse) -> None:
    _CACHE[key] = (time.monotonic() + _CACHE_TTL_SECONDS, value)


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class DashboardService:
    """Generates aggregate dashboard stats with minimal database round‑trips.

    Performance strategy
    --------------------
    * Multi‑metric collections use a single ``$facet`` aggregation instead of
      N separate ``count_documents`` calls (1 network hop instead of N).
    * All per‑collection pipelines run concurrently via ``asyncio.gather``.
    * Results are cached in‑memory for 60 seconds so the database is only hit
      once per minute per user.
    """

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)

    # ------------------------------------------------------------------
    # Collection helpers
    # ------------------------------------------------------------------

    @property
    def _topics(self) -> AsyncCollection:
        coll = self._db.topics
        assert coll is not None
        return coll

    @property
    def _journals(self) -> AsyncCollection:
        coll = self._db.journal_entries
        assert coll is not None
        return coll

    @property
    def _sources(self) -> AsyncCollection:
        coll = self._db.sources
        assert coll is not None
        return coll

    @property
    def _chunks(self) -> AsyncCollection:
        coll = self._db.document_chunks
        assert coll is not None
        return coll

    @property
    def _quizzes(self) -> AsyncCollection:
        coll = self._db.quizzes
        assert coll is not None
        return coll

    @property
    def _quiz_attempts(self) -> AsyncCollection:
        coll = self._db.quiz_attempts
        assert coll is not None
        return coll

    @property
    def _sessions(self) -> AsyncCollection:
        coll = self._db.study_sessions
        assert coll is not None
        return coll

    @property
    def _notifications(self) -> AsyncCollection:
        coll = self._db.notifications
        assert coll is not None
        return coll

    @property
    def _rag_evaluations(self) -> AsyncCollection:
        coll = self._db.rag_evaluations
        assert coll is not None
        return coll

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------

    async def get_stats(self, user_id: str) -> DashboardStatsResponse:
        # ── Check cache first ──────────────────────────────────────────
        cached = _cache_get(user_id)
        if cached is not None:
            return cached

        oid = ObjectId(user_id)
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)

        # ── Fire all collection aggregations in parallel ───────────────
        (
            journal_counts,
            chunk_counts,
            rag_counts,
            total_topics,
            total_sources,
            total_quizzes,
            quiz_avg,
            active_sessions,
            total_sessions,
            unread_notifications,
        ) = await asyncio.gather(
            # Journals — 3 counts in 1 $facet
            self._journals.aggregate([
                {"$match": {"user_id": oid}},
                {
                    "$facet": {
                        "total": [{"$count": "value"}],
                        "last_7": [
                            {"$match": {"created_at": {"$gte": seven_days_ago}}},
                            {"$count": "value"},
                        ],
                        "embedded": [
                            {"$match": {"embedding_status": "COMPLETED"}},
                            {"$count": "value"},
                        ],
                    }
                },
            ]).to_list(length=1),

            # Chunks — 2 counts in 1 $facet
            self._chunks.aggregate([
                {"$match": {"user_id": oid}},
                {
                    "$facet": {
                        "total": [{"$count": "value"}],
                        "embedded": [
                            {"$match": {"embedding_status": "COMPLETED"}},
                            {"$count": "value"},
                        ],
                    }
                },
            ]).to_list(length=1),

            # RAG evaluations — 3 counts in 1 $facet
            self._rag_evaluations.aggregate([
                {"$match": {"user_id": oid}},
                {
                    "$facet": {
                        "total": [{"$count": "value"}],
                        "positive": [
                            {"$match": {"user_rating": 1}},
                            {"$count": "value"},
                        ],
                        "rated": [
                            {"$match": {"user_rating": {"$ne": None}}},
                            {"$count": "value"},
                        ],
                    }
                },
            ]).to_list(length=1),

            # Single-count collections (kept as simple count_documents)
            self._topics.count_documents({"user_id": oid}),
            self._sources.count_documents({"user_id": oid}),
            self._quizzes.count_documents({"user_id": oid}),
            self._compute_avg_quiz_score(oid),  # Single aggregation
            self._sessions.count_documents({"user_id": oid, "status": "active"}),
            self._sessions.count_documents({"user_id": oid}),
            self._notifications.count_documents({"user_id": oid, "is_read": False}),
        )

        # ── Extract facet results ──────────────────────────────────────

        def _facet_val(data: list[dict], key: str) -> int:
            """Extract a count from a ``$facet`` result bucket."""
            bucket = data[0].get(key, []) if data else []
            return bucket[0]["value"] if bucket else 0

        total_journals = _facet_val(journal_counts, "total")
        journals_last_7 = _facet_val(journal_counts, "last_7")
        journals_embedded = _facet_val(journal_counts, "embedded")

        total_chunks = _facet_val(chunk_counts, "total")
        chunks_embedded = _facet_val(chunk_counts, "embedded")

        total_rag_queries = _facet_val(rag_counts, "total")
        positive_ratings = _facet_val(rag_counts, "positive")
        total_ratings = _facet_val(rag_counts, "rated")

        # ── Derived values ─────────────────────────────────────────────
        rag_positive_rate = (
            round(positive_ratings / total_ratings * 100, 1)
            if total_ratings > 0
            else 0.0
        )

        # Recent activity (fast — last 5, indexed on user_id)
        recent_logs = await self._audit.list_logs(user_id=user_id, limit=5)

        result = DashboardStatsResponse(
            total_topics=total_topics,
            total_journals=total_journals,
            journals_last_7_days=journals_last_7,
            journals_embedded=journals_embedded,
            total_sources=total_sources,
            total_chunks=total_chunks,
            chunks_embedded=chunks_embedded,
            total_quizzes=total_quizzes,
            avg_quiz_score=quiz_avg,
            active_sessions=active_sessions,
            total_sessions=total_sessions,
            unread_notifications=unread_notifications,
            total_rag_queries=total_rag_queries,
            rag_positive_rate=rag_positive_rate,
            recent_activity=recent_logs,
            generated_at=now,
        )

        # ── Cache before returning ─────────────────────────────────────
        _cache_set(user_id, result)
        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _compute_avg_quiz_score(self, user_oid: ObjectId) -> float:
        """Return the average score percentage across all quiz attempts."""
        pipeline = [
            {"$match": {"user_id": user_oid}},
            {
                "$group": {
                    "_id": None,
                    "avg_score": {"$avg": "$score"},
                    "avg_max": {"$avg": "$max_score"},
                }
            },
        ]
        cursor = await self._quiz_attempts.aggregate(pipeline)
        result = await cursor.to_list(length=1)
        if not result:
            return 0.0
        avg_score = result[0].get("avg_score", 0) or 0
        avg_max = result[0].get("avg_max", 0) or 1
        if avg_max == 0:
            return 0.0
        return round(avg_score / avg_max * 100, 1)
