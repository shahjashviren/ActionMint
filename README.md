# ActionMint

**Turn meeting conversations into evidence-linked actions.** ActionMint accepts pasted transcripts, audio/video recordings, and public YouTube links, then uses Gemini to draft a summary, decisions, action items, risks, open questions, and follow-ups. Review and edit the result before exporting it.

> Live Google Meet, Zoom, and Teams joining is **not implemented**. You can submit a valid meeting link in the UI; ActionMint shows a courteous “Coming soon” notice and does not contact or join the meeting.

## Product and data boundaries

- **Sign-in:** Supabase Auth email/password. Supabase stores account/auth details required for sign-in.
- **Meeting content:** ActionMint does not put transcripts, uploads, results, or meeting history in Supabase tables or Storage. The backend keeps active session data in process memory and temporary files only; sessions expire after 30 minutes by default and are lost if the backend restarts. The Render API should remain a single instance because in-memory sessions aren’t shared across replicas. Results are available in the active browser/session until it expires. Export before leaving.
- **AI provider:** Gemini receives submitted transcripts/media/YouTube URLs to generate outputs. Google’s own processing, retention, quota, and availability terms apply; ActionMint does not claim to control third-party retention.
- **Media handling:** audio/video uploads are capped at 100 MB and 20 minutes by default. The backend converts the audio track in a temporary directory, uploads the transcription asset to Gemini Files API, requests transcription, and attempts to delete that provider file after use. Visual slide/image analysis is not included.
- **YouTube:** public videos only. Private and unlisted links are unsupported. The Gemini YouTube route is a preview feature and may be subject to model/provider limits. ActionMint does not scrape or download YouTube videos.
- **No fabricated bot or offline analysis:** AI configuration/provider failures are shown as actionable errors; the application does not replace failed Gemini output with simulated meeting results.

## Required setup

You need a Supabase project and a Gemini API key. **Do not paste secrets into chat, commit them, or put Gemini credentials in a `VITE_` variable.** Use private environment files locally and your host’s secret/environment settings in production.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | Backend only; secret | Gemini API key used for text analysis, audio transcription, and public YouTube processing. |
| `SUPABASE_URL` | Backend | Project URL used to validate Supabase Auth access tokens. |
| `SUPABASE_ANON_KEY` | Backend | Supabase public anon/publishable key used with Auth. **Do not use a `service_role` key.** |
| `ALLOWED_ORIGINS` | Backend | Comma-separated exact frontend origins allowed to call the API, e.g. `http://localhost:5173`. |
| `VITE_SUPABASE_URL` | Frontend build | Same Supabase project URL, exposed to the browser as expected for Supabase Auth. |
| `VITE_SUPABASE_ANON_KEY` | Frontend build | Same public anon/publishable key; this is not a service-role secret. |
| `VITE_API_BASE` | Frontend build | Backend API origin, e.g. `http://localhost:8000`; use the deployed backend URL on Render. |
| `GEMINI_MODEL` | Backend, optional | Text analysis model; defaults to `gemini-3.5-flash-lite`. |
| `GEMINI_STT_MODEL` | Backend, optional | Audio transcription model; defaults to `gemini-3.5-transcribe`. |
| `GEMINI_VIDEO_MODEL` | Backend, optional | Public YouTube video model; defaults to `gemini-3.8-flash`. |
| `MAX_MEDIA_MB` | Backend, optional | Upload cap in MiB; defaults to `100`. |
| `MAX_MEDIA_MIN` | Backend, optional | Audio/video duration cap; defaults to `20`. |
| `MAX_TRANSCRIPT_CHARS` | Backend, optional | Pasted transcript cap; defaults to `60000`. |
| `SESSION_TTL_SECONDS` | Backend, optional | In-memory meeting session lifetime; defaults to `1800` seconds. |
| `ENV` | Backend | Use `prod` for deployment; hides FastAPI docs outside dev. |
| `PROVIDER_CHAIN` | Backend | Set to `gemini`. No mock fallback is supported. |

