# State

Single source of truth for "what's done and what's in flight." Newest entry
first. Update the top of this file whenever a session ships.

---

**Last updated:** 2026-08-09 (Food port — the last un-ported screen;
label scanning as reusable products; from a cloud session)
**Current phase:** All five Pitaya screens + Chat are now design ports on
prod. **Michael is pausing to use the app and run a bug sweep.** Next block
(his 90-day priority, spec captured in deferred-items): training + Today
polish — live sessions w/ HR/zones/burn/analytics + post-workout AI report,
protocol-true EMOM/circuit runners on web + watch. Food stays deliberately
crude (calories/macros by input) until 2c. PR #1 open to main.
**Branch in flight:** `claude/phase1-modernization` (pushed; PR #1 open;
prod deploys via `vercel deploy --prod`; merge awaits Michael) ·
`claude/watch-app` (watch lane, local) · `claude/emom-guided-runner`
(cloud session; PR into phase1).

## 2026-08-09l — Food port: the last screen, plus label products

Michael's ask from the road: bring Food up to speed — label photos he
can store, meals set by voice, reusable defaults, meal slots.

- **Food screen ported** (design screen 2, the final un-ported surface —
  build order from 2026-08-09f is now complete): date header + kcal
  pill, day timeline with the design's per-meal colour tiles (breakfast
  #E8D9C8, lunch #C8D6C6, dinner #6B4A5C, snack #D8CBE0), macros as
  "28P · 44C · 22F", `usual` and `via chat ✓` pills driven by
  FoodLog.source, the dashed not-logged row, MY USUALS scroller, and a
  SUPPLEMENTS card. Legacy shadcn Card/Dialog/Select page retired.
- **Not-logged prompts are lunch + dinner**, not the design's dinner
  only — he eats those two; breakfast silence isn't a miss.
- **Supplements ride habit_checks** (the rows Today already uses), so a
  tick is a tick on both screens — no new model.
- **Label scanning → reusable products** (NOT in the design; his ask,
  cleared in chat): POST /api/health/food/scan-label reads a label's
  per-serving numbers (bilingual — Colombian panels included), the
  sheet scales by servings, and confirming logs today AND saves the
  product into MY USUALS with its photo. FavoriteFoods gains
  kind/servingLabel/photoData (migration 20260809220000). The list GET
  omits photoData so 20 base64 labels can't bloat the screen's load.
- **Kept from his bug sweep**: the Targets button (macro goals) — my
  first port dropped it; self-smoke caught it. Delete lives in the
  entry sheet since the design's timeline has no edit affordance
  (surfaced deviation).
- Self-smoke: 14 assertions on the running build (pills, totals,
  supplement state, product serving line) plus POST payload proofs —
  a usual logs with source=usual, a scan posts kind=product with
  servingLabel and the compressed photo, and macros scale 1.5×.
  Also caught: dock covered the last supplement row (pb-32 → pb-44)
  and "Not Logged" title-casing vs the design's "not logged".

## 2026-08-09k — EMOM runner: the clock IS the log (web half)

Michael's ask from the road (cloud session): "start routine" on an EMOM
must dive into the protocol, not into set-counting busywork — 3-2-1,
minute wheel, per-round movement cycling, congratulations, one-tap save.

- **components/emom-runner.tsx** — full-screen dark live surface ported
  from the watch design's sequence-live screens (pitaya-watch 05/08/09):
  #DC74A0 minute ring draining on the :60 over the #2A1420 track, ROUND
  X/Y micro, :SS Familjen countdown, raspberry movement line, "next ·"
  preview. Phone adaptations (no web comp exists — surfaced deviation):
  3-2-1 GET READY intro, pause/mute/end controls, save panel. Wall-clock
  engine (throttle-proof), screen wake lock, WebAudio cues (unlocked in
  the launch tap for iOS) + vibration + spoken round announcements
  (muteable, persisted).
- **Train page** — `startLive` routes EMOM routines into the runner —
  matched by `kind === "emom"` OR a name containing "emom" (the builder
  defaults kind to "straight", so routines built before the kind
  selector would otherwise fall silently to the manual sheet), with
  length defaulting to 20 min when durationMinutes is unset; the start
  picker's "EMOM · guided" chip shows which routines run guided; sets derive from rounds completed (round i → step
  i mod n) and save through the shared path with
  `metricsData.emom = {roundsCompleted, totalRounds}`. Ending early
  always offers Finish & save — a session is never silently discarded.
  Manual sheet unchanged for straight/circuit/tabata, but a logged set
  now starts a sage REST :ss countdown chip (step.restSeconds ??
  routine.restSecondsDefault, skippable, beeps out the last 3s) — the
  spec's circuit-rest-timer half.
