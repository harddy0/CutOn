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
    """Generates aggregate dashboard stats with minimal database impact.

    Performance strategy
    --------------------
    * All queries run sequentially (not in parallel) to avoid overwhelming
      the database — especially important on M0 Atlas free tier.
    * Uses simple ``count_documents`` calls instead of ``$facet`` aggregations,
      which are much lighter on shared clusters.
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

        # ── Run queries sequentially to avoid overwhelming the DB ──────
        # Simple count_documents calls are much lighter than $facet
        # aggregations on shared M0 clusters.

        total_topics = await self._topics.count_documents({"user_id": oid})
        total_sources = await self._sources.count_documents({"user_id": oid})
        total_quizzes = await self._quizzes.count_documents({"user_id": oid})
        total_sessions = await self._sessions.count_documents({"user_id": oid})
        active_sessions = await self._sessions.count_documents(
            {"user_id": oid, "status": "active"}
        )
        unread_notifications = await self._notifications.count_documents(
            {"user_id": oid, "is_read": False}
        )

        total_journals = await self._journals.count_documents({"user_id": oid})
        journals_last_7 = await self._journals.count_documents(
            {"user_id": oid, "created_at": {"$gte": seven_days_ago}}
        )
        journals_embedded = await self._journals.count_documents(
            {"user_id": oid, "embedding_status": "COMPLETED"}
        )

        total_chunks = await self._chunks.count_documents({"user_id": oid})
        chunks_embedded = await self._chunks.count_documents(
            {"user_id": oid, "embedding_status": "COMPLETED"}
        )

        total_rag_queries = await self._rag_evaluations.count_documents({"user_id": oid})
        total_rag_rated = await self._rag_evaluations.count_documents(
            {"user_id": oid, "user_rating": {"$ne": None}}
        )
        positive_ratings = await self._rag_evaluations.count_documents(
            {"user_id": oid, "user_rating": 1}
        )

        quiz_avg = await self._compute_avg_quiz_score(oid)

        # ── Derived values ─────────────────────────────────────────────
        rag_positive_rate = (
            round(positive_ratings / total_rag_rated * 100, 1)
            if total_rag_rated > 0
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
