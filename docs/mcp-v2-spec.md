# Pitaya MCP v2: let Claude change Pitaya without a code release

**Status:** built on branch `claude/mcp-v2` (2026-11-12/13), on top of `claude/security-audit-2026-10`. Not merged; production unchanged. See "Build notes" below for where the build differs from this text and why.
**Date:** 2026-11-12
**Builds on:** `main` at `edf5099`, plus the unmerged `claude/security-audit-2026-10` branch (a hard precondition, see §2).
**Replaces:** nothing. `docs/mcp-proposal.md` (Stage 1 and the multi-user Stage 2 plan) still stands. This is "Stage 1.5": the same single-user connector, made flexible.

> This file has no personal health data, so it can go into `docs/` as it is. The repo is public, so keep it that way. **Every number in an example is made up.**

---

## Build notes (2026-11-13): where the build differs from the spec

Each difference was decided while building, after reading the code. The spec text below keeps the original plan, with corrections marked.

1. **The app DOES have a targets editor.** `components/macro-targets-sheet.tsx` (Food and Today screens) saves kcal and a macro split as the legacy keys. The spec said there was none. Making `targets` server-owned and re-deriving the legacy keys on every save would have silently undone edits made there. Self-smoke caught it. `reconcileTargetsOnSave` now decides:
   - The sheet re-reads the server when it opens, so its copy carries the current `targets.updatedAt`. An edit from it becomes the new rest target (training target and rule kept) and is recorded in `record_changes` with `via: "app"`.
   - An older copy can't move the goal back.
2. **The legacy keys are refused by `update_settings`, not mapped.** `calorieTarget` and the percentage keys return an error pointing to `targets.rest`. That leaves one way to set the goal over MCP, with no rounding questions.
3. **Routine link without a new column.** Watch-run routines already carry `metricsData.sequenceId` and `sequenceName`, and `recent_workouts` already returns them. `patch_record { routineId }` writes those keys, so no `WorkoutLog.routineId` column was added.
4. **PR identity stays the name.** The guarded matcher re-reads names on every PR rebuild, which cleans up wrist rows that kept their raw names. `merge_exercises` rewrites names as well as ids, so a merge is still authoritative.
5. **Write rules live in `lib/patch-record.ts` (`WRITE_SPECS`), not in the read registry.** The read registry's workout and food entries are curated and have no model.
6. **Steps.** The ledger prefers `daily_activity`, the iPhone app's own per-day totals since 2026-10-17. It falls back to `daily_health_snapshots` (production's `daily_activity` is still empty).
7. **Reads are flattened for `clip()`.** `query_data` replaces anything nested deeper than four levels with a placeholder. So a workout's streams come back at the top of the by-id response, and a ledger day lists its workouts at the row's top level (`workoutKcal`, `workouts`, not `exercise.{…}`).
8. **The wrist voice parser keeps the loose matcher** (`looseExerciseMatch`) for its "did you mean…?" suggestions, because those are always confirmed on the watch. Everything that stores or counts uses the guarded matcher.
9. **Starter fields are seeded by the Phase B migration** (`ON CONFLICT DO NOTHING`).
10. **Custom field values are exported** in the measurement, food and workout CSVs (`extra` column).

---

## 0. The short version

**What's wrong today.** Each Pitaya tool hard-codes exactly which fields it accepts. When Claude needs to:
- fix a number the watch got wrong,
- record a new measurement, or
- change a target,

and the tool doesn't have that field, nothing can happen until someone writes code and releases it. About 12 of the 18 items on the Nov 12 gap list are this one problem.

**The change.** Pitaya tells Claude what its data looks like and lets Claude change it, within rules. Every change is recorded and can be undone. It comes in four pieces, built in this order:

| Phase | In plain English | You'll be able to say to Claude |
|---|---|---|
| **D. Targets and the daily breakdown** | Your goals become rules (one target for rest days, another for training days). Every day you see eaten, burned, steps, net and deficit, plus a weekly "is it working" check. | "New targets: X on rest days, Y on hard days." / "Is it working?" |
| **A. One correction tool, with undo** | Claude can fix any allowed field on a workout, meal, measurement or recipe. The old value is saved, a later re-send from the watch never overwrites your fix, and any change can be reversed. | "That treadmill walk was 3.6 km and about 4,200 steps." / "Undo that." |
| **C. Claude manages the exercise list** | Claude can add, rename, merge and re-label movements, and mark a move as bodyweight so handle bells don't create fake PRs. Every log says what each name was matched to, so a wrong match gets caught on the spot. **Every new movement gets explained** (how it's done, muscles, pattern, what it's a variation of, its source) so the library builds up real context. | "Atomic push-ups are bodyweight; the bells are just handles." / "Merge those three single-arm swings." |
| **B. Fields Claude can add** | Claude can start tracking something new (abdomen, left and right arms, how a food number was obtained) in a conversation, with no release. | "Start tracking my abdomen and left/right arms." |

**What it costs:** about 5 to 7 build sessions in total. The next 18 gaps should mostly get fixed in a chat instead of a release.

**What it doesn't change:** your app screens, the watch app, and every existing tool. All keep working exactly as now (§8).

---

## 1. Why: the pattern behind the gap list

The Nov 12 review traced most gaps to fields the tools simply don't accept:

