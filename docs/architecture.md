# Architecture and data lifecycle

```text
Browser (React + Supabase Auth)
  ├─ Supabase email/password → access token
  └─ Bearer token + per-session token
       ↓
FastAPI API (Render or local)
  ├─ validates user with Supabase Auth /auth/v1/user
  ├─ binds meeting token to authenticated Supabase user id
  ├─ stores active meeting content in process memory only
  ├─ converts audio/video in temporary files; sends to Gemini for transcription
  ├─ sends transcript / public YouTube URL to Gemini for analysis/transcription
  └─ returns editable draft and exports to the browser
```

## Security and retention

- Supabase Auth is used only for account/sign-in. No meeting transcript, media, meeting result, or history is written to Supabase database tables or Storage.
- Meeting sessions are held in process memory with a 30-minute default TTL. Media conversion uses temporary files removed with the temporary directory. A backend restart discards active sessions; keep the API to a single instance because sessions are not shared across replicas.
- A random per-meeting token is returned once and held in browser `sessionStorage`; the backend stores only its hash. Every meeting route validates the current Supabase user and checks session ownership.
- The backend uses only the Supabase public anon/publishable key for Auth validation. No service-role key is required or supported.
- Submitted content is processed by Google Gemini. External-provider terms and retention policy apply; this project does not promise third-party zero retention.
- Gemini Files API uploads for audio are deleted after transcription where possible. The app also removes temporary local files. Provider-side processing remains subject to Google's policy.

## Processing

- Pasted text is normalized into evidence-bearing transcript segments and analyzed with Gemini.
- Audio/video upload is limited by configured size/duration caps, converted to a temporary mono WAV for the audio track, transcribed by Gemini, then the transcript is analyzed.
- Public YouTube URLs are validated against supported YouTube domains and sent directly to Gemini's YouTube video input route. There is no video scraping/downloading or caption API call. Private/unlisted URLs are unsupported.
- Meet/Zoom/Teams links are retained as a visible input only. Submitting one returns a Coming Soon message in the UI; the client does not create a meeting session or call a bot endpoint.
- There is no mock analysis fallback and no simulated meeting bot. Provider errors are returned as clear, non-sensitive messages.
