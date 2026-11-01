import json, logging, re
from datetime import date
from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from app.config import settings
from app.schemas import CreateMeeting, TranscriptBody, MeetingSpec, BotBody, AskBody, YouTubeBody
from app.security import require_user, require_session, validate_meeting_id
from app.meetings.store import store
from app.meetings.normalize import normalize_transcript
from app.meetings.export_md import render_markdown
from app.providers.base import extract_with_chain, provider_for, ProviderError
from app.stt.media import transcribe_upload
from app.stt.youtube import transcribe_youtube

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log=logging.getLogger("actionmint")
limiter=Limiter(key_func=get_remote_address, default_limits=[])
app=FastAPI(title="ActionMint — Meeting-to-Action Workspace", version="1.1.0", docs_url="/docs" if settings.env=="dev" else None, redoc_url=None)
app.state.limiter=limiter
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429,content={"detail":{"code":"rate_limited","message":"Too many requests in a short time. Wait a little and try again."}})

app.add_exception_handler(RateLimitExceeded,rate_limit_handler)
app.add_middleware(CORSMiddleware,allow_origins=list(settings.allowed_origins),allow_credentials=False,allow_methods=["GET","POST","PUT","DELETE","OPTIONS"],allow_headers=["Content-Type","Authorization","X-Session-Token"],expose_headers=["Content-Disposition"])

@app.middleware("http")
async def security_headers(request: Request, call_next):
    length=request.headers.get("content-length")
    if length and request.url.path.startswith("/api/") and request.url.path.endswith("/media") and length.isdigit() and int(length)>settings.max_media_mb*1024*1024+1024*1024:
        return JSONResponse(status_code=413,content={"detail":{"code":"too_long","message":f"This file is over the {settings.max_media_mb} MB upload limit."}})
    response=await call_next(request)
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["Referrer-Policy"]="no-referrer"
    response.headers["X-Frame-Options"]="DENY"
    response.headers["Permissions-Policy"]="camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/"): response.headers["Cache-Control"]="no-store"
    return response

@app.get("/health")
async def health():
    providers=[]
    for name in settings.provider_chain:
        provider=provider_for(name)
        configured=bool(settings.gemini_api_key) if name.startswith("gemini") else provider is not None
        providers.append({"name":name,"ok":configured,"latency_ms":None})
    return {"status":"ok","auth_configured":bool(settings.supabase_url and settings.supabase_anon_key),"ai_configured":bool(settings.gemini_api_key),"providers":providers,"default_provider":next(iter(settings.provider_chain),"none"),"model":settings.gemini_model,"meeting_storage":"ephemeral-memory"}

@app.post("/api/meetings",status_code=201)
@limiter.limit("10/minute")
async def create_meeting(request: Request, body: CreateMeeting, user: dict=Depends(require_user)):
    if body.source=="link":
        raise HTTPException(status_code=501,detail={"code":"coming_soon","message":"Live meeting capture is coming soon. You can use a transcript, recording, or public YouTube video for now."})
    text=body.text or ""
    if text and len(text)>settings.max_transcript_chars:
        raise HTTPException(413,detail={"code":"too_long","message":f"Transcript exceeds {settings.max_transcript_chars:,} characters."})
    meeting_date=body.meeting_date or date.today().isoformat()
    try: date.fromisoformat(meeting_date)
    except ValueError as exc: raise HTTPException(422,detail={"code":"bad_request","message":"Meeting date must use YYYY-MM-DD."}) from exc
    title=(body.title or "Meeting notes").strip() or "Meeting notes"
    item,token=store.create(user["id"],body.source,title,meeting_date,text)
    store.extend(item.meeting_id,settings.session_ttl_seconds)
    if text: item.segments=normalize_transcript(text)
    log.info("meeting created id=%s source=%s",item.meeting_id[:8],body.source)
    return {"meeting_id":item.meeting_id,"session_token":token,"expires_at":item.expires_at,"state":item.state}

