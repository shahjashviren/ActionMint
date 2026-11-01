from __future__ import annotations
import argparse
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
REQUIRED=[
 "README.md",".gitignore",".env.example","frontend/.env.example","backend/.env.example",
 "brief.md","DECISIONS.md","frontend/package.json","frontend/pnpm-lock.yaml","frontend/index.html",
 "frontend/public/assets/actionmint-mark.png","frontend/src/App.tsx","frontend/src/auth/AuthProvider.tsx",
 "frontend/src/auth/AuthContext.ts","frontend/src/auth/supabase.ts","frontend/src/api/client.ts","frontend/src/pages/NewMeetingPage.tsx","backend/app/main.py",
 "backend/app/security.py","backend/app/stt/media.py","backend/app/stt/youtube.py",
 "backend/requirements.txt","backend/tests/test_api.py","render.yaml"
]

def run(strict: bool=False)->list[str]:
    errors=[]
    for rel in REQUIRED:
        if not (ROOT/rel).is_file():errors.append(f"Missing required file: {rel}")
    forbidden="TO"+"DO"
    for base in (ROOT/"frontend"/"src",ROOT/"backend"/"app"):
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts",".tsx",".py",".css"}:continue
            text=path.read_text(encoding="utf-8",errors="replace")
            if re.search(r"\{\{[A-Z][A-Z0-9_]*\}\}",text):errors.append(f"Unresolved template marker in {path.relative_to(ROOT)}")
            if forbidden in text:errors.append(f"Placeholder marker in {path.relative_to(ROOT)}")
            if strict and "dangerouslySetInnerHTML" in text:errors.append(f"Unsafe HTML sink in {path.relative_to(ROOT)}")
            if strict and re.search(r"localStorage\.(?:setItem|getItem)\([^\n]*(?:transcript|session.token|app.token)",text,re.I):errors.append(f"Potential sensitive localStorage use in {path.relative_to(ROOT)}")
    if strict:
        for path in ROOT.rglob("*"):
            if not path.is_file() or any(x in path.parts for x in ("node_modules",".git","dist",".venv",".pytest_cache")):continue
            if path.name.startswith(".env") and path.name not in {".env.example"}:continue
            if path.suffix in {".py",".ts",".tsx",".json",".yaml",".yml",".sh",".md"}:
                text=path.read_text(encoding="utf-8",errors="replace")
                if re.search(r"(?:GEMINI_API_KEY|SUPABASE_SERVICE(?:_ROLE)?_KEY)\s*=\s*['\"]?(?!replace|dev-token|$)[A-Za-z0-9_\-/]{24,}",text):errors.append(f"Possible hard-coded credential in {path.relative_to(ROOT)}")
    return errors

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--strict",action="store_true");args=parser.parse_args()
    issues=run(args.strict)
    if issues:
        for issue in issues:print("FAIL:",issue)
        raise SystemExit(1)
    print("ActionMint repository checks passed"+(" (strict)" if args.strict else ""))
    registry=(ROOT/"frontend/src/features/meeting/categories.ts").read_text(encoding="utf-8")
    missing=[]
    for category_id in re.findall(r"record\('([^']+)'",registry):
        for frame in ("a","b"):
            asset=ROOT/f"frontend/public/assets/categories/{category_id}-{frame}.png"
            if not asset.is_file():missing.append(asset)
    if missing:print(f"INFO: {len(missing)} optional category-art files are absent; inline transition glyphs provide the fallback.")
