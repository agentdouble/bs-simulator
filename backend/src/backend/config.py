import os
from dataclasses import dataclass


@dataclass
class Settings:
    supabase_url: str | None
    supabase_key: str | None
    supabase_verify_ssl: bool


def get_settings() -> Settings:

    def _env_bool(name: str, default: bool = True) -> bool:
        raw = os.getenv(name)
        if raw is None:
            return default
        return raw.strip().lower() in {"1", "true", "yes", "on"}

    return Settings(
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_KEY"),
        supabase_verify_ssl=_env_bool("SUPABASE_VERIFY_SSL", default=True),
    )
