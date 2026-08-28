# Main App ↔ Watch Contract

One repo, two lanes, one truth. This file settles ownership so neither lane
guesses. Sources: `docs/design/pitaya-app.dc.html`, `pitaya-watch.dc.html`,
the `[watch]` deferred items (2026-08-09), and THE PORT GATE in CLAUDE.md
(binds both lanes — extract from the design, never interpret).

## Lane homes (updated 2026-08-28 — the 08-09 split is history)

**`main` is the single source of truth for BOTH surfaces.** The Q23
exception (Spirit-on-iPad, 2026-08-22) merged `ios/**` work through
main-lane branches, and `claude/watch-app` has been a strict ANCESTOR of
main since — 18 files / 1199 deletions stale as of 08-26. Branching watch
work off `claude/watch-app` is the documented clobber risk
(deferred-items 2026-08-26): branch off `main`, whatever the lane. The
re-sign automation already builds from `origin/main`.

The original split (main lane `~/VibeCoding/Mikes Personal OS`, watch lane
`~/VibeCoding/personal-os-watch` on `claude/watch-app`) remains only as the
worktree-hygiene rule: never switch branches in a directory another session
is using. Both lanes read/write `docs/state.md` and `docs/deferred-items.md`
(merge conflicts there are expected occasionally; resolve by keeping both
entries, newest first).

## Ownership map

| Concern | Owner | Consumer | Contract |
|---|---|---|---|
| Exercise catalog + canonical ids | Main (`lib/exercises.ts`) | Watch mirrors normalizer in Swift | Ids are append-only and stable; watch re-syncs its mirror when the file changes (state.md announces changes) |
| PR detection + records | Main (`lib/prs.ts`, `personal_records`) | Watch celebrates | Server is the source of truth. Sync response now returns `prs: [{externalId, newPRs}]` per item; `GET /api/mobile/prs` (bearer) serves baselines — watch may drop its top-100 rebuild fallback |
| Workout storage + sync | Main (`/api/mobile/workouts*`) | Watch offline queue | Existing payload shape frozen; additive changes only, announced in state.md. **(externalSource, externalId) is DB-unique since 2026-08-28** — sync create is atomic (P2002 → update), so retries land as updates, never duplicates. Additive since 08-28: `items[].trailId`, `strippedRoutes` in the response, and server-side `metricsData.routeAnalytics` (moving/stopped/breaks/splits) computed from `routeData.points[]`. routeData is stripped server-side for non-GPS workoutTypes |
| Named trails | Main (`lib/trails.ts`, `trails` table) | Watch "save this track?" + Saved trails list | `GET /api/mobile/trails` (bearer; `?nearLat&nearLng&distanceMeters` ranks suggestions by trailhead proximity + similar length) returns `{trails: [{id, name, aliases, distanceMeters, elevationGainM, summaryPolyline, startLat, startLng, runCount, lastRun}], updatedAt}`; `POST /api/mobile/trails {name \| trailId, workoutExternalId}` create-or-links (case-insensitive on name+aliases, never duplicates). Wrist UI ports after the v3 design round (docs/design/watch-v3-prompt.md); shared models `TrailSummary`/`WorkoutSyncItem.trailId` shipped inert 2026-08-28 |
| Device auth | Main (`/api/mobile/auth/*`) | Watch Keychain | Current: PIN-on-wrist pairing (shipped, design-styled). Future: pairing-code flow (below) |
| Sequences (routines) | Main builds model + API + iPhone builder UI in the **Train stage** | Watch renders/runs them | Contract below — watch builds wrist UI only after `/api/mobile/sequences` ships |
| Recovery/HRV/sleep ingestion | Watch captures (HealthKit) → posts | Main stores + Body screen renders | Uses `/api/mobile/health/daily` (existing); extend additively when Body stage lands |
| Brand assets | Each lane bundles its own from `docs/design/` | — | Fonts: Familjen Grotesk + Instrument Sans; kettlebell glyph: extract the Train tab SVG from the app design (components/pitaya-icons.tsx has it) — do NOT substitute SF Symbols on designed surfaces (PORT GATE) |