- **globals.css** — sonner toast width pinned so the on-phone
  one-character-per-line vertical toast ("Nothing logged — session
  discarded." screenshot) can't happen.
- Watch half of the runner + HR/zones into the live screen remain with
  the watch lane (contract unchanged).

## 2026-08-09j — Sweep 2 fixed (portal sheets, chat send) + ZONES LIVE

Second on-phone sweep + his "fire the Strava upgrades" green light
(mountain training these next months — zones/effort/elevation are now
first-class).

Bug fixes:
- **Sheets really above the dock now.** Root cause found: `main { z-index:
  1 }` (page-in animation rule) creates a permanent stacking context, so
  in-page fixed sheets could NEVER out-stack the dock outside it —
  z-80 was meaningless. components/sheet-portal.tsx portals every bottom
  sheet (tape, journal, routines, start picker, live workout, targets) to
  <body>. This was the real "mic node covers everything" bug.
- **Chat composer: send button** — typing swaps the mic for a raspberry
  send arrow (his "no send on the chat"); mic returns when empty.
- **Dock hidden on /chat** — the thread's composer IS the input there;
  the dock only overlapped it on real phones (surfaced deviation from the
  design's dock-on-every-screen; usability wins).

Strava upgrades (all live, backfilled):
- **lib/zones.ts** — his real Strava zone boundaries as defaults
  (122/152/167/182), timeInZones() with gap-owning samples, TRIMP-style
  trainingLoad() (transparent alternative to Strava's proprietary RE),
  downsample(). 5 new tests (73 total).
- **Streams pipeline** — lib/strava.ts fetchActivityStreams
  (heartrate/time/altitude) + buildStreamMetrics; sync now attaches
  hrStream/timeStream/altitudeStream (downsampled ≤120 pts) +
  timeInZones + loadScore + relativeEffort to metricsData on every new
  import; POST /api/strava/backfill-streams (idempotent) ran against his
  history: **23/23 activities enriched**.
- **Train screen** — TRAILS card now draws the REAL elevation profile
  (design's sparkline, live data: his run's altitude trace); new
  EFFORT · TIME IN ZONES card (zone ramp bar + Z1–Z5 percentages + RE /
  load) from the latest HR-bearing session — verified with real numbers:
  Z1 30 / Z2 47 / Z3 23, RE 16, avg 139 bpm.
- **Chat sees it** — get_health_data recent_workouts now returns
  zonePct/loadScore/relativeEffort per workout ("how hard was this
  week?" answerable with real numbers).
- Kettlebell/dumbbell coverage note: the same pipeline applies to ANY
  workout with an HR stream — the watch supplies HR for strength
  sessions once it records; the zone card + load work unchanged.

Notes: his last Strava sync was June — the Aug walks import with streams
on his next Settings → Sync tap. Routine "finisher" structure discussion
filed as a v2 deferred item (blocks model, watch-lane coordination).
Maps: RouteMap SVG shape rendering exists + polylines stored; tile maps
(streets background) are a later add.

## 2026-08-09i — Michael's first on-phone bug sweep, fixed same-day

He used prod on his iPhone; his list, dispositions:

- **"Opens to a legacy page"** — root already redirects to /dashboard; the
  culprits were the home-screen icon (iOS pins start_url at INSTALL time —
  his icon predates the /dashboard manifest) and the v2 service worker
  precaching legacy routes with OFFLINE_URL /health. SW rebuilt as
  **pitaya-v3** (Pitaya precache set, /dashboard offline). The legacy
  /health hub page is SUNSET → server redirect to /dashboard (old page in
  git history). **He must delete + re-add the home icon once** — that also
  clears the stale JS bundle that caused several of his symptoms (the old
  dock composer/review UI he screenshotted can't render from current code).
- **"Voice showed the old review card / input didn't store in chat /
  routine wasn't stored"** — the dock-fold deferred item, done: dock voice
  + text now hand off to the chat thread (sessionStorage handoff +
  navigate, or a window event when already there). Proposals render as
  chat cards with voice-back editing; routine asks made by dock voice now
  actually reach create_routine. The legacy /api/ai/chat flow serves ONLY
  the camera path now (photo→analyze→confirm card; folding that too is a
  follow-up). processText removed from voice-input.
- **"Sheets/toasts blocked by the mic node / Dynamic Island"** — all
  bottom sheets raised to z-80/81 (decisively above the z-60 dock); chat
  composer repositioned above the dock (safe-area + 12.5rem) with page
  padding to match; **Toaster moved top→bottom-center at 216px offset**
  (top toasts hid under the Dynamic Island).
- **"Journal should take one picture"** — JournalEntry.photoData migration
  (`journal_photo`); journal POST accepts photo-only or text (photo-only
  still auto-ticks the journal habit); Today's card grew a camera button
  (design's camera glyph, client-side canvas compress to ≤900px jpeg)
  that becomes the day's thumbnail; today composite returns the photo.
- **"No place to set calorie/macro targets"** — components/
  macro-targets-sheet.tsx (calories + P/C/F % with live gram preview,
  sum-to-100 guard) wired into the Food page header as "Targets"; the
  ring/bars/chat goals all read the same settings. Food back-arrow now
  points to /dashboard.
- **"Log tape by voice"** — already works via chat's log_measurement
  proposal; with the dock fold it now works from ANY screen's mic.
  Measurement card labels humanized (waistCm 88 → "waist 88 cm").

Verification: tsc clean · 68/68 vitest · clean build · smokes: /health →
/dashboard redirect, photo-only journal POST + auto-tick (rows cleaned),
Today card shows camera button + live streak pill. Deployed to prod.

Open questions answered in chat (not code): chat stays ONE rolling thread
(logs render as cards in it; splitting log-chat/coach-chat adds input
friction he explicitly doesn't want); Apple Health without the companion
app = possible via an iOS Shortcuts automation POSTing Health samples
(weight/steps/sleep) to a Pitaya endpoint — queued as the bridge until
the companion ships.

## 2026-08-09h — Body port + EMOM duration + chat designs routines

Michael's direction: Body stays simple (daily weight + tape → trends);
training is the 90-day priority and the next block after his stress test.
This session shipped Body plus the two training pieces his spec needed
in the data model NOW so routines built this week are protocol-true.

- **Body screen** (design screen 4, replacing the legacy report list):
  scrubable trend chart — Weight = last 12 real weigh-ins (own dates; a
  12-week window would have hidden his May-and-older history — same trap
  as chat's weight_trend, fixed the same way), Volume/Calories = 12
  Mon-start weekly buckets; design geometry exact (area fill, dots, dark
  tooltip, touch-drag scrub that snaps to points). Measurements card:
  design's body-figure SVG verbatim w/ 7 tap points mapped to schema
  fields, #F6E3EB detail panel (value, delta since first tape, 3-bar mini
  history), "+ New tape" sheet (kg + 7 dims, only filled fields POST).
  Progress-photos compare slider (real photos when ≥2 exist, quiet empty
  state until then). Recovery card renders its honest "arrives with sleep
  sync" state — no sleep/HRV data source exists yet (surfaced deviation).
  Backend: `GET /api/health/body/overview` one-fetch composite.
- **Sequence.durationMinutes** (migration `sequence_duration`): his
  "20-minute EMOM" is now expressible. validateSequence caps at 240;
  builder page grew TOTAL MINUTES + REST BETWEEN fields; both sequence
  routes + mobile payload carry it; watch-contract updated with v1 run
  semantics (EMOM = durationMinutes 1-min rounds cycling steps; circuit =
  restSecondsDefault between movements). Per-side fix: catalog
  normalization no longer swallows "each side" ("5 snatches each side" →
  "Kettlebell Snatch (each side)", kb-snatch id kept).
- **Chat designs routines**: new `create_routine` proposal tool + prompt
  section speaking his protocol language. Smoked with his exact ask —
  "design me a 20 minute EMOM: 20 KB swings, 15 goblet squats, 5 snatches
  each side, swings/squats 24kg, snatches 20kg" → correct card (emom ·
  20 min · 3 steps w/ weights) → confirm → saved with catalog ids
  (kb-swing / kb-goblet-squat / kb-snatch) → appears in Train → Routines
  and the watch list. Routine cards render steps + kind/duration in-thread.

Verification: tsc clean · 68/68 vitest (EMOM duration, per-side, absurd
durations, create_routine in surface) · clean build · dev smokes (body
overview with his real 12 weigh-ins Mar 17 → May 2 −2.5 kg, tape dims,
EMOM design→confirm→normalized save) · Body screenshotted at 375px (real
chart + NECK 41.1 cm panel) · prod deploy Ready + prod body-overview
smoke · all smoke rows cleaned.

**PAUSED HERE for Michael's bug sweep.** Next block spec:
docs/deferred-items.md top entry (his words, near-verbatim).

## 2026-08-09g — Chat 2b: Responses-API agentic loop + the /chat screen

## 2026-08-09g — Chat 2b: Responses-API agentic loop + the /chat screen

The chat rebuild ("the notebook that talks back"), per the locked order.
GitHub collaborator access landed → branch pushed.

Backend:
- **`POST /api/ai/chat/stream`** — SSE streaming loop on
  `openai.responses.create` (CHAT_MODEL gpt-5.6-terra): tools + reasoning
  {effort: low} combine (the thing chat-completions rejects on 5.6);
  stateless multi-turn via echoing output + `include:
  reasoning.encrypted_content`; `store: false`; max 5 turns; ALL function
  calls per turn processed (the old first-call-only bug is gone on this
  path). Events: delta / tool / proposal / done / error. Usage metered per
  call into ai_usage_events (surface "chat"); errors classified.
- **Tool surface v2** (lib/ai-prompts.ts `CHAT_RESPONSES_TOOLS`, flat
  Responses shapes): `get_health_data` (read: today_summary / prs /
  recent_food / recent_workouts / weight_trend — executed server-side in
  lib/chat-tools.ts, ids included), proposals log_food / log_measurement /
  log_workout / log_water (legacy schemas reused), NEW `edit_food_log` +
  `delete_entry` (confirm-first, target real row ids), set_reminder
  (direct). manage_todo / workout_plan_query / general_response are GONE
  from chat — stripped surfaces stay stripped (test-pinned).
- **CHAT_SYSTEM_PROMPT** — wry-warm voice, plain-text-only (bubbles render
  raw), read-before-answer rule, pending-vs-saved amendment rule (pending →
  re-propose; saved → edit/delete, never re-log), bilingual mirroring
  (default to the setting, mirror EN↔ES when the user switches).
- **`ChatMessage` migration** (roles user/assistant/proposal, meta carries
  {kind, data, status}) + `/api/ai/chat/messages` (GET thread · PATCH
  proposal status saved/rejected · DELETE clear).
- Legacy `/api/ai/chat` untouched — the dock still runs it (fold deferred).

Screen (`/chat`, design screen 1 port):
- Header "THE NOTEBOOK THAT TALKS BACK / Chat"; raspberry user bubbles
  (r18/18/5/18, "via voice" tag) vs white assistant bubbles (r18/18/18/5);
  dashed hint card on empty thread (honest copy — surfaced deviation);
  streaming text grows in-bubble; "checking your data…" line during reads.
- **Proposal cards in-thread** (design verbatim): #F6E3EB header strip
  "PROPOSED LOG · TIME", item rows w/ macro micro-lines, Total row,
  Confirm/Edit/Reject; Edit mode = design's −/+ steppers (scale item ±25%,
  macros follow); saved → green "✓ Saved" strip; rejected → "Discarded.
  Nothing saved." Confirms persist through the SAME endpoints the dock
  uses (food/batch, body, workouts w/ PR toasts, water), edits via
  `PATCH /api/health/food?id=`, deletes via `?id=` DELETEs; card status
  PATCHed so reloads show resolved state.
- Composer pill ("Type, or tap the mic…" + #F6E3EB mic circle) — mic
  records → gpt-transcribe → sends as voice-tagged message.
- **Dock now global** (components/global-dock.tsx in the tabs layout — the
  design shows it on every screen; before it lived on only 3 legacy pages).
  Chat bubble navigates to /chat and lights raspberry there. Pages refresh
  on a "pitaya:logged" window event (components/use-data-logged.ts);
  Today/Train/health/body/food all listen.

Verification: tsc clean · 66/66 vitest (5 new: tool shapes, stripped
surfaces pinned, proposal classification) · clean build · live smokes on
dev with minted cookie: PR question → get_health_data(prs) → streamed
"20 kg, May 5, previous 16 kg"; food log → pending proposal card w/
Colombian portions; "fix the orange juice to two glasses" → recent_food
read → edit_food_log proposal targeting the REAL row id (after the
pending-vs-saved prompt rule — first attempt re-proposed, fixed);
"delete the arepas" → delete_entry w/ correct id; browser round-trip on
/chat at 375px (streamed real answer rendered in design bubbles). Fixed
during smoke: weight_trend window removed (weigh-ins older than 30 days
read as "none"), plain-text rule (markdown ** rendered raw), food PATCH
uses ?id= query param. Prod deploy + prod smoke (Spanish PR question →
Spanish answer w/ real values) · smoke rows and thread cleaned after.

Notes: one Armenian token ("նախկին") appeared mid-stream in an early dev
smoke — 5.6-terra sampling artifact at low effort, not reproduced since;
watch if it recurs. Sessions = one rolling thread (single-user app).

## 2026-08-09f — Settings/Train/Today full ports + sequences backend on prod

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
