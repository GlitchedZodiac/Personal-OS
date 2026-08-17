# State

Single source of truth for "what's done and what's in flight." Newest entry
first. Update the top of this file whenever a session ships.

---

**Last updated:** 2026-08-15 (WATCH ROUND 1+2 phone half: sync summary/routine coda + GET /api/mobile/summary)
**Current phase:** the watch lane is implementing the Round 1+2 design
handoff on `claude/watch-app`; the main lane shipped its API dependencies
(below). `main` is the single source of truth as of 08-14d.
**Branch in flight:** `claude/phase1-modernization` (web) ·
`claude/watch-app` (watch, worktree ~/VibeCoding/personal-os-watch —
**must merge `main` FIRST**, it is 56+ commits behind and its docs/ios
snapshot predates the consolidation).

## 2026-08-15 — WATCH ROUND 1+2: the phone half (API dependencies)

Michael fired the design-handoff implementation prompt to the watch lane.
Its API-dependencies block is main-lane territory — implemented here so the
wrist binds to real endpoints instead of stubs:

- **`POST /api/mobile/workouts/sync`** response adds `summary` (streakDays,
  weight7dAvgKg, weight7dDeltaKg, z2WeeklyMinutes) and `routine` (sequenceId,
  sequenceName, verdict raise/hold/deload from lib/progression.ts, reason,
  lastRun stats of the run BEFORE the one just synced). Additive; a summary
  hiccup can never fail a sync that already persisted.
- **`GET /api/mobile/summary`** (new, bearer) — the complication's
  widget-side fetch: the three hero metrics + timeZone, kept deliberately
  cheap for widget timeline budgets.
- Shared math in **lib/mobile-summary.ts**; exact field names + semantics in
  deferred-items (the 2026-08-15 watch← main entry). Spec-vs-names rule: the
  server renames to match the handoff spec if they differ.

Self-smoke: GET returned live data (streak 7 · 82.5 kg −0.4 · Z2 44 min);
sync probe against the real Full-Body Kettlebell Circuit returned its actual
08-11 run as lastRun (18 min · 2,080 kg · 153 kcal · 166 bpm); 401 without a
bearer. Probe rows + probe device session deleted after.

DEPLOY DEPENDENCY: the watch client talks to PRODUCTION
(MobileAPIClient.productionBaseURL). These endpoints must reach prod before
the wrist features light up — `vercel --prod` or the Vercel↔GitHub
connection Michael chose on 08-14.


## 2026-08-14d — BRANCH CONSOLIDATION (main = both lanes)

`main` was 32 commits behind live production and had never seen the watch
lane at all. Fixed by fast-forwarding `main` to the web lane (34 commits,
zero conflicts) and merging `claude/watch-app` into it (14 commits; the only
conflicts were this file and `deferred-items.md`, resolved by keeping both
lanes' entries).

Facts that made it safe: all 18 migrations were ALREADY applied to the live
database (dev and prod share one Supabase instance), so no schema work was
involved; and Vercel is NOT git-connected (`.vercel/project.json` carries no
repo link), so moving `main` cannot trigger a deploy. Production ships by
`vercel --prod` from a working directory — commit c949043 at 23:54:25 and
the prod deployment at 23:54:32, seven seconds apart.

Consequence worth keeping: **`ios/**` on `main` is now the real watch tree**
(6,227 lines), not the pre-routines snapshot. The watch lane must merge
`main` back before its next session.


## 2026-08-14c — HIS REVIEW PASS (numbers, chat feel, watch audit)

Fixed:
- **"6,190 kg this week" → "6.2 t · 6 sessions"** — tonnage is the right
  metric, five digits of kilos was the wrong presentation. New
  `lib/format-training.ts` (`formatTonnage`/`tonnageLabel`) flips to tonnes
  at 1000 kg; used on the dashboard tile and the Train header pill.
- **"46 PRs this week" → gone, and the count itself was wrong.** Every
  first-ever log of a movement mints a baseline row per kind (weight AND
  volume), and `/api/health/today` counted all of them — 23 movements
  seeded = "46 PRs". Now counts only `kind:"weight"` rows with a non-null
  `previousValue` (genuine improvements): live value went 46 → **0**.
- **The dashboard tile's second line is now his ask:** burn today + calorie
  balance ("0 burned · 2,000 left"). Deliberately "left", not "under" — at
  9am with nothing logged, −2000 is an unspent budget, not an earned deficit.
- **PR banner tells the truth.** Prefers heaviest-ever (`kind:"weight"`)
  records — the only PR kind that means the same thing on every movement —
  and the hardcoded "Yesterday's you lifted less." is replaced by the real
  delta, or "First time on record at this bell." when there's no prior.
- **The "+0%" volume trend was comparing the only week of data to itself.**
  `volumeTrendPct` needs two distinct weeks with work or returns null; the
  label now reads "+12% vs last week", and the chart carries the current
  week's tonnage on its axis.
- **Chat latency:** four sequential Supabase round trips before the first
  byte became one parallel pair, with the user-row insert moved off the
  critical path (ordering preserved by awaiting it before any later write).
  Measured: `open` 92–694 ms, first delta ~1.9–2.3 s. The rest is the model —
  `effort:"low"` is the floor, `"minimal"` is rejected by `gpt-5.6-terra`.
- **Chat feel:** deltas are rAF-coalesced (was a full list re-render per
  token) and `scrollIntoView({behavior:"smooth"})` no longer fires per token
  — smooth for a new message, instant while streaming, and nothing at all
  when he has scrolled up to read. Added bubble entrance motion, a real
  three-dot typing indicator, and a streaming caret.
- **Chat filters:** All / Food / Usuals / Weight / Chat pills with live
  counts, filtering the same transcript (nothing is hidden permanently).
- **Mic live state:** breathing halo + real audio-level ring + level bars +
  an explicit "Listening — tap to stop" strip, on BOTH the dock and the chat
  composer. Reduced-motion keeps these running — they carry meaning.

Also fixed (found while re-auditing):
- **HRV was being measured and thrown away.** The iOS companion's v1 mapping
  nests sleep/HRV inside `rawData` "until the main lane's columns ship" —
  they shipped, the companion was never told. Prod row 2026-08-12 carried
  `rawData.payload = {"hrvMs": 27.8}` with the `hrvMs` column null.
  `/api/mobile/health/daily` now promotes nested fields when the top-level
  ones are absent (top-level always wins). Self-smoked both shapes against
  the running app; probe rows and the probe device session deleted after.

**CORRECTION — the first watch audit this session was wrong.** It read
`ios/**` from THIS worktree, which is a stale snapshot (2,640 lines,
pre-routines). The watch lane's real tree is on `claude/watch-app` (6,227
lines). Retracted claims — all actually BUILT: routines wired to the wrist,
pre-flight weight confirm with persisted per-routine overrides, now/next with
a per-step Done, rest timer, 4 kg crown detents, `HKWorkoutRouteBuilder` GPS,
a WidgetKit complication, custom glyphs, and the `syncDailyHealth` call site.
**Never audit `ios/**` from the main-lane checkout** — use
`git archive claude/watch-app -- ios/`.

