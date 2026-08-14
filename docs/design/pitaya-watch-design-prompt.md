# Pitaya — Watch + Voice + Chat design prompt (round 1 for watchOS)

**Status:** paste-ready. Hand the whole file to Claude Design.
**Written:** 2026-08-14 · main lane
**Read alongside:** `docs/design/claude-design-brief.md` (visual identity),
`docs/watch-contract.md` (data contracts), `ios/WatchApp/**` (what exists).

---

## Who this is for

One user: Michael. A lifelong health app, kettlebell-first. He trains 5–6
times a week — kettlebell sessions at home plus walks/hikes/runs outdoors. He
logs food and weight by voice. There is no second user, no onboarding funnel,
no growth loop. Optimize for the 400th session, not the first.

The phone app is a Next.js PWA called **Pitaya** (raspberry/plum identity,
`#8C2F51` / `#A63D63` / `#DC74A0`, cream-grey ground, Familjen Grotesk
display + Instrument Sans text). The watch app is a **standalone watchOS
app** — no iPhone required at workout time. It pairs once by PIN and syncs
over a bearer token.

---

## What exists today (build to this, not to a blank page)

The watch app is ~2,600 lines of SwiftUI. It has:

- **Pair → Home → Live → Summary** as its entire state machine.
- **Home:** a flat list of five workout kinds (Kettlebell, Walk, Run, Hike,
  Other), each a row with an SF Symbol, a title, one line of subtitle. Plus a
  bare "Unpair" text button in the footer.
- **Live workout:** a vertical `TabView` — a Metrics page (elapsed, heart
  rate, a zone bar, kcal, sets/km), a **Set Logger** page for kettlebell
  (Digital Crown dials bell weight 2–60 kg in 2 kg steps; ± buttons set reps;
  one big "Log set" button; a PR haptic fires the instant a set beats
  history), and a Controls page (End, Pause, Water Lock, Repeat set).
- **Summary:** a 2×2 stat grid (time, kcal, avg bpm, volume/km), PR banners,
  a sync-status line, Done.
- **Offline queue:** finished workouts persist locally and drain when the
  network returns.
- **Local PR engine:** baselines computed on-watch from synced history so a
  PR celebrates instantly, fully offline.

This is a good, honest core. The design work is about what surrounds it.

---

## The problems to solve

### 1. Routines are invisible on the wrist — the biggest gap

