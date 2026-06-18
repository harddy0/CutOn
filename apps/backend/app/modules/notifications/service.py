from datetime import datetime
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection

from app.db.client import DatabaseClient
from app.modules.notifications.dto import NotificationResponse


class NotificationsService:
    """Manages user notifications — create, list, mark as read."""

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @property
    def _notifications_collection(self) -> AsyncCollection:
        coll = self._db.notifications
        assert coll is not None, "Database not connected"
        return coll

    @staticmethod
    def _format(doc: dict) -> NotificationResponse:
        return NotificationResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            type=doc["type"],
            title=doc["title"],
            message=doc["message"],
            is_read=doc.get("is_read", False),
            action_url=doc.get("action_url"),
            created_at=doc["created_at"],
        )

    # ------------------------------------------------------------------
    # create (internal — called by services / tasks)
    # ------------------------------------------------------------------

    async def create(
        self,
        user_id: str,
        notif_type: str,
        title: str,
        message: str,
        action_url: Optional[str] = None,
    ) -> NotificationResponse:
        """Insert a new notification for a user."""
        coll = self._notifications_collection
        now = datetime.utcnow()
        doc = {
            "user_id": ObjectId(user_id),
            "type": notif_type,
            "title": title,
            "message": message,
            "is_read": False,
            "action_url": action_url,
            "created_at": now,
        }
        result = await coll.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._format(doc)

    # ------------------------------------------------------------------
    # list
    # ------------------------------------------------------------------

    async def list_by_user(
        self, user_id: str, unread_only: bool = False, skip: int = 0, limit: int = 100
    ) -> list[NotificationResponse]:
        coll = self._notifications_collection
        query: dict = {"user_id": ObjectId(user_id)}
        if unread_only:
            query["is_read"] = False

        cursor = (
            coll.find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format(doc) async for doc in cursor]

    # ------------------------------------------------------------------
    # mark as read
    # ------------------------------------------------------------------

    async def mark_as_read(self, notification_id: str, user_id: str) -> NotificationResponse:
        coll = self._notifications_collection
        try:
            oid = ObjectId(notification_id)
        except (InvalidId, TypeError):
            raise HTTPException(status_code=400, detail="Invalid notification_id")

        doc = await coll.find_one_and_update(
            {"_id": oid, "user_id": ObjectId(user_id)},
            {"$set": {"is_read": True}},
        )
        if doc is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        doc["is_read"] = True
        return self._format(doc)

    async def mark_all_as_read(self, user_id: str) -> int:
        coll = self._notifications_collection
        result = await coll.update_many(
            {"user_id": ObjectId(user_id), "is_read": False},
            {"$set": {"is_read": True}},
        )
        return result.modified_count

    # ------------------------------------------------------------------
    # unread count
    # ------------------------------------------------------------------

    async def unread_count(self, user_id: str) -> int:
        coll = self._notifications_collection
        return await coll.count_documents({"user_id": ObjectId(user_id), "is_read": False})
