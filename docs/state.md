# State

Single source of truth for "what's done and what's in flight." Newest entry
first. Update the top of this file whenever a session ships.

---

**Last updated:** 2026-08-09 (PITAYA Stage A web + [watch] app live E2E in sim)
**Current phase:** Phase 1 complete; AI provider decided (all-OpenAI, 5.6
tiers, live on prod). Web: Pitaya Stage A shipped, next stages queued. Watch
Phase 3 STARTED — core loop (pair → record → kettlebell sets → PR haptic →
sync) working in simulator against prod, Pitaya watch design implemented.
**Branch in flight:** `claude/phase1-modernization` (web, deployed to prod
via `vercel deploy --prod`; UNPUSHED to GitHub — 403, collaborator access
pending, see deferred-items) · `claude/watch-app` (watch lane, local).

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
