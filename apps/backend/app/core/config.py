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

    # CORS
    cors_origins: str = Field(default="*", validation_alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()