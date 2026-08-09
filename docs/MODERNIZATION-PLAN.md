# Personal OS — Health-First Modernization Plan

**Owner:** Michael · **Executor:** Claude · **Written:** 2026-08-08
**North star:** a lifelong personal health app — kettlebell training and
calorie/macro tracking dialed in perfectly — with pinpoint voice + photo
logging, a real conversational AI that can edit anything, a Claude-design
visual identity, and eventually a standalone Apple Watch app that replaces
Strava.

Finance and todos stay functional but frozen: no investment, no redesign,
until the health experience is world-class.

---

## Phase 0 — Solidify (DONE, 2026-08-08 session)

Access restored, security closed (RLS + server-side API auth), safe dep
bumps, AI/voice layer modernized and live-verified, known bugs fixed, working
practices imported (CLAUDE.md, state.md, deferred-items.md). Details in
[`docs/state.md`](state.md).

**What this already changed for daily use:** voice transcription is now on
the newest model with kettlebell/food vocabulary baked in, the chat
understands follow-ups ("actually it was three eggs"), and photo analysis
can't return broken JSON anymore.

## Phase 1 — Foundation completion (next Claude session, ~half a day)

| # | Item | Notes |
|---|------|-------|
| 1.1 | Merge + deploy the `claude/phase1-modernization` branch | **Michael's go required** — one approval, then it's live |
| 1.2 | Prisma 5 → 7 + real migration history | DB backup first; baseline the live schema; retire `manual-migrations/` + the runtime schema-sync endpoint |
| 1.3 | TypeScript 5 → 7 | isolated commit; fix strictness fallout |
| 1.4 | Health safety-net tests | vitest around chat tool-dispatch, timezone day-keys, food batch logging, workout parsing — the walls Phase 2 will lean on |
| 1.5 | AI provider decision **(Michael)** | see Decision 1 below — 5-minute answer, unblocks Phase 2 chat architecture |

## Phase 2 — The health experience (the big one; starts immediately after 1.x, design runs in parallel NOW)

### 2a. Claude-design visual identity — **Michael can start this today**

The paste-ready brief is at
[`docs/design/claude-design-brief.md`](design/claude-design-brief.md).
Workflow: Michael runs the brief through Claude design (claude.ai) whenever he
wants, iterates on looks he likes, and drops the outputs (palette, type,
reference screens — even screenshots) back into `docs/design/`. Claude (code)
translates them into Tailwind tokens in `app/globals.css` and rebuilds the
health surfaces to match. **Nothing else blocks on this** — backend work
proceeds in parallel; design lands whenever it's ready.

### 2b. Real conversational chat — the new center of the app

- A proper chat surface (streaming, message list, session persistence in the
  existing `AIConversation` table — resume, scroll back, rename).
- **Full editing through chat**: tools for update/delete across food logs,
  workouts, water, measurements — "change lunch to 650 calories", "delete
  yesterday's run", "what was my kettlebell volume this week?" — every tool
  call still lands as a confirm-card before it commits (the existing
  confirmation UX is good; it stays).
- Voice becomes an input mode INTO the chat (not a separate one-shot flow),
  with the option later of the realtime voice API for true talk-back.
- Query tools over history: PRs, streaks, weekly macro averages — the AI can
  read the data, not just write it.

### 2c. Calorie tracking dialed in

- **Nutrition-label memory** (Michael's feature): snap a label photo →
  structured parse (per-serving macros) → save as a **named local food**
  ("Colanta protein yogurt") → from then on "I had a Colanta yogurt" logs
  exact macros, no estimation. Uses the existing `FavoriteFoods` table as the
  base, extended into a proper personal food library.
- Meal-photo flow refinement: portion calibration, multi-item edit in one
  card, photo optionally stored with the log (progress-photo storage pattern).
- "My usuals": one-tap repeat of frequent meals, learned from history.

### 2d. Kettlebell + workout tracking dialed in

- Exercise-aware logging: sets × reps × weight per exercise (schema already
  supports it — the UX doesn't surface it well).
- **PR detection + history**: automatic per-exercise bests (heaviest bell,
  most reps, volume PRs), a PR timeline, and chat awareness ("new PR?" gets a
  real answer).
- Kettlebell-specific catalog (swings, goblet squat, TGU, clean & press,
  snatch, complexes) so voice logs land on canonical exercise names —
  this same catalog becomes the watch app's exercise picker.

## Phase 3 — Apple Watch app (after 2b/2d foundations; overlaps 2c fine)

The 369-line Swift scaffold in `ios/` + the 5 live `/api/mobile/*` endpoints
are the starting point. The Mac phase that never happened, happens:

| Step | What |
|------|------|
| 3.1 | Xcode workspace: iOS companion + watchOS app targets, HealthKit + Background Modes entitlements, Keychain token storage (replacing UserDefaults) |
| 3.2 | Watch workout session: start/stop/pause from the wrist, live HR + calories via HKWorkoutSession (manager already drafted) |
| 3.3 | **Kettlebell mode**: on-wrist set logging — pick exercise, crown-dial the weight, tap reps, PR haptic when a set beats history |
| 3.4 | Offline queue → `/api/mobile/workouts/sync` (queue code drafted); Apple Health daily snapshot import |
| 3.5 | GPS route recording for runs/walks/hikes (HKWorkoutRouteBuilder + CoreLocation) — the actual Strava replacement |

**Michael's prerequisites:** Apple Developer account active + signing on this
Mac (needed at 3.1). Design tokens from 2a get mirrored on-watch.

## Phase 4 — Strava fully replaced

Route maps rendered in-app from our own GPS data (route-map component exists
for Strava polylines — re-point it), pace/splits, activity history parity.
Strava OAuth demoted to optional import; then retired.

---

## Decisions Michael owns (answer whenever — none block tonight's work)

1. **AI provider for the Phase 2 chat.** Options: (a) stay OpenAI — works
   today, zero setup; (b) **add Claude (recommended for the agentic
   chat/editing loop)** — create an Anthropic API key, add
   `ANTHROPIC_API_KEY` to `.env.local` + Vercel, the `lib/openai.ts` seam
   makes the swap one file; (c) Vercel AI Gateway — one key, any model,
   unified billing (the setup screen you screenshotted is the coding-agent
   variant, not this). Architecture is provider-agnostic either way.
2. **Deploy cadence.** Recommend: merge Phase 0/1 branch now (it's verified),
   then auto-deploy each merged branch after its self-smoke, with the
   completion-report checklist as your review. Alternative: you approve every
   merge (current default).
3. **Demo mode**: keep or kill the demo plumbing (deferred-items has it).
4. **Apple Developer account** status, when Phase 3 nears.

## Standing cadence

Each session: read `CLAUDE.md` + `docs/state.md` + this plan → execute the
next unblocked item → self-smoke → update `state.md` → completion report with
Michael's 3–7-item checklist. Small discoveries go to `deferred-items.md`,
premise-breaking discoveries halt and surface.
