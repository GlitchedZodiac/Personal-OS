# Pitaya — native Apple apps (watch lane)

The watch-first workout app for Personal OS. **The watchOS app is standalone
and live against prod**: pair with the Pitaya PIN on the wrist, record
workouts with live HealthKit metrics, log kettlebell sets with a crown weight
dial and PR haptics, and sync straight to `/api/mobile/workouts/sync`.

Owned by the **watch lane** (branch `claude/watch-app`) — see the Parallel
lanes section of the repo `CLAUDE.md`. Backend/API changes are never made
here; they go through `docs/deferred-items.md` tagged `[watch]`.

## Layout

```
project.yml          XcodeGen manifest — the source of truth for the project
PersonalOS.xcodeproj generated: cd ios && xcodegen generate (after file adds)
Shared/              platform-neutral core, compiled into both targets
  Theme.swift          Pitaya design tokens — THE single theming seam
  ExerciseCatalog.swift  GENERATED mirror of lib/exercises.ts (ids + aliases
                         + the fold/containment normalizer) — regenerate via
                         node ios/scripts/gen-catalog.mjs
  PRBaselines.swift    local PR engine (weight + volume, lib/prs.ts semantics)
  Models/              /api/mobile/* wire types (fractional-second ISO dates,
                       tolerant exercises decoding — see file header)
  Networking/          bearer client: pair/refresh/fetch/sync
  Storage/             Keychain session store + offline workout queue
WatchApp/            the watchOS app (SwiftUI, watchOS 11+)
  AppModel.swift       state machine: pairing → home → live → summary
  WorkoutRecorder.swift  HKWorkoutSession + live builder statistics
  Smoke.swift          DEBUG-only headless self-smoke seams (see below)
  Views/               Pitaya screens (design: Pitaya Watch.dc.html)
iOSApp/              iPhone companion — deliberate placeholder until the
                     "Pitaya App" design lands
iPhone/              iOS-only helpers (Apple Health daily snapshot, future)
scripts/             gen-catalog.mjs
```

## Build & run

Xcode's developer dir may point at CommandLineTools; every command below
works with the override:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
cd ios
xcodegen generate   # only after adding/removing files
xcodebuild -project PersonalOS.xcodeproj -scheme "PersonalOS Watch" \
  -destination "platform=watchOS Simulator,name=Apple Watch Series 11 (46mm)" build
xcodebuild -project PersonalOS.xcodeproj -scheme "PersonalOS" \
  -destination "generic/platform=iOS Simulator" build
```

Both targets build green (verified 2026-08-09, Xcode 26.6 / SDKs 26.5).

## Self-smoke seams (DEBUG builds only)

Launch env vars drive the real AppModel paths headlessly:

```bash
SIMCTL_CHILD_PITAYA_SMOKE_PIN=<pin> \
SIMCTL_CHILD_PITAYA_SMOKE_AUTORUN=1 \
  xcrun simctl launch <udid> net.blacksheepglobal.pitaya.watchkitapp
```

- `PITAYA_SMOKE_PIN` — pair on launch through the normal pairing flow
- `PITAYA_SMOKE_AUTORUN=1` — record + log 2 sets + finish + sync
- `PITAYA_SMOKE_HOLD=1` — start a session, log one set, stay on the logger

## Design (THE PORT GATE applies)

Visuals come from Michael's Claude-design project (`docs/design/
pitaya-watch.dc.html`). All tokens live in `Shared/Theme.swift`.
**Fonts are bundled**: Familjen Grotesk (display/numerals) + Instrument Sans
(text) in `WatchApp/Fonts/`, registered via UIAppFonts, routed through
`Theme.display/text/numeric`. **Glyphs are extracted verbatim** from the
design's SVGs into `WatchApp/Views/PitayaGlyphs.swift` (kettlebell, trail,
walk figure, heart, check, end ✕, pause, water drop, play, lap flag) — SF
Symbols are allowed only on undesigned elements (currently: the chevron,
the repeat-set arrow, the queued-sync badge).

## What works today / what's next

Working end-to-end (proven against prod): PIN pairing (+ wrong-PIN error
path), Keychain persistence, token refresh path, home, live HR/kcal/zone
metrics, kettlebell set logging (crown weight, reps, PR haptic + banner),
controls (end/pause/water-lock/repeat), summary with stats + PR celebration,
offline queue → sync, walk/run freeform recording.

PRs are **server-truth** (docs/watch-contract.md): baselines from
`GET /api/mobile/prs` (disk-cached for offline cold-starts, in
`Shared/PRBaselines.swift` + `PRBaselineCache`), live-set haptics evaluated
locally, and the sync response's `prs[]` replaces the local estimate on the
summary once the server confirms. Smoke-driven workouts sync under
externalSource `watch_smoke` (never `app_watch`) so cleanup can never touch
real rows.

Not built yet (design exists, awaiting contracts or next sessions): sequences
(EMOM/Tabata/complexes), rest timer, GPS route capture, sleep/recovery
screens, iPhone app, WatchConnectivity handoff, complications.
