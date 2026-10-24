from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    learning_storage_bucket: str = "learning-materials"
    database_url: str = ""
    migration_database_url: str = ""
    ai_provider: str = "openai_compatible"
    ai_model: str = ""
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_enabled: bool = False
    ai_demo_fallback: bool = True
    ai_timeout_seconds: int = Field(default=90, ge=5, le=180)
    ai_max_output_tokens: int = Field(default=4096, ge=100, le=4096)
    # Zero disables the optional local request-count cap; usage is still logged.
    ai_max_calls: int = Field(default=0, ge=0, le=1000)
    ai_calls_per_user_hour: int = Field(default=0, ge=0, le=100)
    ai_usage_path: str = str(ROOT / "backend" / ".ai-usage.sqlite3")
    jsearch_api_key: str = ''
    jsearch_base_url: str = 'https://api.openwebninja.com/jsearch'
    jsearch_api_id: str = 'jsearch'
    jsearch_max_calls: int = Field(default=25, ge=0, le=200)
    jsearch_usage_path: str = str(ROOT / 'backend' / '.jobs-usage.sqlite3')
    sdg_ai_enabled: bool = False
    gemini_api_key: str = ""
    gemini_model: str = ""
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    demo_mode: bool = True
    tesseract_cmd: str = ""
    libreoffice_cmd: str = ""

    @field_validator("supabase_url")
    @classmethod
    def normalize_supabase_url(cls, value: str) -> str:
        # Token issuers use the origin without a trailing slash.
        return value.strip().rstrip("/")


settings = Settings()