## Sequences contract (v1 — main lane ships with the Train stage)

The design's routines ("KB Block A", "EMOM 20", "Armor Complex", Tabata,
rest timers) are **built in Pitaya on iPhone, executed on either surface**.

Model (additive migration, main lane):

```
Sequence {
  id, name, kind: "straight" | "emom" | "tabata" | "circuit",
  restSecondsDefault: Int?,   // circuits: rest BETWEEN ROUNDS (the watch's runCircuitRest); Michael's: 45–90 s
  durationMinutes: Int?,      // ADDED 2026-08-09: EMOM total time ("20-minute EMOM")
  rounds: Int?,               // ADDED 2026-08-10: circuit round count ("repeat 3 times"); watch falls back to 3 when null
  steps: Json  // ordered [{ exercise: canonicalId, exerciseName, sets?, reps?, seconds?, weightKg?, restSeconds?, toFailure? }] — toFailure added 2026-08-26 ("MAX" in the wrist numeral slot)
  isArchived, createdAt, updatedAt
}
```

Watch semantics (v1): an EMOM run is `durationMinutes` one-minute rounds
cycling `steps` in order (e.g. 20 min cycling 3 movements → each movement
6–7 times); a circuit runs `rounds` tap-driven rounds (fallback 3), resting
`restSecondsDefault` between rounds (a restSeconds on the last step
overrides). Per-step `restSeconds` on other steps = rest after that
movement (web honors it; watch may adopt later). Routines are created from
the app's chat in any equipment category — same rows, no watch change
needed.

Endpoints: `GET /api/mobile/sequences` (bearer; list, active only — carries
`rounds` since 2026-08-10) and the cookie-gated web CRUD under
`/api/health/sequences`. Watch treats sequences as read-only v1 (runs them,
logs resulting workouts through the existing sync — a run references
`sequenceId`/`sequenceName`/`roundsCompleted`/`stepSeconds[]` inside
`metricsData`; the Train screen renders all four since 2026-08-10).

## Exercises contract (v1 — live 2026-08-10)

The AI mints user movements (compound flows, tracked variants) into
`user_exercises` (slug, name, category, aliases). They resolve everywhere
names resolve on the server (voice logging, PRs, routines, Train display).
The watch keeps its picker/normalizer in sync via:

`GET /api/mobile/exercises` (bearer) →
`{ exercises: [{slug, name, category, aliases: [String], updatedAt}], updatedAt }`
— top-level `updatedAt` is the max across rows (null when none): poll
cheaply, refetch when it moves. Slugs join the catalog id namespace
(`one-arm-clean-squat-thruster` alongside `kb-swing`) and appear as
`steps[].exercise` in sequences.

## Workout-sync streams contract (added 2026-08-11 — main lane live)

`POST /api/mobile/workouts/sync` items may now carry raw parallel streams
inside `metricsData`:

```
metricsData: {
  hrStream:  [Int],   // bpm samples during the session
  timeStream: [Int],  // elapsed seconds from start, parallel to hrStream
  altitudeStream?: [Double],
  ...existing keys (sequenceId, roundsCompleted, stepSeconds) unchanged
}
```

The SERVER owns analytics (same policy as PR detection): on sync it runs
the identical downsample/time-in-zones/training-load math the Strava
import uses and stores the enriched metricsData. The app's Activities
detail then renders the HR chart, TIME IN ZONES, and load for
watch-recorded sessions with zero extra watch work. Don't pre-compute
zones on-wrist; don't downsample below ~1 sample/5s — send what
HealthKit gives (the server downsamples to ≤120 points for storage).

`workoutType` vocabulary grows: `treadmill_walk`, `treadmill_run`,
`hike` (existing `walk`/`run`/`trail_run` unchanged). Treadmill types
render a distance-hero header instead of a GPS map; `stepCount` is
already an accepted column — send it when HealthKit has it.

## Companion contract (added 2026-08-12 — main lane LIVE, build against it)

