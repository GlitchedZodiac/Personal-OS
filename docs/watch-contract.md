# Main App ↔ Watch Contract

One repo, two lanes, one truth. This file settles ownership so neither lane
guesses. Sources: `docs/design/pitaya-app.dc.html`, `pitaya-watch.dc.html`,
the `[watch]` deferred items (2026-08-09), and THE PORT GATE in CLAUDE.md
(binds both lanes — extract from the design, never interpret).

## Lane homes (after the worktree split, 2026-08-09)

| Lane | Directory | Branch |
|---|---|---|
| Main (web + backend) | `~/VibeCoding/Mikes Personal OS` | `claude/phase1-modernization` |
| Watch (native Apple) | `~/VibeCoding/personal-os-watch` | `claude/watch-app` |

Same repo, separate working trees — never switch branches in the other
lane's directory. Both lanes read/write `docs/state.md` and
`docs/deferred-items.md` (merge conflicts in these two files are expected
occasionally; resolve by keeping both entries, newest first).

## Ownership map

| Concern | Owner | Consumer | Contract |
|---|---|---|---|
| Exercise catalog + canonical ids | Main (`lib/exercises.ts`) | Watch mirrors normalizer in Swift | Ids are append-only and stable; watch re-syncs its mirror when the file changes (state.md announces changes) |
| PR detection + records | Main (`lib/prs.ts`, `personal_records`) | Watch celebrates | Server is the source of truth. Sync response now returns `prs: [{externalId, newPRs}]` per item; `GET /api/mobile/prs` (bearer) serves baselines — watch may drop its top-100 rebuild fallback |
| Workout storage + sync | Main (`/api/mobile/workouts*`) | Watch offline queue | Existing payload shape frozen; additive changes only, announced in state.md |
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
  steps: Json  // ordered [{ exercise: canonicalId, exerciseName, sets?, reps?, seconds?, weightKg?, restSeconds? }]
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
