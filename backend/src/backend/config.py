import os
from dataclasses import dataclass


@dataclass
class Settings:
    openai_api_key: str
    openai_model: str
    supabase_url: str | None
    supabase_key: str | None


def get_settings() -> Settings:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY est requis pour le mode LLM API")

    return Settings(
        openai_api_key=api_key,
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_KEY"),
    )
