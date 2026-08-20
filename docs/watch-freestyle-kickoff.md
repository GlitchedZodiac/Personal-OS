# Watch-lane kickoff — the Freestyle tile

Paste this into the watch-lane chat (worktree `~/VibeCoding/personal-os-watch`,
branch `claude/watch-app`). **First:** run the standing merge from
deferred-items — `git -C ~/VibeCoding/personal-os-watch merge main` — this
feature's server halves live on main.

## The mission

Michael does follow-along videos and improvised EMOMs that aren't set up as
routines. The wrist's only job during them: **record** — heart rate and
altitude — while he works out to something else. Structure happens later on
the phone (that half is LIVE: describe → the coach attaches movements →
measures the description against the recording → offers to keep it as a
routine). Build the wrist recorder; do not build any structure UI on the
watch.

## The tile

A **Freestyle** tile on the Home grid (there is a literal "Coming soon — a
fourth space" placeholder tile per the 2026-08-14 gap audit — this is the
strongest candidate to take that slot; if you keep the placeholder, add
Freestyle as a normal tile instead).

Running screen, minimal: elapsed time · live HR (big) · current-zone tint ·
End. Start begins an `HKWorkoutSession` (activity type `.other` or
`.highIntensityIntervalTraining`) so HR streams; capture altitude when
available. Haptic on zone change is welcome; nothing else.

## Binding contracts (all LIVE on prod — bind, don't stub)

1. **Zone boundaries:** `GET /api/mobile/zones` (bearer) →
   `{ tops: [122,152,167,182], names: ["Z1".."Z5"] }`. Z5 is above the last
   top. Use for the live zone tint AND the on-device `timeInZones`
   computation. Do not hardcode — a recalibration should land everywhere
   at once.
2. **Sync:** existing `POST /api/mobile/workouts/sync`, zero server changes.
   Shape (Strava-vocabulary metricsData so phone analytics render
   identically — full details in docs/watch-contract.md §Freestyle):

   ```json
   {
     "workoutType": "freestyle",
     "startedAt": "ISO", "durationMinutes": 27,
     "caloriesBurned": 210,
     "exercises": [],
     "metricsData": {
       "hrStream": [/* downsampled ≤200 pts */],
       "timeStream": [/* elapsed seconds, same length */],
       "altitudeStream": [/* optional, same length */],
       "timeInZones": { "seconds": [s1..s5], "pct": [p1..p5], "totalSeconds": n },
       "elevationGainM": 12
     }
   }
   ```

   Downsample on-wrist (uniform stride to ≤200 points). `exercises` stays
   empty — the phone fills it when he describes the session.

## Guardrails

- Offline-first like every wrist surface: queue the session, drain on
  connectivity (note the standing gap: `drainQueue()` needs more call
  sites — `WKApplicationRefresh` is a separate deferred item, don't block
  on it).
- No design slice exists for this tile — build inside the watch design
  system (ios/Shared/Theme.swift idiom, existing tile grammar) and flag
  the screen for the next design pass. PORT GATE applies when a design
  lands.
- After sync, the phone's Activities detail shows "Describe what this
  was →" automatically — nothing for the wrist to do there. Verify the
  loop end-to-end once: record 2 minutes on-wrist → sync → see the
  session + button on the phone.
- Write the completion entry in docs/state.md and annotate the
  `[watch — FREESTYLE recording mode]` deferred item.
