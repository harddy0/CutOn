from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = Field(default="CutOn Backend", validation_alias="PROJECT_NAME")
    mongo_uri: str = Field(default="mongodb://localhost:27017", validation_alias="MONGO_URI")
    mongo_db_name: str = Field(default="cuton_db", validation_alias="MONGO_DB_NAME")

    # JWT
    jwt_secret: str = Field(default="change-me-in-production", validation_alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_expire_minutes: int = Field(default=1440, validation_alias="JWT_EXPIRE_MINUTES")  # 24h

    # Google AI Studio (Gemini)
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-1.5-flash", validation_alias="GEMINI_MODEL")

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

    # ── Celery ───────────────────────────────────────────────────────────
    celery_max_retries: int = Field(default=5, validation_alias="CELERY_MAX_RETRIES")
    celery_retry_backoff_sec: int = Field(
        default=60, validation_alias="CELERY_RETRY_BACKOFF_SEC"
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