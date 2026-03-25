"""
Application configuration loaded from environment variables.

All settings are read from the .env file at project root.
Access anywhere via:  from app.config import settings
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration – every value can be overridden by an env var."""

    # ── Application ────────────────────────────────────────
    APP_NAME: str = "Operations & Finance Platform"
    APP_VERSION: str = "1.0.0"

    # ── Database ───────────────────────────────────────────
    DATABASE_URL: str

    # ── JWT Authentication ─────────────────────────────────
    JWT_SECRET: str = "change-this-to-a-strong-random-secret-key"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 480  # 8 hours

    # ── AWS S3 (PDF document storage) ──────────────────────
    AWS_ACCESS_KEY: str = ""
    AWS_SECRET_KEY: str = ""
    BUCKET_NAME: str = ""
    REGION: str = "us-east-1"

    # ── Gemini AI (PDF parsing) ──────────────────────────────
    GEMINI_API_KEY: str = ""

    # ── OpenAI / LLM (swappable later) ─────────────────────
    OPENAI_API_KEY: str = ""

    model_config = {
        "env_file": (".env", "../.env"),
        "case_sensitive": True,
    }


settings = Settings()
