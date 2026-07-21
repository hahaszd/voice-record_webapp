# CLAUDE.md — VoiceSpark

Guidance for Claude Code when working in this repository.

## How to work with me (applies to EVERY conversation)

**Default to critical thinking, not agreement.** When I propose an idea, a feature, or an approach, do NOT just accept it and start building. First evaluate it critically and give me a verdict — is it good, flawed, or unnecessary — with reasons:

- Say plainly whether you think it's a good idea, and why or why not.
- Check whether it already exists / is partly solved before building it (verify in the code, don't assume).
- Point out flaws, risks, hidden costs, edge cases, and simpler or better alternatives.
- Push back when you disagree; don't flatter or rubber-stamp. I want an honest technical partner, not a yes-man.
- After the critique, give a clear recommendation, then let me decide before you implement.

This applies to all of my messages, in every session — treat it as a standing instruction, not a one-off.

**Act autonomously; escalate only real decisions.** Anything you can look up, read, verify, test, or
do yourself — **just do it, don't hand it back to me**. Don't ask me to confirm things you can determine
from the code, the docs, or a quick test; don't ask permission for reversible, well-scoped steps;
investigate and act. **Only bring me the things you genuinely cannot decide yourself:**
- Choices that depend on my preference, product direction, or business priorities.
- Ambiguous requirements where guessing wrong is costly.
- Decisions needing knowledge only I have (deployment/infra facts, external context, credentials).
- Irreversible or outward-facing actions that the safety rules / conventions say to confirm.

When you do escalate, give me a crisp recommendation + the minimum I need to decide — not an open-ended
question. This **refines, not overrides,** the two rules around it: (1) when I *propose* a new idea/
feature, still evaluate and give a verdict before building; (2) commit/push/deploy still follow the
"ask before committing/pushing" convention below — autonomy is about the *investigation and
implementation* work, not about shipping to prod on your own.

## What this is

VoiceSpark is a lightweight web app for **personal idea capture & learning notes**: record your voice and/or system audio (YouTube, podcasts, courses) in short snippets (30s / 1min / 5min), transcribe to editable, searchable text. Not a meeting recorder — focused on quick captures.

- Live product, actively maintained. Indie/solo project.
- GitHub: `hahaszd/voice-record_webapp` (origin). Deployed on **Railway**.
- The user migrated this from a Cursor project; older docs still reference `d:\Cursor voice record web\`.

## Tech stack

- **Backend**: Python 3.11, FastAPI + Uvicorn. Everything is served from two big files.
- **Frontend**: Vanilla HTML/CSS/JS (no framework, no build step). Web Audio API, MediaRecorder, IndexedDB (local audio history), Notification API. PWA (manifest.json).
- **Transcription APIs** (external): OpenAI Whisper (`whisper-1`), AI Builder Space (proxied Whisper), Google Speech-to-Text, Deepgram.
- **Tests**: Playwright (TypeScript) in `tests/`. `package.json` is *tests only*, not an app build.

## Key files (the real code lives here)

| File | Role |
|------|------|
| `server2.py` (~1400 lines) | **The** FastAPI app. All endpoints, static serving, Google STT, chat. `app` = the ASGI entry. |
| `api_fallback.py` (~1600 lines) | Transcription fallback engine — per-API transcribe fns + priority/quota/retry logic. |
| `logging_helper.py` | `TranscriptionLogger`, audio-format detection helpers used by server2. |
| `static/script.js` (~3800 lines) | All frontend logic (recording, VAD, upload, history, auto-copy, UI). |
| `static/index.html`, `style.css` | Main UI. `about.html`, `faq.html` also served. |
| `static/audio-storage.js` | IndexedDB local audio storage. |
| `main.py` | **Vestigial** "Hello API" demo — NOT the real app. Ignore / candidate for deletion. |
| `start.py`, `start.sh`, `Dockerfile`, `railway.json` | Deployment / startup (reads `PORT`, runs `uvicorn server2:app`). |

`static/script-old.js` and `script-new.js` are unused leftovers; `script.js` is live.

## Key backend endpoints (`server2.py`)

- `POST /speech-to-text` — Google STT path
- `POST /speech-to-text-aibuilder` — AI Builder path
- `POST /transcribe-segment` — main segment transcription (uses `api_fallback`)
- `GET /` and static assets, `favicon.ico`, `robots.txt`, `sitemap.xml`, `about.html`, `faq.html`

**v120 removed** (dead code, zero frontend callers): `/chat/completions`, `/hello`, `/hello/{name}`,
`/api`, `/transcribe-segment-legacy`, `/api-status` (its `get_api_status()` helper stays — still used
inside the transcription flow). `CHAT_API_USAGE.md` was deleted along with `/chat/completions`.

### Security posture (v120)

There is **no authentication** — anonymous, no-signup is the product design (see tool philosophy), so
API keys are not an option. The defenses are:

- **Rate limiting** (`rate_limit_middleware` in `server2.py`): per-IP, in-memory, applied only to the
  three paid-API paths (`/transcribe-segment`, `/speech-to-text`, `/speech-to-text-aibuilder`).
  Limits in `RATE_LIMITS` — currently 20/min and 150/hour. Client IP comes from `X-Forwarded-For`
  (Railway sits behind a proxy; `request.client.host` would be the proxy). Returns 429 + `Retry-After`.
  In-memory state is fine only while Railway runs a **single instance** — if you ever scale out,
  each instance gets its own counter and the effective limit multiplies.
  - **K6 (eval review 2026-07-21, empirically confirmed SAFE):** `_client_id` uses the leftmost XFF
    entry, which is **not** forgeable on Railway. Tested via a temporary `/_debug/xff` endpoint on dev,
    hitting it with a forged `X-Forwarded-For`: Railway's edge **strips/overwrites** the client-supplied
    XFF and puts the real client IP leftmost (the forged value never appears; X-Real-IP is likewise
    overwritten with the real IP). So `split(",")[0]` is the true client IP and can't be spoofed — no
    code change needed. (Real-IP rotation can still bypass, but that's the already-accepted tradeoff:
    block opportunistic scanners, not targeted attackers.)
- **API docs disabled in production**: `/docs`, `/redoc`, `/openapi.json` are `None` when
  `DEPLOY_ENVIRONMENT=production`, so the endpoint list and schemas aren't published.

Anyone determined can still rotate IPs (or forge XFF, see K6). The goal is blocking opportunistic
scanners and runaway scripts, not defeating a targeted attacker.

## Transcription fallback (api_fallback.py)

`transcribe_with_fallback()` — **microphone** scenario priority (verified against the actual code
body, `api_fallback.py:1402-1464`, not the docstring):
1. OpenAI Whisper (`whisper-1`) → returns `api_used="openai_whisper"`
2. AI Builder Space → `"ai_builder"`
3. Google Cloud STT → `"google"`

⚠️ **Deepgram is NOT in the microphone path.** It's the last backup only in the **system-audio**
path `transcribe_system_audio()` (order there: `gpt-4o-transcribe-diarize` → Google → Deepgram).
Heads-up: the code is self-contradictory here — `transcribe_with_fallback`'s own docstring
(`api_fallback.py:1378-1381`) claims "AI Builder→OpenAI→Deepgram", which matches neither the
execution order nor the actual third API. Trust the code body. (This bit us: earlier CLAUDE.md/
FEATURES copied the wrong "Deepgram" claim — caught by the eval-checklist review, 2026-07-21.)

`transcribe_with_preferred_api()` handles history re-transcribe with an explicit API choice.
Quota detection (`is_quota_exceeded` + `should_retry_api`) skips exhausted APIs for
`QUOTA_RECHECK_INTERVAL` (1h). Note `is_temporary_error` (`api_fallback.py:136`) is **dead code** —
defined but never called; any single-API failure just falls through to the next API, there is no
"retry the same API on transient error" path. `whisper-1` is deliberately chosen over
`gpt-4o-transcribe` for better Chinese accuracy on the mic path — don't "upgrade" it without checking
(the system-audio path intentionally uses `gpt-4o-transcribe-diarize` for speaker diarization).

## Running locally

```bash
# Python 3.11 recommended (system default here is 3.9 — use a venv)
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python server2.py           # or: uvicorn server2:app --port 8000
# open http://localhost:8000
```

Needs a browser + localhost/HTTPS for mic & system-audio permissions.

### Secrets / env vars (none are committed)

Code reads these via `os.getenv` (see `server2.py`, `api_fallback.py`):

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | OpenAI Whisper (primary transcription) |
| `AI_BUILDER_TOKEN` / `AI_BUILDER_API_BASE` | AI Builder Space |
| `DEEPGRAM_API_KEY` | Deepgram fallback |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Google STT — full service-account JSON as a string (Railway). Locally falls back to a `oceanic-hook-*.json` file. |
| `DEPLOY_ENVIRONMENT` | `production` / `development` banner |
| `PORT` | Railway-injected |

**Not present locally right now**: no `.env`, no Google `oceanic-hook-*.json`, `aibuilder_config.json` has no token. So transcription won't work until the user supplies keys. `.env`, `aibuilder_config.json`, and `oceanic-hook-*.json` / `*-credentials.json` are gitignored — see `CONFIG.md` for the token-loading precedence (env var → `.env`/`aibuilder_config.json`). Never commit secrets.

## Testing

```bash
npm install            # first time (Playwright)
npm run test:smoke     # smoke (also the precommit hook)
npm run test:all       # full suite → HTML report
```
Tests live in `tests/{smoke,functional,mobile}` (Playwright/TS). `playwright.config.ts` at root. Many
`test_*.py` at **repo root** are ad-hoc audio-transcription scripts, not a test suite — don't run them
with pytest.

**Backend unit tests (v121): `tests/backend/` (pytest).** Cover `api_fallback.py`'s fallback engine
(priority / fallthrough / quota-skip) with the `_transcribe_*` fns mocked — no API keys, no network.
Dev-only deps in `requirements-dev.txt`; `pytest.ini` scopes collection to `tests/backend` (so bare
`pytest` won't pick up the root ad-hoc scripts) and sets `asyncio_mode=auto`.
```bash
./venv/bin/pip install -r requirements-dev.txt   # first time
./venv/bin/pytest                                 # runs tests/backend only
```
Not wired into the Playwright precommit — run manually (or add to CI) when touching backend logic.

## Deployment & branching (see ARCHITECTURE.md)

- `dev` branch → auto-deploys to Railway **development** (`web-dev-9821.up.railway.app`).
- `main` branch → **auto-deploys** to Railway **production** (`voicespark.app`). (ARCHITECTURE.md says "manual" but in practice production auto-deploys on push to main — confirmed by the owner 2026-07-06. No manual Redeploy needed.)
- Normal flow: develop/test on `dev` → merge to `main` → push → it goes live automatically.
- Rollback prod via Railway dashboard → Redeploy a previous deployment.
- The dual commits (same message twice) in git history come from committing to both branches.

## Conventions & gotchas

- **~160 Markdown docs at repo root** split into two kinds:
  - **Living docs (source-of-truth-adjacent, keep in sync with code):** `README.md`, `FEATURES.md`, `ARCHITECTURE.md`, `CLAUDE.md`. These describe *current* behavior/structure. The **iron rule** below governs them.
  - **Frozen historical logs (reference only, do NOT retro-edit):** everything else (`AUTO_COPY_*.md`, `V1xx_*.md`, `TEST_REPORT_*.md`, `DURATION_BUTTON_WARNING.md`, etc.) — snapshots of a past change. `VERSION_HISTORY.md` is the closest thing to a changelog. When code and a frozen log disagree, the **code wins** and the log stays as-is (it's history).
- Feature "versions" are tracked as `vNNN` tags in code comments/UI (currently ~v113 in `script.js`). Keep them consistent when touching related logic.
- **CACHE-BUST when editing `static/style.css` or `static/script.js`:** `index.html` links them with a version query (`style.css?v=NNN`, `script.js?v=NNN`). Returning visitors (and the CDN) cache by that exact URL, so if you don't bump the number, your CSS/JS change won't reach anyone who already loaded the site — it silently serves the stale file. ALWAYS bump both `?v=` numbers in `index.html` in the same change. (This bit us once: language selector shipped but rendered as unstyled native buttons in prod because `?v=` wasn't bumped.)
- Code comments and commit messages are frequently in **Chinese**; match the surrounding language when editing.
- Recent work focus (git log): client-side **VAD** to trim leading/trailing silence, 16kHz mono downsampling to stay under the 25MB upload limit, Whisper hallucination filtering, transcription history + re-transcribe with API selection.
- No linter/formatter config committed. Match existing style.

## 🔒 Iron rule: code and living docs move together

**Every code change that alters behavior, structure, or setup described in a living doc MUST update that living doc in the same change** — never in a "later" pass. If you change what the duration buttons do, how recording/auto-capture works, an endpoint, an env var, or the deploy flow, the matching section of `README.md` / `FEATURES.md` / `ARCHITECTURE.md` / `CLAUDE.md` is updated before the change is considered done.

- Applies **only to the four living docs** above — do not retro-edit frozen historical logs.
- If a change touches nothing in a living doc, no doc update is needed — but check, don't assume.
- If code and a living doc already disagree, the code is the truth: fix the doc to match (that's how this rule got added — `FEATURES.md`/`README.md` claimed the duration button auto-stops recording and auto-capture chunks "every 5 minutes"; neither is true — see those files).

## When making changes

1. Real app code = `server2.py`, `api_fallback.py`, `static/script.js`, `static/index.html`, `static/style.css`. Start there.
2. Prefer editing over adding yet another root `.md` file unless the user asks.
3. Ask before committing/pushing; if committing, do it on `dev` first (not `main`) unless it's a hotfix.
4. **Honor the iron rule above** — sync living docs in the same change.
