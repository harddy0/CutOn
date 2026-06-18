from datetime import datetime
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection

from app.db.client import DatabaseClient
from app.modules.audit.dto import AuditLogResponse


class AuditService:
    """Records and queries audit logs.

    Usage from any other service::

        await AuditService.log(
            DatabaseClient,
            user_id=current_user.id,
            action="document.upload",
            resource_type="source",
            resource_id=source_id,
            metadata={"filename": "guide.pdf", "file_size": 45200},
        )
    """

    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @property
    def _audit_collection(self) -> AsyncCollection:
        coll = self._db.audit_logs
        assert coll is not None, "Database not connected"
        return coll

    @staticmethod
    def _format_log(doc: dict) -> AuditLogResponse:
        return AuditLogResponse(
            id=str(doc["_id"]),
            user_id=str(doc["user_id"]),
            action=doc["action"],
            resource_type=doc["resource_type"],
            resource_id=str(doc["resource_id"]),
            metadata=doc.get("metadata", {}),
            created_at=doc["created_at"],
        )

    # ------------------------------------------------------------------
    # write
    # ------------------------------------------------------------------

    async def log(
        self,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Persist an audit log entry.

        Parameters
        ----------
        user_id:
            The acting user's ObjectId string.
        action:
            Dot-notation event name, e.g. ``"topic.create"``, ``"document.upload"``.
        resource_type:
            The kind of resource affected, e.g. ``"topic"``, ``"source"``,
            ``"journal_entry"``, ``"quiz"``, ``"user"``.
        resource_id:
            The affected resource's ObjectId string.
        metadata:
            Optional extra context (filename, file_size, chunk_count, etc.).
        """
        coll = self._audit_collection
        doc = {
            "user_id": ObjectId(user_id),
            "action": action,
            "resource_type": resource_type,
            "resource_id": ObjectId(resource_id),
            "metadata": metadata or {},
            "created_at": datetime.utcnow(),
        }
        await coll.insert_one(doc)

    # ------------------------------------------------------------------
    # query (admin)
    # ------------------------------------------------------------------

    async def list_logs(
        self,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AuditLogResponse]:
        """Return paginated audit logs, optionally filtered."""
        coll = self._audit_collection
        query: dict = {}
        if user_id:
            try:
                query["user_id"] = ObjectId(user_id)
            except (InvalidId, TypeError):
                raise HTTPException(status_code=400, detail="Invalid user_id format")
        if action:
            query["action"] = action
        if resource_type:
            query["resource_type"] = resource_type

        cursor = (
            coll.find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return [self._format_log(doc) async for doc in cursor]