- `edit_workout` can change only movements and pack weight (`lib/mcp/tools.ts`, the `edit_workout` handler). Title, type, distance, steps, calories and the rope record can't be fixed (#3, #7, #8).
- Calorie and macro targets live in the settings record, but no tool can change them (#2).
- New measurements need a database change (#10, #11).
- The exercise list can be extended only as a side effect of creating a routine (#1, #4).
- The data Claude needs is stored but not shown together. Daily steps are in `daily_health`, but `today_summary` (`lib/chat-tools.ts`) never reads them (#5, #6).

Two traps make "just add the field" unsafe, and the spec handles both:

1. **A watch re-send overwrites corrections.** When the watch re-sends a session, the sync route copies every top-level field over the stored row (`app/api/mobile/workouts/sync/route.ts`, the `...data` spread in the re-send `update`). Only movement lists are protected (`lib/workout-resync.ts`, `exercisesEditedAt`). A corrected distance or calorie count would quietly revert.
2. **The app saves the whole settings record from a possibly stale copy.** `PUT /api/settings` replaces everything except `SERVER_OWNED_KEYS`. A target Claude set could be undone by an unrelated save in the app. *(Correction, build note 1: the app also has its own targets editor, which must keep working.)*

---

## 2. Before anything: preconditions

1. **Merge `claude/security-audit-2026-10` first, following its documented order:** merge, let the production build fail its preflight check, add the secrets, redeploy, then merge the rest. This spec depends on four things it adds:
   - connector-only tokens on `/api/mcp`;
   - `mcp_audit_events` (one row per tool call);
   - argument bounds (`argsProblem`);
   - `MCP_SETTINGS_KEYS` and the finance switch.
   Without them, giving the connector broader write power is not acceptable.
2. **Triage the other October branches before the phase they overlap:**
   - `claude/coach-weekly-review` overlaps D's weekly block. Reuse its facts layer; don't build a second one.
   - `claude/intake-reliability` overlaps food logging and C6.
3. **Optional but recommended:** the quick-wins PR from the review, since its fixes are prerequisites for some phases:
   - #9: fractional servings for meals;
   - #15: workout streams returned when one workout is fetched by id;
   - #13: the macro sanity warning;
   - the stricter name matcher and missing aliases (C1);
   - the bodyweight PR rule by category (part of C3).

   The phases below assume these exist and don't redo them.

---

## 3. Rules every phase follows

1. **Every write leaves a receipt and a record.** The tool result says what changed, from what, to what. Field-level changes go to `record_changes` (Phase A). The call itself goes to `mcp_audit_events` (security branch).
2. **Your corrections beat the watch.** A field changed outside the wrist is never overwritten by a re-send.
3. **Anything can be undone.** Every batch of changes can be reverted, but only if nothing has changed it since.
4. **There is no general delete.** `delete_entry` stays the only way to delete, unchanged.
5. **These are never writable over MCP:**
   - finance data;
   - authentication: PIN, devices, sessions, OAuth;
   - `notificationPrefs` and `timeZone`;
   - watch-only data: HR, speed and GPS streams (`metricsData` streams, `routeData`), and the identity fields `externalId`, `source`, `syncStatus`;
   - derived tables such as `personal_records`, which are rebuilt instead.
6. **The registry is the single source of truth.** One registry entry decides what can be read, what can be written, the allowed values, and what the tool descriptions say. This extends the existing `lib/ai/data-registry.ts` principle: "adding a new surface to the AI must be ONE entry here."
7. **Every database change is additive** (new tables, nullable columns), because `npm run build` runs `prisma migrate deploy` (§9).
8. **No in-app screen changes.** New data doesn't appear in the app until a design exists. Ledger numbers, corrections and extra fields are deferred for UI (§12). This follows the global design rule: an undesigned screen is not invented.

---

## 4. Phase D: targets as rules, and a full daily breakdown

### 4.1 In plain English
Today one fixed calorie number (currently out of date) drives the daily goal, and net or deficit gets worked out by hand. After Phase D:
- your targets are rules;
- the daily summary shows every input and the result;
- a weekly block answers "is it working?" by comparing what the math predicted with what the scale did.

You can also tell Claude a standing rule once, and every future Claude chat with Pitaya will see it.

### 4.2 `settings.targets`
A new key in the existing settings JSON. No database change.

```ts
interface MacroTarget { kcal: number; proteinG: number; fatG: number; carbsG: number }

interface Targets {
  rest: MacroTarget;                          // the default day
  training: MacroTarget | null;               // null = same as rest
  trainingDayRule: { minWorkoutKcal: number }; // day becomes "training" once logged workouts reach this
  tdee: {
    bmr: { source: "latest_scale" | "fixed"; kcal?: number };
    tefPct: number;      // digestion, % of kcal eaten (default 10)
    kcalPerStep: number; // steps outside workouts (default 0.04)
  };
  updatedAt: string;
  updatedVia: "mcp" | "app";
}
```

- **Backward compatibility (nothing removed):** whenever `targets` is written, the server sets the legacy `calorieTarget`, `proteinPct`, `carbsPct` and `fatPct` from `targets.rest`. Every app screen that reads them shows the right rest-day goal without changes.
- **Stale-copy guard:** add `targets` to `SERVER_OWNED_KEYS` in `app/api/settings/route.ts`. On every `PUT`, if `targets` exists, re-derive the four legacy keys from it, so an old app copy can't move the daily goal back. *(As built: `reconcileTargetsOnSave`. An edit from the app's own targets sheet still wins; see build note 1.)*

### 4.3 Tool `update_settings`
```json
{
  "patch": { "targets": { "rest": { "kcal": 2000, "proteinG": 160, "fatG": 65, "carbsG": 205 } } },
  "reason": "New targets"
}
```
- **Writable keys:** `targets`, `aiInstructions.health`, `bodyGoals`, `healthGoals`, `workoutGoals`, `hrZoneTops`, `units`, `aiLanguage`. *(As built, the legacy macro keys are refused with a pointer to `targets.rest`; build note 2.)* This must be a subset of `MCP_SETTINGS_KEYS` from the security branch; a test checks it.
- **Merge rules:** objects are merged key by key; arrays are replaced; `null` clears a key that is allowed to be cleared.
- **Checks:**
  - kcal between 800 and 6,000;
  - each macro in grams between 0 and 500;
  - a **warning, not an error**, when protein×4 + carbs×4 + fat×9 is more than 5% off the kcal.
- **Result:** a `before`/`after` per key. Each key is also written to `record_changes` once Phase A exists. Until then the receipt plus `mcp_audit_events` is the record.

### 4.4 Dataset `day_ledger` (and a block in `today_summary`)
`day_ledger` is a new curated dataset in `lib/ai/data-registry.ts` (handled in `lib/chat-tools.ts`). It accepts `from`/`to`/`days` (default today, at most 31 days) and returns one row per local day:

```jsonc
{
  "date": "2026-11-12",
  "dayType": "rest",                          // from trainingDayRule
  "target": { "kcal": 2000, "proteinG": 160, "fatG": 65, "carbsG": 205 },
  "eaten": { "kcal": 1640, "proteinG": 150, "fatG": 55, "carbsG": 150, "entries": 6 },
  "remaining": { "kcal": 360, "proteinG": 10 },
  "exercise": { "workoutKcal": 310, "workouts": [{ "id": "…", "type": "strength", "kcal": 310, "source": "app_watch" }] },
  "activity": { "steps": 6200, "stepsInWorkouts": 2900, "stepsOutsideWorkouts": 3300,
                "restingHrBpm": 58, "hrvMs": 70, "activeEnergyKcal": 1.3, "activeEnergyTrusted": false },
  "net": 1330,                                // eaten − workoutKcal
  "tdee": { "total": 2356, "bmr": 1750, "bmrSource": "scale <date>", "tef": 164, "neat": 132, "workouts": 310 },
  "deficit": 716,                             // tdee.total − eaten.kcal
  "dataQuality": ["active energy implausible (1.3 kcal), not used"]
}
```

**How the numbers are worked out** (the defaults below are open decision 1):
- **Steps** come from `DailyHealthSnapshot` (the populated Apple Health table). The empty `daily_activity` pipeline isn't used (§12).
- **Steps outside workouts** = daily steps − the `stepCount` of that day's workouts. This stops a walk being counted twice: once as a workout and again as steps.
- **NEAT** (calories from everyday movement) = steps outside workouts × `kcalPerStep`.
- **TEF** (calories used digesting food) = kcal eaten × `tefPct`.
- **BMR** = the latest `bodyMeasurement.bmrKcal`, or the fixed value if set. The receipt names its source.
- **Apple "active energy" is never used in the math.** It's shown and marked untrusted when it's under 50 kcal on a day with more than 1,000 steps. It's been unreliable on some days.

**`today_summary`** keeps every field it has today, so nothing is removed. Its `calorieGoal`, `proteinGoalG` and the other goal fields now come from the resolved day target. It gains a `steps` field and a `ledger` field holding today's `day_ledger` row. Because `today_summary` is shared code, the in-app assistant gets the same improvement.

**Weekly block** (`day_ledger` with `weekly: true`, also inside `today_summary`):
- covers the last **7 complete days**, so a half-logged today doesn't skew it;
- average intake and average deficit, counting only days with logged food. Days under 800 kcal are flagged "probably incomplete logging";
- **weight**: the 7-day median-based average, leaving out any weigh-in more than 2.5 kg from the 14-day median (flagged as an outlier with its id), compared with the previous 7 days;
- the **change the math predicts** (average deficit × 7 ÷ 7,700 kg) against the actual change, with the gap in plain words, e.g. "losing 0.3 kg/week less than the math predicts: either logging is low or the TDEE estimate is high";
- **flags:** no weigh-in for 5 or more days, missing step days, outliers that were left out.

### 4.5 Standing rules for every Claude chat
- `initialize.instructions` in `lib/mcp/server.ts` becomes the static text plus a section headed **"Standing rules from Michael"**, filled from `aiInstructions.health`.
- That text is capped at 2,000 characters and clearly labelled as his.
- `update_settings` can write it, so "from now on, log jump rope EMOMs as intervals" becomes a rule every future Claude session reads.

### 4.6 Tests and self-smoke
- **Unit tests:**
  - every rule for picking the day target;
  - the legacy keys mirroring `targets.rest`;
  - the stale-copy guard (a `PUT` without `targets` doesn't regress the goal);
  - each part of the TDEE math, including the walk double-count case;
  - the outlier rule;
  - the 7-complete-days window.
- **Smoke:** run the local dev server and call `update_settings`, then `query_data today_summary`, then `day_ledger days=7`, using JSON-RPC over curl with a connector token. Check one day by hand.

---

## 5. Phase A: one correction tool, with undo

### 5.1 In plain English
- One tool fixes any allowed field on a workout, meal, measurement or saved recipe.
- Claude has to give a reason.
- The old value is kept, and you can say "undo that".
- Once a workout field is corrected, the watch can never overwrite it.
- This also lets you link a workout to a saved routine, so a watch session can be named after your Lebe Stark video.

### 5.2 Tool `patch_record`
```jsonc
{
  "entity": "workout",            // workout | food | measurement | recipe (same words as delete_entry)
  "id": "<workout id>",
  "set": { "distanceMeters": 3600, "stepCount": 4200 },
  "rope": null,                   // workout only, see 5.5
  "reason": "Watch undercounted steps and distance on the treadmill",
  "dryRun": false
}
```
- **Result:** `{ entity, id, batchId, changes: [{ field, before, after }], warnings, rebuilt: ["personal_records"]? }`.
- `reason` is required (at most 300 characters). `dryRun: true` returns the same diff without writing anything.

### 5.3 What each entity allows (declared in the registry)
Each entry adds a `write` block to `DatasetSpec`:

```ts
write?: {
  entity: "workout" | "food" | "measurement" | "recipe";
  model: string;
  fields: Record<string, FieldRule>;
  after?: Array<"rebuildPRs" | "ropeRecompute">;
}
type FieldRule = {
  type: "number" | "int" | "text" | "enum" | "datetime" | "bool" | "ref";
  min?: number; max?: number; maxLen?: number;
  values?: string[]; nullable?: boolean;
  ref?: string;               // model an id must point to
  watchOwned?: boolean;       // stamped in correctedFields when patched
};
```

| Entity | Writable fields | Notes |
|---|---|---|
| workout | `description` (title/notes, ≤2,000 chars), `workoutType` (known types + `other`), `startedAt`, `durationMinutes` (0–600), `distanceMeters` (0–200,000; types with routes only), `stepCount` (0–100,000), `caloriesBurned` (0–5,000), `avgHeartRateBpm` / `maxHeartRateBpm` (30–230), `elevationGainM` (0–10,000), `packKg` (0–60), `routineId` (ref → Sequence, or null) | Movements stay with `edit_workout`. Streams, `routeData`, `externalId`, `source` and `syncStatus` are never writable. |
| food | `loggedAt`, `mealType`, `foodDescription`, `calories` (0–5,000), `proteinG` / `carbsG` / `fatG` (0–500), `notes` | The same fields as `edit_food` |
| measurement | `measuredAt`, every entry in `MEASURED_FIELDS`, `notes` | Sets `fieldSources[field] = "corrected"`. Per-field ranges are **new**, kept next to `MEASURED_FIELDS` in `lib/body-measurements.ts`. Today only incoming scale samples are validated. |
| recipe | `foodDescription`, `mealType`, `calories` and macros, `servingLabel`, `kind` | Rows already logged are history and don't change |

**Parity test:** every writable field must exist on its Prisma model (checked against the DMMF), the same pattern as the existing `MEASURED_FIELDS` parity test.

### 5.4 Table `record_changes`, and tool `undo_change`
```prisma
model RecordChange {
  id        String    @id @default(uuid())
  batchId   String                 // one tool call = one batch
  entity    String                 // workout | food | measurement | recipe | settings | exercise | field
  recordId  String
  field     String                 // e.g. "distanceMeters", "extra.abdomenCm", "targets.rest"
  before    Json?
  after     Json?
  reason    String?
  via       String                 // mcp | app | undo
  undoneAt  DateTime?
  createdAt DateTime  @default(now())

  @@index([entity, recordId])
  @@index([batchId])
  @@map("record_changes")
}
```
- `query_data record_changes` lists recent changes, newest first, and can be searched by entity and record id through `q`. Finance is never in it, because finance is never patched.
- **`undo_change`** takes `{ batchId | changeId, dryRun }`. For each change:
  - if the field's current value still equals `after`, it's restored to `before`;
  - otherwise it's skipped with "changed since".
  - The undo is itself written as a batch (`via: "undo"`) and triggers the same follow-up work, such as rebuilding PRs.
- **`mcp_audit_events` vs `record_changes`:** the audit table records *who called what* and deliberately stores no content. `record_changes` records *what changed*. Both are needed.
- `edit_workout`, `edit_food` and `rename_recipe` keep their inputs and outputs unchanged, but also write `record_changes` rows, so "undo" works for every edit and not only `patch_record`.

### 5.5 Workout specifics
- **Corrections survive re-sends.** Patching a `watchOwned` field adds it to `metricsData.correctedFields: { [field]: isoTimestamp }`, generalising the existing `exercisesEditedAt`.
  - `mergeResync` carries `correctedFields` forward.
  - The re-send `update` in `app/api/mobile/workouts/sync/route.ts` leaves out every key listed in it, instead of spreading `...data`.
  - The watch still owns everything nobody corrected: HR, streams, the recovery-HR number.
- **Rope block** (`rope: { workSeconds, restSeconds, rounds, jumps? }`):
  - rebuilds `metricsData.intervals` with `source: "corrected"` and replaces the jump-rope movement row, using the same helpers as the `log_workout` jump-rope path (`readIntervals`, `jumpRopeExerciseRow`);
  - stamps `correctedFields.rope`, and `mergeResync` keeps a corrected interval record instead of the watch's.
- **Routine link:** a new nullable column `WorkoutLog.routineId → Sequence` (`onDelete: SetNull`). `recent_workouts` returns `routineName`. `log_workout` accepts `routineId` too. *(As built: no column. `patch_record { routineId }` writes the existing `metricsData.sequenceId`/`sequenceName`; build note 3.)*
- **PRs:** patching anything that changes exercises or their weights calls `rebuildPersonalRecords()`, as `edit_workout` already does.

### 5.6 Tests and self-smoke
- **Unit tests:**
  - every field rule, accept and refuse;
  - `dryRun` writes nothing;
  - undo, plus undo after a later change (skipped);
  - `correctedFields` survives `mergeResync`;
  - the rope rebuild.
- **The important smoke test:** POST a watch workout, patch its distance, POST the same `externalId` again with different HR, and check that the distance stays corrected while the HR updated.
- Patch a food row, undo it, and check the value is back and two batches exist.

---

## 6. Phase C: Claude manages the exercise list

### 6.1 In plain English
Movements get matched to the wrong exercise silently: "Seated Dumbbell Shoulder Press" lands in barbell overhead-press history and creates a fake PR. Phase C makes the matcher refuse risky guesses. Instead it creates a new movement and says so, and Claude can then fix the list itself: rename, add aliases, merge duplicates, mark bodyweight. Wrong matches become visible and quick to fix instead of invisible and permanent.

### 6.2 C1: a stricter matcher (can ship in the quick-wins PR)
`normalizeExerciseName` in `lib/exercises.ts` keeps its exact pass. The containment pass now accepts a match only if **every left-over word** in the input is harmless:
- **noise:** `/^x?\d+$/`, `rep(s)`, `set(s)`, `each`, `side`, `per`, `total`;
- **or the matched movement's own equipment word:** kettlebell → `kettlebell(s)`, `kb`; dumbbell → `dumbbell(s)`, `db`; barbell → `barbell`, `bb`; bodyweight → `bodyweight`, `bw`; machine → `machine`.

Anything else is treated as unknown.

| Logged as | Today | After C1 |
|---|---|---|
| Seated Dumbbell Shoulder Press | `overhead-press` (barbell) | unknown → new movement (dumbbell) |
| Bodyweight Squat | `back-squat` (barbell) | unknown → new movement (or the alias added to the custom Air Squat) |
| 2-Pump Burpee | `burpee` | unknown → new movement ("pump" isn't noise) |
| Thrust Jerk | custom `jerk` | unknown → new movement |
| Single-Arm Kettlebell Swing | `kb-swing` | `kb-one-arm-swing` (alias added) |
| Kettlebell swings x20 | `kb-swing` | `kb-swing` (unchanged) |

**Who calls it, and what happens on "unknown":**
- **MCP `log_workout` / `edit_workout`:** create a new movement through `createUserExercise`. The category is guessed from equipment words, otherwise `other`.
- **The watch path (`withCanonicalIds`):** stays conservative. Unknown means no id, as today, and nothing is created.

**Trade-off:** more new movements and fewer silent wrong matches. A new movement shows up in the result and is merged in one call. A wrong match quietly poisons PRs.

### 6.3 C2: keep the name as logged
MCP and in-app rows overwrite the name you said with the matched name. A Nov 3 row now reads "Overhead Press", and what was actually logged is gone, so history can't be re-matched automatically.

**Fix:** every exercise row written outside the watch stores `rawName` whenever it differs from the display name. Watch rows already keep raw names.

### 6.4 C3: what counts as load
- `ExerciseDef` gains `load: "external" | "bodyweight"`. The default comes from the category: bodyweight → `bodyweight`, everything else → `external`.
- `UserExercise` gains a nullable `load` column, so a custom kettlebell-handle push-up can keep `category: kettlebell` (the equipment used) and still be `load: bodyweight` (what counts).
- **PR and volume rule** (`lib/prs.ts`, `extractPRCandidates` and `sessionVolumeKg`), for `load: bodyweight`:
  - weight PRs come from `vestKg` only;
  - volume = sets × reps × `vestKg`;
  - `weightKg` stays on the row but is never counted.
  - **Visible effect:** weekly training volume in the app drops for sessions with handle bells. That's correct, but you'll notice it.
- **Identity:** PR extraction uses the row's stored `exercise` id when there is one, and only falls back to matching the name. The id becomes the identity and the name is just for display. That's what makes a merge authoritative. *(As built: PRs still match by name; build note 4.)*

### 6.5 C4: exercise-list tools
- **`query_data exercises`** (curated): `{ id, name, category, load, aliases, builtin, timesLogged }` for the built-in catalog plus custom movements.
- **`upsert_exercise`** `{ id?, name, category?, load?, aliases?: { add?, remove? }, reason }`.
  - Custom movements are created or updated through `createUserExercise`.
  - **Built-in movements:** writes an overlay `UserExercise` row with the same slug that can only add aliases and set `load`. The name and category stay the catalog's. This needs a small change to how `lib/user-exercises.ts` and `buildIndex` merge rows that share a slug.
  - **Alias collision:** an alias that already resolves to a different movement is refused, naming that movement.
- **`merge_exercises`** `{ from, into, dryRun, reason }`:
  - rewrites `exercise` and `name` on every workout row and routine step (`Sequence.steps`) that points to `from`;
  - moves `from`'s name and aliases onto `into`;
  - deletes `from` if it's custom;
  - rebuilds PRs;
  - writes one `record_changes` batch, so it can be undone.
- **`renormalize_history`** `{ dryRun: true by default, from?, to? }`: re-runs the matcher on `rawName ?? name` for rows that haven't been corrected by hand. It lists what would change and applies it only when `dryRun: false`. It's one batch and can be undone.
- **Receipts:** `log_workout` and `edit_workout` return `mapped: [{ input, to: { id, name, category, load }, how: "exact" | "alias" | "contains" | "minted" | "none" }]`. Their descriptions tell Claude to check `mapped` and fix a wrong match in the same turn.

### 6.5b Every new movement gets explained, not just named (added 2026-11-12, Michael's ask)

**In plain English.** When Pitaya meets a movement it doesn't know, it shouldn't just save the name as a bare line. Claude explains it before the conversation moves on:
- what the movement is and how it's done;
- which muscles it works and which movement pattern it is;
- what equipment it uses;
- what it's a variation of.

Claude uses what it knows, plus a web search (or the video you named) when it isn't sure, and saves the explanation with its source. Every new thing you log adds real context to the library. Pitaya itself doesn't search or pay for AI: your Claude does the research, and Pitaya checks and stores it.

**Technical.**
- **A profile on each movement:** `UserExercise.profile Json?` (nullable, additive).
  ```ts
  interface ExerciseProfile {
    description: string;              // how it's performed, ≤ 600 chars
    pattern: "hinge" | "squat" | "lunge" | "push-horizontal" | "push-vertical"
           | "pull-horizontal" | "pull-vertical" | "carry" | "core" | "rotation"
           | "locomotion" | "plyometric" | "conditioning" | "mobility";
    primaryMuscles: string[];         // fixed vocabulary, e.g. glutes, hamstrings, lats, delts-front
    secondaryMuscles: string[];
    equipment: string[];              // kettlebell, dumbbell, barbell, vest, band, none…
    unilateral: boolean;
    variantOf?: string;               // exercise id: "thrust jerk" is a variant of "jerk"
    cues?: string[];                  // ≤ 5 short coaching cues
    sourceUrl?: string;               // https only: the video or page it came from
    sourceNote?: string;              // e.g. "Lebe Stark 35-min follow-along, minute 12"
    describedAt: string;
  }
  ```
  Built-in movements get a profile through the same overlay row that carries their aliases (6.5).
- **Profiles are filled in when the movement is created.** When `log_workout`, `edit_workout` or `create_routine` creates a new movement, its `mapped` entry carries `needsProfile: true`. The tool descriptions tell Claude: *"For every new movement, identify it from your own knowledge, a web search, or the source Michael named, and call `upsert_exercise` with a `profile` in the same turn. If you can't identify it confidently, ask him instead of guessing."*
- **`upsert_exercise` accepts `profile`.** It's checked strictly:
  - `pattern` and the muscle names must come from the fixed lists;
  - text lengths are capped;
  - `sourceUrl` must be https;
  - `variantOf` must be an existing movement.
- **Nothing gets forgotten:**
  - `query_data exercises` returns each movement's `profile` and a `profileMissing` flag;
  - `app_digest` counts movements without a profile;
  - the server instructions remind Claude to fill gaps when it's in a workout conversation.
- **Variants group without merging.** `variantOf` lets analysis treat a thrust jerk as part of the jerk family. Histories and PRs stay separate, unlike `merge_exercises`.
- **What the patterns and muscles make possible:** questions like "no vertical pull in 9 days" or "posterior-chain volume this week vs last". Claude works these out from workouts plus profiles, with no new dataset.
- **Whole sessions get the same treatment.** `Sequence` (routines) gains nullable `description` and `sourceUrl`. A follow-along video saved as a routine keeps what it is and where it came from. Phase A's `routineId` then links each watch session to it.
- **Backfill:** a supervised chat fills profiles for the 28 existing custom movements and the most-used built-ins.

### 6.6 C5: assisted history cleanup
- Because C2 doesn't apply to the past, rows that were already collapsed have to be fixed by hand.
- Claude builds a short list from workout descriptions, the voice-log audit and the dates named in the Nov 12 review. You confirm it, then Claude applies it with `edit_workout match+set` plus `merge_exercises`.
- After that, `rebuildPersonalRecords()` removes the fake PRs.
- This is a supervised chat task, not code.

### 6.7 C6 (optional, separate PR): recipes built from products
- `FavoriteFoods.components Json?` holds `[{ productId, servings }]`.
- `save_recipe` accepts `components` instead of macros. The macros are calculated and stored, so `log_recipe` stays an exact copy.
- **Changing a product's label macros** recalculates every recipe that uses it. That's written as one `record_changes` batch, and the receipt lists the recipes affected. Food entries already logged don't change: they're what was eaten under the old label.
- This also covers #9 (servings for meals) and #13 (the macro sanity warning), unless they shipped in the quick-wins PR.

### 6.8 Tests
- A fixture table with every real name from the review mapped to its expected result (above).
- Alias collision refusal.
- Merge rewrites workouts and routine steps, and undo restores them.
- Bodyweight PRs from the vest only.
- PRs use the stored id when present.
- Profile checks: pattern or muscle outside the lists, a non-https source, an unknown `variantOf`. A new movement returns `needsProfile: true`, and `profileMissing` clears once a profile is saved.

---

## 7. Phase B: fields Claude can add

### 7.1 In plain English
When you want to start tracking something new, Claude defines the field, says what it means and its unit, and from then on it's accepted on logs, returned on reads, and listed in the tool descriptions every future Claude chat sees. No release. If the app screens ever need to chart one of these, it gets promoted to a permanent field then. That would need a design first.

### 7.2 Schema
```prisma
model FieldDefinition {
  id          String   @id @default(uuid())
  entity      String   // food | measurement | workout
  key         String   // camelCase, ^[a-z][a-zA-Z0-9]{1,40}$
  label       String
  type        String   // number | integer | text | enum | boolean
  unit        String?
  min         Float?
  max         Float?
  options     Json?    // enum values
  description String
  status      String   @default("active") // active | retired
  createdVia  String   @default("mcp")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([entity, key])
  @@map("field_definitions")
}
```
Plus a nullable `extra Json?` column on `FoodLog`, `BodyMeasurement` and `WorkoutLog`.

### 7.3 Tools and behaviour
- **`define_field`** `{ entity, key, label, type, unit?, min?, max?, options?, description }`.
  - A key can't clash with a real column (checked against the DMMF) or an existing key.
  - Defining a retired key again brings it back.
  - It's written to `record_changes` (`entity: "field"`).
- **`retire_field`** `{ entity, key, reason }` hides the key from tool descriptions but keeps every stored value.
- **Writing values:**
  - `log_food` `items[].extra`, `log_measurement.extra`, `log_workout.extra`;
  - `patch_record` `set: { "extra.abdomenCm": 88.4 }`, recorded as field `extra.abdomenCm`.
  - Unknown keys and out-of-range values are refused with a list of the defined keys.
  - Missing values stay missing and are never filled with zero (the existing measurement rule).
- **Reading values:** the registry's `fields` gain `extra` (`body_measurements`), and the curated `recent_food`, `recent_workouts` and `weight_trend` include it.
- **Pitaya describes itself:**
  - `MCP_TOOL_DEFS` becomes `buildToolDefs()` (async, cached for 60 seconds). Each write tool's `extra` property lists the active definitions as `key: type unit — description`.
  - `initialize.instructions` gets a "Custom fields" line.
  - `tools/list` is fetched when Claude connects, so a new field appears in the tool schema from the next session. `define_field`'s result says the field can be used right away.

### 7.4 Starter definitions (open decision 4)
- **measurement:**
  - circumferences in cm: `abdomenCm`; `armLeftCm` / `armRightCm`; `thighLeftCm` / `thighRightCm`; `calfLeftCm` / `calfRightCm`; `forearmLeftCm` / `forearmRightCm`;
  - `tapeMethod` (enum: `hand`, `tape-app`, `clinic`);
  - `tapeLandmarks` (text: where each tape went).
- **food:** `confidence` (enum: `label`, `weighed`, `estimated`, `photo-estimate`).

Don't reuse `skinfoldData.abdomen`. That's a skinfold pinch in mm, not a circumference.

### 7.5 Turning one into a permanent field
When a screen needs to chart one of these:
1. a migration adds the column;
2. the column is backfilled from `extra`;
3. the definition is retired;
4. the registry is updated.

That's documented here so it isn't improvised.

### 7.6 Tests
- Define, then write, then read, through each write tool.
- Refusals: type, range, unknown key, key that clashes with a column.
- A retired key is hidden but its data is kept.
- `buildToolDefs` includes active definitions.

---

## 8. What doesn't change

Checked so this redesign removes nothing:

- **All 27 existing tools** keep their names, inputs and behaviour. `edit_workout`, `edit_food` and `rename_recipe` stay. They only add `record_changes` rows and, for workouts, the `mapped` receipt.
- **App screens:** nothing changes. New data isn't shown in the app until it's designed (§12).
- **Watch app and the `/api/mobile/*` data format:** unchanged. The only change is on the server: a re-send respects corrections. No TestFlight build is needed for any phase.
- **In-app assistant:** gets the improved `today_summary` automatically. Its confirm-first flow is unchanged.
- **Settings:** every existing key keeps its meaning. The legacy macro keys are kept in sync from `targets.rest`.
- **Finance and authentication:** not touched by any phase.

---

## 9. Rollout, quality checks, effort

- **Branches:** `claude/mcp-v2-d`, `-a`, `-c`, `-b` (and later `-c6`), each off `main` after the security merge. One draft PR each. Prod deploys wait for your go (Pitaya's CLAUDE.md).
- **Database changes only add, never drop or rename.** `npm run build` runs `prisma migrate deploy`, so a local build or a Vercel preview build may apply a migration to the live database before merge. An added table or nullable column doesn't affect the running code.
- **Quality checks (all must pass):** `npm run build` (migrate, generate, type-check, Next build), `npm run test`, and the extended registry parity tests. GitHub CI is off for good, so these local checks *are* the check.
- **Self-smoke:** run the local dev server, then call every new tool over JSON-RPC with curl: one success and one refusal each, plus the phase-specific smokes in §4.6, §5.6 and §6.8. After deploying, reconnect the connector in claude.ai so it fetches the new tool list.
- **Independent review:** Phase A changes the watch sync route and adds a broad write tool, so it gets a separate review pass, not just the builder's self-check.

| Phase | Effort | DB migration |
|---|---|---|
| D: targets and daily breakdown | ~1 session | none (settings JSON) |
| A: correction tool and undo | 1–2 sessions | `record_changes` (no `routineId` column; build note 3) |
| C: exercise list and movement profiles | ~2 sessions | `UserExercise.load`, `UserExercise.profile`, `Sequence.description` / `sourceUrl` |
| B: added fields | ~1 session | `field_definitions`, three `extra` columns |
| C6: recipes from products (optional) | 1–2 sessions | `FavoriteFoods.components` |

**Order: D → A → C → B.**
- D fixes the number you look at every day.
- A brings the record and undo that C and B rely on.
- C stops the history pollution. Its stricter matcher can ship earlier, in the quick-wins PR.
- B comes last because filling in past values uses A's `patch_record`.

---

## 10. Where each gap-list item ends up

| # | Item | Where |
|---|---|---|
| 1 | Catalog collapses movements | Quick wins (C1 and aliases), then C4 and C5 |
| 2 | Targets not updatable | D (`update_settings`, `targets`) |
| 3 | `edit_workout` too narrow | A (`patch_record`, `correctedFields`) |
| 4 | Bodyweight fake PRs | Quick wins (category rule), then C3 (`load`) and `upsert_exercise` |
| 5 | Steps not in summary | D (ledger reads `daily_health`) |
| 6 | No net/deficit, no day types | D |
| 7 | Treadmill steps/distance | A (manual fix now). Automatic cadence correction deferred (§12) |
| 8 | Rope EMOM as one set | A (rope correction). Automatic interval detection deferred (§12) |
| 9 | Fractional meal servings | Quick wins (or C6) |
| 10 | Missing measurement fields | B (starter definitions) |
| 11 | Food confidence | B (`confidence`) |
| 12 | Recipes from ingredients | C6 |
| 13 | Label capture | Claude reads labels already. Macro sanity warning in quick wins or C6 |
| 14 | Calories without the watch | Deferred. The D ledger gives Claude workout kcal by type to estimate from |
| 15 | Streams not queryable | Quick wins (detail fields) |
| 16 | Walk timeline | Close |
| 17 | RENPHO import | Verify (not code). The latest scale report arrived typed in, not from the RENPHO feed |
| 18 | Weigh-in gap | D data-quality flags (no weigh-in for 5+ days, outliers) plus verify |
| bonus | Routines for repeat videos | A (`routineId`). `create_routine` already exists |

---

## 11. Decisions I need from you

1. **The daily deficit formula.** Proposed: scale BMR + 10% for digestion + 0.04 kcal per step outside workouts + workout calories. Apple active energy is never used. *Your call: does this match how you think about it?*
2. **Training-day rule.** Proposed: a day counts as "training" once logged workouts reach 300 kcal, and then uses the training target. *What threshold and what training target?*
3. **Scale estimates.** Can Claude correct body-composition numbers (a bioimpedance estimate typed in wrong)? Proposed: yes, with a reason. Weight only ever comes from the scale or from you.
4. **Starter fields for Phase B.** Are the §7.4 fields right? Any you want to add or rename?
5. **Adding fields freely.** Proposed: Claude may define fields without asking first, because claude.ai already asks your permission for each tool call and every definition is logged and can be retired. The alternative is Claude proposing in chat and waiting for your yes.
6. **Stricter matching.** Proposed: create a new movement rather than guess. That means you'll sometimes see "new movement: X". Claude merges it if it was a duplicate.
7. **Public repo.** This spec has no personal data, but `docs/state.md` does. Recommended: make `GlitchedZodiac/Personal-OS` private before more health detail goes into docs.

---

## 12. Deferred (not in this spec)

- `[2026-11-12]` **Automatic treadmill correction** (#7): when cadence × duration and the step count disagree by more than 15%, fix it at sync. | It's useful but separate, and the manual fix in A covers it for now. | `app/api/mobile/workouts/sync/route.ts`
- `[2026-11-12]` **Automatic rope-interval detection** from the stored trace (#8). | Large, and the manual fix in A covers it. | `lib/jump-rope.ts`
- `[2026-11-12]` **Calorie estimator for sessions without the watch** (#14). | Low value once Claude can read kcal by type from the ledger. | new `lib/` module
- `[2026-11-12]` **Retire the empty `daily_activity` pipeline**, or decide it replaces `DailyHealthSnapshot`. | It needs a check that no installed iPhone build writes to it. | `prisma` `DailyActivity`, `lib/daily-activity.ts`
- `[2026-11-12]` **Settings stale-copy risk for keys other than targets.** | Only `targets` is made server-owned here. | `app/api/settings/route.ts`
- `[2026-11-12]` **App screens for the ledger, corrections and undo, and added fields.** | No design exists, and the global design rule says don't invent one. | Request a design first
- `[2026-11-12]` **Multi-user (Stage 2).** | Unchanged. | `docs/mcp-proposal.md`

---

## 13. After each phase: what to check

**After D**
1. Tell Claude your rest-day and training-day targets, then ask "what's my goal today?" and check the right number comes back.
2. Open the app's food screen and check it shows the new rest-day goal.
3. Ask "how did yesterday go?" and check eaten, burned, steps, net and deficit all appear.
4. Ask "is it working?" and check the weekly block reads sensibly to you. This one is your judgement call.

**After A**
1. Ask Claude to fix a watch walk's distance, and check the result shows before and after.
2. Do another short watch workout, then check the fix from step 1 hasn't been undone.
3. Say "undo that" on a fix, and check the old value is back.
4. Link today's workout to a saved routine, and check the routine name shows on it.

**After C**
1. Log "seated dumbbell shoulder press", and check it's reported as a new dumbbell movement, not overhead press.
2. Ask "what are my PRs?" and check the fake overhead-press and push-up records from the review are gone.
3. Say "merge single-hand swing into one-arm swing", and check one movement remains with its history.
4. Log a movement Pitaya has never seen, and check that Claude explains it (how it's done, muscles, what it's a variation of) and saves that, citing where the explanation came from. Then ask "what is a thrust jerk?" in a new chat and check the stored explanation comes back.

**After B**
1. Say "start tracking my abdomen", then log a value, then ask for your last measurements, and check the abdomen value comes back.
2. Start a new Claude chat and ask "what can you record for measurements?" Abdomen should be listed.
