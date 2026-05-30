from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "nse-data-service"
    environment: str = "production"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://aibazaar:changeme_in_production@db:5432/aibazaar"
    redis_url: str = "redis://redis:6379/0"
    kafka_bootstrap_servers: str = "kafka:9092"
    clickhouse_host: str = "clickhouse"
    clickhouse_port: int = 8123
    clickhouse_username: str = "default"
    clickhouse_password: str = ""
    clickhouse_database: str = "aibazaar"

    cache_ttl_seconds: int = 300
    symbol_universe_ttl_seconds: int = 86400
    nselib_rate_limit_per_second: float = 1.5
    nselib_max_attempts: int = 3
    kafka_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
