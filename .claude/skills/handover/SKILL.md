---
name: handover
description: End-of-session wrap-up / handover for VoiceSpark. Verifies a green build, syncs the living docs, commits and pushes dev→prod, updates the eval tracker, and writes a handover memory so the next conversation can continue cleanly. Use when finishing a work session or when the user says "wrap up", "hand over", "prepare delivery / 交付", "collect loose ends", or "get ready for next time".
---

# Handover / session wrap-up (VoiceSpark)

Goal: leave nothing half-committed, half-documented, or unverified between conversations.
Work the steps in order. If a step surfaces a problem, **stop and fix or flag it** — do not paper over red tests or skipped docs. Follow the repo's iron rules (critical thinking; code↔living-docs in sync; act autonomously, escalate only real decisions).

## 1. Verify green state
- `git status --short` — capture anything uncommitted (you'll handle it in step 4).
- Backend: `./venv/bin/pytest -q` (needs `requirements-dev.txt` installed once). Must pass.
- Frontend: ensure the app is on `http://localhost:8000` (start it if needed), then
  `npx playwright test --project=functional --project=smoke-chrome --project=recording --reporter=line`.
  The **mobile** project has known pre-existing failures — don't block the handover on those; do block on any regression in the others.
- Report pass/fail counts. Red → fix or clearly flag before continuing.

## 2. Sync the living docs (iron rule)
For everything this session changed, update the matching **living doc** in this same wrap-up (never "later"):
- Living docs: `README.md`, `FEATURES.md`, `ARCHITECTURE.md`, `CLAUDE.md`. If a code change altered behavior / endpoints / env vars / deploy flow described there, fix that section.
- `VERSION_HISTORY.md`: add or extend the `vNNN` entry for code changes and bump the "Current Version" header. (It's a frozen log but is actively appended by convention.)
- **Cache-bust:** if `static/script.js` or `static/style.css` changed, bump BOTH `?v=NNN` in `static/index.html`.
- Don't retro-edit the ~160 frozen historical `.md` files.

## 3. Update the eval tracker
`tests/EVAL_CHECKLIST.md` is the living tracker. Mark completed items ✅ with the spec filename, keep each item's Layer/priority/status honest, and refresh the "现状汇总" so the P0/P1 picture is current.

## 4. Commit + push (dev → prod)
- Commit on `dev` with a clear, specific message. End the message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Push `dev`, then `git checkout main && git merge dev && git push origin main` (prod auto-deploys), then `git checkout dev`.
- **Pushing to prod is outward-facing — confirm with the user first unless they've already said go this session.** Never auto-ship to prod on your own initiative.

## 5. Verify the deploy (runtime changes only)
For changes to `static/script.js` / `server2.py` / `api_fallback.py`:
- Poll the target URL until it serves the new `?v=` (frontend) and/or returns health 200 (backend):
  dev = `https://web-dev-9821.up.railway.app`, prod = `https://voicespark.app`.
- For frontend logic, cross-check the real behavior via the Chrome extension against the live site (same harness as the tests).
- Doc-only / test-only changes need no deploy verification (no runtime effect).

## 6. Write the handover memory
Update/create a `project`-type memory in the memory dir capturing: current status, what's in-flight, next steps, and any non-obvious gotchas found this session. **Point to the in-repo trackers** (`tests/EVAL_CHECKLIST.md`, `VERSION_HISTORY.md`) rather than duplicating them. Add a one-line pointer in `MEMORY.md`. (Memory files live outside the repo and are the cross-conversation channel.)

## 7. Final summary to the user
One tight recap: what shipped, test status (counts), what's live on dev/prod, and the top 1–3 next steps. No fluff.

---

## Project quick-reference
- **Deploy:** `dev` branch → `web-dev-9821.up.railway.app`; `main` → `voicespark.app`. Both auto-deploy on push. Normal flow: work/test on dev → merge to main.
- **Real app code:** `server2.py`, `api_fallback.py`, `static/script.js`, `static/index.html`, `static/style.css`.
- **Tests:** Playwright/TS in `tests/{smoke,functional,mobile,recording}` (`recording` = fake-mic project). Backend pytest in `tests/backend/` (`./venv/bin/pytest`, deps in `requirements-dev.txt`, scoped by `pytest.ini`).
- **Eval tracker:** `tests/EVAL_CHECKLIST.md`. **Changelog:** `VERSION_HISTORY.md`.
- **No auth by design** (anonymous product); defenses are per-IP rate limiting (3 paid paths) + docs-off in prod. Feature versions tracked as `vNNN`.
