import asyncio
from datetime import datetime, timedelta

from bson import ObjectId
from pymongo.asynchronous.collection import AsyncCollection

from app.db.client import DatabaseClient
from app.db.redis_client import RedisClient
from app.modules.audit.service import AuditService
from app.modules.dashboard.dto import (
    DashboardActivityResponse,
    DashboardLearningResponse,
    DashboardQuizResponse,
    DashboardRagResponse,
    DashboardStatsResponse,
    DashboardSummaryResponse,
)

# ---------------------------------------------------------------------------
# Tiered TTL configuration (seconds per cache category)
#
#   Summary  (topics, sources, sessions, notifications)  →  30 s
#   Learning (journals, chunks, embedding status)        →  60 s
#   Quizzes  (total + avg score)                         →  5 min
#   RAG      (queries + rating rate)                     →  5 min
#   Activity (recent audit logs)                         →  30 s
# ---------------------------------------------------------------------------

_CACHE_TTL: dict[str, int] = {
    "summary": 30,
    "learning": 60,
    "quiz": 300,  # 5 minutes
    "rag": 300,  # 5 minutes
    "activity": 30,
}


def _ttl(prefix: str) -> int:
    """Return the TTL in seconds for *prefix*, raising ``KeyError`` if unknown."""
    if prefix not in _CACHE_TTL:
        msg = f"Unknown cache prefix '{prefix}'. Expected one of: {list(_CACHE_TTL)}"
        raise KeyError(msg)
    return _CACHE_TTL[prefix]


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class DashboardService:
    """Generates dashboard stats grouped by category.

    Each category method has its own TTL cache (backed by Redis with a
    transparent in-memory fallback) so that fast-changing data (e.g. unread
    notifications) refreshes more frequently than slow data (e.g. average
    quiz score).
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
    # Summary — lightweight counts (shortest TTL)
    # ------------------------------------------------------------------

    async def get_summary(self, user_id: str) -> DashboardSummaryResponse:
        cache_key = RedisClient.make_key("summary", user_id)
        cached = await RedisClient.get(cache_key)
        if cached is not None:
            return DashboardSummaryResponse(**cached)

        oid = ObjectId(user_id)

        total_topics = await self._topics.count_documents({"user_id": oid})
        total_sources = await self._sources.count_documents({"user_id": oid})
        total_sessions = await self._sessions.count_documents({"user_id": oid})
        active_sessions = await self._sessions.count_documents(
            {"user_id": oid, "status": "active"}
        )
        unread_notifications = await self._notifications.count_documents(
            {"user_id": oid, "is_read": False}
        )

        result = DashboardSummaryResponse(
            total_topics=total_topics,
            total_sources=total_sources,
            total_sessions=total_sessions,
            active_sessions=active_sessions,
            unread_notifications=unread_notifications,
        )

        await RedisClient.set(cache_key, result, _ttl("summary"))
        return result

    # ------------------------------------------------------------------
    # Learning — journals & embedding progress (medium TTL)
    # ------------------------------------------------------------------

    async def get_learning(self, user_id: str) -> DashboardLearningResponse:
        cache_key = RedisClient.make_key("learning", user_id)
        cached = await RedisClient.get(cache_key)
        if cached is not None:
            return DashboardLearningResponse(**cached)

        oid = ObjectId(user_id)
        now = datetime.utcnow()
        seven_days_ago = now - timedelta(days=7)

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

        result = DashboardLearningResponse(
            total_journals=total_journals,
            journals_last_7_days=journals_last_7,
            journals_embedded=journals_embedded,
            total_chunks=total_chunks,
            chunks_embedded=chunks_embedded,
        )

        await RedisClient.set(cache_key, result, _ttl("learning"))
        return result

    # ------------------------------------------------------------------
    # Quizzes — total count & average score (long TTL)
    # ------------------------------------------------------------------

    async def get_quiz_stats(self, user_id: str) -> DashboardQuizResponse:
        cache_key = RedisClient.make_key("quiz", user_id)
        cached = await RedisClient.get(cache_key)
        if cached is not None:
            return DashboardQuizResponse(**cached)

        oid = ObjectId(user_id)

        total_quizzes = await self._quizzes.count_documents({"user_id": oid})
        avg_quiz_score = await self._compute_avg_quiz_score(oid)

        result = DashboardQuizResponse(
            total_quizzes=total_quizzes,
            avg_quiz_score=avg_quiz_score,
        )

        await RedisClient.set(cache_key, result, _ttl("quiz"))
        return result

    # ------------------------------------------------------------------
    # RAG — quality metrics (long TTL)
    # ------------------------------------------------------------------

    async def get_rag_stats(self, user_id: str) -> DashboardRagResponse:
        cache_key = RedisClient.make_key("rag", user_id)
        cached = await RedisClient.get(cache_key)
        if cached is not None:
            return DashboardRagResponse(**cached)

        oid = ObjectId(user_id)

        total_rag_queries = await self._rag_evaluations.count_documents(
            {"user_id": oid}
        )
        total_rag_rated = await self._rag_evaluations.count_documents(
            {"user_id": oid, "user_rating": {"$ne": None}}
        )
        positive_ratings = await self._rag_evaluations.count_documents(
            {"user_id": oid, "user_rating": 1}
        )

        rag_positive_rate = (
            round(positive_ratings / total_rag_rated * 100, 1)
            if total_rag_rated > 0
            else 0.0
        )

        result = DashboardRagResponse(
            total_rag_queries=total_rag_queries,
            total_rag_rated=total_rag_rated,
            rag_positive_rate=rag_positive_rate,
        )

        await RedisClient.set(cache_key, result, _ttl("rag"))
        return result

    # ------------------------------------------------------------------
    # Activity — recent audit logs (short TTL)
    # ------------------------------------------------------------------

    async def get_activity(
        self, user_id: str, limit: int = 5
    ) -> DashboardActivityResponse:
        cache_key = RedisClient.make_key("activity", user_id)
        cached = await RedisClient.get(cache_key)
        if cached is not None:
            return DashboardActivityResponse(**cached)

        recent_logs = await self._audit.list_logs(user_id=user_id, limit=limit)

        result = DashboardActivityResponse(recent_activity=recent_logs)
        await RedisClient.set(cache_key, result, _ttl("activity"))
        return result

    # ------------------------------------------------------------------
    # Legacy aggregate — calls all split methods
    # ------------------------------------------------------------------

    async def get_stats(self, user_id: str) -> DashboardStatsResponse:
        """Aggregate dashboard statistics (deprecated).

        Builds the combined response from the individual category methods.
        This ensures consistency — the old endpoint and the new split
        endpoints share the same caching and business logic.
        """
        now = datetime.utcnow()

        summary, learning, quiz, rag, activity = await asyncio.gather(
            self.get_summary(user_id),
            self.get_learning(user_id),
            self.get_quiz_stats(user_id),
            self.get_rag_stats(user_id),
            self.get_activity(user_id),
        )

        return DashboardStatsResponse(
            total_topics=summary.total_topics,
            total_sources=summary.total_sources,
            total_sessions=summary.total_sessions,
            active_sessions=summary.active_sessions,
            unread_notifications=summary.unread_notifications,
            total_journals=learning.total_journals,
            journals_last_7_days=learning.journals_last_7_days,
            journals_embedded=learning.journals_embedded,
            total_chunks=learning.total_chunks,
            chunks_embedded=learning.chunks_embedded,
            total_quizzes=quiz.total_quizzes,
            avg_quiz_score=quiz.avg_quiz_score,
            total_rag_queries=rag.total_rag_queries,
            total_rag_rated=rag.total_rag_rated,
            rag_positive_rate=rag.rag_positive_rate,
            recent_activity=activity.recent_activity,
            generated_at=now,
        )

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
