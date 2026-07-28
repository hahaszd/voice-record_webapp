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

## 2. Sync the living docs (iron rule #1)
For everything this session changed, update the matching **living doc** in this same wrap-up (never "later"):
- Living docs: `README.md`, `FEATURES.md`, `ARCHITECTURE.md`, `CLAUDE.md`. If a code change altered behavior / endpoints / env vars / deploy flow described there, fix that section.
- `VERSION_HISTORY.md`: add or extend the `vNNN` entry for code changes and bump the "Current Version" header. (It's an append-only log but is actively appended by convention.)
- **Cache-bust: nothing to do.** Since v123 it's automatic (content hash injected by `server2.py`'s
  `_inject_asset_versions()`); source HTML uses `?v=auto`. Never hand-edit a `?v=` value back to a
  number. If `tests/smoke/asset-versioning.spec.ts` fails, the injection broke — fix it, don't paper
  over it (returning visitors would get pinned to a stale cache key).
- **Version bump:** feature version lives ONLY in `APP_VERSION` (`server2.py`). Bump it there for a
  meaningful change; leave historical `vNNN` code comments alone.
- Don't retro-edit the ~160 frozen historical `.md` files.

## 2b. Sweep the session into BACKLOG / DECISION_LOG (iron rule #2)
**Do this even when no code changed** — this is the step that catches what rule #1 misses. Re-read the
session and ask: what did we decide, reject, or leave undone that will matter later?
- **Not yet done** (todo, direction, needs-owner-decision) → **`BACKLOG.md`**.
- **Happened but no code change** (decision, **rejected direction + why**, ops/API-key/dashboard/config
  change, important fact established after investigation) → append to **`DECISION_LOG.md`** under
  today's date, newest date on top.
- Filter: *"in three months, would someone need this to answer 'why did we decide that?'"* If no, leave
  it out. Don't log transient chatter.
- **⚠️ PRUNE `BACKLOG.md` — this is mandatory, not optional.** Move finished items out (code change →
  `VERSION_HISTORY.md`; no code change → `DECISION_LOG.md`) and delete dead ones with a one-line reason.
  A backlog that only grows gets mistaken for current state and rots (see `INDIE_DEVELOPER_ROADMAP.md`).
- **Verified findings** (anything tested/measured/looked up this session, **including what the owner
  verified themselves outside the repo**, and including negative results) → update
  `DECISION_LOG.md`'s **"✅ 已验证结论速查"** section, with conclusion + how verified + when. Also record
  what was *not* covered — an unstated gap reads as verified. This is the section future sessions consult
  *before* re-testing or re-asking, so it must stay accurate.
