# Apple Watch App — Branch-Chat Kickoff Prompt

(Michael: paste everything below the line into a fresh Claude Code session
opened at `~/VibeCoding/Mikes Personal OS`. It's also saved here so the watch
chat can re-read it later.)

---

You are the dedicated **Apple Watch lane** for Personal OS — Michael's
single-user, lifelong health app. A parallel Claude session (the "main lane")
owns the web app and backend. Your lane is the native Apple side only.

## Before anything else, read these in order

1. `CLAUDE.md` — operating model (halt-on-discovery, self-smoke, completion
   reports, deferred-items). It binds you too, including the **Parallel
   lanes** section.
2. `docs/state.md` — what's shipped and in flight. Add your own entries under
   a `[watch]` tag when you ship.
3. `docs/deferred-items.md` — the cross-lane queue.
4. `docs/MODERNIZATION-PLAN.md` (Phase 3) and `ios/README.md` — the watch
   vision and the existing scaffold's intent.

## Mission

A watch-first workout app that eventually **replaces Strava** for Michael,
with kettlebell training as the crown jewel:

- **Record workouts on the wrist**: HKWorkoutSession with live heart rate,
  calories, duration; GPS routes (HKWorkoutRouteBuilder + CoreLocation) for
  runs/walks/hikes.
- **On-wrist kettlebell set logging**: pick an exercise, dial weight with the
  crown, tap reps per set, and get a **PR haptic** when a set beats history.
- **Offline-first**: queue completed workouts on device, sync when reachable.
- **Standalone-capable**: the watch talks to the backend directly when it has
  connectivity; the iPhone companion is a convenience, not a dependency.

## What already exists (audit before trusting)

- `ios/` — a 369-line Swift scaffold (models, API client, session store,
  offline queue, HKWorkoutSession manager). It was written **blind from a
  Windows machine** and has never compiled. Treat it as a design sketch:
  validate every file against the real APIs, keep what's right, rewrite
  what isn't. There is **no Xcode project yet** — creating the workspace is
  your first build task.
- **Backend contracts (live on prod, bearer-token auth)** — verified working:
  - `POST /api/mobile/auth/session` `{pin, deviceLabel, platform, deviceType}`
    → `{accessToken, refreshToken, session}` (Michael types his PIN once at
    pairing; store tokens in **Keychain**, not UserDefaults — the scaffold's
    UserDefaults store is a known TODO).
  - `POST /api/mobile/auth/refresh` — refresh flow.
  - `GET /api/mobile/workouts`, `POST /api/mobile/workouts/sync`,
    `POST /api/mobile/health/daily`.
  - Base URL: `https://personal-os-plum.vercel.app`. These routes bypass the
    cookie middleware by design (self-authenticating bearer).
- **Exercise catalog + PR system**: the main lane is landing
  `lib/exercises.ts` (canonical exercise names + EN/ES aliases) and a
  `personal_records` table with `/api/health/prs`. Mirror the canonical
  names in Swift **by reading those files** (read-only) so wrist logging and
  web logging agree. If the endpoint shape doesn't fit watch needs, request
  changes via `docs/deferred-items.md` — do not edit backend code.

## Environment facts

- Xcode is installed on this Mac (fresh install — run `sudo xcodebuild
  -license accept` and switch developer dir if `xcode-select -p` still points
  at CommandLineTools; ask Michael to run sudo commands, you can't).
- Build **simulator-first** (iPhone + paired Watch simulators). No paid
  developer account needed for that. When it's time to install on Michael's
  real watch, he'll be present for signing/pairing.
- Secrets: none in the repo. Michael enters his PIN in the pairing UI at
  runtime. Never commit tokens.

## ⚠️ Design is in flight — build function-first

Michael is actively designing the app's look **and some of its flows** in a
separate Claude-design session. Rules until his design lands:

1. **No visual identity work.** Stock SwiftUI system styling only. The old
   "graphite/teal/amber" note in `ios/README.md` is superseded — ignore it.
2. **One theming seam**: route every color/font through a single
   `Theme.swift` so the design drop-in is a one-file change (plus asset
   catalog). Screens should be ugly-but-working.
3. **Core loop is safe to build now** (pair → record workout → log kettlebell
   sets → finish → sync → appears in the web app). It survives any design.
   For flows beyond it (complications, summaries, plan views, navigation
   structure), sketch cheaply and **confirm with Michael before deep-building**
   — his design session may reshape them.

## Parallel-lane rules (hard boundaries)

- **You own**: `ios/**`, the Xcode workspace/project files, and
  `docs/watch-*.md`. Commit on branch `claude/watch-app`.
- **You never edit**: `app/**`, `lib/**`, `prisma/**`, `proxy.ts`,
  `components/**`, or deploy the web app. Read them freely.
- Backend/API needs → one entry in `docs/deferred-items.md`
  (`[watch]` tag, what + why + proposed shape) and tell Michael in chat; the
  main lane implements.
- Both lanes update `docs/state.md` (newest-first) — read it at session start
  to catch what the other lane shipped.

## First session — do exactly this, then report

1. Read the four docs above; audit the `ios/` scaffold against the live
   backend contracts (list what's wrong with it).
2. Verify Xcode: `xcodebuild -version`, simulators present (ask Michael to run
   any sudo fixes).
3. Create the workspace: iOS app target (`PersonalOS`) + watchOS app target
   (`PersonalOS Watch`), wiring in `ios/Shared` sources; both build green in
   simulator.
4. Pairing flow: PIN screen on iPhone → `POST /api/mobile/auth/session` →
   tokens in Keychain → watch receives session (WatchConnectivity or its own
   pairing) — prove with a real call against prod.
5. Smallest end-to-end win: start a workout on the watch simulator, stop it,
   sync it, and show it landed via `GET /api/mobile/workouts`.
6. End with a completion report per CLAUDE.md (build status, what you
   self-smoked, deferred items filed, Michael's 3-item checklist), and a
   `docs/state.md` entry tagged `[watch]`.

Halt-and-surface beats improvising: if the scaffold, these instructions, or
the live API disagree, say so before building around the disagreement.
