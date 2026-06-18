from datetime import datetime

from bson import ObjectId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection
from pymongo import ReturnDocument

from app.core.security import hash_password
from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.users.dto import CreateUserRequest, UpdateUserRequest, UserResponse


class UsersService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client
        self._audit = AuditService(db_client)

    # ------------------------------------------------------------------ helpers

    @property
    def _users_collection(self) -> AsyncCollection:
        coll = self._db.users
        assert coll is not None, "Database not connected — call DatabaseClient.connect() first"
        return coll

    @staticmethod
    def _format_user(doc: dict) -> UserResponse:
        """Convert a raw MongoDB user document into the API response model.
        Strips password_hash and preferences from the output.
        """
        return UserResponse(
            id=str(doc["_id"]),
            email=doc["email"],
            first_name=doc["first_name"],
            last_name=doc["last_name"],
            role=doc.get("role", "user"),
            is_active=doc.get("is_active", True),
            created_at=doc["created_at"],
            last_login=doc.get("last_login"),
        )

    @staticmethod
    def _build_set(payload: UpdateUserRequest) -> dict:
        """Build a $set dict from non-None fields of an update payload."""
        update_data = payload.model_dump(exclude_none=True)
        return update_data

    # ------------------------------------------------------------------ crud

    async def create(self, payload: CreateUserRequest) -> UserResponse:
        """Insert a new user document."""
        collection = self._users_collection

        # Check for duplicate email
        existing = await collection.find_one({"email": payload.email})
        if existing:
            raise HTTPException(
                status_code=409,
                detail="A user with this email already exists",
            )

        doc = {
            "email": payload.email,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "password_hash": hash_password(payload.password),
            "role": "user",
            "is_active": True,
            "preferences": {"email_notifications": True},
            "created_at": datetime.utcnow(),
            "last_login": None,
        }

        result = await collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return self._format_user(doc)

    async def find_by_id(self, user_id: str) -> UserResponse | None:
        """Retrieve a user by their MongoDB _id."""
        collection = self._users_collection
        doc = await collection.find_one({"_id": ObjectId(user_id)})
        if doc is None:
            return None
        return self._format_user(doc)

    async def find_by_email(self, email: str) -> dict | None:
        """Retrieve a user by email (includes password_hash — for auth)."""
        collection = self._users_collection
        doc = await collection.find_one({"email": email})
        if doc is None:
            return None
        # Return raw doc so auth can verify password
        return dict(doc)

    async def update(self, user_id: str, payload: UpdateUserRequest) -> UserResponse | None:
        """Partially update a user document."""
        collection = self._users_collection
        set_fields = self._build_set(payload)
        if not set_fields:
            return await self.find_by_id(user_id)

        result = await collection.find_one_and_update(
            {"_id": ObjectId(user_id)},
            {"$set": set_fields},
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            return None
        await self._audit.log(
            user_id, "user.update", "user", user_id, {"changed_fields": list(set_fields.keys())}
        )
        return self._format_user(result)

    async def delete(self, user_id: str) -> bool:
        """Delete a user by _id. Returns True if a document was deleted."""
        collection = self._users_collection
        result = await collection.delete_one({"_id": ObjectId(user_id)})
        if result.deleted_count == 1:
            await self._audit.log(user_id, "user.delete", "user", user_id, {})
        return result.deleted_count == 1

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[UserResponse]:
        """Return a paginated list of users."""
        collection = self._users_collection
        cursor = collection.find().sort("created_at", -1).skip(skip).limit(limit)
        return [self._format_user(doc) async for doc in cursor]
