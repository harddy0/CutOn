from datetime import datetime

from bson import ObjectId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection
from pymongo import ReturnDocument

from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.topics.dto import CreateTopicRequest, UpdateTopicRequest, TopicResponse


class TopicsService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)

    # ------------------------------------------------------------------ helpers

    @property
    def _topics_collection(self) -> AsyncCollection:
        coll = self._db.topics
        assert coll is not None, "Database not connected — call DatabaseClient.connect() first"
        return coll

    @staticmethod
    def _format_topic(doc: dict) -> TopicResponse:
        """Convert a raw MongoDB topic document into the API response model."""
        return TopicResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            name=doc["name"],
            description=doc.get("description"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    @staticmethod
    def _build_set(payload: UpdateTopicRequest) -> dict:
        """Build a $set dict from non-None fields of an update payload."""
        return payload.model_dump(exclude_none=True)

    # ------------------------------------------------------------------ ownership check

    async def _assert_owner(self, topic_id: str, user_id: str) -> dict:
        """Fetch a topic and verify the user owns it. Returns the topic doc or raises 403/404."""
        collection = self._topics_collection
        doc = await collection.find_one({"_id": ObjectId(topic_id)})
        if doc is None:
            raise HTTPException(status_code=404, detail="Topic not found")
        if str(doc["user_id"]) != user_id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action on this topic",
            )
        return dict(doc)

    # ------------------------------------------------------------------ owner-scoped lookup

    async def find_by_id_for_user(self, topic_id: str, user_id: str) -> TopicResponse:
        """Retrieve a topic, ensuring the authenticated user owns it.

        Raises 404 if not found, 403 if not owned by the user.
        """
        doc = await self._assert_owner(topic_id, user_id)
        return self._format_topic(doc)

    # ------------------------------------------------------------------ crud

    async def create(self, user_id: str, payload: CreateTopicRequest) -> TopicResponse:
        """Insert a new topic for the authenticated user."""
        collection = self._topics_collection

        doc = {
            "user_id": ObjectId(user_id),
            "name": payload.name,
            "description": payload.description,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        result = await collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        await self._audit.log(
            user_id, "topic.create", "topic", str(result.inserted_id), {"name": payload.name}
        )
        return self._format_topic(doc)

    async def find_by_id(self, topic_id: str) -> TopicResponse | None:
        """Retrieve a topic by its MongoDB _id."""
        collection = self._topics_collection
        doc = await collection.find_one({"_id": ObjectId(topic_id)})
        if doc is None:
            return None
        return self._format_topic(dict(doc))

    async def update(self, topic_id: str, user_id: str, payload: UpdateTopicRequest) -> TopicResponse:
        """Partially update a topic, ensuring the user owns it."""
        await self._assert_owner(topic_id, user_id)

        collection = self._topics_collection
        set_fields = self._build_set(payload)
        if not set_fields:
            doc = await collection.find_one({"_id": ObjectId(topic_id)})
            assert doc is not None, "Topic existence confirmed by _assert_owner above"
            return self._format_topic(doc)

        set_fields["updated_at"] = datetime.utcnow()

        result = await collection.find_one_and_update(
            {"_id": ObjectId(topic_id)},
            {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
        assert result is not None, "Topic existence confirmed by _assert_owner above"
        await self._audit.log(
            user_id, "topic.update", "topic", topic_id, {"changed_fields": list(set_fields.keys())}
        )
        return self._format_topic(result)

    async def delete(self, topic_id: str, user_id: str) -> None:
        """Delete a topic, ensuring the user owns it."""
        await self._assert_owner(topic_id, user_id)

        collection = self._topics_collection
        await collection.delete_one({"_id": ObjectId(topic_id)})
        await self._audit.log(user_id, "topic.delete", "topic", topic_id, {})

    async def list_by_user(self, user_id: str, skip: int = 0, limit: int = 100) -> list[TopicResponse]:
        """Return a paginated list of topics belonging to the authenticated user."""
        collection = self._topics_collection
        cursor = (
            collection.find({"user_id": ObjectId(user_id)})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format_topic(doc) async for doc in cursor]
