# Pitaya — Watch + Voice + Chat design prompt (round 1 for watchOS)

**Status:** paste-ready. Hand the whole file to Claude Design.
**Written:** 2026-08-14 · main lane · *corrected 2026-08-14 after re-reading
the watch lane's actual branch (`claude/watch-app`) — an earlier draft of this
file described a much thinner app and asked for work that is already built.*
**Read alongside:** `docs/design/claude-design-brief.md` (visual identity),
`docs/watch-contract.md` (data contracts), `ios/**` on branch
`claude/watch-app` (the real code — **not** the stale copy on
`claude/phase1-modernization`).

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

## What already exists — build on this, don't redesign it

The watch app is ~6,200 lines of SwiftUI and it is further along than a
first glance suggests. **Please read the code before proposing changes.**

Its navigation is a real IA, not a stack of screens:

```
home (tile grid)
 ├── workoutList
 ├── kettlebellSpace ......... routines + free sets
 │    ├── sequences .......... saved routines list
 │    │    └── sequenceDetail  pre-flight: steps, weights, Start
 │    └── live ............... freeform set logger
 ├── liveSequence ............ EMOM ring OR circuit runner, by routine kind
 └── summary
```

Working today:

- **Routines run on the wrist.** `fetchSequences()` pulls
  `/api/mobile/sequences`; `SequencesListView` lists them with a duration
  pill and a one-line recipe.
- **Weight is confirmed before the routine starts.** `sequenceDetail` lists
  each step with its prescribed bell; tapping one opens a crown-dial sheet;
  overrides persist per routine in `UserDefaults` and survive to the next run.
