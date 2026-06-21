import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from fastapi import HTTPException

logger = logging.getLogger(__name__)
from pymongo.asynchronous.collection import AsyncCollection

from app.core.config import settings
from app.core.email import send_password_reset_email
from app.core.security import hash_password, verify_password
from app.db.client import DatabaseClient
from app.modules.audit.service import AuditService
from app.modules.auth.dto import (
    ForgotPasswordRequest,
    MessageResponse,
    RegisterRequest,
    LoginRequest,
    AuthResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.modules.users.dto import UserResponse


class AuthService:
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
    def _create_token(user_id: str) -> str:
        payload = {
            "sub": user_id,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes),
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    # ------------------------------------------------------------------ helpers

    @property
    def _reset_tokens_collection(self) -> AsyncCollection:
        coll = self._db.password_reset_tokens
        assert coll is not None, "Database not connected"
        return coll

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
            "created_at": datetime.now(timezone.utc),
            "last_login": None,
        }

        result = await collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        await self._audit.log(
            str(result.inserted_id),
            "auth.register",
            "user",
            str(result.inserted_id),
            {"email": payload.email},
        )
        token = self._create_token(str(result.inserted_id))
        # Cast to str since MongoDB dict lookups lose type info for mypy
        email: str = doc["email"]  # type: ignore[assignment]
        first_name: str = doc["first_name"]  # type: ignore[assignment]
        last_name: str = doc["last_name"]  # type: ignore[assignment]
        return AuthResponse(
            id=str(result.inserted_id),
            email=email,
            first_name=first_name,
            last_name=last_name,
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
            {"$set": {"last_login": datetime.now(timezone.utc)}},
        )

        await self._audit.log(
            str(doc["_id"]),
            "auth.login",
            "user",
            str(doc["_id"]),
            {"email": payload.email},
        )
        token = self._create_token(str(doc["_id"]))
        return TokenResponse(
            access_token=token,
        )

    async def forgot_password(self, payload: ForgotPasswordRequest) -> MessageResponse:
        """Initiate a password reset flow.

        1. Look up the user by email (always return 200 to prevent enumeration).
        2. Generate a cryptographically secure random token.
        3. Store its SHA-256 hash in ``password_reset_tokens``.
        4. Email the raw token embedded in a reset link to the user.
        """
        collection = self._users_collection
        user = await collection.find_one({"email": payload.email})

        # Always return the same message regardless of whether the email exists
        generic_message = (
            "If an account with that email exists, a reset link has been sent."
        )

        if user is None or not user.get("is_active", True):
            # Silently no-op for non-existent or deactivated accounts
            logger.info(
                "Forgot-password requested for %s (user exists=%s)",
                payload.email,
                user is not None,
            )
            return MessageResponse(message=generic_message)

        # Generate a raw token and persist its hash
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.reset_token_expire_minutes
        )

        token_doc = {
            "user_id": user["_id"],
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used": False,
            "created_at": datetime.now(timezone.utc),
        }
        await self._reset_tokens_collection.insert_one(token_doc)

        # Build the reset link and fire the email
        reset_link = (
            f"{payload.base_url.rstrip('/')}"
            f"?token={raw_token}&email={payload.email}"
        )
        # Run the synchronous Brevo API call in a thread so it doesn't
        # block the async event loop.
        await asyncio.to_thread(
            send_password_reset_email, payload.email, reset_link
        )

        await self._audit.log(
            str(user["_id"]),
            "auth.forgot_password",
            "user",
            str(user["_id"]),
            {"email": payload.email},
        )

        return MessageResponse(message=generic_message)

    async def reset_password(self, payload: ResetPasswordRequest) -> MessageResponse:
        """Complete a password reset using the token from the email link.

        1. Hash the provided token and look up the stored record.
        2. Verify the token is valid (exists, not used, not expired).
        3. Hash the new password and update the user document.
        4. Mark the token as used.
        """
        token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
        coll = self._reset_tokens_collection

        doc = await coll.find_one({"token_hash": token_hash})
        if doc is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid or expired reset token.",
            )

        if doc.get("used", False):
            raise HTTPException(
                status_code=400,
                detail="This reset link has already been used.",
            )

        if doc["expires_at"] < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="This reset link has expired.",
            )

        # Update the user's password
        users_coll = self._users_collection
        user_id = doc["user_id"]
        new_hash = hash_password(payload.new_password)
        await users_coll.update_one(
            {"_id": user_id},
            {"$set": {"password_hash": new_hash}},
        )

        # Mark the token as used
        await coll.update_one(
            {"_id": doc["_id"]},
            {"$set": {"used": True}},
        )

        await self._audit.log(
            str(user_id),
            "auth.reset_password",
            "user",
            str(user_id),
            {},
        )

        return MessageResponse(message="Password has been reset successfully.")

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
