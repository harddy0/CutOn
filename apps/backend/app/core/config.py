from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = Field(default="CutOn Backend", validation_alias="PROJECT_NAME")
    # ── MongoDB Connection ────────────────────────────────────────────
    # Supports both:
    #   - Local: mongodb://localhost:27017
    #   - MongoDB Atlas (cloud): mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>?retryWrites=true&w=majority
    # Set MONGO_URI in your .env file to switch between local and cloud.
    mongo_uri: str = Field(default="mongodb://localhost:27017", validation_alias="MONGO_URI")
    mongo_db_name: str = Field(default="cuton_db", validation_alias="MONGO_DB_NAME")

    # JWT
    jwt_secret: str = Field(default="change-me-in-production", validation_alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=1440, validation_alias="JWT_EXPIRE_MINUTES")  # 24h

    # Google AI Studio (Gemini)
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL")

    # ── Optional Thinking Level ────────────────────────────────────────────
    # For models that support reasoning (e.g. gemini-2.0-flash-thinking).
    #   "enabled"  – Include chain-of-thought in responses.
    #   "1024"     – Enable thinking with a custom token budget.
    #   Empty      – No thinking override (model default behaviour).
    ai_thinking_level: str = Field(default="", validation_alias="AI_THINKING_LEVEL")

    # Embeddings (Cloud)
    embedding_model: str = Field(
        default="gemini-embedding-2-flash",
        validation_alias="EMBEDDING_MODEL",
    )

    # ── Redis ────────────────────────────────────────────────────────────
    # Full connection URL (takes priority over individual params below)
    redis_url: Optional[str] = Field(default=None, validation_alias="REDIS_URL")
    # Individual connection params (used when REDIS_URL is not set)
    redis_host: str = Field(default="localhost", validation_alias="REDIS_HOST")
    redis_port: int = Field(default=6379, validation_alias="REDIS_PORT")
    redis_password: Optional[str] = Field(default=None, validation_alias="REDIS_PASSWORD")
    redis_username: Optional[str] = Field(default=None, validation_alias="REDIS_USERNAME")
    redis_db: int = Field(default=0, validation_alias="REDIS_DB")
    redis_ssl: bool = Field(default=False, validation_alias="REDIS_SSL")
    redis_max_connections: int = Field(default=10, validation_alias="REDIS_MAX_CONNECTIONS")
    redis_socket_timeout_sec: int = Field(default=2, validation_alias="REDIS_SOCKET_TIMEOUT_SEC")
    redis_socket_connect_timeout_sec: int = Field(
        default=2, validation_alias="REDIS_SOCKET_CONNECT_TIMEOUT_SEC"
    )

    # ── Celery ───────────────────────────────────────────────────────────
    celery_max_retries: int = Field(default=5, validation_alias="CELERY_MAX_RETRIES")
    celery_retry_backoff_sec: int = Field(
        default=60, validation_alias="CELERY_RETRY_BACKOFF_SEC"
    )
    celery_retry_backoff_max_sec: int = Field(
        default=3600, validation_alias="CELERY_RETRY_BACKOFF_MAX_SEC"
    )

    # ── File Upload ──────────────────────────────────────────────────────
    max_upload_size_mb: int = Field(
        default=50, validation_alias="MAX_UPLOAD_SIZE_MB"
    )
    allowed_file_types: str = Field(
        default="pdf,docx,txt", validation_alias="ALLOWED_FILE_TYPES"
    )

    # ── Text Chunking ────────────────────────────────────────────────────
    chunk_size: int = Field(
        default=1000, validation_alias="CHUNK_SIZE"  # Characters per chunk
    )
    chunk_overlap: int = Field(
        default=200, validation_alias="CHUNK_OVERLAP"  # Overlap chars between chunks
    )

    # ── Brevo (Transactional Email) ────────────────────────────────
    brevo_api_key: str = Field(default="", validation_alias="BREVO_API_KEY")
    email_from_address: str = Field(
        default="noreply@cuton.app", validation_alias="EMAIL_FROM_ADDRESS"
    )
    email_from_name: str = Field(default="CutOn", validation_alias="EMAIL_FROM_NAME")

    # ── Password Reset ──────────────────────────────────────────────
    reset_token_expire_minutes: int = Field(
        default=60, validation_alias="RESET_TOKEN_EXPIRE_MINUTES"
    )
    frontend_url: str = Field(
        default="http://localhost:5173", validation_alias="FRONTEND_URL"
    )

    # ── Rate Limiting ──────────────────────────────────────────────────
    rate_limit_retry_after_sec: int = Field(
        default=60, validation_alias="RATE_LIMIT_RETRY_AFTER_SEC"
    )

    # ── Dashboard Cache TTLs (seconds per category) ────────────────
    cache_ttl_summary_sec: int = Field(
        default=30, validation_alias="CACHE_TTL_SUMMARY_SEC"
    )
    cache_ttl_learning_sec: int = Field(
        default=60, validation_alias="CACHE_TTL_LEARNING_SEC"
    )
    cache_ttl_quiz_sec: int = Field(
        default=300, validation_alias="CACHE_TTL_QUIZ_SEC"
    )
    cache_ttl_rag_sec: int = Field(
        default=300, validation_alias="CACHE_TTL_RAG_SEC"
    )
    cache_ttl_activity_sec: int = Field(
        default=30, validation_alias="CACHE_TTL_ACTIVITY_SEC"
    )

    # CORS
    cors_origins: str = Field(default="*", validation_alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def resolved_redis_broker_url(self) -> str:
        """Return the full Redis broker URL, constructing from parts if needed.

        If ``REDIS_URL`` is set in the environment it is used verbatim.
        Otherwise the URL is built from the individual ``REDIS_HOST``,
        ``REDIS_PORT``, ``REDIS_PASSWORD``, ``REDIS_USERNAME``,
        ``REDIS_DB`` and ``REDIS_SSL`` variables.

        This supports both plain Redis and Redis over TLS (rediss://).
        """
        if self.redis_url:
            return self.redis_url

        auth = ""
        if self.redis_username and self.redis_password:
            auth = f"{self.redis_username}:{self.redis_password}@"
        elif self.redis_password:
            auth = f":{self.redis_password}@"

        scheme = "rediss" if self.redis_ssl else "redis"
        return f"{scheme}://{auth}{self.redis_host}:{self.redis_port}/{self.redis_db}"


settings = Settings()