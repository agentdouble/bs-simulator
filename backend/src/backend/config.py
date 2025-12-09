import os
from dataclasses import dataclass


@dataclass
class Settings:
    llm_mode: str
    supabase_url: str | None
    supabase_key: str | None


def get_settings() -> Settings:
    llm_mode = os.getenv("LLM_MODE", "local").lower()
    if llm_mode not in {"local", "api"}:
        raise ValueError("LLM_MODE must be 'local' or 'api'")

    return Settings(
        llm_mode=llm_mode,
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_KEY"),
    )
