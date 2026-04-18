from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Required — app won't start if this is missing from .env
    database_url: str

    # Cloudflare R2 (S3-compatible) object storage
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    r2_account_api_token: str

    # Comma-separated list of allowed frontend origins for CORS.
    # Stored as a plain string to avoid pydantic-settings trying to JSON-decode it.
    # Parsed into a list in main.py where it's passed to CORSMiddleware.
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
