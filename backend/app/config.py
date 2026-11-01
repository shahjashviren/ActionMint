from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env", override=True)


def _csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(x.strip() for x in os.getenv(name, default).split(",") if x.strip())


_PROVIDER_CHAIN = tuple(name.lower() for name in _csv("PROVIDER_CHAIN", "gemini") if name.lower() == "gemini") or ("gemini",)


@dataclass(frozen=True)
class Settings:
    env: str = os.getenv("ENV", "dev")
    allowed_origins: tuple[str, ...] = _csv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    provider_chain: tuple[str, ...] = _PROVIDER_CHAIN
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    gemini_stt_model: str = os.getenv("GEMINI_STT_MODEL", "gemini-3.5-transcribe")
    gemini_video_model: str = os.getenv("GEMINI_VIDEO_MODEL", "gemini-3.8-flash")
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    max_media_mb: int = int(os.getenv("MAX_MEDIA_MB", "100"))
    max_media_min: int = int(os.getenv("MAX_MEDIA_MIN", "20"))
    max_transcript_chars: int = int(os.getenv("MAX_TRANSCRIPT_CHARS", "60000"))
    session_ttl_seconds: int = int(os.getenv("SESSION_TTL_SECONDS", "1800"))

settings = Settings()