Written (no code):
- `docs/design/pitaya-watch-design-prompt.md` — paste-ready Claude Design
  prompt, CORRECTED against the real branch: settings surface, the
  complication (currently a static launcher that can never show data),
  on-watch insights incl. heart-rate recovery, Double Tap + App Intents,
  `HKWorkoutEvent` structure, mic states, chat IA.
- Three `[watch]`/`[main]` entries in `docs/deferred-items.md`: the
  audit-the-right-branch process note, the eight verified gaps, and the
  companion's nested sleep/HRV handoff.

Tests: 128/128 (11 new in `tests/format-training.test.ts`). Build green.

---

**Previously:** 2026-08-14b (DEFERRED-QUEUE SWEEP: Track 2 live on
the BSB, Library screen, church week-advance, reader footnotes/poetry
sups, progression intelligence, + 12 annotations closed)
**Current phase:** The queue is swept — docs/deferred-items.md's top
entry is the honest remaining list (Strong's, Journal-needs-design,
bundles/barcode, circuit parity, Strava adoptions, blocks v2, demo
keep/kill, TS7-upstream, round-3 design asks). Spirit is complete for
daily life: v3 curriculum, homework engine, Track 2, Library, free
Bible, memory, church track. Health: progression intelligence shipped.

## 2026-08-14f — FREESTYLE: record → describe → measure → keep

His ask: track HR + elevation for follow-along videos and improvised
EMOMs, describe the work after, measure the description against the
recording, and keep it as a routine when it earned it.

- **The recording half already existed** (Strava streams adoption):
  any session recorded on the watch via the Strava app arrives with
  hrStream/timeInZones/altitudeStream in metricsData. The native wrist
  "Freestyle" tile is the watch lane's ask — contract + his zone
  boundaries written into docs/watch-contract.md §Freestyle (the sync
  route needs zero changes; verified).
- **edit_workout_entry grew ATTACH mode**: an `exercises` array
  replaces a structure-less session's movement list, names normalized
  against the catalog (smoke: "kettlebell swing" → kb-swing, persisted,
  PRs rebuilt, throwaway row deleted). Chat card renders the attached
  list; confirm copy says "measured against the recording."
- **"Describe what this was →"** on the Activities detail for any
  session without segments/sequence: hands the recording's facts
  (duration · avg/max HR · zones · elevation · kcal) to chat via the
  existing pending-chat handoff.
- **Prompt: THE FREESTYLE FLOW** — ask one question if no description
  came; attach via exercises mode; measure claim-vs-recording in one
  sentence; offer create_routine ONCE, never push.

## 2026-08-14b — THE DEFERRED-QUEUE SWEEP (his "run all deferred items")

Built:
- **Track 2 LIVE** — the whole Bible, quietly, in the Berean Standard
  Bible (public domain CC0; served by bible.helloao.org, keyless —
  fetched server-side with 30-day revalidate; if that free service ever
  dies the page says so and nothing else breaks). /spirit/track2:
  themed chapter reader (headings, poetry, reader typography), one-tap
  "read → next chapter" advancing SpiritPref.track2Position and logging
  HONEST transcript coverage (track2 rows count chapters like any
  reading). Home card shows next chapter + n of 1,189 + progress bar.
  lib/bible-refs grew BOOK_USFM + TOTAL_CHAPTERS + chapterAt().
- **Library screen** — /spirit/library over SourceDoc with per-source
  cited-counts computed from the generated studies' citations; home
  tile + source-sheet "Open the library ›" wired; the designed-stub
  sheet retired. Corpus growth stays a curation task (PD only).
- **Church week-advance** — PATCH /api/spirit/church + "Sunday happened
  — prep next week" on the live view; walks the announced passages,
  auto-completes past expectedWeeks.
- **Reader polish** — poetry verses now carry their crossref sups (on
  the last line); footnotes finally have UI: [n] sups + a single-tap
  ESV FOOTNOTE tooltip.
- **Progression intelligence** (approved roadmap #4, pure math, ZERO
  AI): lib/progression.ts — raise only after 3 clean runs at the
  prescription, post-raise hold (Sequence.progression.lastRaiseAt),
  4 kg bell denominations, deload after 2 abandoned runs, +5 s for
  timed holds; 6 vitest cases. GET/POST /api/health/progression;
  earned/deload cards on the Routines screen with "Take the raise";
  the Sunday report names a pending suggestion in one clause. Missing
  telemetry never punishes (rounds-less runs count as complete).
- **Builder mints movements** — unknown names in the web routine
  builder get a "file it under" category select (API already accepted
  it).
- **Water batching** — POST /api/health/water {glasses:n} → createMany;
  the dock stopped looping the network.
- **Transcribe streams** — openai.toFile from memory; temp-file path
  and cleanup deleted.
- **Strava OAuth state** — /api/strava/auth mints state into an
  httpOnly cookie; the callback rejects mismatches (CSRF closed).
- **Service worker v4** — precache list matched to the live IA
  (stale routes could brick addAll installs — now per-asset
  allSettled); audited: network-first keeps JS fresh, cache is
  offline-fallback only.
- **Env hygiene** — NEXT_PUBLIC_SUPABASE_* confirmed unread, removed
  from all Vercel envs + .env.example.

