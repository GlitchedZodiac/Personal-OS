# State

Single source of truth for "what's done and what's in flight." Newest entry
first. Update the top of this file whenever a session ships.

---

**Last updated:** 2026-08-09 (Settings/Train/Today full ports + sequences API live)
**Current phase:** Phase 1 complete; AI provider decided (all-OpenAI, 5.6
tiers, live on prod). Web: Pitaya Settings + Train + Today are FULL ports
now (Michael's locked order), sequences/habits/journal backends live —
next: Chat rebuild (2b), then Body, then Food. Watch Phase 3 running in
parallel — core loop works in simulator; sequences API is now live so the
wrist routines UI is unblocked.
**Branch in flight:** `claude/phase1-modernization` (web, deployed to prod
via `vercel deploy --prod`; UNPUSHED to GitHub — 403, collaborator access
pending, see deferred-items) · `claude/watch-app` (watch lane, local).

## 2026-08-09f — Settings/Train/Today full ports + sequences backend on prod

The build block Michael ordered ("train and today full are the primary
focuses… settings also needs to be fully adopted"). All three screens are
now extraction-grade ports of pitaya-app.dc.html; the watch's missing
sequences contract is implemented and deployed.

Backend (all cookie-gated via proxy.ts unless noted; all verified on prod):
- **Migration `sequences_habits_journal`**: `Sequence` (name/kind/steps Json/
  restSecondsDefault/isArchived), `HabitCheck` (@@unique [name, localDate]),
  `JournalEntry` (localDate @unique).
- **lib/sequences.ts** — SEQUENCE_KINDS (straight/emom/tabata/circuit),
  validateSequence(): catalog-normalizes step exercises via
  normalizeExerciseName (falls back to free-form), steps carry
  sets/reps/seconds/weightKg/restSeconds, reps-or-seconds required,
  ≤40 steps, name ≤60. 8 new vitest cases (61 total green).
- **/api/health/sequences** (GET/POST/PATCH incl. archive) — web CRUD.
- **/api/mobile/sequences** (GET, bearer) — the watch-contract v1 payload;
  401s without a device token (verified).
- **/api/health/habits** (GET ?date / POST toggle) and **/api/health/journal**
  (GET ?date / POST upsert+append; journalling auto-ticks the "journal"
  habit).
- **/api/health/devices** (GET active DeviceSessions / DELETE revoke) —
  powers the Settings pairing card; "Unpair" is real revocation.
- **Composite screen endpoints** so each screen is one fetch:
  `GET /api/health/today` (zone-aware food streak, calorie ring + P/C/F
  from UserSettings targets, train tile, weight tile + 12-point spark,
  journal state + day number, habit ticks) and `GET /api/health/train`
  (ISO week number, Mon-start weekly tonnage via new sessionVolumeKg() in
  lib/prs.ts, latest-PR banner data (≤7 days old), today's session rows
  with per-row PR flags from personal_records.workoutLogId, 8-week volume
  buckets + pct change, latest trail). Both take ?date&tz from the client.

Screens (all Familjen/Instrument, light-only per design "Night — next build"):
- **Settings** — CONNECTIONS & APP header; drawn-watch pairing card with the
  design's exact SVG + state colors (face #A63D63 when paired, card
  #F0F7F1); five-row feature list flips off→ON with the connection; DATA
  card (CSV import → /settings/import, Weekly PDF Export = pending toast,
  Strava row kept as surfaced deviation — still the GPS source); APP list
  (PIN lock expands the real changer, Units tap-toggles, Appearance shows
  the design's literal "Day · Night — next build", Chat language EN/ES);
  AI status card stays (accepted deviation). The watch lane's simulator
  session appeared live in the card during verification — pairing state is
  real end-to-end.
- **Train** — WEEK n · KETTLEBELL BLOCK header + weekly-volume pill;
  "● Start live workout" + "Routines"; shimmer NEW PR banner (only when
  ≤7 days fresh); today's-session card with PR chips + #FDF7FA row tint;
  VOLUME · 8 WEEKS bars in the design's exact color ramp; TRAILS card from
  real workout rows (title trimmed at Strava's "•"), Record = pending
  toast (watch owns recording). **Live workout sheet**: routine picker →
  elapsed clock, CURRENT · SET n OF x, −/+ set logging, prev/next
  movement, End & save → POST /api/health/workouts → PR toasts from
  newPRs. **Routines sheet** per design + builder page at
  /health/workouts/routines (kind pills, movement rows with
  sets/reps/secs/kg, datalist over the 48-movement catalog, archive).
- **Today** — SUN · AUGUST 9 header + diamond streak pill (hidden at 0);
  150px calorie ring (dasharray 339.3, tap-to-flip eaten↔remaining);
  P/C/F bars (#A63D63/#232227/#A9A7AE) against settings-derived gram
  goals; TRAIN tile (kettlebell icon, week volume, PR count) + WEIGHT tile
  (latest, delta, real sparkline); TONIGHT'S PAGE · DAY n with a **real
  voice memo** (MediaRecorder → /api/ai/transcribe → journal append →
  "✓ appended" state, VU bars while listening) + "+" text sheet; HABITS
  tap-to-tick 40px tiles (Creatine/Mobility/10k steps/Journal); Sunday
  Report row (PDF = pending toast).
- Design keyframes added verbatim (sheetUp/vu/soft-pulse/fadeUp); radius
  audit — the app's --radius scale rendered 12px-design corners at 20px,
  swept all four new pages to exact px values (rounded-[16px]/[12px]/[8px],
  bars rounded-t-[6px]).

Verification: tsc clean · 61/61 vitest · clean `next build` · dev-server
smoke with minted cookie (sequence create normalized "two hand swings"→
kb-swing; habit toggle; journal append auto-ticked habit; smoke rows
cleaned from DB after) · mobile endpoint 401 gate · all three screens
screenshotted in the browser at 375px · prod deploy Ready + prod smoke of
today/train/sequences (200s with real data) and mobile 401.

Notes: legacy 1,009-line workouts page replaced wholesale (git history
keeps it; manual editing returns with chat 2b). Old /api/health/streak
still exists but Today computes its own zone-aware streak. Next dev now
appends a Next.js agent-rules block to CLAUDE.md (self-regenerating,
harmless). Trail elevation sparkline intentionally omitted until real
elevation-series data exists (PORT GATE: no fake data).

Watch lane: sequences deferred item marked resolved — wrist routines UI
can start against `GET /api/mobile/sequences`.

## 2026-08-09e — [watch] Pitaya watch app: core loop live in simulator

First watch-lane session. The Xcode phase that never happened, happened —
and the full core loop runs against prod from the wrist simulator.

Shipped (branch `claude/watch-app`, ios/** + docs/watch docs):
- **Xcode project generated** (XcodeGen, `ios/project.yml`): `PersonalOS`
  (iOS 18 companion placeholder) + `PersonalOS Watch` (watchOS 11 standalone,
  WKWatchOnly) — both build green on Xcode 26.6/SDK 26.5. No sudo needed:
  `DEVELOPER_DIR` override documented in ios/README.md. iOS sim platform
  runtime downloaded (watch runtime was already present).
- **Scaffold audit → rewrite.** The blind-from-Windows scaffold had real
  bugs: query strings percent-encoded into paths, stock .iso8601 decoding
  that rejects the backend's fractional-second dates, non-optional fields
  that crash on real null-bearing rows, missing `exercises` payload, a
  potential infinite 401 retry loop, tokens in UserDefaults. All fixed;
  tokens now Keychain-only (`ios/Shared/Storage/SessionStore.swift`).
- **Exercise catalog mirrored, with aliases** (`ios/scripts/gen-catalog.mjs`
  → generated Swift). Self-smoke caught that exact-name matching missed his
  real history ("Kettlebell swings" plural → no match → false 16 kg PR);
  ported the fold+alias+containment normalizer — watch baselines now equal
  the server backfill's bests (20 kg swing/goblet, 16 kg press/clean, 12 halo).
- **Pitaya watch design implemented** (from design project `Pitaya
  Watch.dc.html`, all tokens in `ios/Shared/Theme.swift` as the one seam):
  welcome → PIN pad → paired; home; live metrics (elapsed, beating-heart HR,
  zone bar, kcal); kettlebell set logger (crown weight dial, rep stepper,
  PR flash + haptic); controls (end/pause/water-lock/repeat); summary with
  stats grid + PR banners + sync state. Fonts not bundled yet (system face
  via the Theme seam; deferred item).
- **Local PR engine** (`PRBaselines.swift`) mirroring lib/prs.ts semantics
  (weight + volume), built from `GET /api/mobile/workouts` history because
  `/api/health/prs` is cookie-gated (deferred ask filed for /api/mobile/prs;
  also: mobile sync doesn't run server PR detection — filed).
- **Offline queue → sync** with server-side (externalSource, externalId)
  upsert dedupe.

Self-smoke (all against live prod, then cleaned up — 4 workout rows + 4
device sessions created and deleted, verified before each delete):
- Headless seams (DEBUG-only env vars) drove the real AppModel paths:
  pair → fetch → baselines → 2 sets → finish → sync; row landed with exact
  `{name, sets, reps, weightKg}` entries.
- Full INTERACTIVE UI run via simulator taps: wrong-PIN 401 error state →
  pair → HealthKit grant sheets → live session with **streaming simulated
  HR (64 bpm), zone bar live** → tap-logged sets (16 kg × 10 and × 11) →
  End → summary showed volume-PR-only (16<20 weight correctly suppressed)
  → synced; prod row carried avgHR 60 + both sets.
- Fixed en route: reps text wrapping, "1 sets" pluralization, iPhone
  HealthStore continuation that had never compiled.

Not built yet (design exists): sequences/EMOM timers (no backend contract —
deferred), rest timer, GPS routes (3.5), sleep/recovery screens, iPhone app,
complications. Watch sim left booted at the fresh welcome screen for Michael.

## 2026-08-09f — Lanes untangled, watch contract signed, order locked

Michael set the build order: **Train + Today-full first, then Chat rebuild,
then Body, finally Food** — with a FULL Settings port (it still leans on
legacy data/structures) leading the next block. PORT GATE to be propagated
to TheProcessLounge + The Foundry per his ask.

- **Worktree split DONE** (the [BOTH LANES] hazard): both branches aligned
  at superset tip bebd92a; this directory stays main-lane on
  claude/phase1-modernization; the watch lane's home is now
  `~/VibeCoding/personal-os-watch` (worktree, claude/watch-app). CLAUDE.md
  updated with lane directories + never-switch-in-the-other-lane's-dir rule.
- **docs/watch-contract.md** — ownership map + sequences contract v1
  (main builds model/API/iPhone builder in the Train stage; watch runs them
  read-only) + pairing-code contract v2 (deferred until iPhone Devices UI)
  + dispositions for all five [watch] items.
- **Shipped for the watch**: PR detection now runs in
  `/api/mobile/workouts/sync` (returns `prs[]` per item) and
  `GET /api/mobile/prs` (bearer) serves baselines — two of the five [watch]
  asks closed.
- Answered: ONE repo forever; the watch app never touches Vercel (Xcode
  builds it), so the single free Vercel project stays.

## 2026-08-09e — Design-parity fixes after Michael's review

Michael flagged: nav icons and logo weren't from the design, Body/Food still
old pages, coach remnants visible. Fixes:
- THE PORT GATE added to CLAUDE.md — designs are ported verbatim (assets
  extracted from the design file, never substituted); "close enough" is a
  defect. Applies to both lanes.
- components/pitaya-icons.tsx — every icon extracted verbatim: tab bar
  (Body person, Food bowl, Today circle-dot, Train KETTLEBELL, Settings
  sun-gear), dock (chat bubble, white mic, camera), and the REAL logo: the
  dragonfruit (raspberry tile, white flesh, 4 seeds, 2 leaves) found on the
  design's lock screen. The uploaded PNG turned out to be the color muse
  (a Dragon Fruit-finish guitar), not a logo.
- Tab bar rebuilt: five even tabs, design icons, no invented center diamond.
- Dock rebuilt to design: floating pill, chat 46 · raspberry mic 54 ·
  camera 46, design glyphs.
- PIN gate + sidebar + app icons (qlmanage SVG render) now use the
  dragonfruit; sidebar carries the design icon set.
- Health hub: AI Morning Brief card stripped (his no-popup-AI rule).
- Body/Food/Train screens confirmed to Michael as STAGED (not missed):
  next build order agreed below.
## 2026-08-09d — PITAYA: design landed, Stage A shipped

Michael's Claude-design arrived (project "Pitaya") and he mandated radical
simplification: strip finances/todos/AI-trainer surfaces, follow the design
~99%. Imported via DesignSync into docs/design/: pitaya-app.dc.html,
pitaya-watch.dc.html (FOR THE WATCH LANE — read it!), pitaya-tokens.md
(extracted spec: raspberry #A63D63 family, ink #232227, bg #F2F1F2, pills,
Familjen Grotesk + Instrument Sans, light-first).

Stage A shipped:
- globals.css → full Pitaya token set (light default + warm night .dark);
  legacy utility classes kept but restyled so unrebuilt pages stay coherent.
- Fonts swapped (Familjen Grotesk display / Instrument Sans body); metadata,
  manifest, theme colors → Pitaya; new diamond app icons (pure-node PNG).
- IA: 5 tabs Body | Food | Today (center diamond) | Train | Settings —
  finances/todos/trends/coach REMOVED from all nav (routes + data intact).
- PIN gate rebranded (diamond mark, PITAYA, bilingual tagline).
- Dashboard → Today v1: date header, 4 stat tiles, "notebook that talks
  back" card, VoiceInput chat dock mounted (was only on /health).
- Settings rewritten (1054 → ~350 lines) per design sections: WATCH (honest
  "Soon" rows), DATA (CSV import, Strava, export), APP (PIN, units,
  appearance Day/Night/Auto wired to html.dark, chat language EN/ES),
  SYSTEM (AI status card). Macro sliders/coach instructions/finance settings
  gone from UI (values persist in stored settings JSON).

Verified: build green, PIN gate visually confirmed in Pitaya skin.
Next stages: Today full build (habits/journal/supplements/voice memo +
schema), Food (usuals + supplements), Train (routines/PRs/trails), Body
(charts/body map/recovery), Chat rebuild (2b), weekly PDF.

## 2026-08-09c — Kettlebell catalog + PR system live; watch lane opened

Michael greenlit parallel work: main lane continues here; a dedicated watch
lane starts from `docs/watch-kickoff-prompt.md` (Xcode now installed).
CLAUDE.md gained a **Parallel lanes** section (main owns web/backend, watch
owns ios/** on branch `claude/watch-app`; /api/mobile/* is the contract;
cross-lane asks go through deferred-items).

Shipped (2d backend, design-independent):
- `lib/exercises.ts` — canonical exercise catalog (48 movements, kettlebell
  first-class) with EN/ES aliases + accent/hyphen-folding normalizer; the
  shared vocabulary for voice, PRs, plan imageKeys, and the watch app.
- `personal_records` table (migration 3) + `lib/prs.ts` — weight + volume
  records per canonical exercise; detection runs on workout create and
  returns `newPRs` in the POST response (celebration hook for UI/watch).
- `/api/health/prs` (bests + recent) and `/api/health/prs/backfill`
  (idempotent rebuild from full history — rerun when the catalog grows).
- Backfilled from his real history: 72 workouts scanned → 7 true records
  (20kg swing & goblet squat, 16kg press/clean, 12kg halo...).
- Self-smoke: below-best workout fired no weight PR; above-best fired with
  correct previousValue; test workouts deleted and backfill re-run clean.
- Tests 43 → 53 (catalog normalization EN/ES + PR extraction edge cases).

Remaining for 2d-adjacent: chat query tool ("what's my swing PR?") lands
with the 2b Responses-API rebuild; PR celebration UI lands with 2a design.

## 2026-08-09b — Prod DB outage fixed + AI status & spend metering

Michael hit "a failure" testing prod — root cause found in Vercel function
logs: **P1011, self-signed certificate**. The stored prod DATABASE_URL
carries sslmode=require; Prisma 5's engine encrypted without CA-verifying,
node-postgres verified and rejected Supabase's chain — every DB call 500'd
in prod while local (no sslmode) worked plaintext. Fix: adapter always
encrypts with rejectUnauthorized:false (except sslmode=disable), matching
engine semantics; verified both URL shapes locally; deploy #4 restored prod.
Vercel DATABASE_URL/DIRECT_URL values replaced with our verified aws-1 URLs
(still marked Sensitive, but now byte-identical to .env.local — no mystery).

His feature ask (connection clarity + balance visibility) shipped, deploy #5:
- `ai_usage_events` table (migration 2) — every AI call meters surface/model/
  tokens/cost at published 5.6 rates; recordAIUsage is fire-and-forget and
  hardened against stale clients.
- `/api/ai/status` + Settings "AI & System Status" card: OpenAI + DB health
  with latency, configured tiers, today/30d spend, Test button, top-up link.
  (OpenAI exposes no balance to API keys — metered locally, link out to top up.)
- classifyOpenAIError: chat/transcribe/photo now return actionable messages
  (quota/auth/rate-limit/network) surfaced in the voice-input toast.

Verified on prod: status OK/OK with spend flowing, chat write path in Spanish.

## 2026-08-09 — AI provider decision + GPT-5.6 tier upgrade

Michael decided: **all-OpenAI, one bill** — bilingual voice quality is the
deciding factor (no Anthropic audio API), and the reasoning need is coaching/
math-grade. Budget target ≤ $0.50/day.

- **GPT-5.6 tier system wired** (probed live on his key; pricing per OpenAI
  July 2026 cuts): `terra` ($2/$12) = everyday CHAT_MODEL (chat parsing, meal
  photos — vision verified); `sol` ($5/$30) = COACH_MODEL (workout-plan
  generation, trends insights/projections, reasoningEffort medium); `luna`
  ($0.20/$1.20) available via env. Overrides: OPENAI_MODEL / OPENAI_COACH_MODEL.
- **5.6 API rule discovered**: tools + reasoning not supported on
  chat-completions → chat route sets reasoning_effort "none" (right for parse
  turns anyway); Responses API migration queued for the 2b rebuild.
- **Token discipline**: 1500-token cap on chat turns; synthesis budgets raised
  (1200/2000, 1400/2200) because reasoning tokens share max_completion_tokens
  — a 220-token cap would have returned empty insights.
- Live-verified: Spanish breakfast parse (2 items, Colombian-aware macros,
  3.7s) + Spanish follow-up correction re-totaled correctly (2.3s). 2-3×
  faster than 5.5.
- Deploy #3 to prod. Xcode NOT installed on this Mac (CLT only) — full Xcode
  is Michael's action item before the watch phase.

## 2026-08-08 — Phase 1b session (Prisma 7, TS 6, tests, prod deploys)

Michael approved "run phase 1" and took the design brief to Claude design.

- **Prod deploy #1** (pre-Prisma work): security middleware + AI layer live.
  Verified: prod `/api/todos` 401 (was publicly 200!), PIN page renders, cron
  end-to-end 200 with real CRON_SECRET.
- **Prisma 5.22 → 7.9.1**: `prisma.config.ts` (URLs out of schema;
  `process.loadEnvFile` locally, platform env on Vercel); driver adapter
  `@prisma/adapter-pg` (engine-era URL params stripped, pool max 5) in
  `lib/prisma.ts` + `lib/prisma-request.ts`; **client-bundle leak fixed** —
  `route-map.tsx` (client) imported `lib/strava` → prisma → pg; extracted
  `decodePolyline` to client-safe `lib/polyline.ts`.
- **Migration history established**: JSON backup of all 43 models (1,698 rows)
  to `~/VibeCoding/personal-os-backups/` first; `0_init` baseline; **live-DB
  drift healed** — 25 missing FKs added (zero-orphan-verified), indexes
  renamed to Prisma conventions, `updatedAt` defaults dropped; drift re-diff
  now empty; archived as `manual-migrations/20260808_align_db_to_schema.sql`.
- **TypeScript 5 → 6.0.3**: TS 7.0.2 proven (Next typecheck 210ms native)
  but typescript-eslint blocks <7.1 — flip deferred. ESLint runs again;
  pre-existing finance-inbox errors deferred.
- **Tests 13 → 43**: extracted food-timing inference from the chat route to
  `lib/food-timing.ts`; new suites: food-timing (14), timezone (7),
  health-tools contract (5), strava/polyline (4). Caught own vitest-green/
  tsc-broken cast bug — the exact trap the TPL merge gate exists for.
- **Prod deploy #2**: full Phase 1 state live. Self-smoke on prod after.

## 2026-08-08 — Phase 1 modernization session (Claude, hands-off evening run)

Context: app untouched ~5 months; Michael set the new direction (health-first
lifelong app, voice/AI first, then Claude-design redesign, then watch app).

Shipped:

- **Access restored**: repo cloned to `~/VibeCoding/Mikes Personal OS`, Vercel
  CLI linked (`personal-os`), prod env pulled, DB connection rebuilt
  (Supabase pooler `aws-1-us-east-1`, password in `.env.local` only). App
  boots locally against production data (419 food logs, 100 workouts).
- **Security**: RLS enabled on all 43 public tables (anon key now reads 0 rows;
  Prisma unaffected — verified both sides). Dead `lib/supabase.ts` +
  `@supabase/supabase-js` removed. **`proxy.ts` added — the previously wide-open
  `/api/*` surface (confirmed 200 unauthenticated on prod) now requires the
  signed auth cookie** except auth/cron/mobile/OAuth-callback routes.
- **Deps**: Next 16.1.6→16.3.0, React 19.2.3→19.2.8, lucide/sonner/tw-merge
  bumped. Prisma 5→7 and TS 5→7 deliberately deferred (tasks #4/#5).
- **AI layer modernized** (the "voice + AI first" directive):
  - Deprecated `functions` API → modern `tools` API (`lib/ai-prompts.ts`
    exports `HEALTH_TOOLS`).
  - `/api/ai/chat` now accepts `history` — **real back-and-forth works**
    (self-smoke: "actually it was three eggs" returned the delta, live).
  - `voice-input.tsx` keeps a rolling 12-message history.
  - Transcription `whisper-1` → **`gpt-transcribe`** with a domain-vocabulary
    prompt (kettlebell/macros/Colombian food); whisper-1 fallback. Self-smoke:
    synthesized kettlebell audio transcribed flawlessly.
  - Meal photo analysis → strict `json_schema` structured outputs.
  - All model ids centralized in `lib/openai.ts` (`CHAT_MODEL` = gpt-5.5,
    override via `OPENAI_MODEL`).
- **Bug fixes** (from `docs/bug-backlog.md`): UTC date-key drift in
  trends/daily-log `isToday` and workout-plan chat history grouping; mojibake
  🔁 in todos; repo-wide mojibake scan clean.
- **Docs**: CLAUDE.md (operating model, adapted from TPL), this file,
  `deferred-items.md`, `MODERNIZATION-PLAN.md`, `design/claude-design-brief.md`,
  `.env.example`, rewritten README.

Verification: `npm run build` green (type-checked), vitest 13/13, middleware
401/200 both directions, live two-turn chat + workout logging + transcription
against the dev server with a locally minted cookie.