Michael builds **routines** (called Sequences) on the phone: named, ordered
programs with a `kind` of `straight | emom | tabata | circuit`, a step list,
per-step reps/seconds/**weightKg**, per-step rest, and round counts.

`GET /api/mobile/sequences` has shipped and returns all of this. **The watch
has never called it.** So every kettlebell session on the wrist is a blank
set logger: he re-picks the movement, re-dials the weight, and remembers the
program in his head.

Design the wrist routine experience:

- **Choosing a routine before the workout starts** — the Home screen needs a
  routine lane above the raw workout kinds. Show the routine he's most likely
  to run (last run, or the one his plan says is due) as a single primary
  action, with the rest one tap away. Screen space is 184–208 pt wide; a list
  of five routines with names like "20-Min EMOM — Swings, Snatches, Squats +
  Push-up Finisher" needs a real answer for truncation.
- **Confirming the weight at the start.** His explicit ask. A routine's steps
  carry a `weightKg`, but the bell he actually picks up today may differ
  (progression, fatigue, which bell is in the room). Design a **pre-flight
  screen**: the routine's movements listed with their prescribed bells,
  each tappable to adjust, one "Start" action. It should take two seconds
  when nothing changed and still allow a change. Consider a "my bells"
  inventory (he owns specific denominations — 12/16/20/24/28/32 kg) so the
  picker offers real bells instead of a continuous 2 kg dial.
- **Step-by-step guidance during the run.** His ask: *"better identify
  routines that start and go next to confirm I did them."* The live screen
  must answer three questions without a tap: **what am I doing now**, **how
  much is left of it**, **what's next**. Design the now/next pair, the
  per-step completion confirm, and what a skipped or failed step looks like.
- **Rest between steps and rounds.** Routines carry `restSeconds` per step
  and `restSecondsDefault` between rounds. There is no rest timer on the
  watch at all today. Design it: countdown, the moment it ends (haptic —
  he can't be watching the screen), and how to skip or extend it.
- **EMOM and circuit modes.** EMOM = one movement per minute on the minute,
  cycling. Circuit = N rounds of the whole list. These need different live
  screens from a straight sets-and-reps routine. The minute boundary in an
  EMOM is a hard event that must be felt, not seen.
- **The finisher problem.** His real routine ends with "minute 21: push-ups
  until failure" — an open-ended step the EMOM model can't express. Design
  what an open-ended finisher step looks like on the wrist.

### 2. There is no settings screen

The only setting on the watch is "Unpair." Design a settings surface for:
units (kg/lb), his bell inventory, default reps, haptic intensity, whether
the crown steps by 2 kg or by real bell denominations, auto-pause for
outdoor work, rest-timer defaults, and what the app does when a workout is
left running. Keep it short — this is a watch, not a preferences pane. Decide
what genuinely needs to be settable versus what should just be right.

### 3. Insights die on the wrist

Today the Summary shows four numbers and disappears. Everything interesting
lives on the phone ("Full breakdown in Pitaya"). Design what deserves to live
on the watch:

- **After a set:** is this bell heavier than last time on this movement? How
  many sets into the prescription is he?
- **After a session:** how does it compare to the last session of the same
  routine? Time in heart-rate zones? Did the session earn a progression?
- **Between sessions:** the Home screen currently says "last · 3d ago". It
  could say what's due, what the current block is, whether he's ahead or
  behind the week.
- **Heart-rate recovery** — the drop in the first minute after a hard set or
  the end of a session. Cheap to measure, genuinely diagnostic, and nothing
  in the app shows it today.

Design the hierarchy: what earns the summary screen, what earns a second
scroll, and what should stay on the phone.

### 4. Speed and friction

Logging a set is currently: scroll to the logger page → tap the movement
name → scroll a sheet → pick → dismiss → dial the crown → tap ± for reps →
tap Log. When a routine is loaded, most of that is already known. Design the
fast path — the one where he just did what the routine said and needs to
confirm it in one gesture — while keeping the slow path for deviations.

Also consider: complications / Smart Stack (starting a workout from the
watch face), Action Button on Ultra, and what the app should show when it's
launched mid-workout from a wrist raise.

### 5. Microphone state is unreadable (phone app, not watch)

On both the main dock and the Chat screen, "the mic is live" is currently
communicated by swapping one maroon for a slightly different maroon. He
cannot tell whether it's listening. A first pass has just shipped — a
breathing halo, an audio-level ring driven by real input, level bars, and an
explicit "Listening — tap to stop" strip — but it was engineered, not
designed.

Design the real thing: the idle → listening → transcribing → thinking states
for a voice-first app, as one coherent visual language across the dock and
the chat composer. It must be readable at arm's length, in sunlight, with a
phone lying on a bench between sets.

### 6. Chat is a wall of cards

The Chat screen is the app's logging surface: he talks, the AI proposes a
card (food, workout, measurement, routine), he confirms. It works. It reads
as an undifferentiated stack.

Filter tabs (All / Food / Usuals / Weight / Chat) have just shipped as plain
pills. Design the real information architecture: how a day breaks up, how a
confirmed card differs from a pending one at a glance, how the proposal cards
themselves should look per kind, and what the empty and thinking states are.

---

## Constraints — please respect these

- **watchOS 11+, standalone.** No iPhone at workout time.
- **Screen sizes:** 41/45 mm and 49 mm Ultra. Design for the smallest.
- **Gloves and sweat.** Tap targets stay large; the Digital Crown is a
  first-class input, not a fallback.
- **Always-On Display.** A live workout screen must have a legible dimmed
  state.
- **Battery.** A kettlebell session is 20–45 min; a hike is 4 h.
- **Offline is normal**, not exceptional. Every screen needs a truthful
  not-yet-synced state.
- **Identity:** the Pitaya raspberry palette on watch-black. The app uses
  SF Symbols today, including `dumbbell.fill` standing in for a kettlebell —
  **please draw a real kettlebell mark** and any other glyphs you need, and
  supply them as SVG. Per our port gate, implementation copies your assets
  verbatim rather than substituting from an icon library.

---

## What to deliver

1. **Watch screens**, in priority order: Home-with-routines, routine
   pre-flight (weight confirm), live routine run (straight / EMOM / circuit
   variants), rest timer, per-step confirm, session summary with insights,
   settings.
2. **Phone screens:** the microphone state language (dock + chat composer),
   and the Chat screen with filters and per-kind proposal cards.
3. **Icons as SVG**, including the kettlebell mark.
4. **Motion notes** for anything whose meaning depends on movement — the
   listening state, the EMOM minute boundary, the rest countdown, the PR
   celebration.
5. Where you deviate from what exists, **say so explicitly** and say why.

Ask for any code or data shapes you want to see. The repo is available and
`docs/watch-contract.md` has the exact JSON the watch receives.
