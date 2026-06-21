from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection
from pymongo import ReturnDocument

from app.core.config import settings
from app.core.dto import PaginatedResponse
from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.journal.dto import (
    CreateJournalEntryRequest,
    UpdateJournalEntryRequest,
    JournalEntryResponse,
)
from app.tasks.embeddings import EMBEDDINGS_QUEUE, generate_journal_embedding


class JournalEntriesService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)

    # ------------------------------------------------------------------ helpers

    @property
    def _journal_collection(self) -> AsyncCollection:
        coll = self._db.journal_entries
        assert coll is not None, "Database not connected — call DatabaseClient.connect() first"
        return coll

    @staticmethod
    def _format_entry(doc: dict) -> JournalEntryResponse:
        """Convert a raw MongoDB journal entry document into the API response model."""
        return JournalEntryResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            topic_id=str(doc["topic_id"]),
            content=doc["content"],
            embedding_status=doc.get("embedding_status", "PENDING"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    @staticmethod
    def _build_set(payload: UpdateJournalEntryRequest) -> dict:
        """Build a $set dict from non-None fields of an update payload."""
        return payload.model_dump(exclude_none=True)

    # ------------------------------------------------------------------ ownership check

    async def _assert_owner(self, entry_id: str, user_id: str) -> dict:
        """Fetch an entry and verify the user owns it. Returns the doc or raises 403/404."""
        collection = self._journal_collection
        try:
            oid = ObjectId(entry_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid journal entry ID format")
        doc = await collection.find_one({"_id": oid})
        if doc is None:
            raise HTTPException(status_code=404, detail="Journal entry not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action on this journal entry",
            )
        return dict(doc)

    # ------------------------------------------------------------------ owner-scoped lookup

    async def find_by_id_for_user(self, entry_id: str, user_id: str) -> JournalEntryResponse:
        """Retrieve an entry, ensuring the authenticated user owns it.

        Raises 404 if not found, 403 if not owned by the user.
        """
        doc = await self._assert_owner(entry_id, user_id)
        return self._format_entry(doc)

    # ------------------------------------------------------------------ crud

    async def create(self, user_id: str, payload: CreateJournalEntryRequest) -> JournalEntryResponse:
        """Insert a new journal entry for the authenticated user.

        The entry is created with ``embedding_status = "PENDING"`` and a
        **background Celery task** is enqueued to generate the embedding
        vector via the Gemini Embedding API.  The API response returns
        **202 Accepted** immediately — the client can poll the entry to
        check when the embedding is ``COMPLETED``.
        """
        collection = self._journal_collection
        now = datetime.now(timezone.utc)

        try:
            topic_oid = ObjectId(payload.topic_id)
        except (InvalidId, TypeError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid topic_id: '{payload.topic_id}' is not a valid ObjectId. It must be a 24-character hex string.",
            )

        doc = {
            "user_id": ObjectId(user_id),
            "topic_id": topic_oid,
            "content": payload.content,
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

        result = await collection.insert_one(doc)
        entry_id = str(result.inserted_id)
        doc["_id"] = result.inserted_id

        # Enqueue background embedding task to the ``embeddings`` queue
        generate_journal_embedding.apply_async(
            args=[entry_id],
            queue=EMBEDDINGS_QUEUE,
        )

        await self._audit.log(
            user_id,
            "journal.create",
            "journal_entry",
            entry_id,
            {"topic_id": payload.topic_id},
        )
        return self._format_entry(doc)

    async def find_by_id(self, entry_id: str) -> JournalEntryResponse | None:
        """Retrieve an entry by its MongoDB _id."""
        collection = self._journal_collection
        try:
            oid = ObjectId(entry_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid journal entry ID format")
        doc = await collection.find_one({"_id": oid})
        if doc is None:
            return None
        return self._format_entry(dict(doc))

    async def update(
        self, entry_id: str, user_id: str, payload: UpdateJournalEntryRequest
    ) -> JournalEntryResponse:
        """Partially update an entry, ensuring the user owns it."""
        await self._assert_owner(entry_id, user_id)

        collection = self._journal_collection
        set_fields = self._build_set(payload)
        if not set_fields:
            doc = await collection.find_one({"_id": ObjectId(entry_id)})
            assert doc is not None, "Entry existence confirmed by _assert_owner above"
            return self._format_entry(doc)

        set_fields["updated_at"] = datetime.now(timezone.utc)

        result = await collection.find_one_and_update(
            {"_id": ObjectId(entry_id)},
            {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
        assert result is not None, "Entry existence confirmed by _assert_owner above"
        return self._format_entry(result)

    async def delete(self, entry_id: str, user_id: str) -> None:
        """Delete an entry, ensuring the user owns it."""
        await self._assert_owner(entry_id, user_id)

        collection = self._journal_collection
        await collection.delete_one({"_id": ObjectId(entry_id)})
        await self._audit.log(user_id, "journal.delete", "journal_entry", entry_id, {})

    async def list_by_user(
        self, user_id: str, skip: int = 0, limit: int = 100
    ) -> PaginatedResponse[JournalEntryResponse]:
        """Return a paginated list of journal entries belonging to the authenticated user."""
        collection = self._journal_collection
        query: dict = {"user_id": ObjectId(user_id)}
        total = await collection.count_documents(query)
        cursor = (
            collection.find(query, {"embedding": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = [self._format_entry(doc) async for doc in cursor]
        return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)

    async def list_by_topic(
        self, user_id: str, topic_id: str, skip: int = 0, limit: int = 100
    ) -> PaginatedResponse[JournalEntryResponse]:
        """Return paginated entries for a specific topic, ensuring user ownership."""
        collection = self._journal_collection
        try:
            topic_oid = ObjectId(topic_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid topic_id format")
        query: dict = {"user_id": ObjectId(user_id), "topic_id": topic_oid}
        total = await collection.count_documents(query)
        cursor = (
            collection.find(query, {"embedding": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = [self._format_entry(doc) async for doc in cursor]
        return PaginatedResponse(items=items, total=total, skip=skip, limit=limit)
