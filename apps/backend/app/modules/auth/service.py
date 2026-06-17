from datetime import datetime, timedelta

import jwt
from bson import ObjectId
from fastapi import HTTPException
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.db.client import DatabaseClient
from app.modules.auth.dto import RegisterRequest, LoginRequest, AuthResponse, TokenResponse
from app.modules.users.dto import UserResponse


class AuthService:
    def __init__(self, db_client: type[DatabaseClient]) -> None:
        self._db = db_client

    # ------------------------------------------------------------------ helpers

    @property
    def _users_collection(self) -> AsyncCollection:
        coll = self._db.users
        assert coll is not None, "Database not connected — call DatabaseClient.connect() first"
        return coll

    @staticmethod
    def _create_token(user_id: str) -> str:
        payload = {
            "sub": user_id,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes),
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    # ------------------------------------------------------------------ public

    async def register(self, payload: RegisterRequest) -> AuthResponse:
        """Register a new user account and return an access token."""
        collection = self._users_collection

        existing = await collection.find_one({"email": payload.email})
        if existing:
            raise HTTPException(status_code=409, detail="A user with this email already exists")

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
        token = self._create_token(str(result.inserted_id))
        return AuthResponse(
            id=str(result.inserted_id),
            email=doc["email"],
            first_name=doc["first_name"],
            last_name=doc["last_name"],
            role="user",
            access_token=token,
        )

    async def login(self, payload: LoginRequest) -> TokenResponse:
        """Authenticate a user and return an access token."""
        collection = self._users_collection

        doc = await collection.find_one({"email": payload.email})
        if doc is None:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not doc.get("is_active", True):
            raise HTTPException(status_code=403, detail="Account is deactivated")

        if not verify_password(payload.password, doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # Update last_login
        await collection.update_one(
            {"_id": doc["_id"]},
            {"$set": {"last_login": datetime.utcnow()}},
        )

        token = self._create_token(str(doc["_id"]))
        return TokenResponse(
            access_token=token,
        )

    async def get_current_user(self, token: str) -> UserResponse:
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
