# Implementation decisions

- Product name and brand: ActionMint; preserve the existing visual system, button styling, animations, and reduced-motion support.
- Authentication: Supabase Auth email/password with access-token validation in FastAPI. Use only the public anon/publishable key; never use or expose a service-role key.
- Persistence: Auth account details are in Supabase; meeting content/results are not. Keep active meeting sessions in memory with a 30-minute TTL by default and temporary media conversion files. No meeting-history tables or cross-device meeting history.
- AI: Gemini for text extraction, audio/video transcription, and public YouTube processing. No mock AI fallback; provider errors must be explicit and user-safe.
- Public video: accept supported public YouTube URLs and send them directly to Gemini. Do not scrape or download YouTube.
- Meeting links: keep the Meet/Zoom/Teams URL input. Valid submit displays a professional Coming Soon popup and makes no joining/bot API call. No simulated bot route or fake meeting output.
- Media: 100 MB upload and 20-minute duration defaults; temporary audio conversion, Gemini Files API upload, and best-effort provider-file deletion.
- Date interpretation: day-first for numeric dates; dates that cannot be resolved deterministically remain as their original phrase.
- Brand and theme: ActionMint fixed-background mark; light uses cream/warm lilac/terracotta/sea-glass gradients, dark uses deep ink with teal/indigo/amber ambience, chartreuse remains an accent.
- Motion: scroll-triggered reveals, smooth scrolling, pointer tilt, and category transitions remain disabled or reduced for low-effects/reduced-motion preferences. Keep existing button animations.
- Frontend package manager: pnpm 10.8.1, pinned in `frontend/package.json` with committed lockfile.
- Deployment: Render blueprint is a starting point. No hosting account, DNS, or provider keys are supplied; deployment must be configured by the repo owner.
