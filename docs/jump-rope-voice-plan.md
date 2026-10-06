# Jump rope + watch voice logging — findings, feasibility, plan

**Status: APPROVED and BUILT 2026-10-05.** What shipped, what was verified
and what still needs the watch is in [`state.md`](state.md) (top entry). This
file is kept as the record of the findings and of the reasoning.

**His answers to §5:** (1) yes — one session across web and watch, and Jump
Rope gets its own section in the workout-type list; (2) build inside the
existing design, and draw a new jump rope icon to match; (3) selectable on
the watch — the phone is for analytics, he never logs there (so the
"change type" control and a phone timer were dropped); (4) convert the three
5 Oct sessions; (5) fix going forward only; (6) Series 11; (7) vests run
5–22 kg, usually 5 — say the weight and it is used, otherwise 5 is assumed;
(8) run the jump-count trial now. He also asked that calories show on every
workout and steps on every distance one.

Two things in §4 changed in the building: late voice entries are re-sent
with the workout rather than appended through a separate endpoint (one sync
path, guarded by `lib/workout-resync.ts`), and the plural names the parser
first treated as fuzzy ("kettlebell presses") became catalog aliases so the
common phrasings stay on the fast rule path.

Contents: [1. How it works today](#1-how-it-works-today) ·
[2. What I found that changes the brief](#2-what-i-found-that-changes-the-brief) ·
[3. Feasibility](#3-feasibility) · [4. Plan](#4-plan) ·
[5. Decisions I need](#5-decisions-i-need)

How each claim was established is marked where it matters: **read** (in the
code), **checked** (against the installed watchOS 26.5 SDK or your prod data),
**estimate** (not measured — treat as a hypothesis).

---

## 1. How it works today

### Watch app — start and record

- The watch app is **standalone** (`WKWatchOnly: true`, `ios/project.yml`). It
  talks straight to the backend with a bearer token
  (`ios/Shared/Networking/MobileAPIClient.swift`). There is no link to the
  phone app — no WatchConnectivity on `main`.
- Start path: Home → Workouts list (`ios/WatchApp/Views/HomeView.swift`) →
  `AppModel.startWorkout(kind)` → 3-2-1 → `WorkoutRecorder.start()` opens an
  `HKWorkoutSession` + `HKLiveWorkoutBuilder` (`ios/WatchApp/WorkoutRecorder.swift:161`).
- Heart rate is appended to `hrStream` / `timeStream` whenever HealthKit
  delivers a sample (one point per elapsed second at most). Calories and
  distance come from the builder's statistics.
- End path: End → sensors freeze → 60-second recovery capture (HRR) →
  Summary → **Save** → offline queue → `POST /api/mobile/workouts/sync`.
  The HRR number lands up to a minute later by re-sending the same item.

### Workout types

- Watch: one enum, `WorkoutKind` (`ios/WatchApp/AppModel.swift:45`) —
  kettlebell, walk, treadmill, run, hike, freestyle, other. Each case carries
  its server string and its HealthKit activity type. Freestyle is
  `.highIntensityIntervalTraining`, stored as `freestyle`.
- Server: `workoutType` is a **free string**, no enum, no validation. There
  are at least nine separate lists of type names (chat tool, MCP, Strava map,
  MET tables, card typing…).
- Phone screens don't use the type directly. They use three **card types**:
  `kb | cir | out` (`lib/activities.ts:71`). Anything unknown falls to `kb`,
  or to `out` if the row carries any distance.
- Structure on the wrist exists only for routines: an EMOM engine with fixed
  60-second rounds and a tap-driven circuit runner. Freestyle has none — it
  shows HR, zone and End.

### HealthKit → backend

- Workouts reach Pitaya **only** as the watch's own payload. Nothing reads
  `HKWorkout`s back out of Apple Health; the phone companion syncs daily
  totals only (steps, sleep, HRV, resting HR, weight —
  `ios/iPhone/HealthStore.swift`).
- So the Apple Health category of a session affects Apple's rings, Fitness
  and the calorie model the watch applies — not what Pitaya stores.

### Data model (read)

| Field | Where it lives | Notes |
|---|---|---|
| `workoutType` | column, free string | no enum |
| `exercises` | JSON column, no validator | rows are `{name, exercise?, sets?, reps?, seconds?, weightKg?}`; `exercise` (catalog id) is added only by the phone editor and MCP |
| `packKg` | column, 0–60 | session-wide carried load, built for hikes; the watch sync route does not accept it |
| `hrStream`, `timeStream` | inside `metricsData` | stored at ≤200 points for freestyle, ≤120 for other kinds |
| `timeInZones` | inside `metricsData` | `{seconds[5], pct[5], totalSeconds}` |
| `hrr` | derived on read | from `metricsData.hrrDelta` / `hrrSeconds` |
| `volumeKg` | derived on read | sets × reps × kg; a row with only `seconds` adds 0 |
| `roundsCompleted`, `stepSeconds`, `sequenceId` | inside `metricsData` | routine runs |

The watch's own `ExerciseEntry` struct has only `name, sets, reps, weightKg` —
no `seconds`, no `exercise` id (`ios/Shared/Models/MobileAPIModels.swift:46`).

### Display, graphs, PRs (read)

- **Detail screen** (`components/activity-detail.tsx`): the heart-rate chart
  is a hand-drawn SVG line. Its x-axis is the **sample index**, not time —
  `timeStream` is never sent to the page. No axes, no shading, no scrubbing.
  Zones are five bars; HRR is one card.
- **PRs** (`lib/prs.ts`): two kinds only — heaviest weight, and best
  single-row volume. Both require a recognised exercise name **and**
  weight > 0. Timed and bodyweight rows can never PR. The PR wall reads the
  weight kind only and prints "kg".
- **Weekly**: tonnage is the headline everywhere. A cardio session adds 0 kg
  but counts toward sessions, minutes and calories. Zone time is summed in
  the Sunday Report.
- **No per-exercise history or progression screen exists.**
- **No workout-type picker exists anywhere on the phone.** Workouts are
  created by the routine runner (always `strength`), a chat proposal, the
  watch, or MCP.

### Your jump rope sessions as stored (checked, prod)

Three sessions, all 5 Oct: `freestyle`, `exercises: [{"name":"Jump Rope","sets":N,"seconds":30}]`.

- `sets` equals the session's minutes each time (29 min → 29, 17 → 17, 8 → 8)
  — the round count was typed in afterward, not measured.
- "Jump Rope" is in neither the catalog nor your 25 custom exercises, so the
  rows carry no exercise id.
- On the phone they render as **kettlebell cards**: kettlebell icon, the word
  "kettlebell", "0 kg".
- They have no training-load score (freestyle rows skip that server step).
- No round boundaries were recorded, so nothing knows when each round began.

---

## 2. What I found that changes the brief

**Four parts of the brief don't match the code:**

1. **"Selectable in the iPhone app" has nothing to attach to.** There is no
   type picker on the phone. I propose it means: chat can log jump rope with a
   protocol, the list and detail show it as its own thing, and the detail
   gets a small "change type" control (new) so a mis-typed session is one tap
   to fix. A phone-side jump rope timer is not included.
2. **"Fall back to a regex parser if it's offline" can't work on the wrist.**
   With no on-watch transcription (see §3), an offline watch has audio, not
   text — there is nothing for a regex to parse. Offline means "queue the
   audio". The rule-based parser still earns its place on the server, as the
   fast path and as the fallback when the LLM call fails or is slow.
3. **"Send the audio to the phone" is not available.** The watch app has no
   channel to the phone app. The work that embedded it (28 Aug, TestFlight)
   sits on an unmerged branch, `claude/apple-dev-program-setup-eefb21`.
4. **The interval graphs need two things that are not stored today**: when
   each round started, and a time axis at useful resolution. A 29-minute
   session is stored at about one HR point per 9 seconds — three points per
   30-second round. New sessions can fix both. The three existing sessions
   can only get protocol-level numbers.

**Three existing bugs, all of which would hit these features:**

5. **Indoor sessions inherit the previous walk's distance** (read + checked).
   `WorkoutRecorder.start()` never clears `distanceMeters`. Thirteen freestyle
   sessions from 12–30 Sep carry a stale value — for example three carry
   exactly 7,079 m after the 26 Sep walk. It inflates "OUTDOORS km" on the
   Train overview, which sums distance across every type
   (`app/api/health/train/route.ts:159`). A jump rope row would get the same.
6. **Every session carries one old circuit's step timings** (read + checked).
   `circuitStepSeconds` is cleared only when a routine starts. All 21 watch
   sessions from 7–30 Sep carry `[784,1222,0,0,0,0]`, including walks. On the
   14 Sep gym session those two numbers are shown as "time to complete" for
   Treadmill walk and Leg Press.
7. **A re-send from the watch overwrites edits made on the phone** (read).
   The sync update path writes the whole row, including `exercises`
   (`app/api/mobile/workouts/sync/route.ts:264`). Today that window is about
   a minute (the HRR re-send), longer if the watch is offline. With voice
   entries arriving late it would be routine. The plan closes it.

**Also worth knowing:**

8. **PRs are weight-only.** "10 push-ups" or "12 pull-ups" will log and
   display but never PR — same as today. Weighted voice entries PR exactly as
   they do now. Jump rope PRs need new record kinds.
9. **The phone editor rebuilds each exercise row from a fixed field list**
   (`app/api/health/workouts/entry/route.ts:92`). Any new per-entry key (such
   as a vest) is dropped on save unless the editor is taught about it.
10. **No design source exists** for any screen these features need: jump rope
    setup and live screens, the record button and confirmation line, an
    interval HR chart, a per-round chart, a progression view, a voice review
    screen, or a jump rope icon. By the PORT GATE that is a gap to flag.
11. **`docs/design/pitaya-app.dc.html` is truncated in git** — exactly
    262,144 bytes, ending mid-statement. The activity screens are intact; the
    icon and colour maps at the end are gone. Unrelated to this work.
12. **Builds reach your wrist by direct install from `main`**
    (`pitaya-resign.sh`), not TestFlight. Nothing here goes through App Store
    review today.

---

## 3. Feasibility

### Jump counting from the accelerometer / gyro

- **No system count exists** (checked). HealthKit has the jump rope activity
  type and no jump-count data type.
- **The sensors are available** (checked). `CMMotionManager` runs during a
  workout session; `CMBatchedSensorManager` gives high-rate batches on
  watchOS 10+ with newer hardware.
- **The signal is there in principle.** Each rope turn is one wrist rotation;
  steady single bounce is a clean rhythm at roughly 2–3 turns a second.
- **How accurate it would be for you is unknown.** I can't measure it: the
  simulator produces no motion data and I have none from your wrist. I am not
  going to quote a percentage I haven't measured.
- **Where it is expected to go wrong** (estimate): trips and restarts,
  double-unders (two turns per jump), boxer or alternate-foot steps, and the
  first and last second of every round. That last one repeats every round, so
  30/30 is a harder case than continuous jumping.
- **The step count HealthKit already reports is not a jump count.** Your
  sessions show 1,103, 2,556 and none. It is the pedometer reacting to
  bouncing. I won't show it as jumps.

**Recommendation:** ship **manual entry** now — total jumps on the watch
summary, total or per-round on the phone. Treat automatic counting as a
separate trial: capture raw motion on two or three sessions where you count a
known number; I tune against that; the estimate then runs hidden next to your
manual counts for about five sessions. It is shown (marked "≈") only if it
lands within about 3% on your data. Jump PRs come only from manual or
validated counts.

### Wrist-raise to start recording

- **No public API.** Siri's Raise to Speak is system-only.
- **Building it from wrist angle would misfire** on swings, presses, snatches
  and wiping your face, and it would open the microphone without intent.
  Your expectation was right; I'm not building it.
- **What is reliable:**
  - A large on-screen button.
  - **Double Tap** (pinch twice). The app already uses it. On the freestyle
    screen it is currently unassigned, so it can start and stop a recording
    with no screen touch. Needs a Series 9 / Ultra 2 or later.
  - **Action Button** (Ultra only): through a Shortcut bound to a new "Log by
    voice" intent. An earlier round concluded there is no per-screen Action
    Button API; I'd re-check that on-device before promising more.
- On the strength set logger, Double Tap already means "Log". I'd leave that
  and use the tap button there.

### Transcription on the watch

- **The Speech framework does not exist on watchOS** (checked — absent from
  the 26.5 SDK). No on-device speech API we can call.

| Option | Verdict |
|---|---|
| **(a) System dictation** (`TextFieldLink`, already used for trail names) | Works, no mic permission. But it is a system sheet: tap, sheet opens, speak, tap Done. It covers the workout screen, can't be started by Double Tap and can't stop on silence. Too fiddly mid-set. |
| **(b) Record on the watch, send to the backend** | **Recommended.** Audio recording is available on watchOS (checked). The backend already has the transcription model wired (`gpt-transcribe`, `whisper-1` fallback). |
| **(c) Send to the phone** | Not available — see §2.3. |

- **What exists to reuse:** the model registry in `lib/openai.ts` and the
  call pattern in `app/api/ai/transcribe/route.ts`. That route is
  cookie-gated, so the watch's token can't use it — a new bearer route is
  needed. `transcribe_recording` is the sermon pipeline (two-minute segments
  stored in Postgres, processed in batches); it shares the model call and
  nothing else.
- **Latency** (estimate, to be measured in the first slice): a 4-second clip
  is about 15–25 KB. After you stop speaking — upload 0.2–0.8 s,
  transcription 0.5–1.5 s, parsing near zero on the rule path or 0.5–1.5 s
  through the LLM. That is **about 1.5–3 s typical, up to about 5 s** on a
  cold server or weak signal. "A couple of seconds" is realistic for clean
  phrases and not guaranteed.
- **You are never blocked.** A haptic and "got it…" fire the instant
  recording stops; the parsed line lands when it lands.
- **No connection:** the clip is saved on the watch with its timestamp and
  shown as "queued". It uploads when the connection returns — mid-workout or
  after — and the server adds it to the workout even if the workout already
  synced.

### Permissions, App Store, battery

- **Microphone:** the watch target has no `NSMicrophoneUsageDescription`
  today. Without it the app crashes on first mic use. The permission prompt
  should be triggered at a calm moment (a Settings row), not mid-set.
- **Speech permission:** not needed — transcription is server-side.
- **Motion:** the existing string mentions only the barometer; it needs new
  wording if the counting trial runs.
- **App Store:** not in play today. If this ever ships through TestFlight or
  the Store, missing purpose strings reject the upload, and the privacy label
  must declare audio sent to your server and processed by OpenAI.
- **Battery** (estimate): a few seconds of microphone per entry is
  negligible. Each upload wakes the radio — small through the phone, more
  noticeable on LTE alone. Motion capture for 20–30 minutes is modest next to
  the heart sensor and display already running.
- **To test on-device, not assumed:** recording may pause music playing from
  the watch, and may switch to the AirPods microphone if they're connected.

---

## 4. Plan

### Data model changes

**No database migration.** Everything is additive inside existing columns.

| Change | Where | Shape |
|---|---|---|
| New type | `workoutType` | `"jump_rope"` |
| Catalog entry | `lib/exercises.ts` → regenerated Swift catalog | `jump-rope`, aliases incl. "skipping", "saltar la cuerda" |
| Jump rope exercise row | `exercises` | `{name:"Jump Rope", exercise:"jump-rope", sets:<rounds completed>, seconds:<work s per round>}` — your current shape plus the id |
| Interval record | `metricsData.intervals` (new) | `{mode:"interval"\|"continuous", workSeconds, restSeconds, plannedRounds, roundsCompleted, jumpSeconds, restSecondsTotal, marks:[[start,end],…], jumps?:{total, perRound?, source:"manual"\|"estimated"}}` |
| Stream resolution | `metricsData.hrStream/timeStream` | up to 600 points for interval sessions (about one per 3–5 s) |
| Per-entry log | `metricsData.setLog` (new) | `[{id, t, name, exercise?, reps?, sets?, weightKg?, seconds?, load?, transcript, confidence, status, gapSeconds?}]` |
| Carried load per entry | `exercises[].load` (new, optional) | `{type:"vest", kg?}` |
| PR kinds | `personal_records.kind` (string) | adds `rounds`, `duration`, `jumps`, `jumps_round`; weight and volume untouched |
| Watch `ExerciseEntry` | Swift struct | gains optional `seconds`, `exercise`, `load` |

- `marks` uses the same clock as `timeStream`, so shading lines up exactly.
- `gapSeconds` is the time since the previous entry. It is rest **plus** the
  next set's work, so it is named for what it is and shown as "≈ rest".
- The rounds PR is per protocol (for example "30/30").

**Vest: a per-entry modifier, not `packKg`.** `packKg` is one number for the
whole session, built for rucks, and the watch sync doesn't carry it. A vest
can be on for squats and off for swings; only a per-entry field can say that.
`weightKg` stays the implement's load, so a vested bodyweight squat does not
become a "10 kg squat" PR. It costs one thing: the phone editor must carry
the new key through (§2.9).

**Parsing: rules first, LLM second.** You asked for LLM with a regex fallback;
I recommend the reverse order on the server. "10 kettlebell swings" resolves
by rule against the catalog and your custom exercises in milliseconds.
Anything the rules aren't sure about goes to the LLM with a strict JSON
schema. If the LLM fails or exceeds its time budget, the rule result is kept
and marked for review. It is faster on the common case and fully testable.
Say so if you want LLM-always instead.

### Phases

Each phase is shippable alone. Web phases end with a deploy; watch phases end
with a merge and `pitaya-resign.sh --force`.

**A — Jump rope on the server and phone** (no watch change)
- `jump_rope` type, catalog entry, chat and MCP can log it with a protocol.
- Its own label on the list and detail. It reuses the existing circuit icon
  until a rope glyph is designed.
- Interval analytics as a pure, tested library: per-round peak, trough and
  drop; drift (first vs last third); work vs rest averages; jump time vs
  session time; calories per jumping minute.
- Detail screen: HR trace on a real time axis with work bands shaded;
  per-round trend.
- Progression grouped by protocol; the new PR kinds; jump time in the weekly
  summary where tonnage is 0.
- "Change type" on the workout detail.

**B — Jump rope on the watch**
- New kind using `HKWorkoutActivityType.jumpRope`.
- Setup screen: intervals (work, rest, rounds or total time) or continuous;
  last protocol remembered.
- Interval engine with a haptic at every transition, working with the wrist
  down.
- Each work interval is also written to Apple Health as a segment.
- Full-resolution streams and round marks in the payload.
- Manual jump entry on the summary.
- Fixes for bugs 5 and 6.

**C — Voice, server**
- One bearer route: audio in, parsed entry out.
- Parser with fuzzy catalog matching, unit conversion, sets, durations,
  "N rounds of…", vest.
- Composer that turns the entry log into the exercise list (consecutive
  identical entries become sets).
- Late entries append to an already-synced workout.
- Sync no longer overwrites phone edits (bug 7).
- **Tests:** a wide phrasing table for the parser (digits and number words,
  kg and lb, "one 24", "double 16s", vest phrasings, durations, per-side,
  Spanish, common mis-hearings, pure noise) plus composer tests.

**D — Voice, watch**
- **First slice measures real latency on your wrist** before the rest is
  built.
- Microphone permission; a large record button on freestyle and strength
  screens; tap or silence to stop.
- One-line confirmation with haptic; a distinct "needs review" state;
  one-tap undo; offline audio queue.

**E — Voice, phone review**
- A voice-log section on the workout detail: each entry with its transcript
  and time, review badges, inline fix.
- Unknown names prompt "add as a new exercise" rather than being dropped.

**F — Jump-count trial** (optional, after B)

### What I can and can't verify myself

- **Can:** the parser and analytics (unit tests); the server routes (curl
  with a minted token); the phone screens (browser); the watch flows in the
  simulator, which supplies synthetic heart rate.
- **Can't:** real microphone capture during a workout, real latency, haptics
  with the wrist down, jump counting, and the calorie model for the jump
  rope activity type. Those need you and the watch. Each watch phase ends
  with a short on-wrist checklist.

---

## 5. Decisions I need

Recommended option first. "Go" alone means the recommended options.

1. **One session across web and watch code.** CLAUDE.md's lane rule names
   only Spirit-on-iPad as an exception. I'm reading this request as granting
   the same. The parity check passes (`HEAD..claude/watch-app -- ios/` is
   empty). Confirm.
2. **Undesigned screens:** build inside the existing design systems now and
   flag them for a later design pass (as Freestyle was) — or run a design
   round first?
3. **"Selectable on the phone"** means chat + list/detail + a change-type
   control — agreed, or do you want a phone-side jump rope timer too?
4. **Convert the three 5 Oct sessions** to `jump_rope` with a declared 30/30
   protocol? They'd get protocol-level numbers only; no shaded rounds.
   Reversible. They stay HIIT in Apple Health.
5. **Old rows with the wrong distance or step timings** (bugs 5 and 6): fix
   going forward only, or also repair the affected rows? I'd list them for a
   separate go before touching any.
6. **Which Apple Watch do you have?** It decides Double Tap, the Action
   Button and high-rate motion.
7. **What does the vest weigh?** Without a number, "with a vest" is stored as
   a vest with no kg.
8. **Jump-count trial (F):** want it, after B?