- Never retro-edit past dated `DECISION_LOG.md` entries — that part is a log. Wrong entry → append a
  correction. (The 速查 section at the top *is* meant to be updated — it's current state, not history.)

## 2c. Fix any stale living doc you noticed (iron rule #3)
If anything you read this session contradicted reality — a claim about local setup, a version number, a
file that does/doesn't exist, an endpoint — **fix it now**, don't just report it. Verify against the
code/filesystem first, then edit. Applies to living docs + trackers only; `DECISION_LOG.md`,
`VERSION_HISTORY.md` and the ~168 frozen root `.md` files are history and stay as-is. Too big or
uncertain to fix inline → it goes in `BACKLOG.md` instead of being dropped.

## 3. Update the eval tracker
`tests/EVAL_CHECKLIST.md` is the living tracker. Mark completed items ✅ with the spec filename, keep each item's Layer/priority/status honest, and refresh the "现状汇总" so the P0/P1 picture is current. Test/eval gaps live here, **not** in `BACKLOG.md` — `BACKLOG.md` may point to them, not duplicate them.

## 4. Commit + push (dev → prod)
- Commit on `dev` with a clear, specific message. End the message with a co-author trailer naming the
  model that actually did the work, e.g. `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Push `dev`, then `git checkout main && git merge dev && git push origin main` (prod auto-deploys), then `git checkout dev`.
- **Pushing to prod is outward-facing — confirm with the user first unless they've already said go this session.** Never auto-ship to prod on your own initiative.

## 5. Verify the deploy (runtime changes only)
For changes to `static/script.js` / `server2.py` / `api_fallback.py`:
- Poll the target URL until it returns the new build — the served HTML must carry **content-hash**
  `?v=` values (v123+; a `?v=auto` in the response means the deploy is stale or injection broke)
  and/or health 200: dev = `https://web-dev-9821.up.railway.app`, prod = `https://voicespark.app`.
- For frontend logic, cross-check the real behavior via the Chrome extension against the live site (same harness as the tests).
- Doc-only / test-only changes need no deploy verification (no runtime effect).

## 6. Write `HANDOVER.md` (the baton)

Write `HANDOVER.md` at the **repo root** — in the repo, versioned, and visible to the owner. It is a
**baton for the next session, not a summary of this one**.

**Route everything else out FIRST.** Steps 2–3 already did most of this; anything still in your head
goes to its real home before you write a line here:

| Thing | Where it goes |
|---|---|
| Outstanding item — todo, deferral, open question | `BACKLOG.md` (with a status marker) |
| Decision, rejected direction + why, ops change, **verified finding** | `DECISION_LOG.md` (速查区 for findings) |
| Test/eval gap | `tests/EVAL_CHECKLIST.md` |
| Durable fact about architecture/commands/setup | `CLAUDE.md` |
| A working habit true **beyond this repo** | memory (`~/.claude/.../memory/`) |

**Litmus test: if a paragraph would still be true and useful in a month, it belongs in another file.**
Move it, don't copy it.

Then write only what's left — four sections, drop any that's empty:
1. **Where things stand.** Committed/pushed or not, tests green or not, deployed or not, anything
   half-applied or running. Be exact: "all pushed, dev==main, 31+49 green, prod verified" beats "done".
2. **The next task, with just enough context.** Name it, point at the `BACKLOG.md` entry, add the one
   or two facts that make it actionable without re-derivation. A pointer, not a plan.
3. **What to be careful of.** The *shape* of what went wrong, not a list of fixes. "The A/B sample was
   too easy to discriminate the dimension being judged" is worth carrying; "fixed a typo" is git history.
4. **Waiting on the owner.** Anything asked and unanswered, any owner-only action (dashboard,
   credentials) that blocks progress. State what was asked so the next session opens with it.

**Rules:**
- **Open with the date and an explicit "delete or rewrite this when absorbed".** A stale baton is worse
  than none — it reads authoritative.
- **Never duplicate `BACKLOG.md`.** Reference it. Two lists of outstanding work diverge within a session.
- **No secrets.** Name the credential and where it goes (`.env`, Railway var), never its value.
- **State what is unfinished and unverified**, including things you were unsure about. The failure mode
  of a handover is optimism — reporting the *intent* of the last change rather than its verified state.
- Keep it under ~100 lines. Point at files instead of restating them.
- **Absorbing one:** if `HANDOVER.md` exists at session start, read it, follow its pointers, then
  **delete or rewrite it** — don't leave the last baton lying beside this session's work.

**Memory is now only for what the repo can't hold** — working habits that apply beyond VoiceSpark.
Project status, decisions and todos go in the repo files above, where the owner can actually see them.

## 7. Final summary to the user
One tight recap: what shipped, test status (counts), what's live on dev/prod, and the top 1–3 next steps. No fluff.

---

## Project quick-reference
- **Deploy:** `dev` branch → `web-dev-9821.up.railway.app`; `main` → `voicespark.app`. Both auto-deploy on push. Normal flow: work/test on dev → merge to main.
- **Real app code:** `server2.py`, `api_fallback.py`, `static/script.js`, `static/index.html`, `static/style.css`.
- **Tests:** Playwright/TS in `tests/{smoke,functional,mobile,recording}` (`recording` = fake-mic project). Backend pytest in `tests/backend/` (`./venv/bin/pytest`, deps in `requirements-dev.txt`, scoped by `pytest.ini`).
- **Trackers:** `HANDOVER.md` (**ephemeral baton — read first, then delete/rewrite**) · `BACKLOG.md` (not yet done — living, must be pruned) · `DECISION_LOG.md` (decisions/rejections/ops + ✅已验证结论速查, append-only) · `tests/EVAL_CHECKLIST.md` (test gaps) · `VERSION_HISTORY.md` (code changelog by `vNNN`).
- **Versioning (v123+):** one number only — `APP_VERSION` in `server2.py`. Cache-bust is an automatic content hash; never hand-maintain a `?v=`.
- **Three iron rules** (see `CLAUDE.md`): #1 code ↔ living docs move together; #2 decisions/todos land in `BACKLOG.md`/`DECISION_LOG.md` immediately, even with zero code changed; #3 a stale living doc you notice gets fixed on the spot, never just remarked on.
- **No auth by design** (anonymous product); defenses are per-IP rate limiting (3 paid paths) + docs-off in prod. Feature versions tracked as `vNNN`.
