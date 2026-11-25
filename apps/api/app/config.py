import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # LLM Settings
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"

    # Google Cloud Firestore Settings
    gcp_project_id: str = "phoenix-ai-org"
    firestore_emulator_host: str = ""

    # Security & Policy Engine Settings
    policy_secret_key: str = "phoenix-super-secret-hmac-key-change-in-production"
    approval_token_ttl_seconds: int = 3600  # 1 hour expiration

    # J.A.R.V.I.S. Butler Voice Settings
    jarvis_voice_name: str = "Brian"  # Refined British Butler
    jarvis_salutation: str = "Sir"
    jarvis_quiet_hours_start: str = "22:00"
    jarvis_quiet_hours_end: str = "08:00"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    owner_phone_number: str = ""

    # Infrastructure
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://127.0.0.1:8000,http://localhost:8000,http://localhost:3000,http://localhost:5173,tauri://localhost"
    daily_budget_limit: float = 50.00

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

settings = Settings()
