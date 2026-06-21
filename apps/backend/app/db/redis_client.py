"""Async Redis client with automatic in-memory fallback.

Usage
-----
    from app.db.redis_client import RedisClient

    # On app startup:
    await RedisClient.connect()

    # On app shutdown:
    await RedisClient.close()

    # In service code:
    await RedisClient.set(key, value, ttl=60)
    value = await RedisClient.get(key)
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

from redis.asyncio import Redis
from redis.asyncio.connection import ConnectionPool

from app.core.config import settings

# ---------------------------------------------------------------------------
# In-memory fallback store (used when Redis is unavailable)
# ---------------------------------------------------------------------------

_FALLBACK: dict[str, tuple[float, Any]] = {}  # key -> (expires_at, value)


def _fallback_get(key: str) -> Optional[Any]:
    entry = _FALLBACK.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        del _FALLBACK[key]
        return None
    return value


def _fallback_set(key: str, value: Any, ttl: int) -> None:
    _FALLBACK[key] = (time.monotonic() + ttl, value)


def _fallback_del(pattern: str) -> None:
    """Delete all fallback keys matching *pattern* (simple prefix match)."""
    prefix = pattern.rstrip("*")
    keys_to_del = [k for k in _FALLBACK if k.startswith(prefix)]
    for k in keys_to_del:
        del _FALLBACK[k]


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------

def _serialise(value: Any) -> str:
    """JSON‑serialise *value*, falling back to ``repr()`` for non‑serialisable types.

    Pydantic BaseModel instances are converted via ``.model_dump_json()``.
    """
    if hasattr(value, "model_dump_json"):
        return value.model_dump_json()
    return json.dumps(value, default=repr, ensure_ascii=False)


def _deserialise(raw: str) -> Any:
    """Deserialise a JSON string. Returns ``None`` on parse failure."""
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Redis Client Singleton
# ---------------------------------------------------------------------------


class RedisClient:
    """Singleton async Redis client.

    Call ``await RedisClient.connect()`` once at application startup and
    ``await RedisClient.close()`` at shutdown.

    When Redis is **unavailable** (connection refused, timeout, etc.) all
    operations transparently fall back to an in‑memory dictionary.  This
    means the application never crashes or hangs due to a missing Redis.
    """

    _pool: Optional[ConnectionPool] = None
    _client: Optional[Redis] = None
    _available: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @classmethod
    async def connect(cls) -> None:
        """Create a connection pool and verify connectivity."""
        if cls._client is not None:
            return  # already connected

        try:
            redis_url = settings.resolved_redis_broker_url()
            cls._pool = ConnectionPool.from_url(
                redis_url,
                decode_responses=True,
                max_connections=10,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=False,
            )
            cls._client = Redis.from_pool(cls._pool)

            # Verify connection with a PING
            await cls._client.ping()
            cls._available = True
        except Exception:
            cls._available = False
            cls._pool = None
            cls._client = None

    @classmethod
    async def close(cls) -> None:
        """Disconnect the Redis client."""
        if cls._client is not None:
            await cls._client.aclose()
            cls._client = None
        if cls._pool is not None:
            await cls._pool.aclose()
            cls._pool = None
        cls._available = False

    @classmethod
    def is_available(cls) -> bool:
        return cls._available

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    @classmethod
    async def get(cls, key: str) -> Optional[Any]:
        """Return the deserialised value for *key*, or ``None``.

        Falls back to in‑memory dict when Redis is unreachable.
        """
        if cls._available and cls._client is not None:
            try:
                raw = await cls._client.get(key)
                if raw is None:
                    return None
                return _deserialise(raw)
            except Exception:
                cls._available = False  # degrade to fallback

        return _fallback_get(key)

    @classmethod
    async def set(cls, key: str, value: Any, ttl: int) -> None:
        """Store *value* at *key* with a TTL in seconds.

        Falls back to in‑memory dict when Redis is unreachable.
        """
        if cls._available and cls._client is not None:
            try:
                raw = _serialise(value)
                await cls._client.set(key, raw, ex=ttl)
                return
            except Exception:
                cls._available = False  # degrade to fallback

        _fallback_set(key, value, ttl)

    @classmethod
    async def delete(cls, pattern: str) -> None:
        """Delete all keys matching ``*pattern*``.

        In Redis this uses the ``SCAN`` + ``UNLINK`` approach so it is safe
        for large key spaces.  The in‑memory fallback does a simple prefix
        match.
        """
        # Always clear fallback so we don't leak stale entries
        _fallback_del(pattern)

        if cls._available and cls._client is not None:
            try:
                cursor = 0
                while True:
                    cursor, keys = await cls._client.scan(
                        cursor=cursor, match=pattern, count=100
                    )
                    if keys:
                        await cls._client.unlink(*keys)
                    if cursor == 0:
                        break
            except Exception:
                cls._available = False

    # ------------------------------------------------------------------
    # Convenience: build a namespaced key from parts
    # ------------------------------------------------------------------

    @staticmethod
    def make_key(prefix: str, user_id: str) -> str:
        return f"dashboard:{prefix}:{user_id}"
