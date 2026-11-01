# Local setup: step-by-step

This guide expands the README setup into smaller checks. You need your own Supabase project and Gemini API key for sign-in and real AI processing. ActionMint has no shared-token or offline mock mode.

## 1. Check prerequisites

1. Install Python 3.11 or newer.
2. Install Node.js 22 or newer (recommended) and Corepack. Supabase's current JavaScript SDK may emit a deprecation notice on Node 20, though the build can still work there.
3. Check the tools:
   ```sh
   python --version
   node --version
   corepack --version
   ```
   On Windows, `py --version` or `py -3.11 --version` may be more useful than `python --version`.
4. Make sure you can access your Supabase dashboard and Gemini API credentials. Never add secret values to Git or paste them into chat.

## 2. Extract and open the project

1. Download and extract `ActionMint.zip`.
2. Open a terminal in the extracted `ActionMint` project folder (the folder containing `README.md`, `.env.example`, and `frontend/`).
3. Keep this project-root terminal available. The next steps use separate terminals for the API and web app.

## 3. Prepare Supabase Auth

1. In the Supabase dashboard, create or open your project.
2. Open **Authentication → Providers** and enable **Email**.
3. In Auth URL/site settings, add `http://localhost:5173` as the local Site URL or redirect URL. If Supabase requires separate redirect URLs, add it there too.
4. Decide whether email confirmation is enabled. If enabled, ensure email delivery works and confirm your address after signing up.
5. Copy the project URL and the public **anon/publishable** key from the project API settings. Do not use `service_role` or `secret` keys.
6. No database tables or Supabase Storage bucket are needed for meeting content.

## 4. Create local environment files

1. In the project root, create `.env` from `.env.example` if it does not already exist:
   ```sh
   # macOS/Linux/Git Bash
   test -f .env || cp .env.example .env
   ```
   In Windows PowerShell:
   ```powershell
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ```
2. Open the root `.env` in a local text editor and set:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your_public_anon_or_publishable_key
   ALLOWED_ORIGINS=http://localhost:5173
   ```
3. Create `frontend/.env.local` from its example if it does not already exist:
   ```sh
   # macOS/Linux/Git Bash
   test -f frontend/.env.local || cp frontend/.env.example frontend/.env.local
   ```
   In Windows PowerShell:
   ```powershell
   if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
   ```
4. Open `frontend/.env.local` and set the matching public Supabase values plus the local API URL:
   ```env
   VITE_API_BASE=http://localhost:8000
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your_public_anon_or_publishable_key
   ```
5. Confirm the backend and frontend Supabase URLs/anon keys point to the same project. The `VITE_` values are included in the public browser bundle, so only use the public anon/publishable key there.
6. Keep `.env` and `.env.local` private and untracked. If you already have private env files, add or edit these values—do not overwrite them blindly. Remove any old `APP_TOKEN`, `VITE_APP_TOKEN`, or `SUPABASE_SERVICE_KEY` values; this version does not use them.

## 5. Install and start the backend API

1. Open a new terminal in the project root.
2. Enter the backend folder and create a virtual environment:
   ```sh
   cd backend
   python -m venv .venv
   ```
   On Windows, use `py -3.11 -m venv .venv` if `python` points to a different version.
3. Activate the environment:
   ```sh
   # macOS/Linux/Git Bash
   source .venv/bin/activate
   ```
   ```powershell
   # Windows PowerShell
   .\.venv\Scripts\Activate.ps1
   ```
4. If PowerShell blocks activation, allow it for this terminal only, then activate again:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\.venv\Scripts\Activate.ps1
   ```
5. Install backend dependencies:
   ```sh
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```
6. Start the API:
   ```sh
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
7. Leave this terminal running. Open `http://localhost:8000/health` in a browser; the response should be JSON with `"status":"ok"`. Check that `auth_configured` and `ai_configured` are `true`. The health endpoint does not make a live Gemini request.

## 6. Install and start the frontend

1. Open a second terminal in the project root; do not stop the API terminal.
2. Enter the frontend folder:
   ```sh
   cd frontend
   ```
3. Install the locked JavaScript dependencies:
   ```sh
   corepack pnpm install
   ```
4. Start Vite:
   ```sh
   corepack pnpm dev
   ```
5. Open `http://localhost:5173`. If you change `frontend/.env.local`, stop and restart Vite so it reloads those values.

## 7. Try the app

1. Select **Create an account** or sign in with Supabase email/password. If confirmation is enabled, open your email and confirm the new account first.
2. Start with a pasted transcript, the built-in sample transcript, an audio/video upload, or a public YouTube link.
3. A transcript or media submission makes real Gemini API requests and may use quota. Uploads default to a 100 MB / 20-minute limit. YouTube URLs must be public; processing is a preview and long videos may take longer or use more quota.
4. Wait for the draft, then review the evidence, decisions, action items, and other sections. Edit the draft and use the export menu to download it.
5. To verify the link placeholder, select **Join a meeting**, enter any valid HTTPS meeting URL, and submit it. The Coming Soon dialog should appear; ActionMint does not make a joining or bot request.
6. Meeting results are temporary. They are not stored in Supabase meeting tables or Storage; export anything you want to keep before the session expires. A backend restart also clears active sessions.

## 8. Run automated checks

From the repository root:

```sh
cd frontend
corepack pnpm test
corepack pnpm run lint
corepack pnpm run build
cd ../backend
pytest -q
cd ..
python scripts/check.py --strict
```

These tests do not call Supabase or Gemini. Live provider/API behavior requires your configured credentials.

## Troubleshooting

- **The sign-in page says setup is missing:** check both frontend `VITE_SUPABASE_*` values and restart Vite.
- **Sign-in says it cannot verify the session:** confirm backend `SUPABASE_URL` and `SUPABASE_ANON_KEY` match the frontend project and that the API is running.
- **Browser reports a CORS error:** set backend `ALLOWED_ORIGINS` to exactly `http://localhost:5173` (no path or trailing slash), then restart the API.
- **The app cannot reach the API:** keep Uvicorn running on port `8000` and set `VITE_API_BASE=http://localhost:8000`.
- **Gemini reports quota, model, or configuration errors:** verify `GEMINI_API_KEY` and the selected model names, then check your Google AI project’s current API access, limits, and billing/quota settings. Free-tier availability is not guaranteed.
- **A YouTube URL fails:** use a public YouTube video URL; private/unlisted content is unsupported. Provider access and regional availability may vary.
- **Results disappear:** this is expected if the temporary session expires or the backend restarts. Export results before leaving.
