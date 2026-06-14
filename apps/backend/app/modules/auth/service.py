from datetime import datetime, timedelta

import bcrypt
import jwt
from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection

from app.core.config import settings
from app.db.client import DatabaseClient
from app.modules.auth.dto import RegisterRequest, LoginRequest


class AuthService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    # ------------------------------------------------------------------ helpers

    @property
    def _users_collection(self) -> AsyncIOMotorCollection:
        coll = self._db.users
        assert coll is not None, "Database not connected — call DatabaseClient.connect() first"
        return coll

    @staticmethod
    def _hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def _verify_password(plain: str, hashed: str) -> bool:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

    @staticmethod
    def _create_token(user_id: str) -> str:
        payload = {
            "sub": user_id,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    @staticmethod
    def _format_auth_user(doc: dict, token: str) -> dict:
        return {
            "id": str(doc["_id"]),
            "email": doc["email"],
            "first_name": doc["first_name"],
            "last_name": doc["last_name"],
            "access_token": token,
            "token_type": "bearer",
        }

    # ------------------------------------------------------------------ public

    async def register(self, payload: RegisterRequest) -> dict:
        """Register a new user account and return an access token."""
        collection = self._users_collection

        existing = await collection.find_one({"email": payload.email})
        if existing:
            raise HTTPException(status_code=409, detail="A user with this email already exists")

        doc = {
            "email": payload.email,
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "password_hash": self._hash_password(payload.password),
            "is_active": True,
            "preferences": {"email_notifications": True},
            "created_at": datetime.utcnow(),
            "last_login": None,
        }

        result = await collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        token = self._create_token(str(result.inserted_id))
        return self._format_auth_user(doc, token)

    async def login(self, payload: LoginRequest) -> dict:
        """Authenticate a user and return an access token."""
        collection = self._users_collection

        doc = await collection.find_one({"email": payload.email})
        if doc is None:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not doc.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is deactivated")

        if not self._verify_password(payload.password, doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Update last_login
        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"last_login": datetime.utcnow()}},
        )

        token = self._create_token(str(doc["_id"]))
        return {
            "access_token": token,
            "token_type": "bearer",
        }

    async def get_current_user(self, token: str) -> dict:
        """Decode a JWT and return the current user (without password_hash)."""
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            user_id = payload.get("sub")
            if user_id is None:
                raise HTTPException(status_code=401, detail="Invalid token")
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")

        collection = self._users_collection
        doc = await collection.find_one({"_id": ObjectId(user_id)})
        if doc is None:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "id": str(doc["_id"]),
            "email": doc["email"],
            "first_name": doc["first_name"],
            "last_name": doc["last_name"],
            "is_active": doc.get("is_active", True),
            "created_at": doc["created_at"],
            "last_login": doc.get("last_login"),
        }
