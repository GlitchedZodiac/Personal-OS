# Intake reliability — discovery and plan (Lane D, 2026-10-17)

Michael's note this weekend, verbatim: *"I also want to pressure test against
the chat and speech to text and photo app to get more accurate on the
calories for food, storing the meals and data more consistently, and
improving how the phone interacts with the watch and vice versa. ensuring
we're always tracking workouts consistently, and enabling push notifications
too while also confirming we're pulling what we can from renpho or at least
asking for a pull every week or so."*

Four workstreams, one lane. This document is the Phase 1 output: every path
traced end to end in the code and against a 2026-10-17 copy of the production
database (local Postgres `pitaya_lane_d`; no production call was made), the
gaps with their evidence, the plan per workstream, the decisions I am taking
by default while he is away, and — in plain English — what he will see.

Numbers below are counts and percentages over his data. No description,
weight or note is quoted; the repo is public.

**Lane facts.** Branch `claude/intake-reliability` off `main` at `edf5099`.
`ios/` parity with `claude/watch-app` checked (`origin/main..origin/claude/watch-app -- ios/`
is empty), so `ios/**` may be edited under CLAUDE.md's Q23 exception; state.md
will say so before any `ios/` file changes. No design slice exists in
`docs/design/` for the surfaces this lane touches (the chat card's portion and
confidence affordances, Settings → Devices status rows, Settings →
Notifications "This phone (app)", the Body screen's weekly banner); they are
built inside the existing component language and flagged as such (PORT GATE §5).

---

## W1 — Food accuracy and consistency

### The path today

**Text or voice from the dock** (`components/voice-input.tsx`): the mic records
with `MediaRecorder` → `POST /api/ai/transcribe` (`gpt-transcribe` with
`TRANSCRIBE_PROMPT`, `whisper-1` fallback; metered as `transcribe`) → the text
is handed to the chat screen (`handOffToChat(text, "voice")`) → the chat page
posts `{message, source, images, thumbs, conversationId, timeZone}` to
`POST /api/ai/chat/stream`.

**The stream route** (`app/api/ai/chat/stream/route.ts`): `CHAT_SYSTEM_PROMPT`
(+ a `[Now: …]` line, + a first-turn note) and the chat's last 12 rows go to
the Responses API on `CHAT_MODEL` (terra, reasoning `low`, 1,600 max output
tokens) with 15 tools. `log_food` is a PROPOSAL tool (`lib/ai-prompts.ts`
`FOOD_LOG_FUNCTION`): `items[{mealType, foodDescription, calories, proteinG,
carbsG, fatG, notes?, loggedAt?}]` + `message`. On a `log_food` call the
route: runs `sanitizeProposalArgs` (a no-op for food — only
`log_measurement` is sanitized), `normalizeFoodItemsWithTiming` (a temporal
phrase in the MESSAGE sets `loggedAt` on every item; `lib/food-timing.ts`),
`matchUsual` against **`favorite_foods` only** (40 rows max, word-overlap
≥ 0.8; `lib/food-match.ts`), writes a `chat_messages` row
(`role: proposal`, `meta.kind: "food"`, `status: pending`) and streams the
card. Usage is metered once per turn as `chat`.

**The card** (`app/(tabs)/chat/page.tsx`): one line per item (description,
P/C/F, kcal), a total, "≈ your usual · …" when a favourite matched, **Edit**
(per-item −/+ steppers in 0.25× steps, floor 0.25×, no ceiling), **Log usual**
on single-item cards that matched (saves the favourite's exact macros via
`POST /api/health/favorites {logNow}` → `food_logs.source = "usual"`, and
rejects the estimate), **Confirm** → `POST /api/health/food/batch
{items, loggedAt: now}` — the batch route writes each item with
`source: item.source || batchSource || "voice"`. **The client never sends a
source**, so every confirmed card lands as `"voice"` whether it was typed,
dictated or photographed. Items keep their own `loggedAt` when the message
carried a temporal phrase; otherwise the confirm time wins.

**Label photo** has two doors. (a) Food screen → `POST /api/health/food/scan-label`
(chat-completions with a strict JSON schema: product, serving as printed,
servings per container, per-serving macros, `confident`) → servings → `POST
/api/health/favorites {kind: "product", logNow, servings}` → a `favorite_foods`
product + a `food_logs` row with `source: "usual"` and the multiplier in
`notes`. (b) The chat: a label photo goes through the agentic loop as vision
with the prompt rule "use the label's exact per-serving numbers" and lands as
`log_food` (+ `save_food_product`) proposals — no strict schema, no
`confident` flag.

**Meal photo**: the dock's capture sheet (≤ 6 photos, ≤ 1280 px each) → the
stream route with `images` → one user turn (`lib/chat-photos.ts`) → the model
estimates → `log_food` card → same confirm path.

**Other writers**: MCP `log_food` → `source: "mcp"`; MCP `log_recipe` and the
Food screen's one-tap usual → `"usual"`; `POST /api/health/food` → `"manual"`;
the CSV import → `"import"`.

**Storage**: `food_logs(loggedAt, mealType, foodDescription, calories,
proteinG, carbsG, fatG, notes, source)`. No per-item provenance beyond
`source`, no confidence, no link back to the proposal or the transcript.

### What the data says (674 rows, Jan–Oct 2026)

| Finding | Evidence |
|---|---|
| `source` is wrong for most rows | 580 `voice`, 51 `import`, 24 `mcp`, 19 `photo` (the retired Feb–Mar analyze-photo path), 0 `label`, 0 `chat`, 0 `text`. Chat proposals saved since August: 77 food cards, all stored as `voice`. The cause is the missing `source` on the confirm POST plus the batch route's `"voice"` default. |
| Macros and calories disagree on 1 row in 7 | Over rows with kcal > 0: `voice` 80/577 are off by > 10 % against 4P + 4C + 9F, 29 by > 20 %, 9 by > 35 % (mean 6 %); `photo` rows mean 22 % off (n = 18); `mcp` 3 %. Nothing checks the arithmetic on the way in. |
| The usuals shelf is unused | `favorite_foods` has 2 rows, both label products, `usageCount` 1 each. `matchUsual` only ever sees those two. |
| Repeats are rare as strings, common as foods | 653 distinct descriptions of 674 (3.3 % exact repeats after folding). Grouping rows by their first two words puts 137 rows (20 %) into 14 groups — but that grouping mixes real portion and recipe differences with estimate drift (the reviewer's regrouping of the same rows gave spreads anywhere from 26 % to 144 %), so it motivates measuring and proves nothing. The measurement is the harness's paired twins: the same food and portion phrased two ways. |
| Descriptions are already consistently shaped | 97 % start with a capital, 88 % carry a portion in parentheses, 95 % contain a digit, average 53 characters, 1 trailing punctuation mark, 0 untrimmed. Normalisation is a small job; `source` is the real inconsistency. |
| Meal type mostly follows the clock | Bogotá hours: lunch 200/226 at 10–13 h; dinner 300/333 after 17 h; snack 54/76 at 14–16 h. Off-pattern rows (16 breakfasts after 14 h, 33 dinners before 17 h) coincide with back-dated logs — 97 of 580 voice rows have `loggedAt` more than 2 minutes from `createdAt`. The code already honours a per-item `loggedAt` (`lib/food-timing.ts`: an item's own time wins, the message-level phrase only fills items without one) and the model stamps every item — but with the same time, so "eggs this morning and a sandwich at lunch" lands both at 08:00. That is a tool-description fix, not a timing-code fix. |
| No confidence signal exists anywhere | The tool schema has no confidence field; the card shows a number with no hint of how sure it is. |
| The card's only portion fix is slow | 0.25× steps per item; four taps to double a plate, no card-level fix, no "last time this was …". |
| The input bill is mostly history and echoed reasoning, not the prompt | `ai_usage_events`: 157 chat calls averaging 9,473 input tokens (~$0.023); since 2026-10-01 the average is 15,476 input tokens / $0.035 a call. `CHAT_SYSTEM_PROMPT` is ≈ 2.7k of that and the tool schemas ≈ 2.7k (≈ 28 % together); the rest is the 12-row history and the reasoning items echoed back each loop turn. Food is the dominant proposal kind (77 of 108 saved cards). Any Phase 3 item that adds prompt text is measured against the harness's tokens-per-call column; the parked luna food lane (deferred 2026-08-29, his call) is the real cost lever and is NOT built here. |
| Two label readers | The strict-schema reader is only reachable from the Food screen; a label sent in chat is read without the schema or the `confident` flag. |
| Transcript noise is untested | `TRANSCRIBE_PROMPT` lists ten Colombian foods; whether "dos arepas con queso y media taza de arroz" or "two and a half scoops" survive to a correct card has never been measured. |

### Plan

**Phase 2 — measure (the harness).**
- `scripts/food-eval.mjs` (run on demand; never in `vitest`) + `tests/food-eval/fixtures.json`: ~80 SYNTHETIC utterances in his phrasing shapes — Colombian staples, gym foods, quantities, mixed meals, corrections ("make lunch 650"), a usual by nickname, label-with-servings, and realistic-transcript twins (numbers as words, EN/ES mix, fillers, no punctuation). Each carries a reference range for kcal and macros derived from public per-100 g values × the stated portion (documented in `tests/food-eval/reference.md`), expected item count, expected mealType, and expected day/hour when a temporal phrase is present.
- Runs through the REAL route: PIN cookie → `POST /api/ai/chat/stream` with no `conversationId` (a fresh chat per utterance, so history cannot help or hurt) → parse SSE `proposal` events of kind `food`.
- Metrics: in-range rate and error vs the range midpoint (kcal, P, C, F); consistency (a 20-utterance subset × 3 → kcal CV); macro-sanity rate (> 15 % off); usual-match rate (a seeded synthetic usual); item-split exactness; mealType/time correctness; latency and $ per utterance (from `ai_usage_events` deltas).
- Labels: Playwright renders 6 synthetic Nutrition Facts panels (EN and ES, two resolutions) → `scan-label` field-exactness, and the same PNGs through chat with "two servings" → scaled `log_food`.
- Meal photos: **pipeline shape and failure modes only** — a rendered non-food image and an unreadable one, checking the model declines honestly instead of inventing. No public-domain photos are fetched (downloading files needs his say-so; Decision D6). Photo *accuracy* is a checklist item for him.
- Seeds (one synthetic usual, ~10 synthetic history rows tagged in `notes`) are inserted before and deleted after; conversations the run creates are deleted by timestamp.
- Output: `tests/food-eval/last-run.json` (committed summary) and the baseline tables in `docs/food-accuracy.md`.

**Phase 3 — improve, re-measure, normalise.**
1. **Deterministic check** (`lib/food-check.ts`, pure, tested): coerce numbers (strings, NaN, negatives → 0 or dropped), round, and compare kcal with 4P + 4C + 9F per item — alcohol items exempt (7 kcal/g the formula cannot see). Whether a mismatch is corrected, and towards which side, is decided from the Phase 2 table (D2); until then the check FLAGS. Applied in the stream route before the card AND in the batch route on save (so MCP and any client get it too).
2. **History anchor** (`lib/food-match.ts` additive `matchHistory`): word-overlap match each proposed item against the last 400 `food_logs`; annotate `items[i].history = {count, days, medianKcal, spreadPct, lastKcal, lastAt}`; the card shows "last time: N kcal" and a one-tap "use last time" when the spread is small. The same match runs BEFORE the model on the user message and, ONLY under the D3 gate (≥ 3 distinct days, spread ≤ 25 %, no differing quantity, D2-rewritten rows excluded), injects one short line so the estimate is anchored. Measured with the anchor on and off, and its tokens counted.
3. **Promotion — overturning the 2026-08-29 "deliberately NOT done" in `docs/token-roi.md`, explicitly.** That note parked automatic save-as-usual nudges as "UX noise until the fuzzy pill proves itself". The pill never got the chance: `favorite_foods` has held two label products since August, so there was nothing for it to match. With history matching (item 2) the app can tell for the first time that a food repeats. The nudge is therefore reinstated, gated: offered only when the matches span ≥ 3 distinct days with a kcal spread ≤ 25 % and no usual exists, dismissible per food, and it is a tap on a card he is already confirming — not a new surface and never a silent save (`POST /api/health/favorites` without logging).
4. **Portion chips** on the card: ½× · 1.5× · 2× at card level (all items), beside the existing per-item steppers. Confirm sends the scaled items.
5. **Confidence**: an optional `confidence` ("high" | "medium" | "low") per item in `FOOD_LOG_FUNCTION`; the card shows a small hint for medium/low, and for a history spread > 25 %.
6. **Prompt**: a compact Colombian portion table (arepa, patacón, empanada, bandeja paisa components, sancocho bowl, pandebono, jugo) and the explicit rule that macros must sum to the kcal; measured before/after.
7. **Per-item time**: the timing code is already per-item (reviewer's correction); the fix is the `loggedAt` tool description asking for a time PER ITEM when the message names more than one, measured by a mixed-time fixture.
8. **Normalisation** (`lib/food-normalize.ts`, pure, tested): trim, collapse spaces, strip trailing punctuation, capitalise the first letter, keep his language; applied at save in the batch route and `POST /api/health/food`.
9. **`source` vocabulary** (additive): the stream route stamps `source` onto the proposal data (`chat` for typed, `voice`, `photo`); the card passes it on Confirm; label saves via favourites stamp `label`; MCP keeps `mcp`; recipes keep `usual`; the form keeps `manual`. History is not rewritten (Decision D1). The Food timeline pill that reads `source === "usual"` is unaffected.
10. **Label reader in chat**: `scan-label`'s strict schema becomes the shared reader (`lib/label-reader.ts`) and the chat prompt is told labels are read exactly — measured by the label fixtures.

### Decisions (defaults taken; his word can change any)

- **D1 — no backfill of `source` (decision stands; the reason was wrong).** Proposal rows DO link to their user message — same chat, adjacent, and 83 of 86 food proposals have a user row with `meta.source` within 5 minutes; 77 of 77 saved proposals match a `food_logs` row by description and time. So ~77 rows since the chat loop ARE backfillable (chat vs voice vs photo); the other ~500 predate it and are not. Default: leave history as it is and stamp new rows correctly; the 77-row backfill is a one-off he can ask for.
- **D2 — reconciliation: PROVISIONAL until the Phase 2 numbers.** The harness reports, per mismatched item, which side is closer to the reference. The reviewer's case for the other direction is strong for the items that matter: the model recalls kcal-per-typical-serving more reliably than macro grams of mixed dishes; 4/4/9 ignores fibre (≈ 2 kcal/g) and alcohol (7 kcal/g); the mismatch rate is 5.9 % for voice rows, 3.0 % mcp, 21.6 % photo (n = 18). Likely landing: the MODEL reconciles (a schema rule plus confidence), the deterministic check stays as a FLAG on the card, the side is picked by item class (drink / alcohol / label-like → kcal; otherwise macros), and `notes` keeps "model said N". Decided in Phase 3 from the table.
- **D3 — history anchor, gated so it cannot feed on itself** (reviewer's point: word-overlap matching ignores portion, so one-arepa history would anchor a two-arepa plate, and after a few confirms the median would simply be the model's own output). Window 400 rows, 0.8 word-overlap threshold. The CARD shows "last time: N kcal" from 1 match. The PROMPT is given the anchor only when the matches span ≥ 3 distinct DAYS, their kcal spread is ≤ 25 %, and the utterance carries no quantity that differs from the matched rows; rows whose kcal the D2 check rewrote are excluded. The harness runs with the anchor on and off. "Save as usual" counts distinct days, not rows (one three-item lunch is three rows).
- **D4 — portion chips** ½× · 1.5× · 2× at card level; per-item steppers stay.
- **D5 — confidence** is model-declared per item plus a history-spread rule; shown only when it is not "high".
- **D6 — eval budget ≈ $6–8 total** (80 utterances once + a 20-utterance × 3 subset, before and after ≈ 280 chat calls at ~$0.023; labels and photos are a few cents). Metered in `ai_usage_events` like every other call. No public-domain photos are downloaded. [Actual: the first baseline attempt was lost when the dev server was killed mid-run ($3.96), so the baseline cost ≈ $8 in total — see `docs/food-accuracy.md`.]

### What Michael will see

- A food card that says **"last time: 320 kcal"** under an item he has had before, and estimates that stop wandering for his repeats.
- **½× · 1.5× · 2×** on the card — one tap to fix a portion, then Confirm.
- A quiet hint when the model is **unsure**, and a kcal figure that always agrees with the macros (with a one-line note when it had to be corrected).
- **"Save as usual"** offered after the third time he logs the same thing — never saved without his tap.
- Every row stamped with how it came in (**chat · voice · photo · label · usual · Claude · typed**), so Food history can be filtered by it later.
- A measured before/after in `docs/food-accuracy.md`.

---

## W2 — Watch ↔ phone: workouts tracked consistently

### The path today

**Watch, happy path.** `WorkoutRecorder.finish()` → `AppModel` builds a
`WorkoutSyncItem` (`externalId` minted at Start, `externalSource: "app_watch"`)
→ `OfflineWorkoutQueue.enqueue` (a JSON file in Application Support, upsert by
key) → `drainQueue()` → `WorkoutSyncFlight.run` (one flight at a time; joiners
wait) → `MobileAPIClient.syncWorkouts` (15 s request / 60 s resource timeout;
one 401 → refresh → retry) → `POST /api/mobile/workouts/sync` → `create`, or on
`P2002` an `update` through `mergeResync` → PR detection → response with
`created/updated/prs/summary/routine` → `removeSynced` → Summary says "synced
to Pitaya", Settings says "queue empty · hh:mm".

**Watch, failure paths.** Any thrown error (no network, 5xx, a client timeout)
leaves the items on disk; `drainQueue` sets `syncState = .queued(n)`; the
Summary shows **"offline · queued to sync"**, Settings **"N queued"**. Retries:
the next Save, every launch (`bootstrap`), and the scheduled background
refresh (~30 min preferred; watchOS decides). The `.failed(message)` state
exists in the enum and the Summary draws it, but **`drainQueue` never sets it**
— a 500 with a server message and a dead network look identical on the wrist.
A server 500 fails the whole batch (one bad item blocks its siblings until the
next drain; items already created come back as updates, which the upsert
absorbs). A client timeout at 15 s against a route allowed 60 s means a slow
cold start can "fail" a drain the server finishes — the next drain re-sends
and lands as updates; correct, but reported as offline.

**Phone.** `HealthSyncManager` reads quantity/category types only (steps,
energy, distance, RHR, HRV, sleep, body mass + composition, the extras). There
is **no `HKWorkout` read anywhere** — a workout recorded with Apple's Workout
app, Strava's app or anything else never becomes a `workout_logs` row (deferred
item 2026-10-17 "Apple Health WORKOUTS he did outside Pitaya"). Background
delivery is enabled for steps, body mass, sleep and HRV only.

**Status surfaces.** Web Settings → Devices shows device sessions ("last seen")
only; nothing says when a workout last arrived. Settings → Notifications →
"What's syncing" lists `sync_status` rows — today only `apple_health`
(heartbeat). The watch sync row and the phone sheet have no "failed" detail.

**Evidence from the copy:** 60 `app_watch` rows (Aug 10 → Oct 17), all
`synced`, all with kcal, HR and `endedAt`; 91 Strava rows ending 2026-08-07
(Strava retired); 13 manual, 2 mcp. No row carries a HealthKit workout UUID.

### Plan (Phase 4)

**iPhone app** (`ios/iPhone/WorkoutReader.swift`, new; `HealthStore.swift`
additive):
- `HKObjectType.workoutType()` joins `readTypes`; `requestedTypesVersion` → 5
  (the existing self-healing "Allow new Health data" flow re-prompts him once).
- An `HKAnchoredObjectQuery` on workouts (anchor persisted like the weigh-in
  anchor; first run bounded to the last 180 days — Decision D7), with
  background delivery for `workoutType` like the other observers.
- **Skip Pitaya's own sessions on the phone**: any workout whose
  `sourceRevision.source.bundleIdentifier` starts with
  `net.blacksheepglobal.pitaya` is the watch's own `HKWorkoutSession` and is
  never posted.
- Map each remaining workout to a `WorkoutSyncItem`: `externalSource:
  "apple_health"`, `externalId: uuid`, `workoutType` from
  `HKWorkoutActivityType` (running → `run`, walking → `walk`, hiking → `hike`,
  cycling → `cycling`, strength/functional → `strength`, jumpRope →
  `jump_rope`, everything else → `other` with Apple's name in `description`),
  `startedAt/endedAt/durationMinutes`, active kcal, distance, avg/max HR from a
  statistics query over the workout's window, `source: "apple_health"`,
  `deviceType` from the device, and `metricsData.appleHealth = {uuid,
  activityType, sourceName, sourceBundleId}`. Posted in batches of 25 through
  the EXISTING `api.syncWorkouts` (the shared client).
- Phone settings sheet gains a **Workouts** block: last import, how many,
  pending/failed with the error text, and "Import workouts now".

**Server** (`app/api/mobile/workouts/sync/route.ts`, additive;
`lib/workout-dedupe.ts` additive, pure, tested):
- For `externalSource === "apple_health"` items, `findOverlappingWorkout`: an
  existing row whose source is not `apple_health`, starting within ±3 minutes
  OR overlapping ≥ 50 % of the shorter duration, is the same session — the
  import is **skipped**, the HK uuid is written onto the matched row's
  `metricsData.appleHealth` so the next re-send matches exactly, and the
  response carries an additive `skipped: [{externalId, reason:
  "duplicate_of", workoutId}]`. Payload shapes stay frozen; everything is
  additive per `docs/watch-contract.md`.
- The watch starts sending `metricsData.hkWorkoutUUID` (the `HKWorkout` is in
  hand at `finish()`; optional key, additive) so the server has an exact key
  for the mirror — the time-window rule stays as the backstop for old builds.
- `recordSync("watch_workouts" | "apple_health_workouts", …)` on every batch
  (no heartbeat), so both appear under Settings → Notifications → "What's
  syncing" with no new UI, and a 2-day failing streak raises the existing
  system alert.
- `GET /api/health/devices` gains additive `sync: {watchWorkouts: {lastAt,
  last7d}, appleHealthWorkouts: {lastAt, last7d, lastImportAt, skipped7d}}`,
  drawn as compact rows (`components/intake/sync-status-rows.tsx`) under the
  Devices card: label · state chip · one line.

**Watch** (`AppModel.drainQueue` + `SettingsView`, small): a `ClientError.server`
with a status sets `.failed("server <status>: <message>")` instead of
`.queued`; the Settings row shows "N queued · last try hh:mm" and the error.

**Smoke**: the watch simulator records a session → dev server (port 3104) →
one row; the iPhone simulator with a seeded `HKWorkout` (written by a DEBUG
smoke seam, source = the iPhone app's own bundle, so it is NOT filtered) →
appears once; a second seeded workout overlapping a watch row → `skipped`.

### Decisions

- **D7 — the WHOLE history, once** (reviewer: 180 days contradicted the 15-year activity import and his ask for "exercises I didn't even think of"). The one-time full read reuses the activity import's pattern — foreground only, chunked, behind a flag — and workouts are far fewer rows. Unknown activity types → `other` with Apple's name in the description; strength kinds → `strength`. The anchored query's deleted objects are honoured: a workout deleted in Health is removed from Pitaya (an additive `deleted[]` on the sync request, soft-handled by the route).
- **D8 — duplicate rule, as the BACKSTOP**: the primary key is D9's `hkWorkoutUUID` handshake (the watch sends the HealthKit id of the session it wrote; an import carrying that id is the same session). Without it: ±3 min start or ≥ 50 % overlap → skip the import and remember the uuid on the Pitaya row. Apple's numbers are never merged into a watch row (the watch's are richer). The Strava era is covered the same way: Strava's iOS app writes HealthKit workouts, and those rows carry Strava's own start times.
- **D9 — the watch sends `hkWorkoutUUID`** additively from this round, and the phone's own-session filter is an EXACT set of Pitaya's bundle ids — `net.blacksheepglobal.pitaya.watchkitapp` (the watch writes workouts through `builder.finishWorkout()`), never a prefix (reviewer: a prefix match on `net.blacksheepglobal.pitaya` would also have filtered the simulator smoke's seeded workout, which is written under the PHONE's bundle id). The DEBUG seed seam requests share authorisation for `workoutType()` (the app asks `toShare: []` today) and writes under the phone bundle.
- **D10 — `.failed` on the wrist** for a server status AND for an expired session (`ClientError.unauthorized`, "pair again" — today it reads "offline · queued" forever); network errors stay "offline · queued" with "last try hh:mm" shown.

### What Michael will see

- A gym session he recorded with Apple's Workout app (or any app) **shows up
  in Train on its own**, marked *from Apple Health*, with duration, calories
  and heart rate — and a Pitaya watch session is never counted twice.
- Phone app → shake → **Workouts: last import, pending, failed**, and an
  "Import now" button.
- Watch → Settings: **"all synced · 2:02 pm"**, **"2 waiting · no connection · last try 1:40 pm"**, or **"2 waiting · the server said no"** — offline, broken and "pair again" each read differently.
- Web Settings → Devices: two compact rows, **Watch workouts** and **Apple
  Health workouts**, each with a state chip and "last synced …".

---

## W3 — Push notifications on the phone (the TestFlight shell)

### The path today

`notify()` (`lib/notify.ts`) is the one door: category switch → dedupe → quiet
hours → `deliver()` → `sendPush()` (Web Push to `push_subscriptions`) → log.
`deliver()` has exactly one transport. `deviceCount()` counts
`push_subscriptions` only. The iPhone app is a `WKWebView`
(`ios/iOSApp/WebShellView.swift`) with no Push API; `lib/push-client.ts`
detects the shell by the `haptic` message handler and reports `native-shell`
with the copy "can't receive notifications yet".

What already exists for APNs: `push_devices` (token, platform, bundleId,
environment), `POST/DELETE /api/mobile/push/register` (bearer; accepts
`token` or `deviceToken`; environment defaults to `production`),
`CompanionModel.requestPush()` → `registerForRemoteNotifications` →
`handlePushToken` → `postPushToken` (sends `deviceToken` + `platform` only, no
environment, no bundleId; URL hard-coded to production) → `PushStatus`
(`unknown | registered | serverPending | needsPaidTeam | declined`). The
settings sheet shows an "Enable reminders" button under `.unknown`.
**Nothing calls `requestPush()`** except that button; the entitlements file has
no `aps-environment`; there is no `UNUserNotificationCenterDelegate`, so a
delivered notification would neither show in the foreground nor open its
`url` on tap.

**Evidence:** `push_subscriptions` 0, `push_devices` 0; `notification_log` has
20 rows, every one `no_devices` (PR celebrations, Spirit, a weigh-in, a
weekly report, a system alert). Nothing has ever reached him.

### Plan (Phase 5)

**iOS** (`ios/iOSApp/*`, `project.yml`, entitlements):
- `aps-environment: development` in `PersonalOS.entitlements` and
  `project.yml` (Xcode's App Store export rewrites it to `production`; the
  DEBUG build sends `environment: "sandbox"`, Release `"production"`, so the
  server picks the right APNs host).
- `CompanionModel`: `postPushToken` sends `{deviceToken, platform, bundleId,
  environment}` through the shared `MobileAPIClient` (honouring the DEBUG
  dev origin instead of the hard-coded production URL). `requestPush()` runs
  after a successful pairing and on an explicit tap; on every launch, if
  notification permission is already granted, `registerForRemoteNotifications`
  runs silently (tokens rotate). `needsPaidTeam` is renamed in meaning to
  `failed(message)` — the team is paid; a failure now means the entitlement or
  the App ID capability.
- A `UNUserNotificationCenterDelegate`: banners show in the foreground; a tap
  posts the payload's `url` to the shell, which loads it in the web view.
- **`PushBridge`** (`WebShellView.swift`, the `HapticBridge` pattern): the web
  posts `window.webkit.messageHandlers.push.postMessage("request" | "status")`;
  the native side answers with `window.dispatchEvent(new CustomEvent(
  "pitaya-push", {detail: {state, environment}}))` where state ∈
  `off | on | denied | failed`.

**Web**:
- `lib/push-client.ts`: when `messageHandlers.push` exists the state becomes
  `shell-off | shell-on | shell-denied | shell-dormant` (dormant = the server
  has no APNs key, from `GET /api/push/subscribe` → additive
  `apnsConfigured`); `enablePush()` in the shell posts "request" and awaits
  the event (10 s).
- Settings → Notifications: a **"This phone (app)"** row — state chip + one
  action — above the existing "This device" card, shown only inside the shell
  (`components/intake/phone-push-row.tsx`). The dormant copy names the first
  thing to do: add `APNS_*` in Vercel.

**Server**:
- `lib/push-apns.ts`: env `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8`,
  `APNS_BUNDLE_ID` (default `net.blacksheepglobal.pitaya`); `apnsConfigured()`;
  `sendApns(payload)` over Node's built-in `http2` (no new dependency): one
  session per host per call, `POST /3/device/<token>`, headers
  `authorization: bearer <ES256 JWT>` (`kid`, `iss` = team, `iat`; signed with
  `node:crypto` and converted DER → JOSE; cached and refreshed after 50 min),
  `apns-topic` = bundle id, `apns-push-type: alert`, `apns-priority: 10`,
  `apns-collapse-id` = tag, `apns-expiration` 1 h; body
  `{aps: {alert: {title, body}, sound: "default", "thread-id": category}, url}`.
  Host by the row's `environment`. A 410, or a 400 with `BadDeviceToken` /
  `Unregistered` / `DeviceTokenNotForTopic`, prunes the row.
- `lib/notify.ts` `deliver()` runs Web Push and APNs and sums `sent/failed/
  pruned`; `deviceCount()` counts both tables; the status is `sent` if either
  transport accepted. Categories, quiet hours, dedupe and the log apply
  unchanged. "Send a test notification" (`POST /api/push/subscribe?test=1`)
  reaches APNs devices by construction.
- `GET /api/push/log` returns `devices` as the sum plus additive
  `webDevices`/`apnsDevices`.
- Tests: a mocked `http2.connect` asserting path, every header, the JWT's
  header/claims and reuse, the payload, sandbox vs production host, pruning on
  410 and on `BadDeviceToken`, and `deliver()` summing both transports.
- Docs: `docs/push-notifications.md` gains the exact setup — App Store Connect
  → Users and Access → Integrations → Keys → **Apple Push Notifications
  service (APNs)** key → download the `.p8` once → Vercel env (the `.p8` text
  as `APNS_KEY_P8`, key id, team id `HDR67SL3JG`) → redeploy → open the app →
  Settings → Notifications → This phone (app) → Enable → Send a test.

**Risk named up front.** The TestFlight archive is signed with automatic
cloud-managed profiles (`-allowProvisioningUpdates`). Adding `aps-environment`
needs the App ID `net.blacksheepglobal.pitaya` to have the Push Notifications
capability; Xcode normally enables it as part of provisioning updates (that is
how HealthKit background delivery landed on 10-17), but if the first run after
merge fails with "profile doesn't support Push Notifications", the fix is one
toggle at developer.apple.com → Identifiers → the App ID → Push Notifications,
then Actions → TestFlight → Run workflow. Listed first in his checklist.

### Decisions

- **D11 — dormant by design**: without `APNS_*` in the environment the whole path is a no-op that says so in the UI and in the log (`no_devices` with `error: "APNs not configured"`). Nothing is faked. **The key arrives mangled unless handled** (reviewer, HIGH): a `.p8` pasted into Vercel carries literal `\n`, and the repo's env idiom strips newline sequences (`lib/openai.ts`, `lib/auth.ts`); `crypto.createPrivateKey` rejects that. `APNS_KEY_P8` is normalised (`\n` → newline) and base64 is accepted too, and one test SIGNS a JWT with a freshly generated P-256 key — not only a mocked http2 session.
- **D12 — payload**: default sound, collapse by the existing `tag`, `url`
  carried as a custom key, foreground banners on. Pushes carry only what
  `notify()` already sends — his own reminders and the categories he switched
  on (his 2026-08-11 rule stands).
- **D13 — registration moments**: after pairing, on tap, and silently on launch when already authorised. **Environment**: the App Store Connect export rewrites `aps-environment` to `production`, so Release → "production" matches TestFlight; the DEBUG/Release mapping is a proxy and is documented as such (reading `aps-environment` from the embedded provisioning profile is the exact way, used if it proves cheap). `lib/push-client.ts` keeps `haptic` as the shell detector and adds `push` as a capability flag, so a shell from before this build still reads as the shell.

### What Michael will see

- Settings → Notifications in the TestFlight app: **"This phone (app) — Off ·
  Enable"**, then **On**, then "Send a test notification" lands on the lock
  screen. Until the key is in Vercel the row reads **"Waiting for the server
  key"** with the one step to take.
- Phone app → shake → Notifications: **"Reminders on"** (or the real failure
  text).
- A reminder he set in chat arrives on the phone he actually carries.

---

## W4 — RENPHO: pull what we can, or ask for it weekly

### The path today

**Weight**: RENPHO scale → Renpho Health app → Apple Health (weight, and
per the 10-04 evidence body fat/BMI/lean mass are written but never arrive) →
iPhone companion `drainWeighIns()` (anchored) → `POST /api/mobile/health/body`
→ `ingestBodySamples` (±10 min / ±0.3 kg near-twin merge) → `announceWeighIn`
→ `notify("weighIn")` (weight only).

**Composition**: his 10-05 decision — the **report upload** (Body → Add report
→ `POST /api/health/body/report` reads the PDF/screenshots under a strict
schema → confirm card → `PUT` saves through `saveScaleReport`, joining the
weigh-in already stored). The **cloud pull** (`lib/renpho-client.ts`,
`lib/renpho-sync.ts`, `/api/cron/renpho-sync`, `POST /api/health/body/sync`,
and the Apple-Health-arrival trigger) is built and **off**: `renphoSyncEnabled()`
needs `RENPHO_SYNC_ENABLED=1` + credentials, the cron is not in `vercel.json`,
and a login with his own account signs his phone's app out — it needs a second
account. `renphoSyncStatus()` already serves `enabled / lastRunAt / lastRunOk /
lastError / lastSuccessAt / lastReadingAt`, and the Body screen's pull-to-sync
calls `POST /api/health/body/sync` (a no-op while off) then reloads.

**Nothing asks.** The only prompt is the weight-only line on the latest
weigh-in card ("Add its RENPHO report"), visible only if he opens Body and the
newest weigh-in has no fat %.

**Evidence from the copy:** weigh-ins keep arriving through Apple Health (last
2026-10-08); the last row with any composition is 2026-10-04 (his hand-typed
report). `body_sync_runs`: two backfill runs, nothing since. Settings → Devices
says nothing about RENPHO at all.

### Plan (Phase 6)

- **`lib/composition-nudge.ts`** (pure, tested): `compositionNudgeFor({
  lastCompositionAt, now, timeZone})` → `{due, daysSince, weekStart, dedupeKey}`.
  Due when no row with any composition field (`bodyFatPct`, `muscleMassKg`,
  `fatMassKg`, …) is dated within the last 7 days AND the local clock is in
  the window: **Sunday 17:00 → 21:59**, with a Monday catch-up until noon
  (quiet hours still hold it if needed). Idempotent per ISO week:
  `dedupeKey = composition-nudge:<weekStart>`.
- **Category `weighInReminder`** (`CategoryPrefs` key, default on; Settings →
  Notifications label **"Weigh-in reminder"**, note "Sunday evening, when a
  week has passed without a body-composition reading"). Sent by the full
  hourly sweep beside the activity reports: title "No composition this week",
  body "Step on the RENPHO and add the report — or pull now.", `url:
  /health/body?nudge=composition`.
- **Body screen banner** (`components/intake/composition-banner.tsx`): a
  compact row above the COMPOSITION card when `daysSinceComposition ≥ 7` (also
  when the URL carries `nudge=composition`): "No composition in N days" chip ·
  one action — **Add report** (opens the existing sheet); **Pull now** replaces
  it when the sync is enabled (calls the existing `POST /api/health/body/sync`
  and reloads). The summary payload gains additive `composition:
  {lastAt, daysSince}`.
- **Settings → Devices RENPHO row** (`components/intake/renpho-status-row.tsx`,
  fed by `GET /api/health/body/sync` with additive `lastCompositionAt`,
  `lastWeightAt`, `daysSinceComposition`): "RENPHO scale" · chip **Off /
  On / Failing** · "last composition … · weight via Apple Health …"; tapping
  the chip when off shows two lines: what turning it on needs (a second RENPHO
  account's login in Vercel + `RENPHO_SYNC_ENABLED=1`) and why (a login with
  his account signs his phone out).
- Cron smoke locally: `GET /api/cron/reminder-push` with `CRON_SECRET` at a
  faked Sunday evening → one `notification_log` row; a second sweep → duplicate.

### Decisions

- **D14 — nudge window, moved to when he actually weighs in.** The reviewer checked his last 90 days: weigh-ins cluster at 11:00–14:00 local, none between 17:00 and 21:59, and Sunday is his second-rarest day — so a Sunday-evening push would have landed beside two "Weekly report ready" pushes and asked for a weigh-in at the wrong time. New default: **Saturday 10:00–12:59 local, with a Monday 10:00–12:59 catch-up**, 7-day threshold, one per week, category default on. The once-a-week key is anchored to that Saturday's week so the Monday catch-up cannot fire a second time (the old key changed over at Monday).
- **D15 — "Pull now" only when the sync is enabled**; otherwise the row says Off and how to turn it on, and the nudge copy never says "or pull now". The second-account step is his (deferred item 2026-10-04, parked on his word; this lane does not reopen it, it only makes the state visible and the weekly ask real). **"Composition" is an explicit column set** — body fat %, muscle mass, fat mass, skeletal muscle, body water, protein, bone, visceral fat, BMR — and NOT BMI (derived, it rides with weight). The premise "composition never arrives via Apple Health" was wrong: four Apple Health rows carry body fat (09-12, 09-19 ×2, 10-03). The banner has two states — "no weigh-in in N days" vs "weight arrived, no report".

### What Michael will see

- **Saturday late morning, a push: "No body-composition reading this week"** — tapping it opens Body with a banner and the Add report button right there.
- Body screen: a quiet **"No composition in 13 days · Add report"** row when a week has gone by (or **"No weigh-in in 9 days"** when the scale itself has gone quiet); it disappears the moment a reading lands.
- Settings → Devices: **"RENPHO scale — Off · last composition Oct 4 · weight
  via Apple Health Oct 8"**, and the two-line how-to when he taps it.
- Settings → Notifications: a **"Weigh-in reminder"** switch beside the others.

---

## Cross-cutting

- **Design**: all new UI is small and token-only (`components/intake/*`), no
  raw hex, icons from `components/pitaya-icons.tsx`; status is "label · state
  chip · one action", never a paragraph. No design slice exists for any of it —
  flagged in `docs/state.md` at the end (PORT GATE §5).
- **Contracts**: every `/api/mobile/*` change is additive (`skipped[]` on the
  sync response, `environment/bundleId` already accepted by register,
  `metricsData.hkWorkoutUUID`/`appleHealth` optional keys).
- **Migrations**: none needed. `push_devices`, `sync_status`,
  `notification_log.dedupeKey` and `favorite_foods` already carry what the
  plan writes. (If Phase 3 wants per-item confidence persisted it rides in
  `notes`, not a new column.)
- **Out of lane** (to `docs/followups.md` as they are confirmed): raw hex
  colours on the chat card and settings pages (Lane C); unbounded `items[]` and
  unvalidated numbers on `/api/health/food/batch` — fixed here because it is
  food consistency, but worth Lane A's eye on the other write routes; the
  Coach (Lane B) will see the new `source` values on food rows.

## Phases from here

| Phase | Deliverable | Commit |
|---|---|---|
| 2 | Harness + fixtures + baseline tables in `docs/food-accuracy.md` | 1 |
| 3 | W1 improvements, re-measure (before/after committed), normalisation, card UX | 1 |
| 4 | W2: HK workout import, dedupe, status rows, wrist failed state, simulator smoke | 1 |
| 5 | W3: APNs end to end, dormant without the key, tests, docs | 1 |
| 6 | W4: nudge, banner, RENPHO row; `state.md`, `followups.md`, draft PR | 1 |

---

## Changed after the independent review of 63b0dc2 (2026-10-17)

The review confirmed the W1–W4 findings that rest on code and data (batch
default "voice", no source from the client, the no-op sanitizer, the two-row
favourites, 580/51/24/19, the never-set `.failed`, no `HKWorkout` read, one
transport, no `aps-environment`, the empty push tables, composition last on
10-04) and overturned five claims; each is corrected in place above and the
decisions it changed are rewritten (D1, D2, D3, D7–D11, D13–D15, Phase 3 items
1, 2, 3 and 7). In plain terms:

- **Measuring consistency.** Running the same text three times only measures
  the model's dice — he never sends the same text twice. The harness now
  scores PAIRED TWINS (the same food and portion phrased two ways) as the
  consistency metric and keeps the ×3 run labelled as the sampling noise floor.
- **Where the money goes.** Not the system prompt (≈ 28 % with the tool
  schemas); mostly the replayed history and the echoed reasoning. Tokens per
  call are now a column in every eval table, and anything Phase 3 adds to the
  prompt is read against it. The cheaper food lane he parked stays parked.
- **Calories vs macros.** Which side to trust when they disagree is decided
  from the eval's per-item table in Phase 3, not assumed; the likely answer
  is "the model reconciles, the app flags, drinks and alcohol trust kcal".
- **History must not feed on itself.** The anchor only reaches the model for
  foods logged on three different days with a stable number and no change of
  quantity in the new message.
- **Build order for the card.** The inline food card in the chat page is
  extracted into its own component first (`components/intake/food-card.tsx`),
  because Lane C restyles that page and Lane B adds to it; Devices rows go
  into `app/(tabs)/settings/page.tsx`, notification rows into
  `app/(tabs)/settings/notifications/page.tsx`.
- **Phase 4.** Filter Pitaya's own sessions by the watch's exact bundle id
  (a prefix would have hidden the simulator smoke's own seeded workout);
  the HealthKit id handshake is the primary duplicate key and the time rule
  the backstop; import the whole history once behind a flag like the
  activity import; honour deletions; show "pair again" on the wrist instead
  of "offline"; label Apple Health rows in the activity detail (today any
  unknown source reads "LOGGED VIA CHAT"); document that weekly burned kcal
  and the daily activity kcal already overlap and are never summed; keep the
  sync-route change small — Lane A's audit also touches that route
  (no `items[]` cap).
- **Phase 5.** The `.p8` key pasted into Vercel needs its newlines restored
  before it can sign; a real signing test joins the mocked-transport tests.
- **Phase 6.** The weekly nudge moves to his weigh-in hours (Saturday late
  morning, Monday catch-up) with a once-a-week key that survives the Monday,
  and "composition" is a named column set that excludes BMI.

**Baseline evidence (Phase 2, 2026-10-17 — 117 chat calls, $4.10; full tables
in `docs/food-accuracy.md`).** Accuracy is already high where the model knows
the food: kcal in band 92.4 % overall, 100 % for gym food, measured quantities
and mixed plates; twins phrased two ways differ by 2.2 % (median). The misses
are all Colombian composites, all high (+19 % median bias; sancocho and ajiaco
+43 %), plus one card that listed a bandeja paisa twice. Labels read exactly
(12/12), photo probes invented nothing, corrections worked where the check was
fair. Two things the plan did not predict: **(1) D2 is moot on today's
model** — of 135 items only four under-20-kcal items (black coffee, a spoon of
ají) "disagree" with their macros; the check becomes a flag with a 30 kcal
floor and nothing is rewritten; **(2) 95.5 % of plain food logs first read
`today_summary`**, so every log is two model requests and 15k input tokens on
a fresh chat — a prompt rule ("no read before a plain log") is the largest
cost and latency lever found, and Phase 3 measures it.