- **Now / next guidance during the run**, with a per-step "Done" confirm —
  the copy already distinguishes EMOM ("Finish early — the clock is your
  rest") from circuits ("Tap Done after each move — rest between rounds").
- **Rest timer** between rounds, honouring per-step `restSeconds` then the
  routine's `restSecondsDefault`, with a skip.
- **The crown dials real bells** — 4–64 kg in 4 kg detents, matching both his
  rack and `lib/progression.ts`.
- **GPS routes** via `HKWorkoutRouteBuilder` + `CLLocationManager`
  (`RouteTracker.swift`), with a trail page.
- **A watch-face complication** (`WatchWidgets/PitayaWidgets.swift`) across
  circular, corner, inline and rectangular/Smart Stack slots.
- **Custom glyphs** (`PitayaGlyphs.swift`) including a dragonfruit mark.
- **Offline queue**, and a **local PR engine** so a PR celebrates instantly
  on the wrist even with no signal.

Treat all of the above as **existing product to refine**, not gaps to fill.

---

## The problems to solve

### 1. There is no settings surface at all

The only persisted preference on the watch is per-routine weight overrides.
There is no screen for: units (kg/lb), his bell inventory, default reps,
haptic strength, auto-pause for outdoor work, rest-timer defaults, what
happens when a workout is left running, or unpairing deliberately.

Design it — and decide what genuinely needs to be settable versus what should
simply be right. This is a watch, not a preferences pane.

### 2. The complication is a doorbell, not a dial

`PitayaLauncherWidget` is a `StaticConfiguration` whose timeline entry
carries nothing but a date and refreshes `.never`. On the face it says
"Pitaya · start a workout" and that is all it can ever say.

A watch face is the highest-value glance surface he owns. Design what it
should actually show across all four accessory families: today's routine,
the week's tonnage, sessions done versus planned, a streak, whether he's
already trained today. Note what each family can carry — `.accessoryCircular`
and `.accessoryCorner` are tiny; `.accessoryRectangular` (the Smart Stack
card) has real room.

### 3. Insights die at the summary screen

The session summary shows four numbers and ends with "Full breakdown in
Pitaya". Design what deserves to live on the wrist:

- **After a set:** heavier than last time on this movement? How far into the
  prescription is he?
- **After a session:** versus the last run of the *same routine*; time in
  heart-rate zones; whether the session earned a progression raise (the
  phone already computes these in `lib/progression.ts`).
- **Heart-rate recovery** — the drop in the first minute after the last hard
  set. The recorder already streams heart rate and throws the shape away.
  Cheap to capture, genuinely diagnostic, and shown nowhere.
- **Between sessions:** the Home grid could say what's due rather than
  standing idle. There is also a literal `"Coming soon — a fourth space"`
  placeholder tile on the grid that needs a decision.

Design the hierarchy: what earns the summary, what earns a scroll, what
stays on the phone.

### 4. Hands-free logging

Logging a set costs a screen tap with a loaded, chalky hand. watchOS 11 ships
**Double Tap** (`handGestureShortcut(.primaryAction)`) and **App Intents**
(Siri phrases, Shortcuts, and the Ultra Action Button) — the app uses
neither.

Design the gesture and voice affordances: what Double Tap does in each live
context (log the set, confirm the step, skip the rest), how the screen
*teaches* that it's available without nagging, and which two or three
intents are worth exposing ("start my kettlebell routine", "log a set").

The phone app is voice-first. The wrist — the surface where voice matters
most — isn't.

### 5. Sessions have no visible structure afterwards

Nothing writes `HKWorkoutEvent` markers, so a 40-minute EMOM appears in Apple
Health as one undifferentiated block. Design what a session's structure
should look like when he reviews it — on the wrist and where it lands in
Health.

### 6. Microphone state is unreadable (phone app, not watch)

On both the main dock and the Chat screen, "the mic is live" was communicated
by swapping one maroon for a slightly different maroon. A first pass just
shipped — a breathing halo, an audio-level ring driven by real input, level
bars, and an explicit "Listening — tap to stop" strip — but it was
engineered, not designed.

Design the real thing: idle → listening → transcribing → thinking, as one
visual language across the dock and the chat composer. It must read at arm's
length, in sunlight, with the phone on a bench between sets.

### 7. Chat is a wall of cards

The Chat screen is the logging surface: he talks, the AI proposes a card
(food, workout, measurement, routine), he confirms. It works; it reads as an
undifferentiated stack. Filter tabs (All / Food / Usuals / Weight / Chat)
just shipped as plain pills.

Design the information architecture: how a day breaks up, how a confirmed
card differs from a pending one at a glance, how each proposal kind should
look, and what the empty and thinking states are.

---

## Constraints — please respect these

- **watchOS 11+, standalone.** No iPhone at workout time.
- **Screen sizes:** 41/45 mm and 49 mm Ultra. Design for the smallest.
- **Gloves and sweat.** Tap targets stay large; the Digital Crown is a
  first-class input, not a fallback.
- **Always-On Display.** A live workout screen needs a legible dimmed state.
- **Battery.** A kettlebell session is 20–45 min; a hike is 4 h.
- **Offline is normal**, not exceptional. Every screen needs a truthful
  not-yet-synced state.
- **Identity:** the Pitaya raspberry palette on watch-black. `PitayaGlyphs`
  already holds custom marks — extend that set rather than replacing it, and
  supply anything new as SVG. Per our port gate, implementation copies your
  assets verbatim rather than substituting from an icon library.

---

## What to deliver

1. **Watch screens:** settings; the complication across all four accessory
   families; the session summary with real insights; the Home grid's idle
   state (including that fourth tile); the Double-Tap affordance in each live
   context.
2. **Phone screens:** the microphone state language (dock + chat composer),
   and the Chat screen with filters and per-kind proposal cards.
3. **Any new glyphs as SVG**, consistent with `PitayaGlyphs`.
4. **Motion notes** for anything whose meaning depends on movement — the
   listening state, the EMOM minute boundary, the rest countdown, the PR
   celebration.
5. Where you'd change something that already exists, **say so explicitly**
   and say why it beats what's there.

Ask for any code or data shapes you want to see. `docs/watch-contract.md` has
the exact JSON the watch receives, and the real implementation is on branch
`claude/watch-app`.