### Local development

For the expanded substeps, Windows PowerShell commands, and troubleshooting, see [`docs/local-setup.md`](docs/local-setup.md).

1. Create a Supabase project. In **Authentication → Providers**, enable Email. Add your local frontend URL (`http://localhost:5173`) to the Auth site/redirect URL settings. For production, add the deployed frontend URL too. Choose whether email confirmation is required; if enabled, configure email delivery and confirm the address before signing in.
2. Create private env files only if they don’t already exist (otherwise merge in the missing variable names without replacing your existing values):
   ```sh
   test -f .env || cp .env.example .env
   test -f frontend/.env.local || cp frontend/.env.example frontend/.env.local
   ```
3. Fill the backend `.env` with `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. Fill `frontend/.env.local` with matching `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; set `VITE_API_BASE=http://localhost:8000`.
4. Start the API:
   ```sh
   cd backend
   python -m venv .venv
   . .venv/bin/activate  # Windows PowerShell: .venv\\Scripts\\Activate.ps1
   pip install -r requirements.txt
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
5. In a second terminal:
   ```sh
   cd frontend
   corepack pnpm install
   corepack pnpm dev
   ```
6. Visit `http://localhost:5173`, create an account or sign in, and start with text, a recording, or a public YouTube URL. Node.js 22+ is recommended; the current Supabase SDK still builds on Node 20 but emits a deprecation notice. Gemini free-tier quotas and availability vary; ActionMint cannot guarantee a fixed number of free requests.

The backend loads the repository-root `.env`, then `backend/.env` if you prefer a backend-local file. Vite reads `frontend/.env.local`. All of these files are git-ignored; commit only the `.env.example` templates. Remove obsolete `APP_TOKEN`, `VITE_APP_TOKEN`, and `SUPABASE_SERVICE_KEY` entries from private env files—the app no longer uses a shared token or any service-role key.

## Render deployment

`render.yaml` defines a FastAPI API and a static Vite frontend. In Render, create a Blueprint from this repository and set the variables in each service’s Environment page before relying on the app:

**`actionmint-api` backend service**
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS` = the exact deployed frontend origin (for example `https://actionmint-web.onrender.com`; include any custom domain you use)
- `ENV=prod` and `PROVIDER_CHAIN=gemini` are set by the blueprint.

**`actionmint-web` static service**
- `VITE_API_BASE` = the deployed backend origin (for example `https://actionmint-api.onrender.com`)
- `VITE_SUPABASE_URL` = same project URL as the backend
- `VITE_SUPABASE_ANON_KEY` = same public anon/publishable key as the backend

Set frontend variables before the static site build; Vite embeds `VITE_` values in its public bundle. They are public configuration, never put secrets there. Add the deployed frontend domain to Supabase Auth’s Site URL/redirect URL settings. Do not configure or expose `SUPABASE_SERVICE_ROLE_KEY`; the application does not use one. After changing Vite variables on Render, trigger a new frontend build/deploy.

## Checks

```sh
# Frontend
cd frontend
corepack pnpm test
corepack pnpm run lint
corepack pnpm run build

# Backend
cd ../backend
pytest -q
```

The tests use mocks and do not require live Supabase or Gemini credentials. Before shipping, verify Auth sign-up/sign-in, a short transcript analysis, a small audio clip, a public YouTube video, invalid media, missing/invalid provider configuration, and that a submitted meeting link only displays the Coming Soon dialog.

## Project layout

- `frontend/` — ActionMint React/Vite interface, Supabase Auth, exports, temporary browser state.
- `backend/app/main.py` — authenticated API, in-memory session processing, export/ask routes, and Coming Soon-only meeting endpoint.
- `backend/app/security.py` — Supabase Auth token validation and owner-bound ephemeral session tokens.
- `backend/app/stt/` — temporary audio transcription and direct public YouTube processing through Gemini.
- `backend/app/providers/` — Gemini meeting extraction and evidence verification.
- `render.yaml` — Render blueprint for the API and frontend.