@app.post("/api/meetings/{meeting_id}/transcript")
@limiter.limit("10/minute")
async def add_transcript(request: Request, meeting_id: str, body: TranscriptBody, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    if len(body.text)>settings.max_transcript_chars: raise HTTPException(413,detail={"code":"too_long","message":"Transcript is too long."})
    item.raw_text=body.text; item.segments=normalize_transcript(body.text); item.state="created"; store.extend(meeting_id,settings.session_ttl_seconds)
    return {"ok":True,"segments":len(item.segments)}

@app.post("/api/meetings/{meeting_id}/media",status_code=202)
@limiter.limit("3/minute")
async def upload_media(request: Request, meeting_id: str, file: UploadFile=File(...), _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    payload=await file.read(settings.max_media_mb*1024*1024+1)
    if len(payload)>settings.max_media_mb*1024*1024:
        raise HTTPException(status_code=413,detail={"code":"too_long","message":f"This file is over the {settings.max_media_mb} MB upload limit."})
    text,duration,provider=await transcribe_upload(file.filename or "recording.wav",payload)
    item.raw_text=text; item.segments=normalize_transcript(text); item.state="created"; item.source="upload"; item.duration_s=duration; item.stt_provider=provider
    store.extend(meeting_id,settings.session_ttl_seconds)
    return {"ok":True,"segments":len(item.segments),"duration_s":duration,"stt_provider":provider}

@app.post("/api/meetings/{meeting_id}/youtube",status_code=202)
@limiter.limit("3/minute")
async def process_youtube(request: Request, meeting_id: str, body: YouTubeBody, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    text,provider=await transcribe_youtube(body.url)
    item.raw_text=text; item.segments=normalize_transcript(text); item.state="created"; item.source="youtube"; item.stt_provider=provider
    store.extend(meeting_id,settings.session_ttl_seconds)
    return {"ok":True,"segments":len(item.segments),"duration_s":None,"stt_provider":provider}

@app.post("/api/meetings/{meeting_id}/bot")
async def start_bot(request: Request, meeting_id: str, body: BotBody, _: str=Depends(require_session)):
    validate_meeting_id(meeting_id)
    raise HTTPException(status_code=501,detail={"code":"coming_soon","message":"Live meeting capture for Google Meet, Zoom, Teams, and other services is coming soon. You can use a transcript, recording, or public YouTube video for now."})

@app.post("/api/meetings/{meeting_id}/finalize")
@limiter.limit("6/minute")
async def finalize(request: Request, meeting_id: str, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    if not item.raw_text and not item.segments: raise HTTPException(422,detail={"code":"bad_request","message":"Add a transcript or recording before processing."})
    if item.state!="ready": item.state="processing"
    return {"meeting_id":meeting_id,"state":item.state}

@app.get("/api/meetings/{meeting_id}/events")
async def meeting_events(request: Request, meeting_id: str, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    if item.state not in {"processing","ready"}: item.state="processing"
    async def emit(event: str, data: dict):
        return f"event: {event}\ndata: {json.dumps(data,ensure_ascii=False,separators=(',',':'))}\n\n"
    async def stream():
        if item.state=="ready" and item.spec:
            yield await emit("status",{"state":"ready","label":"Meeting ready"})
            yield await emit("spec",{"section":"all","data":item.spec})
            yield await emit("done",{"meeting_id":meeting_id}); return
        if not item.segments:
            item.segments=normalize_transcript(item.raw_text or "")
        yield await emit("status",{"state":"transcribing","label":"Preparing transcript"})
        for segment in item.segments:
            if await request.is_disconnected(): return
            yield await emit("segment",{**segment,"final":True})
        yield await emit("status",{"state":"extracting","label":"Finding decisions and commitments"})
        try:
            spec,provider=await extract_with_chain(item.segments,{"meeting_id":item.meeting_id,"title":item.title,"meeting_date":item.meeting_date,"source":item.source})
            if item.duration_s is not None: spec["duration_s"]=item.duration_s
            if item.stt_provider: spec.setdefault("warnings",[]).append(f"Transcript source: {item.stt_provider}.")
            item.spec=MeetingSpec.model_validate(spec).model_dump(mode="json"); item.provider=provider
            item.state="ready"; store.extend(meeting_id,settings.session_ttl_seconds)
            for section in ("summary","decisions","action_items","open_questions","risks","follow_ups","attendees","topics"):
                yield await emit("spec",{"section":section,"data":item.spec.get(section)})
                value=item.spec.get(section)
                count=len(value) if isinstance(value,list) else 1
                unverified=sum(1 for x in value if isinstance(x,dict) and not x.get("verified",True)) if isinstance(value,list) else 0
                yield await emit("question",{"category":section,"count":count,"unverified":unverified})
            yield await emit("status",{"state":"ready","label":"Review your notes"})
            yield await emit("done",{"meeting_id":meeting_id})
            log.info("meeting processed id=%s provider=%s segments=%s",meeting_id[:8],provider,len(item.segments))
        except Exception as exc:
            item.state="created"
            if isinstance(exc,ProviderError) and exc.kind=="quota":
                message="The AI service is at its usage limit right now. Please wait a little and try again."
            elif isinstance(exc,ProviderError) and exc.kind=="config":
                message="AI analysis is not configured correctly. Please contact the site administrator."
            elif isinstance(exc,ProviderError) and exc.kind=="timeout":
                message="AI analysis took too long. Try a shorter transcript or recording."
            elif isinstance(exc,ProviderError):
                message="AI analysis could not complete right now. Please try again shortly."
            else:
                message="Processing failed safely. Your temporary transcript is still available in this session; you can retry."
            yield await emit("error",{"code":"processing_failed","message":message})
            log.warning("meeting processing failed id=%s kind=%s",meeting_id[:8],type(exc).__name__)
    return StreamingResponse(stream(),media_type="text/event-stream",headers={"Cache-Control":"no-cache, no-store","X-Accel-Buffering":"no","Connection":"keep-alive"})

@app.get("/api/meetings/{meeting_id}/result")
async def get_result(request: Request, meeting_id: str, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    if item.state!="ready" or not item.spec: raise HTTPException(409,detail={"code":"bad_request","message":"Meeting is still processing."})
    return {"spec":item.spec,"segments":item.segments,"md":render_markdown(item.spec),"provider":item.provider}

@app.put("/api/meetings/{meeting_id}/result")
async def put_result(request: Request, meeting_id: str, body: MeetingSpec, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    if body.meeting_id!=meeting_id: raise HTTPException(422,detail={"code":"bad_request","message":"meeting_id mismatch."})
    spec=body.model_dump(mode="json"); spec["edited"]=True
    item.spec=spec; store.extend(meeting_id,settings.session_ttl_seconds)
    return {"ok":True,"md":render_markdown(spec)}

@app.post("/api/meetings/{meeting_id}/ask")
@limiter.limit("20/minute")
async def ask_meeting(request: Request, meeting_id: str, body: AskBody, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); item=store.get(meeting_id)
    question_terms={t.lower() for t in re.findall(r"[\w]+",body.question) if len(t)>2}
    ranked=sorted(((len(question_terms & {t.lower() for t in re.findall(r"[\w]+",s["text"])}),s) for s in item.segments),key=lambda pair:pair[0],reverse=True)
    selected=[segment for score,segment in ranked if score>0][:4]
    answer="I couldn't find a relevant passage in this meeting." if not selected or not question_terms else "Relevant meeting passages: " + " ".join(f'[{s["id"]}] {s["text"]}' for s in selected)
    async def stream():
        yield f"event: retrieval\ndata: {json.dumps({'chunks':[{'id':s['id'],'source':'Transcript '+s['id'],'score':0.5,'preview':s['text'][:160]} for s in selected]})}\n\n"
        for part in re.findall(r".{1,90}(?:\s|$)",answer): yield f"event: token\ndata: {json.dumps({'text':part})}\n\n"
        yield "event: done\ndata: {}\n\n"
    return StreamingResponse(stream(),media_type="text/event-stream",headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.delete("/api/meetings/{meeting_id}")
async def delete_meeting(request: Request, meeting_id: str, _: str=Depends(require_session)):
    meeting_id=validate_meeting_id(meeting_id); store.delete(meeting_id); return {"ok":True}