Everything the iOS companion needs from the server exists now.

**`POST /api/mobile/health/daily`** (bearer) accepts, additive:

```
{ localDate, timeZone, source?,          // existing
  steps, restingHeartRateBpm, activeEnergyKcal, walkingRunningDistanceMeters,
  sleepMinutes?, sleepDeepMinutes?, sleepRemMinutes?,   // NEW
  hrvMs?,                                               // NEW (SDNN daily avg)
  weightSamples?: [{ measuredAt: ISO, weightKg: Double }],  // NEW
  rawData? }
```

Weight rule: send EVERY HealthKit bodyMass sample — the server dedupes
them against the VeSync history with the same near-twin rule (±10 min,
±0.3 kg = the same weigh-in). Response returns `weightsImported` /
`weightsSkipped` so the app can show what landed. Never filter on-device.

**`POST /api/mobile/push/register`** (bearer): `{ token (hex APNs), platform?,
bundleId?, environment: "production"|"sandbox" }` → `{registered, id}`.
`DELETE ?token=` unregisters. Pushes carry Michael's own reminders only —
no AI-initiated content (his rule, 2026-08-11).

## Pairing-code contract (v2 auth — build when iPhone Devices UI lands)

Design (watch screens 01–03): watch shows a short code; iPhone confirms in
Settings → Devices. Contract: `POST /api/mobile/pair/start` (bearer-less,
returns `{code, expiresAt}` after creating an unclaimed pairing row, rate-
limited), iPhone `POST /api/mobile/pair/approve` (cookie-auth, `{code}` →
marks approved), watch polls `POST /api/mobile/pair/claim` (`{code}` →
device-session tokens once approved). Until then the shipped PIN-pad-on-
wrist flow stays — it is design-styled and secure enough for one user.

## Five [watch] deferred items — dispositions (2026-08-09)

1. **PR detection in mobile sync** — DONE (main lane): `sync` runs
   `detectAndRecordPRs` per item, returns `prs` array.
2. **Bearer PR endpoint** — DONE (main lane): `GET /api/mobile/prs`.
3. **Pairing-code backend** — contract above; build with the iPhone
   Devices UI (post-Train/Today stages unless Michael reprioritizes).
4. **Sequences contract** — defined above; implementation lands in the
   Train stage (main lane), then the wrist UI (watch lane).
5. **Fonts + kettlebell glyph** — watch lane; extract per PORT GATE.

## Freestyle sessions (2026-08-14 — main lane ready, wrist UI is the ask)

Michael's flow: he does a follow-along video or an improvised EMOM,
the WATCH just records — heart rate + altitude — and he structures it
afterward on the phone by describing it in chat.

**Server contract (LIVE NOW — no changes needed):** sync the session
through the existing `POST /api/mobile/workouts/sync` with
`workoutType: "freestyle"`, `durationMinutes`, `caloriesBurned` if
known, and `metricsData` using the SAME vocabulary Strava rows carry so
the phone's analytics render identically:

```json
{
  "workoutType": "freestyle",
  "startedAt": "...", "durationMinutes": 27,
  "exercises": [],
  "metricsData": {
    "hrStream": [/* downsampled ≤200 pts */],
    "timeStream": [/* seconds, same length */],
    "altitudeStream": [/* optional */],
    "timeInZones": { "pct": [z1,z2,z3,z4,z5], "totalSeconds": 1620 },
    "elevationGainM": 12
  }
}
```

Zone boundaries (his Strava profile, age-derived): Z1 <122 · Z2
123–152 · Z3 153–167 · Z4 168–182 · Z5 183+.

**Phone half (LIVE):** a structure-less session's detail shows
"Describe what this was →" → chat carries the recording's facts → the
coach attaches the described movement list (edit_workout_entry
exercises mode), measures the description against the recording, and
offers to keep it as a routine.

**Wrist ask:** a "Freestyle" tile on the watch — start/stop, live HR,
records the streams above, syncs on end. No structure UI on the wrist;
structure happens on the phone after.
