from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = Field(default="CutOn Backend", validation_alias="PROJECT_NAME")
    mongo_uri: str = Field(default="mongodb://localhost:27017", validation_alias="MONGO_URI")
    mongo_db_name: str = Field(default="cuton_db", validation_alias="MONGO_DB_NAME")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()