Closed by annotation (were already resolved, unrecorded): chat deep
history (workout_history, task #17) · history drill-downs + body-comp
panel (task #18) · journal +-library (task #15) · macro slider
(superseded by his task-19 spec) · stepSeconds history (tasks #5/#18)
· branch-push access · trends toISOString (kept-as-is with a guard
comment — converting would shift date-only values). TS7 re-checked:
typescript-eslint still peers <6.1.0 — blocked upstream.

Deliberately NOT swept (each needs what it needs): Strong's dataset
(own session), the real Journal (design round 3), bundles/barcode
(lukewarm + integration care), circuit-runner parity, Strava
adoptions, routine blocks v2 (his conversation + watch lane), demo
keep/kill (his call). All in deferred-items' top entry with pickup
hints.

## 2026-08-14a — CURRICULUM v3 + THE HOMEWORK ENGINE (his drop, approved)

Michael's curriculum lane delivered v3 (36 terms · 362 studies · 3
years · cap 15, longest 13) plus a homework schema. He approved the
full sequence after confirming the first term shrank (Reading the Room,
8 studies — was Judges at 42) and greenlit: ESV stays default, NBLA
pane stays, `ask` kind kept with its Term-13 gate.

- **Full replace, gated:** importer re-verified zero started data at
  run time (completions/readings/highlights/notes/memory/series/threads
  all 0), wiped 8 terms + 42 generated studies (~$1.50 sunk, expected),
  imported 36 terms — T1 "Reading the Room" active. Acceptance counts
  matched the handoff: 36 / 362.
- **Importer v3:** reads the `{version…terms}` wrapper, cap 3–15,
  validates every unit's homework slugs against `homeworkKinds`, syncs
  homeworkKinds+generatorRules into SpiritCurriculumConfig (the
  generator reads them from DB — docs/ isn't in the serverless bundle).
- **Schema:** Term.homeworkArc, Term.summary, DevotionalDay.homework
  {kind,label,minutes,text}, SpiritCurriculumConfig singleton
  (migration spirit_homework). Unit homework lists ride in syllabus
  Json.
- **Generator, all nine rules:** exactly one homework per study ≤20min
  drawn only from the unit's kinds; never the same kind back-to-back
  (validated server-side across unit AND term boundaries); THE CALLBACK
  — every study's body opens by naming the previous study's homework
  (unit 1 day 1 reaches into the previous term; the curriculum's first
  study opens by setting the arc); `ask` stripped below orderIndex 13
  (gatedFrom in config); no purchases/leaving the house; write ≤ one
  paragraph; spiral back-references get the full 36-term list;
  canonical rationales/hardNotes/arcs surfaced verbatim. Style specimen
  moved to lib/spirit-style-specimen.ts (survives replaces).
- **UI:** study page gets THE HOMEWORK card (dark, kind label chip +
  ≤minutes + prompt + the term arc line + "tomorrow's study opens by
  asking about this"); term page shows THE TERM'S RUNNING ASSIGNMENT;
  transcript's completed rows show the term-end summary line.
- **Term-end summary hook BUILT** (didn't exist): completing a term
  snapshots {studies, topCategory, openQuestions[≤10 w/ refs]} onto
  Term.summary before the next term takes the lectern.
- **NBLA unblocked (Step 5):** Spanish lives in the `compare` homework
  (his Logos, ESV vs NBLA, degrades to KJV); roadmap blocker deleted;
  reader pane stays built-and-dormant; settings copy reframed. ESV
  remains the default text everywhere (his call).
- Kickoff doc realigned to v3 (wrapper format, 3–15, homework schema,
  revision-not-authoring role, Spanish settled).

## 2026-08-13d — THE LIVING CURRICULUM (his ask: "alive and fed constantly")

His framing accepted whole: the syllabus is the ENFORCEMENT SPINE; the
church track, Bible-in-a-year, free reading, journey, memorization are
ancillary. Terms are mixed-modality (history · theology · doctrine ·
evangelism · faith · hope), 3–30 studies, revisiting books is a feature.
Cost model he asked for: curriculum AUTHORING happens in Claude chats
(zero OpenAI tokens); only per-term study generation spends (~$1–2,
visible batch).

- **Engine:** syllabus rows are UNITS with `days` (1–6 each; term total
  3–30). lib/bible-refs: SyllabusUnit/unitDays/syllabusTarget; the
  generator writes "exactly N days" per unit, topical/history units
  still anchor every day to a Scripture reading; progress targets sum
  the units (Judges' day-less rows default 6 → still 42).
- **Year 1 AUTHORED and imported** (docs/spirit-curriculum.json →
  prisma/import-curriculum.mjs, dry-run then applied): T2 The Exile
  (24) · T3 Justification (6-day doctrine short) · T4 Mark (24) · T5
  Giving a Reason (5-day witness) · T6 Romans (30 — the cap, Rom 9–11
  flagged hard) · T7 The First Five Centuries (18, history with the
  Bible open) · T8 Hope — the Last Things (6). 113 studies queued
  behind Judges; each generates as its visible batch when its turn
  comes.
- **Importer safety:** upserts by orderIndex, refuses to touch
  active/completed terms, validates the 3–30 cap and 1–6 unit days.
- **Curriculum lane:** docs/spirit-curriculum-kickoff.md is the paste-
  ready prompt for Michael's dedicated planning chat — interview-first,
  candidate pool for Years 2–3, exact JSON contract, the living-plan
  rule (re-plan unstared terms ~twice a year; his end-of-term open
  questions bend the future).
**Branch in flight:** `claude/phase1-modernization` (pushed; prod deploys
via `vercel deploy --prod`; merge awaits Michael) · `claude/watch-app`
(watch lane, local worktree).

## 2026-08-13c — SPIRIT goes SELF-PACED (his correction, same day)

Michael's review of b: "it shouldn't be something I'm blocked into
because it's 'x' day of the year… like an online class — where I can
eat away as much as possible… I plan one a day but I might be eager and
do two." The pastor still sets the ORDER (announced, not chosen — his
standing rule); the PACE is now entirely his.

- **Completion-based progression:** StudyCompletion model; the current
  study is a POSITION (first study without a completion, syllabus
  order), never a date. POST /api/spirit/complete records it, returns
  streak + the next study; DELETE undoes a mis-tap. Finishing the last
  study completes the term and activates the next.
- **Generation pipeline SHIPPED AND RUN:** POST /api/spirit/generate
  {week} — one sol-model call writes a week's six studies (specimen
  wk5d4 as the style anchor; quotes forbidden unless from stored
  SourceDocs; pull-verse TEXT fetched from the ESV API after
  generation, never model-recalled; suggested refs validated to
  canonical ints inside the reading; citations filtered to real keys).
  The Term screen carries the VISIBLE BATCH card (progress bar, week-by
  -week counts, retry line). The Judges' 42 studies were written this
  session (≈33k output tokens, sol tier — quality spot-checked: wk1d1
  "A good beginning is not the same as faithfulness", real ESV pull
  text, EMPTY citations where the library had nothing — the no-fake-
  quotes guardrail held).
- **Study page:** "Complete this study →" → celebration card (study n
  of 42 · streak · double-portion note) → the EAGER PATH ("Wk 1 · Day 2
  waits — {title} →") loads the next study in place, or "Done for
  today". Term-complete ceremony wired.
- **Home:** University card is a Continue card — study counter,
  progress bar "n of 42 · self-paced", button says Begin/Continue/"One
  more — eager day"; term-complete card when finished.
- **Streaks (no-guilt):** streak = consecutive LOCAL days
  (America/Bogota via lib/timezone) with a completed study or reading;
  pill hidden at zero, gaps just restart the count, double portions
  counted quietly. NEVER "days behind" — that language is banned.
- **Free Bible:** /spirit/bible — OT/NT shelf, all 66 books with HIS
  mark counts, chapter-grid sheet with marked-chapter dots,
  "Continue where you left" (localStorage spirit-last-free-read).
  Reader ?free=1: FREE READING kicker, no term coupling, no mark-read,
  back goes to the shelf. Home's "Open the Bible" tile → the navigator.
  (No design slice exists for the navigator — built in-system, flagged
  for round 3.)
- **Motion pass (his "lacking imagination" note):** the app's existing
  idiom applied across Spirit — stagger-children entrances, push-in
  subscreen transitions (new .push-in/.fade-up utilities), tap-scale
  press feedback, animated progress bars, fade-up celebration.
- **Syllabus rows** are completion-derived (✓ = HIS finished weeks,
  n/6 partials, "unwritten" before generation) — no calendar fiction.

## 2026-08-13b — SPIRIT: the round-2 design port

Design round 2 imported (docs/design/pitaya-app.dc.html refreshed —
17 screens; NOTE: the canvas file now exceeds the 256 KiB design-MCP
read cap, its interaction-script tail truncates on import; all screen
HTML fits) and ported same-day:

- **Reader rework:** light/dark/night themed surfaces (lib/spirit-theme
  .ts tokens, localStorage per-device), Literata serif via next/font
  (`--font-serif`), chapter chips, Type & theme sheet (size dots ·
  serif/sans · justified+hyphenated · 3 swatches), suggested-marks
  banner, poetry hanging indents, selection dimming, two-stage crossref
  tooltips (tap sup → ref card → tap again → verse text fetched from the
  cache → Open), ESV audio mini-player (play/pause · chapter ‹ › · speed
  1/1.25/1.5 · elapsed), ⋯ overflow with **Memorize** (occasion picker →
  deck) and **Copy with attribution**, Word mode designed-stub (honest:
  waits for a Strong's dataset; Logos ref.ly link meanwhile), legend
  sheet now shows whole-Bible per-category counts + expandable refs
  (GET /api/spirit/layer).
- **Transform fix (root-cause):** ESV crossref/footnote markers were
  collected but never stripped — letters glued to words ("zJabin");
  markers also repeat a letter per verse (duplicate React keys). Lift
  regex widened (sup-wrapped OR bare a.cf), markers now removed from
  text, letters deduped; fixture tests assert clean text + unique
  letters (8/8).
- **Passage Notebook** (/spirit/notebook): grouped by chapter, search,
  All/Open-questions views, kind chips + category-dot filters, OPEN
  badges with resurface line, Ask threads included.
  GET /api/spirit/notebook.
- **Memory deck** (/spirit/memory): occasion-first review card (say it
  aloud → reveal fetches ESV text → "Got it — space it out" doubles the
  interval to 90-day cap / "Show again this week" = 3 days), occasions
  grid, computed weekly-review line (marks + questions, no verdicts),
  end-of-term summary row. MemoryVerse model;
  GET/POST/PATCH/DELETE /api/spirit/memory. Cards enter ONLY from the
  Reader (⋯ → Memorize) — deck starts empty, honestly.
- **Church Sunday track** (/spirit/church): Speak it (mic→transcribe) /
  Photograph the slides (≤4, vision parse) / Paste a transcript →
  AI parses to a proposal → HE confirms (editable rows) → series commits
  + the current week's follow-along card generates (context + exactly 3
  questions). ChurchSeries model; GET/POST/PUT /api/spirit/church. Smoke:
  the Galatians announcement parsed to "Sons Not Slaves — Galatians · ≈8
  Sundays · Gal 1–2 preached · Gal 3 next" and week 2 generated 3 real
  questions (rows deleted after smoke).
- **Spirit settings** (/spirit/settings): translation chips (NBLA inert —
  license pending), posture Westminster/1689/Compare (SpiritPref
  singleton), **Export everything** (markdown of notes/highlights/links/
  Ask threads/deck/reading log — /api/spirit/export, no ESV text per
  license), pause-the-term toggle, term-generation card kept HONEST (no
  fake 28-of-42 progress; states the pipeline is the next block).
- **Spirit home:** gear → settings, this-week's-verse card → Memory
  (next-due card + cached snippet), posture ⇄ chip on the University
  card, real Notebook/Memory tiles, Sunday card shows the live series
  week, reading-streak pill (hidden at 0), transcript mini-map on the
  new ramp.
- **Transcript:** honest read-throughs (CHAPTERS[66] in lib/bible-refs;
  a book counts once only when every chapter is covered) — legend is
  now not yet/once/twice/3+/this term; pill counts completed books
  (today: truthful "0 of 66", Judges+Ruth black as this-term).
- **Today's study:** audio ▶ chip on the assignment (opens reader
  w/ autoplay), week-progress bar. **Term:** completed terms lead the
  year rail, footer verbatim. **Journal:** design's coming-soon port.
- Today API extended: memDue, streak, weeklyVerse, prefs, active series,
  completed terms.
- ESV_API_KEY added to Vercel (prod/preview/dev) via CLI — Michael's
  Vercel connection covers env writes; nothing needed from him.
- Verified: tsc clean, 111 vitest pass (incl. new transform
  assertions), all screens browser-driven at mobile size (night theme
  screenshot-verified; action bar via DOM-dispatch — the Browser pane's
  tap translation flaked, not the app).

**Deviations from the design, surfaced deliberately:** NBLA pane renders
its built layout with a Spanish license-pending note (no text without a
license); Word study is a designed-stub until a Strong's dataset lands
(footer/link promise "long-press a word" NOT carried); audio player
shows elapsed time, not per-verse follow-along (ESV serves one mp3 — no
verse timings exist); settings' generation card shows no fabricated
progress; design's "TSK cross-references" footer corrected to "via
Crossway API" (the crossrefs are ESV's own apparatus).

## 2026-08-13a — SPIRIT: the spine (model → ESV → APIs → first screens)

Milestones 1–3 of the Spirit build (see spirit-journal-plan.md):
schema (Term/DevotionalDay/ReadingLog/Highlight/SpiritNote/VerseLink/
StudyThread/SourceDoc/EsvPassage LRU cache), lib/bible-refs +
lib/esv-transform (pure, fixture-tested) + lib/esv (pinned LRU per
Crossway license), seed (The Judges term + wk5d4 study + 2 sources, NO
fabricated history), APIs (today/passage/layer/read/transcript/ask/
source — Ask is retrieval-never-recall and DECLINED a Calvin question it
had no source for, verbatim guardrail proof), screens (home, study,
reader v1, term, transcript) + SpiritIcon/JournalIcon extracted into the
navs.

## 2026-08-12a — Companion server half + THE DOCK PHOTO SUITE

Roadmap items 2 (server side) and 3, both shipped.

**Companion's server dependencies (watch lane starts against these):**
- `/api/mobile/health/daily` grew sleepMinutes/sleepDeepMinutes/
  sleepRemMinutes/hrvMs + `weightSamples[]`. Weight is NOT a snapshot
  field — samples write to body_measurements behind the VeSync near-twin
  rule (±10 min, ±0.3 kg), so Apple Health can't duplicate the CSV
  history. Smoke: sample matching today's 81.5 kg SKIPPED, a second one
  imported; response reports weightsImported/weightsSkipped.
- `POST /api/mobile/push/register` (+ DELETE) stores APNs tokens, hex-
  validated. His reminders only — no AI-initiated pushes.
- Contract written into docs/watch-contract.md § Companion.

**Dock photo suite (his spec, complete):**
- Camera button now opens a CAPTURE SHEET: **Take photo** OR **Library**
  (multi-select), up to 6 shots, thumbnails with remove, a note field,
  and a mic that dictates INTO the note (capture-open ref reroutes
  transcription) — then one hand-off to the chat thread.
- `/api/ai/chat/stream` accepts `images[]` (Responses multimodal
  input_image parts) + `thumbs[]`; the transcript stores only thumbs
  (full frames would bloat rows) and renders them above the bubble.
- NEW `save_food_product` proposal tool — the missing half of his exact
  ask: "this label, 2.5 servings, save it as a usual" now yields TWO
  cards (log_food scaled + SAVE TO MY USUALS with per-serving label
  values). Verified live on a synthetic label: 150 kcal/23P/9C/2F per
  serving read exactly, ×2.5 = 375/57.5/22.5/5. Two different labels in
  one capture → both items priced correctly in one card.
- Legacy photo→analyze→dock-card path RETIRED (the last un-folded dock
  surface; /api/health/food/analyze-photo now has no caller).

## 2026-08-11g2 — Admin-key integration; roadmap locked; companion is next

- **OpenAI real spend**: integration_secrets table + write-only
  /api/ai/admin-key (GET connected-only · POST validates against
  /v1/organization/costs before storing — a project key gets the exact
  "needs an ORG ADMIN key" error · DELETE disconnects). /api/ai/balance
  rewritten: admin key present → real month-to-date costs summed from
  the costs buckets; absent → honest estimate-only message (dead legacy
  dashboard/billing probes removed). AI status card grew the paste-once
  connect flow + real-spend row. Michael pastes the key in Settings —
  it never transits chat and never returns to the client.
- **Roadmap locked (his order)**: companion → dock photo suite →
  progression intelligence (PURE MATH, no AI — his no-hidden-tokens
  rule; N-consistent-runs gate, no back-to-back raises) → barcode/meals.
  Proactive AI check-ins REJECTED. Details in deferred-items APPROVED
  ROADMAP entry.
- **Companion kickoff ready**: docs/companion-kickoff-prompt.md (thin
  WKWebView shell, native mic/cam grant for our origin, HealthKit →
  /api/mobile/health/daily with background delivery, APNs). Main-lane
  obligations when the watch lane starts: sleepMinutes/hrvMs/weightKg
  fields + HealthKit-weight dedup + /api/mobile/push/register.

## 2026-08-11g — First-real-day feedback batch; Spirit/Journal take the bar

His first full day on the new build (watch circuit ran + synced with HR
streams — the whole 11e pipeline worked live). Batch from his voice
notes:

- **Bulk weight corrections**: "both workouts at 20 kg except windmills
  at 8" stalled the chat loop (21 single-entry cards). edit_workout_entry
  gained an `assignments` mode — ordered rules, '*' = all, later
  overrides — ONE card per workout; PATCH /entry accepts it; prompt
  pinned. His stated correction applied through the real route: 21
  entries weighted, PRs rebuilt → **47 current records**, Train now
  reads 4,060 kg this week w/ Renegade Row 20 kg banner.
- **Tab bar**: Body→**Spirit**, Train→**Journal** (his call — spiritual
  morning routine + a proper journal come later; placeholder pages w/
  the dragonfruit mark; PitayaMarkIcon added). Body/Train stay reachable
  from Today's cards; all routes intact.
- **Macro split is his meeting-sliders bar**: one always-100% bar, two
  draggable dividers, segments ARE the percentages, grams live
  (macro-targets-sheet rebuilt; no more arithmetic-to-100).
- **Detail fixes**: AVG WORK ":1065 /rd" → mm:ss "/round" only when
  rounds>1, else "/move"; segment-timeline bar gained its key ("one
  block per movement · width = its time" — he read it as zones).
- AI-balance question answered in chat: OpenAI only exposes real spend
  via an org ADMIN key (/v1/organization/costs) — offer stands if he
  creates one; estimate stays otherwise.

## 2026-08-11f — History drill-downs ported + THE MIDNIGHT TIMEZONE BUG

The design-11e history suite is live, and building it surfaced a
prod-affecting core bug.

- **⚠️ TIMEZONE FIX (lib/timezone.ts)**: `hour12:false` combined with
  `hourCycle:'h23'` flips some ICUs to h24 — local MIDNIGHT renders as
  hour "24", getTimeZoneOffsetMinutes computes a day-forward asUtc, and
  `zonedLocalDateTimeToUtc` lands EVERY day-boundary a day early
  (environment-dependent: this Mac's dev server had it; vitest's ICU
  didn't — tests passed because none used midnight). Symptom that
  exposed it: food history bucketed today's lunch onto yesterday. Fix:
  h23 only + hour % 24, pinned by a local-midnight test. Every
  day/week range in the app runs through this helper — deployed same
  hour. Stale weekly report (computed on shifted bounds) purged; it
  regenerates on next open.
- **Sunday Report** (/health/report, Today card → Open): persisted
  weekly_reports written by cron Sun 11 PM Bogotá (vercel.json Mon
  04:00 UTC) or backfilled on demand; hero verdict + energy in-vs-
  training-burn paired bars + macro adherence + training/zones +
  weight week + COACH paragraph (COACH_MODEL, real numbers only —
  smoke on his real week honestly said "Undertracked. One session, no
  food data."). Deviations: PDF deferred; burn labeled training-only.
- **Food day stepper + past-day view + History**: ‹ › steps days
  (?date= deep-links), past days read-only (DAY TOTAL vs goal +
  MEALS), History screen = calories-vs-goal trend w/ dashed goal line
  + BY DAY goal-tick rows + shared RangePicker calendar sheet (month
  nav added over the design's single-month demo; future locked).
- **Body composition**: SMART SCALE card (fat/muscle/BMR sparklines)
  + /health/body/metric drill-in (4/8/12-wk chips, scrub chart, weekly
  rows, WHAT IT MEANS; also weight/volume/kcal via the chart delta
  chip — design's bcCur). Static explainer copy (demo notes cited
  demo numbers — deviation).
- **Deletes (his ask)**: every food row has a confirm-first ✕ (was
  buried in the save-usual sheet); activity detail gained "Delete this
  workout". Activities got the from–to range pill.

## 2026-08-11e — Watch-stream enrichment + treadmill types; design rev in

Michael's treadmill-walk detail was bare (avg HR only): watch sessions
sync no streams. Fixed the app half + contracted the watch half:

- **Sync enriches raw streams server-side**: metricsData
  {hrStream, timeStream, altitudeStream?} on POST /api/mobile/workouts/
  sync now runs the same buildStreamMetrics as Strava (downsample ≤120,
  timeInZones, loadScore) — watch adopts by just sending samples
  (docs/watch-contract.md § Workout-sync streams; prompt handed to
  Michael). timeInZones-already-present rows pass through untouched.
- **Treadmill vocabulary**: treadmill_walk/treadmill_run/hike in
  lib/activities OUTDOOR_TYPES; no-GPS outdoor details render a
  TREADMILL/INDOOR distance-hero dark header instead of the empty map
  grid.
- **Design rev imported + committed** (487 new lines): FOOD · HISTORY
  (day drill-down w/ meals), calorie history chart, WEEKLY AVERAGES,
  MACRO ADHERENCE, ENERGY IN VS BURNED, Sunday-written WEEKLY REPORT
  w/ COACH paragraph, WEIGHT · WEEK, composition (BMR/muscle), FROM
  range picker, TRAIN · VOLUME. **PORT IS THE NEXT BLOCK** — slice
  inventory per PORT GATE rule 2 before building.

## 2026-08-11d — Chat coaches the whole record; PROD DEPLOYED

- **get_health_data grew workout_history + food_history** (full-history
  Mon-week series: sessions, strength/outdoor, volume, active minutes,
  burn, km, load; intake vs target with loggedDays honesty) and
  from/to range args on recent_* — "coach me since I started" and
  "what did I eat June 5th" both resolve against Nov 2024+. Live smoke:
  the coach cited the May 2025 block, the Jan–Mar 2026 rebuild, and the
  29.7 kg weekly-avg arc unprompted, then flagged strength thinning.
- **TRAILS card → activity detail**: Train's trail summary deep-links
  to /health/workouts/activities?id= (page reads the param).
- **`vercel deploy --prod` shipped everything** (Michael's go, via his
  "is this in production" check): routines MVP, VeSync history + Body
  arc, Activities port, habits/composer/targets batch, Strava full
  history, coaching tools. Prod-verified: body overview serves 96
  points 2025-12-24 → 2026-08-11; activities total 108.
- His mic-permission complaint + Apple Health sync: both answered in
  chat — the durable fix for each is the thin iOS companion (queued,
  Phase 3); Shortcuts bridge offered as the stopgap.

## 2026-08-11c — Full Strava history in + enriched; history audit

His ask: "I would like our app to have all the history I've done."

- **Full-history Strava sync ran** (POST /api/strava/sync fullSync):
  account total 91 activities — 5 new (Jun→Aug walks), 86 already
  present. Coverage now **Nov 4 2024 → Aug 7 2026**; 108 workouts total.
- **63 legacy rows normalized** onto the modern contract
  (externalSource "strava" + externalId from stravaActivityId — they
  predated those fields and were invisible to stream tooling).
- **backfill-streams gained ?take=&before=** (the hardcoded newest-40
  window could never reach 2024) and ran over everything: **89 of 91
  activities now carry hrStream + timeInZones + loadScore** (2 have no
  HR/altitude on Strava at all). Activities detail charts light up
  across the whole history.
- History audit for Michael (delivered in chat): workouts drill-down
  DONE; food history / range filters / weekly report / composition
  panel need design first — filed in deferred-items with his
  cloud-design prompt.

## 2026-08-11b — Activities port (cloud design) + Michael's batch

His cloud design rev (claude.ai/design "Health app design system" →
Pitaya App.dc.html, +238 lines, imported via DesignSync into
docs/design/) added the training-history surfaces; ported same-day per
THE PORT GATE, plus the quick wins from his voice-note batch.

- **THIS WEEK · OVERVIEW** on Train (design verbatim): sessions / active
  h:mm / kcal / outdoors km for the Mon-week + "View activities →".
  Deviation surfaced: design's "4 of 5 planned" needs a weekly plan
  target that doesn't exist — label shows the live session count.
- **Activities** (/health/workouts/activities): push-in list, All/Gym/
  Outdoor chips, typed icon circles (kettlebell/circuit/trail/walk —
  extracted verbatim into pitaya-icons.tsx), count pill, infinite
  scroll (GET /api/health/workouts/activities cursor pagination; 103
  activities). Strava titles trimmed of their stat tails (splits on
  ·/•).
- **Activity detail** (GET /api/health/workouts/activity?id=): outdoor →
  dark GPS panel (real polyline projected; 14 activities have routes;
  no-route rows show the grid honestly), ELEVATION (altitudeStream),
  HR chart + TIME IN ZONES (hrStream/timeInZones, design zone ramp);
  strength/circuit → SEGMENT TIMELINE (hero from stepSeconds, block
  bar: proportions for circuits, alternating rounds for EMOMs) +
  SEGMENTS · TIME TO COMPLETE with per-movement Δ vs the previous run
  of the same routine (server compares stepSeconds positionally).
  Deviations surfaced: SPLITS card omitted (no per-km data stored);
  "Apple Watch" copy is source-aware (Strava/live/chat history).
- **Chat composer split** (his ask): mic stays visible always; send
  arrow joins it when text exists; dictating with a draft APPENDS to it
  instead of auto-sending. (His "still just a microphone" report = the
  stale home-icon bundle from 2026-08-09i — re-add still pending on his
  phone.)
- **Habits are his real stack**: creatine, magnesium, complex B,
  journal, mobility, 10k steps (3-up grid on phones); Food SUPPLEMENTS
  now the same three supplement keys (omega-3/vitamin-d rows were
  invented — dropped). Same habit_checks keys → a tick is a tick.
- **Targets reachable from Today**: gear on the calorie ring opens the
  same MacroTargetsSheet as Food. Slider rebrand + journal library-
  picker + the dock photo suite → deferred-items (specs filed).

## 2026-08-11a — VeSync history imported; the weight trend is the whole journey

His ask: "I have been tracking my weight all along and I'd like to report
the trend as well as other elements that vesync has tracked." (First link
was the Sensi thermostat sheet — halted, got the real export.)

- **Import route rebuilt** (app/api/health/import/vesync +
  lib/vesync.ts, 11 tests): the old route parsed DD/MM — his export is
  MM/DD, which would have landed half the rows on silently wrong dates.
  Format now detected across the whole file (any day-field >12 decides;
  ambiguous defaults MM/DD; conflict → 400). Timestamps parse through the
  USER timezone (settings America/Bogota), not server locale — a UTC
  serverless import can't shift 2 AM weigh-ins a day back. Near-twin
  policy: a stored row (ANY source) within ±10 min at ±0.3 kg is the SAME
  weigh-in → fill its null composition fields, never create a duplicate,
  never overwrite (he voice-logged scale readings minutes after stepping
  off, Feb–May).
- **His full history is in**: 223 CSV rows → 131 imported, 23
  fill-merged onto manual twins, 69 already recorded, 0 errors.
  Dec 24 2025 113.55 kg → Aug 11 2026 81.5 kg. **−32.0 kg.**
- **Body chart shows the whole arc**: overview weighIns = full history,
  one point per local day (earliest = the morning ritual reading),
  stride-downsampled ≤96; tape/photos queries decoupled from the old
  take-120 window (200+ daily rows would have evicted his 2 tapes).
  Chart dots render only when ≤20 points (dense line, not bead chain).
  Header reads −32.0 kg · 33 wk. Screenshot-verified.
- **Chat reports the trend**: weight_trend now returns a full-history
  Mon-week series (avgWeightKg/avgBodyFatPct/avgMuscleMassKg) plus the
  recent raw rows w/ ids. Live smoke: "111.8 kg, 33.9% bf (week of Dec
  22) → 82.1 kg avg this week; latest 81.5. Down 30.3 kg; bf −13.2
  points." Smoke rows cleaned.
- VeSync metrics stored but not yet SURFACED (bf%/muscle/BMR/visceral/
  metabolic-age trends have no screen): deferred — candidates for a Body
  screen composition panel when a design slice exists.

## 2026-08-10b — Routines MVP: the backend/AI half the watch was waiting on

Michael's directive via the watch lane ("we shouldn't do workouts, we
should be focused on routines") — the ROUTINES MVP SPEC's main-lane
pieces, all live:

- **`Sequence.rounds`** (migration `sequence_rounds_user_exercises`):
  circuits are round-counted ("repeat 3 times"). In validateSequence
  (cap 50), both sequence routes, **`/api/mobile/sequences` — the watch's
  nil-safe decode can now go live** (falls back to 3 until then). Builder
  page grew a ROUNDS field; circuit rest label now says ROUND REST
  (matching the watch: restSecondsDefault rests between ROUNDS, per-step
  restSeconds after a movement).
- **User-minted exercises** (`user_exercises`: slug/name/category/
  aliases): lib/exercises.ts gained a customs layer merged into the one
  index (client-safe; DB side in lib/user-exercises.ts, 15 s TTL cache).
  Longest-key-first means "one-arm clean squat thruster" beats the
  catalog's "thruster" substring — customs win without special-casing.
  Exact-name mint gate (plural-tolerant) so "Kettlebell Cleans" never
  mints a duplicate; alias collisions with known keys are dropped so a
  custom can't hijack "clean". Resolves in PRs (custom movements set
  records — proven), routines, Train display. **`GET /api/mobile/
  exercises` (bearer) is live** — customs + max updatedAt for cheap
  polling; contract in watch-contract.md.
- **AI routine builder, upgraded**: create_routine now carries rounds,
  restSecondsDefault (between-rounds), per-step restSeconds/weightKg/
  category — any equipment. Steps with a category auto-mint unknown
  movements on save (one confirm, no extra card); explicit
  create_exercise proposal for standalone "track two-hand cleans
  separately" asks. NEW update_routine (complete-definition replace,
  id via new get_health_data routines query). Live-model smoke: dumbbell
  circuit ask → correct card (circuit · 3 rounds · 60 s round rest ·
  14 kg steps · dumbbell categories).
- **Post-hoc single-line edit (2b family)**: edit_workout_entry chat
  proposal → new PATCH /api/health/workouts/entry — surgical edit of ONE
  exercises[] entry (catalog-normalized name match, "windmills" finds
  Kettlebell Windmill), never touches startedAt/type/duration (the
  general PATCH would clobber). Then a full PR REBUILD (extracted to
  lib/prs.ts rebuildPersonalRecords, shared with backfill) because a
  correction must LOWER records: smoke proved windmill 20 kg phantom PR
  → corrected to 8 kg → phantom retracted. Prompt: after fixing a
  routine-run's entry, the AI offers to update the routine's prescribed
  weight too (update_routine).
- **Watch run metadata rendered**: /api/health/train session now carries
  routine {name, roundsCompleted} (sequenceName, or lookup by
  sequenceId) + per-row workSeconds from stepSeconds (positional, only
  when lengths align); Train's TODAY card shows the routine line, rounds
  pill, and per-movement working time. Web saveSession now also sends
  sequenceName. recent_workouts (chat) returns sequenceId/Name/
  roundsCompleted/stepSeconds — "how did my circuit go" answerable.

Verification: tsc clean · 90/90 vitest (rounds, customs precedence, mint
gate, entry-edit lib, tool surface) · clean build · API smoke on dev
(cookie + minted bearer): circuit create w/ mint → mobile payloads →
update (rounds 3→4) → routine-run workout → Train metadata → entry edit
→ phantom-PR retraction → live chat-stream proposal. All smoke rows
deleted; PR table diffed byte-identical to pre-smoke snapshot.

Notes: found the branch checkout 11 commits behind origin/main (EMOM
runner + Food port merges) — fast-forwarded before building; migration
drift from cloud-session `favorite_products` resolved by the sync (no
reset). Long-running dev server held the pre-migration Prisma client —
restarted. Deferred: builder-UI minting (category picker on unknown
names), web circuit runner with round counting (watch has it; web live
sheet is still set-based), folding stepSeconds into workouts older than
today's on some history surface.

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
- **Build now runs `prisma migrate deploy`** before generate/build.
  Vercel only ran `prisma generate`, so a schema-bearing deploy would
  have shipped code whose columns didn't exist yet (favorites GET
  selects them → the usuals list would have come back empty). Applies
  on CLI `vercel deploy --prod` too, since both use this script. A
  failed migration now fails the build loudly rather than degrading the
  app silently.
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

## 2026-08-12a — [watch] GPS ROUTES (Phase 3.5) + the iOS app icon

The Strava-replacement capture piece, proven end-to-end in the simulator
against prod with a scripted Salento track:

- **RouteTracker** (CoreLocation, best-for-navigation, .fitness): accuracy
  gate at 50 m, sub-metre jitter ignored, fixes feed BOTH
  HKWorkoutRouteBuilder (route lands in Apple Health) and our own buffer.
  Started only for outdoor kinds; background location declared.
- **Wire format reuses the app's existing map contract** — routeData
  `{summaryPolyline, points[], source}`. The polyline is the same
  precision-5 encoding Strava imports use, so watch routes render on the
  ALREADY-BUILT activity map with zero main-lane work. Encoder verified
  against Google's canonical reference string AND round-tripped through
  the app's own lib/polyline.ts decoder (exact). Raw points ride at 1/5 s
  for future server-side splits.
- **Elevation gain** from the barometer (positive deltas, 0.5 m noise
  floor) → the existing `elevationGainM` column ("+186 m" on TRAILS);
  altitudeStream still ships raw. GPS distance fills in only when
  HealthKit has none — HK stays authoritative.
- **Trail live page (design 12) ported**: mint blinking GPS pill
  (SEARCHING → GPS → NO GPS), the map box with the design's three contour
  curves verbatim + the live track drawn from real fixes (aspect-corrected
  for latitude, hollow start dot, filled head), distance hero, ELEV M ·
  /KM pace · BPM. Outdoor sessions get it as their second page.
- **THREE bugs caught by self-smoke, all crash-class**: (1)
  allowsBackgroundLocationUpdates threw because CoreLocation validates
  UIBackgroundModes even on watchOS — declared it AND made the setter
  conditional so a missing key can never crash mid-walk; (2) a live route
  insert racing finishWorkout() deadlocked the save — sensors now stop
  BEFORE the session ends, and finishRoute has a 6 s deadline so Apple
  Health can never cost a workout; (3) `lastT = Int.min` in the
  downsampler overflowed on the first point (Michael's crash report
  pinpointed the line) — now an Optional.
- Smoke: 27 fixes → polyline decoded back to 27 points inside the
  simulated track, HK workout saved, server enrichment intact, row swept.
- **iOS app icon shipped** — the home screen placeholder is gone; the
  dragonfruit is flattened opaque (iOS rejects alpha) at 1024².

## 2026-08-11g — [watch] iOS COMPANION SHIPPED to Michael's iPhone

The thin companion per the kickoff directive — built, sim-verified
end-to-end, Release-installed to his iPhone 17 Pro Max via devicectl:

- **WKWebView shell**: prod web IS the UI; persistent cookie store (PIN
  login survives), light-first chrome (no black safe-area bands), bounce
  off, external links open Safari, back/forward gestures on.
- **Durable mic/camera**: native usage descriptions + WKPermissionDecision
  .grant for the personal-os-plum origin ONLY — the every-launch
  getUserMedia prompt dies (his standing complaint).
- **HealthKit → /api/mobile/health/daily**: reads bodyMass, sleepAnalysis,
  HRV SDNN, restingHeartRate, stepCount, activeEnergy, distance; posts
  today (+ yesterday once per launch) and re-posts on HKObserverQuery
  background delivery (hourly). sleepMinutes/hrvMs/weightKg ride in
  rawData until the announced columns ship. PROVEN in sim: grant sheet →
  Connected → row landed on prod (zeros from the empty sim store —
  today/yesterday get overwritten by his real phone's upsert).
- **Native pairing** (PIN pad, same bearer flow as the watch, separate
  Keychain service) + minimal Companion settings sheet reachable by SHAKE
  or pitaya://settings (URL scheme registered): Health status/sync-now,
  push status, unpair.
- **APNs groundwork**: full token flow wired (UNUserNotificationCenter →
  register → POST /api/mobile/push/register when it exists) — but NO
  aps-environment entitlement on the free personal team (it would break
  provisioning like the Sign-In-with-Apple incident); settings shows
  "needs Apple Developer Program". The $99 decision now gates reminders.
- Shared refactor: SVG parser + DragonfruitLogo moved to
  Shared/PitayaVector.swift (both targets); fixed a nested-ObservableObject
  render bug (health manager changes now forward to the model).

## 2026-08-11f — [watch] Raw streams adopted; treadmill/hike; customs ready

Adopted the 2026-08-11 streams contract end-to-end, proven against prod:
the recorder appends HR samples at HealthKit's natural cadence
(hrStream/timeStream, ~1/5 s) plus barometric altitudeStream on outdoor
sessions (CMAltimeter; NSMotionUsageDescription added) and a session
stepCount query at finish — all raw, server enriches (smoke row came back
with SERVER-computed timeInZones + loadScore from 3 samples at t=2/7/13 s).
Also: Treadmill (treadmill_walk, indoor) and Hike rows in the picker;
GET /api/mobile/exercises merged into the catalog/normalizer with a disk
cache and a MY MOVES picker section (endpoint live but empty — lights up
when the AI mints the first custom); home-grid content +12% per Michael
(icons 30 pt, titles 13 pt, boxes unchanged). HealthKit will re-prompt
once on the wrist (new steps read). Release pushed OTA to his watch.

## 2026-08-10a — [watch] Routines-first: circuits, weights editor, countdown

Michael's direction crystallized on-wrist: routines are the center (his
Lebe Stark walkthrough → MVP spec in deferred-items for the main lane).
Watch side shipped and sim-verified end-to-end (Release built; OTA install
pending — watch was out of network reach, likely on his walk):

- **Circuit runner** (kind != emom): tap-driven Done per step, ROUND r OF R
  + STEP s OF n, big reps + move + weight, live HR, mint REST countdown
  between rounds (skippable, haptic at zero — design 14's job), End-early
  counts tap-counted completions exactly. **Per-step working seconds**
  captured start→Done and synced as metricsData.stepSeconds.
- **Pre-start weights editor** on routine detail ("TODAY'S WEIGHTS"):
  crown-dial sheet per exercise, real bell denominations (4 kg jumps,
  4–64), overrides persist per routine, entries log ACTUAL weights → PRs.
  EMOM labels show weight when set.
- **Kettlebell space IA**: Workouts → Kettlebell → Routines + Free sets
  (routines count live from the API). Sequences list renamed Routines.
- **3-2-1 countdown** with tick haptics + start haptic before every
  freeform/routine start (his ask — nothing starts on the tap itself).
- **Type +12% globally** (one-line Theme typeScale — second size pass) and
  bigger touch targets (rows 31pt circles, controls 50pt, tiles 88pt, PIN
  keys 31pt).
- DEBUG sample-circuit seam (injection survives refreshes) lets the runner
  be driven in sim before the backend can build circuits; circuit detail
  labels say STEP n (not MINUTE n).
- rounds: Int? decodes now (nil-safe until main lane ships the field).

## 2026-08-09h — [watch] ON MICHAEL'S WRIST + feedback batch shipped same-day

Pitaya reached the physical watch (Series 8, watchOS 26.6). Debug install
went through Xcode with Michael present (blockers en route, all solved:
watch invisible to the Mac until same-Wi-Fi + first Xcode contact unlocked
the hidden Developer Mode toggle; a stray Sign-In-with-Apple capability
from "+ Capability" exploration broke personal-team provisioning — removed;
team HDR67SL3JG captured into project.yml). His feedback from the first
wrist session, shipped within the hour and REinstalled over the air via
devicectl as a Release build (commit 6fedc4c):

- **Sequences/EMOM live on the wrist** — /api/mobile/sequences shipped
  mid-session (main lane's Train stage); list/detail/runner ported from
  design 06/07/09; his real "20-Min EMOM" runs with ring countdown, round
  haptics, auto-finish; runs sync with metricsData.sequenceId. Sim-verified
  through real taps end-to-end.
- **New Home ported** (design 04 tile grid, dragonfruit logo extracted
  verbatim from pitaya-icons.tsx; Sleep/Journal honest "soon" tiles).
- **Save/Discard review** replaces auto-save (his ask; discard confirmed
  destructive-style); **idle nudge** after 8 quiet minutes (no sets, HR<95):
  haptic + Keep going / End overlay (his ask).
- **Perf**: the 5–10 s black screens were Debug+debugger overhead plus a
  bootstrap that blocked on two cold Vercel calls — now cached-baselines-
  first with background refresh, and the wrist runs Release.
- Sizes bumped ~10% for the 45 mm ("a little small" feedback — iterate).
- Smoke rows now sync as externalSource watch_smoke; his 2 real app_watch
  wrist workouts were correctly untouched by cleanup; PR table backfilled
  clean after the smoke (7 records, unchanged).
- Watch streak on home deferred (needs a mobile endpoint — new ask below).

## 2026-08-09g — [watch] Server-truth PRs adopted, PORT GATE parity, runbook

Post-worktree-split session in the new lane home. Both new backend
contracts adopted and proven against prod; the watch now matches the design
per THE PORT GATE; everything short of Michael-present device signing is
done (runbook: docs/watch-device-runbook.md).

- **Server-truth PRs** (contract § ownership): baselines now come from
  `GET /api/mobile/prs` (verified identical to the local engine's view — 7
  records matched exactly), disk-cached (`PRBaselineCache`) so offline
  cold-starts still know the bests; the top-100 history rebuild is deleted.
  Sync response `prs: [{externalId,newPRs}]` decodes and REPLACES the local
  estimate on the summary (server wins on drift); live-set haptics stay
  local for offline instantness. Smoke proof: paired fresh → server
  detection wrote swing 48 kg (prev 20) + volume 240 to personal_records →
  summary showed the server-confirmed banners → then FULL RESTORE (rows
  deleted, `/api/health/prs/backfill` re-run, `/api/mobile/prs` diffed
  byte-identical to the pre-smoke snapshot).
- **PORT GATE parity**: `WatchApp/Views/PitayaGlyphs.swift` — a tiny SVG
  path renderer + every glyph EXTRACTED verbatim from pitaya-watch.dc.html
  (kettlebell = the app design's Train icon, trail mountain, walk figure,
  filled heart, check, end ✕, pause bars, water drop, play, lap flag).
  dumbbell.fill and all other SF substitutions on designed surfaces are
  gone (SF remains only on undesigned elements: chevron, repeat-set arrow,
  queue badge — listed in ios/README). Home is the design's row list
  (Kettlebell / Trail Run / Walk) with real-history subtitles ("1.9 km ·
  Wed" from his actual last run). Fonts BUNDLED: Familjen Grotesk +
  Instrument Sans (7 static TTFs, OFL, PostScript names verified) via
  UIAppFonts + the Theme seam — visible in the new screenshots.
- **Smoke hygiene hardened after an incident** (owned in the report to
  Michael): a cleanup sweep keyed on externalSource `app_watch` deleted an
  empty test row (07:28 this morning, strength, 0 sets, no description)
  that was NOT this lane's — almost certainly Michael's own morning
  simulator test (his 12:28Z device session was found and KEPT). His PR
  table was unaffected (backfill-verified). Fix shipped: smoke workouts now
  sync as externalSource `watch_smoke`, never `app_watch`, and session
  cleanup lists-then-deletes only rows attributable to the running session.
  Also: keychain resets during smoke un-paired his sim app — he'll re-pair
  on next open (fresh welcome screen left, new build installed).
- Sequences/rest-timer/sleep: WAITING on the Train-stage API per contract.
- Both targets build green; sim left at welcome on the new build.

Next: the device session (Michael present) — runbook has signing, Developer
Mode, install, HK prompts, and the 8-point real-hardware validation table.

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
