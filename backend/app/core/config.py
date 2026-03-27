from functools import lru_cache

from pydantic import computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RuleFlow Task Manager"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/task_manager"
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_seconds: int = 120
    backend_cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    seed_admin_email: str = "admin@indusaction.org"
    seed_admin_password: str = "indusaction.org"
    seed_manager_email: str = "manager@indusaction.org"
    seed_manager_password: str = "Nta9931@@"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        enable_decoding=False,
    )

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @computed_field
    @property
    def celery_broker_url(self) -> str:
        return self.redis_url

    @computed_field
    @property
    def celery_result_backend(self) -> str:
        return self.redis_url


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
