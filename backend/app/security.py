from __future__ import annotations
import hashlib, secrets, re
import httpx
from fastapi import Header, HTTPException, Request
from app.config import settings
from app.meetings.store import store


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(status_code=503, detail={"code":"auth_unconfigured", "message":"Sign-in is temporarily unavailable. Please try again later."})
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail={"code":"unauthorized", "message":"Please sign in to continue."})
    access_token = authorization[7:].strip()
    if not access_token:
        raise HTTPException(status_code=401, detail={"code":"unauthorized", "message":"Your sign-in has expired. Please sign in again."})
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{settings.supabase_url}/auth/v1/user",
                headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {access_token}"},
            )
        if response.status_code == 401:
            raise HTTPException(status_code=401, detail={"code":"unauthorized", "message":"Your sign-in has expired. Please sign in again."})
        response.raise_for_status()
        user = response.json()
        if not isinstance(user, dict) or not user.get("id"):
            raise HTTPException(status_code=401, detail={"code":"unauthorized", "message":"Please sign in to continue."})
        return {"id": str(user["id"])}
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503, detail={"code":"auth_unavailable", "message":"We couldn’t verify your sign-in right now. Check your connection and try again."}) from exc


async def require_session(
    request: Request,
    authorization: str | None = Header(default=None),
    x_session_token: str | None = Header(default=None),
) -> str:
    user = await require_user(authorization)
    meeting_id = request.path_params.get("meeting_id") or request.path_params.get("id")
    if not meeting_id or not x_session_token:
        raise HTTPException(status_code=401, detail={"code":"expired", "message":"This temporary meeting session has expired. Start a new workspace."})
    if not store.check_token(meeting_id, x_session_token, user["id"]):
        raise HTTPException(status_code=401, detail={"code":"expired", "message":"This temporary meeting session has expired. Start a new workspace."})
    return meeting_id


def validate_meeting_id(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", value):
        raise HTTPException(status_code=422, detail={"code":"bad_request", "message":"Invalid meeting id."})
    return value
