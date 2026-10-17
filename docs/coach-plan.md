# The Coach — a weekly review agent with evidence, actions and a budget

*Lane B plan, 2026-10-17 (Phase 1: discovery + plan). Branch
`claude/coach-weekly-review`. Nothing in this document is code yet; Phases
2–5 build what it describes, in order, one commit each.*

Michael's brief, verbatim where it matters: *"One weekly review agent, built
to the bar of a real AI staffer. Every Sunday evening and on demand it reads
the week … and writes a grounded review: what happened, what it means, three
concrete moves for next week."* Rules: evidence-bound, persistent sessions,
artifacts with provenance, execute buttons that never write silently, metered
and capped, an On/Off switch, a Test button, reuse the existing plumbing, and
wire or retire the dead intakes (water, daily_activity, journal).

---

## 0. What Michael will see on Sunday (plain English)

Sunday around 7 pm a notification arrives: **"The Coach · week of Oct 12 —
Volume up, protein slipped."** Tapping it opens **Today → The Coach** (the old
"Weekly game plan" page, replaced).

The screen is numbers first, not an essay:

1. **A raspberry hero card**: the one-line verdict, and three big numbers —
   sessions trained vs planned, average intake vs target, weight change — each
   with a small grey chip like `workouts · 6 rows` that opens the exact rows
   the number came from.
2. **"What happened"**: six compact tiles — Training, Records, Intake,
   Protein, Body, Recovery — each a hero number, a one-line delta against last
   week, and a provenance chip. A tile for something that has no data this
   week says so flatly ("no step data this week") instead of guessing.
3. **"What it means"**: at most three short sentences, every number in them
   wearing a citation chip `[f12]`. If the model wrote a number the facts do
   not contain, that sentence carries an amber **unverified** chip — the app
   checks the model, not the other way round.
4. **"Three moves for next week"**: three action cards. Each says what it
   will write *before* it writes it — the planned days with their routine and
   date, the new macro targets beside the current ones, the reminder text and
   time, the measurement row with the field for him to fill. Nothing persists
   until he taps **Confirm**. A confirmed move shows "Done · Sun 7:42 pm" on
   the card and is logged on the review.
5. **A provenance strip** at the bottom: `gpt-5.6-sol · 6.1k in / 1.4k out ·
   $0.07 · 9.3 s · Sun Oct 18 7:01 pm · cron`.
6. **"Talk to this review"** opens the ordinary Chat on a conversation named
   "Coach · week of Oct 12" that already holds the review as its first
   message. "Why do you say my protein slipped?" is answered from the same
   facts (they ride along as hidden context on every turn of that chat).
7. **Past reviews**: a list — week, verdict, cost — any one reopens exactly
   as it was written. Reviews never rewrite themselves.

In **Settings → Coach**: an On/Off switch, the monthly budget (default $3),
the model (sol / terra / luna with per-call price hints), this month's spend
as a bar against the budget, **Run now** and **Test**. Test runs the entire
pipeline on a made-up week of synthetic data and shows the result marked
**TEST** — it never reads his logs, never creates a chat, never notifies.

---

## 1. Discovery — what exists, what is dead, what the data looks like

### 1.1 Plumbing that will be reused (nothing parallel is built)

| Need | Existing piece | How the Coach uses it |
|---|---|---|
| Model registry | `lib/openai.ts` — `CHAT_MODEL` (terra), `COACH_MODEL` (sol), luna by env | The review calls `COACH_MODEL` by default; the picker chooses a **tier key**. One additive export (`MODEL_TIERS`) so no route ever holds a model id |
| Text generation | `lib/openai-text.ts` `generateChatText()` — chat.completions, retries on `length`, records usage | The review generator calls it with `surface: "coach"` |
| Metering | `lib/ai-usage.ts` `recordAIUsage`, `estimateChatCostUsd`, `getAISpend` | Cost on every review row; a new additive helper sums month-to-date spend for one surface |
| Conversations | `ChatConversation` / `ChatMessage`, `lib/chat-conversations.ts` | One conversation per live review, title `Coach · week of …`, `titleSource: "user"` so the AI namer leaves it alone |
| Agentic chat | `app/api/ai/chat/stream/route.ts` + `get_app_data` over `lib/ai/data-registry.ts` | "Talk to this review" is the ordinary chat on the review's conversation; the route gets one small hook that appends the review's facts to `instructions` when the conversation belongs to a review |
| Week definition | `lib/weekly-report.ts` + `lib/timezone.ts` `getWeekStartDateString` | Same Mon–Sun week in `getUserTimeZone()` (America/Bogota today) |
| Targets | `lib/health-coach.ts` `getCoachTargets()` | Calorie/protein/carbs/fat gram targets and `plannedWorkoutDays` |
| Planner | `lib/planner.ts` `planWeek`/`getTrainingWeek`, `POST /api/health/planner {days, replaceWeek}` | The "plan next week" move is exactly the chat's `plan_week` proposal payload, confirmed through the same endpoint |
| Macro targets | `MacroTargetsSheet` → `saveSettingsToServer()` → `PUT /api/settings` | The "adjust targets" move saves the same way the sheet does |
| Reminders | `POST /api/reminders {title, body, remindAt, url}` | The "set a reminder" move |
| Measurements | `POST /api/health/body` (every measured column, `source: "manual"`, `fieldSources`) | The "log a measurement" move — a card with the field for him to type |
| Notifications | `lib/notify.ts` (`notify()`, dedupe, quiet hours, log) + `lib/notification-prefs.ts` + Settings → Notifications `SENDERS` | New category `coachReview` with its own switch |
| Activity | `lib/activity-reports.ts` `loadActivityRows()` → `mergeActivitySources` (Shortcut rows, iPhone-app snapshots as fallback) | Steps / active kcal / km for the week; honest when empty |
| Body | `lib/body-summary.ts` `metricValue()`; `body_measurements` rows with `fieldSources` | Weight and composition trend; the provenance chip names the source per value |
| Records | `personal_records` (`@@unique([exercise, kind])`, `previousValue`, `achievedAt`) | "PRs this week" = current bests achieved inside the week, with what they beat |
| Trails | `trails` + `workout_logs.trailId`; `lib/trails.ts` `runProfileMatchesTrail` | Named-trail runs this week vs that trail's previous run |
| Routines | `sequences`, `lib/progression-db.ts` `buildProgressionSuggestions()` | Routine names the planner can resolve; progression "raise earned / deload due" as a fact |
| Confirm-dock shape | `components/voice-input.tsx`, chat proposal cards | Every Coach action is a card → Confirm → existing endpoint → recorded |
| Cron auth | `/api/cron/*` self-verify `Bearer CRON_SECRET`; allowlisted in `proxy.ts` | New `/api/cron/coach-weekly` needs no proxy change |
| Card language | `app/(tabs)/health/report/page.tsx`, `app/(tabs)/health/activity/page.tsx` | Hero card, white hairline cards, micro-labels, `Stat` tiles — reproduced with token classes |

### 1.2 The surface being replaced

`app/(tabs)/health/coach/page.tsx` ("Performance coach · Weekly game plan")
is a pre-Pitaya page: graphite/teal/amber, lucide icons, `cockpit-card`
styling, a hydration hero stat over a table with zero rows, rule-based
"focus areas" and an **Apply tasks to todos** button posting to
`/api/health/coach`. Its API (`GET`/`POST /api/health/coach`) has no other
consumer (`components/ai-meal-suggestion.tsx` only links to the page path,
which survives). Both are replaced. `lib/health-coach.ts` stays — the daily
brief, suggest and trends-insights routes import it.

### 1.3 The dead intakes — why each is dead, and what the Coach does

Prod counts as of the 2026-10-17 copy: `water_logs` 0, `daily_activity` 0,
`journal_entries` 0.

**Water.** Fully wired and never used: `/health/water` (a lucide/shadcn
page), `components/water-tracker.tsx`, `POST /api/health/water` (single or
`{glasses:n}`), the chat tool `log_water`, the MCP tool `log_water`, the dock.
Not broken — simply not a habit he logs. The old coach page made hydration a
hero stat regardless, which is exactly the "invented facts" failure the brief
forbids. **Coach behaviour:** a hydration fact exists only when `water_logs`
has rows in the week; with none, no section, no mention. **Recommendation
(Decision D10):** keep the intake (it costs nothing, the MCP tool is one
sentence away), hide the Coach section when empty, file a followup for Lane C
to de-emphasise `/health/water` in the IA.

**daily_activity.** Not dead — brand new. The Shortcut route
(`POST /api/health/daily`) shipped 2026-10-17 morning and the iPhone app's
own background push (`POST /api/mobile/health/activity`) the same evening;
neither has delivered a row to prod yet because the new build is not
installed. The companion's older `daily_health_snapshots` carries steps for
some days. **Coach behaviour:** read merged rows through `loadActivityRows()`
(Shortcut first, snapshots as fallback — the same rows the Activity screen
shows), average only the days that arrived, and say "no step data this week"
when nothing did. The activity "day" is a calendar string, so the Central-time
convention of those tables (`ACTIVITY_TIME_ZONE`) joins the Bogotá week by
date with no conversion.

**Journal.** `journal_entries` is written by Today's "Tonight's page" sheet
(text + voice memo via `/api/health/journal`; ticks the `journal` habit) and
read by Today and the AI registry (`journal` dataset). The Journal tab itself
is the "coming soon" screen — the full archive is design-blocked
(deferred-items 2026-08-12). Zero rows means he has not used the sheet.
**Coach behaviour:** when the week has pages, the facts carry up to three
short excerpts (his own words, in his own app) and the model may quote them;
when it has none, one flat fact ("no journal pages this week") that the
prompt tells the model not to turn into a scolding. **Recommendation
(Decision D11):** keep, because the Journal tab is in the design IA.

### 1.4 Data coverage in the prod copy (aggregate, no values)

Read-only `psql` against `pitaya_lane_b` to size the honest-when-empty
paths. What follows is table coverage — which weeks and fields have rows —
never a health value.

- **Workouts**: present every week of the last 8; types freestyle, walk,
  hike, jump_rope, strength. A handful of trail-linked sessions and one
  routine (`sequenceId`) run in the window — trail and progression facts will
  be present some weeks and absent others.
- **Food**: logged on only some days of most weeks — `loggedDays` is the
  honesty anchor every intake fact must carry.
- **Records**: new records land in roughly half the weeks.
- **Body**: weigh-ins most weeks (Apple Health / RENPHO); composition fields
  present on some rows only, so "fat % this week" is often null and must say so.
- **Recovery** (`daily_health_snapshots`): 60 days; sleep is present on only
  a few of them, HRV on about half, resting HR on a third. Sleep will usually
  read "1 night of 7" or "none" — the review must state the day count beside
  every recovery average.
- **Planned workouts**: 0 rows — "against the plan" has nothing to compare to
  until he plans a week; the fact says "no plan was set", and the first
  Coach move will usually be to plan one.
- **Weekly reports**: 10 weeks (2026-08-03 → 2026-10-05) — the Sunday Report
  is left exactly as it is; the Coach links to it.
- **AI usage**: 361 events; `weekly_report` (sol) averages about one cent a
  call. The Coach's review will cost a few cents (sol, ~6k in / ~1.5k out ≈
  $0.07); the default $3 budget is roughly 40 reviews.
- **Settings**: `timeZone` America/Bogota; `notificationPrefs.timeZone`
  America/Chicago (the device's — quiet hours follow it); `workoutGoals.
  daysPerWeek` set; no `coach` key yet.
- **Push**: `push_subscriptions` is still empty on prod (2026-10-05
  finding) — the Coach notification is logged either way and lands when he
  subscribes a device; the review itself does not depend on it.

### 1.5 Findings filed, not fixed (docs/followups.md)

- The Sunday Report cron is listed twice in `vercel.json` (`0 14 * * 0`
  and `0 4 * * 1`). The Sunday-morning run generates the **current,
  partial** week and sends the "Weekly report ready" push with that partial
  headline; the night run rewrites the report but its push is deduped. Owner:
  main lane.

---

## 2. Architecture

```
                 ┌──────────────┐    pure, tested, injectable
  Postgres ──►   │ CoachSource  │──► lib/coach/facts.ts ──► WeekFacts {facts[], groups}
  (or fixture)   └──────────────┘                              │
                                                               ▼
                               lib/coach/review.ts  ── prompt(facts only) ──► COACH_MODEL
                                                               │  JSON review citing [fNN]
                                                               ▼
                               lib/coach/checks.ts  ── numbers ⊂ facts? citations? no medical framing?
                                                               │  flags / one retry
                                                               ▼
                               coach_reviews row (facts, review, checks, model, tokens, $, ms)
                                   │                    │                     │
                                   ▼                    ▼                     ▼
                           ChatConversation      notify("coachReview")   Coach screen
                           first msg = review    deep link ?review=id    tiles · chips · moves
                                   │                                          │
                                   ▼                                          ▼
                     /api/ai/chat/stream (+facts in instructions)   Confirm → existing endpoint
                                                                     → PATCH review.actionsJson
```

### 2.1 The facts layer — `lib/coach/facts.ts` (pure)

`buildWeekFacts(input: WeekInput): WeekFacts` takes **rows**, never a Prisma
client. `WeekInput` is produced by a `CoachSource`:

```ts
interface CoachSource {
  settings(): Promise<unknown>;                              // user_settings.data
  foodLogs(range): Promise<FoodRow[]>;                       // food_logs, this week + previous
  workouts(range): Promise<WorkoutRow[]>;                    // workout_logs (+ trail, sequence names)
  records(range): Promise<RecordRow[]>;                      // personal_records achievedAt in week
  bodyMeasurements(range28d): Promise<BodyRow[]>;            // body_measurements (4 weeks for trend)
  snapshots(range): Promise<SnapshotRow[]>;                  // daily_health_snapshots (sleep/HRV/RHR)
  activityRows(range): Promise<ActivityRow[]>;               // loadActivityRows() merged
  plannedWorkouts(weekStart): Promise<PlanRow[]>;            // planned_workouts this week + next
  sequences(): Promise<{id,name,kind}[]>;                    // for planner name resolution
  trails(): Promise<TrailPayload[]>;                         // listTrails()
  waterLogs(range): Promise<WaterRow[]>;
  journalEntries(range): Promise<JournalRow[]>;
  progression(): Promise<ProgressionSuggestion[]>;           // buildProgressionSuggestions()
}
```

Two implementations: `lib/coach/source-prisma.ts` (the real one, thin
selects only) and `lib/coach/fixture-week.ts` (synthetic; re-exported from
`tests/fixtures/coach-week.ts`). Test mode and the unit tests use the fixture;
nothing in the fixture resembles his data.

**A fact** is the unit of evidence:

```ts
interface Fact {
  id: string;            // "f12" — what the model cites
  key: string;           // "training.sessions" — what tests and tiles address
  group: FactGroup;      // training | records | trails | intake | hydration | body | recovery | activity | plan | journal | compare
  label: string;         // "Sessions trained"
  value: number | string | null;
  unit?: string;         // "sessions" | "kg" | "kcal" | "g" | "%" | "min" | "bpm" | "steps" | "km"
  source: {
    table: string;       // "workout_logs"
    field?: string;      // "caloriesBurned"
    ids?: string[];      // up to 50 row ids
    dates?: string[];    // local days the value covers
    count?: number;      // rows behind an aggregate
    note?: string;       // "training burn only — no BMR model"
    fieldSource?: string // body rows: renpho_report | apple_health | manual …
  };
  /** derived from other facts — their ids, so a delta cites both sides */
  derivedFrom?: string[];
}
```

Every number the model is allowed to say is a fact, **including derived
ones**: deltas vs the previous week, percentages of target, averages, and
"days with data" counts are facts with `derivedFrom`. That is what makes the
post-check strict: a number in the prose either matches a fact value or is
flagged.

What the facts cover (group → facts; each says "none" honestly):

| Group | Facts | Source | Honest-when-empty |
|---|---|---|---|
| training | sessions, planned days, planned done/skipped, volume kg (`sessionVolumeKg`), active minutes, training kcal, jump-rope seconds, sessions by type, per-session list (date, type, minutes, kcal, trail/routine) | `workout_logs`, `planned_workouts` | 0 sessions is a fact; "no plan set" is a fact (not 0 of 0) |
| records | each record achieved in the week: exercise, kind, value, previous, date | `personal_records` | "no new records" |
| trails | each named-trail run: trail, minutes, km, gain, vs the trail's previous run (both ids) | `workout_logs.trailId` + `trails` | omitted group when no linked runs |
| intake | logged days, avg kcal on logged days, target, avg deficit, week deficit, avg protein/carbs/fat g, targets, protein days hit, per-day kcal list | `food_logs`, `user_settings` | `loggedDays = 0` → averages null, one fact "no food logged" |
| hydration | avg ml per logged day, days logged | `water_logs` | **group omitted** (D10) |
| body | first/last weight in week (+ids, fieldSource), delta, 4-week slope kg/week, latest fat %, latest skeletal muscle kg, days since last weigh-in | `body_measurements` | "no weigh-in this week"; composition facts only when present |
| recovery | sleep avg h + nights with data, HRV avg + days, resting HR avg + days, each vs previous week | `daily_health_snapshots` | each metric states its day count; a metric with 0 days is a single "none" fact |
| activity | steps avg + days arrived, active kcal avg, km avg, 10k days, vs previous week | `loadActivityRows()` | "no step data this week" |
| plan | next week's rows already planned; progression suggestions (raise earned / deload due) | `planned_workouts`, `lib/progression-db.ts` | "nothing planned yet" |
| journal | pages written (count), up to 3 excerpts ≤ 160 chars | `journal_entries` | "no journal pages this week" |
| compare | previous-week counterparts for sessions, volume, avg kcal, protein, weight — the deltas | same tables, prior Mon–Sun | null when either side is empty |

Pure helpers reused: `sessionVolumeKg`, `jumpSecondsOf`, `metricValue`,
`getCoachTargets`, `mergeActivitySources`, `buildWeeklyReport` (activity),
`getDateStringInTimeZone`/`getWeekStartDateString`/`addDaysToDateString`.
`isoWeekNumber` in `lib/weekly-report.ts` becomes an export (additive).

### 2.2 Review generation — `lib/coach/review.ts`

`generateReview({facts, tier, generate = generateChatText})` sends:

- **system**: the Coach's voice and rules — evidence-bound ("use ONLY the
  facts; every number you write must be a fact value and must be followed by
  its id like [f12]; if a fact is null or absent, say so in plain words and
  move on; never estimate"), no medical claims ("no diagnosis, no disease
  names, no supplement or medication advice, no 'you are at risk of'; you
  describe training, intake, body and recovery numbers and what to do next
  week"), no nagging about optional intakes (water, journal, steps: state
  absence once, flat), the format contract, length ceilings (headline ≤ 8
  words; `whatHappened` ≤ 6 items ≤ 18 words each; `whatItMeans` ≤ 3 items
  ≤ 28 words each; exactly 3 moves, each `title` ≤ 8 words, `why` ≤ 25
  words), and the action menu with payload schemas.
- **user**: `JSON.stringify(facts)` plus the targets and the next week's
  dates (so a plan proposal lands on real dates).

Output is JSON:

```ts
interface ReviewJson {
  headline: string;
  whatHappened: Array<{ text: string; cites: string[] }>;
  whatItMeans:  Array<{ text: string; cites: string[] }>;
  moves: Array<{
    title: string; why: string; cites: string[];
    action:
      | { kind: "plan_week"; days: PlannedDayInput[]; replaceWeek: boolean }
      | { kind: "adjust_targets"; calorieTarget?: number; proteinPct?: number; carbsPct?: number; fatPct?: number }
      | { kind: "set_reminder"; title: string; atLocal: string }        // "YYYY-MM-DDTHH:mm"
      | { kind: "log_measurement"; fields: string[]; when?: string }  // he types the value
      | { kind: "none" };
  }>;
}
```

`generateChatText` is used with `model = MODEL_TIERS[tier]`,
`reasoningEffort: "low"` (the Sunday Report's setting; D14),
`maxCompletionTokens: 2400`, retry 3400, `surface: "coach"`. Token counts and
`estimateChatCostUsd` go on the row; `recordAIUsage` fires as it does for every
other call.

### 2.3 The post-check — `lib/coach/checks.ts` (pure)

1. **Numbers ⊂ facts.** Every numeric token in every `text`/`why`/`title`
   (handles `1,850`, `82.4`, `12%`, `3×`, `2h 10m`) is normalised and matched
   against the set of fact values (integers exact after rounding; decimals
   within 1 % or 0.05). Allowed without a fact: digits inside `[fNN]`, dates
   that appear in any fact's `dates`, and bare 1–3 **not followed by a unit**
   (so "three moves", "two of the sessions" pass; "2 kg" does not). Anything
   else marks the item `unverified: true` with the offending token.
2. **Citations.** An item containing a number but citing no fact id is
   flagged `uncited`. Every cited id must exist.
3. **Medical framing lint.** A small list of forbidden framings (diagnos-,
   disease names, deficiency, syndrome, "you have", "at risk of", "treat",
   medication, supplement dosing, "consult"/"see a doctor" as advice given
   with a claim). A hit removes the item and counts it.
4. **Actions.** Each move's action is validated: `plan_week` dates inside next
   week, titles non-empty, `routineName`/`trailName` must appear in the facts'
   routine/trail lists (else the name is dropped and the move notes "routine
   not found"); `adjust_targets` percentages sum to 100 and `calorieTarget`
   within ±25 % of the current target (guardrail — a coach does not slash
   intake by 40 % in one move); `set_reminder` time within the next 8 days;
   `log_measurement` fields ⊂ `MEASURED_FIELDS`. Invalid → `kind: "none"` with
   the reason kept on the move.
5. **One retry.** If more than two items are `unverified`/`uncited` or any
   medical hit occurred, the generator re-asks once with the violations
   appended ("these numbers are not in the facts: …"). After the retry the
   flags stay and are rendered — the UI shows the amber chip; nothing is
   silently fixed.

All of this is unit-tested on canned reviews (good, numbers invented, missing
cites, medical phrasing, bad plan dates).

### 2.4 Storage — `coach_reviews`

New table (D3). Additive migration `prisma/migrations/20261018120000_coach_reviews/migration.sql`,
applied with `prisma migrate deploy`.

```prisma
model CoachReview {
  id             String   @id @default(uuid())
  weekStart      String                      // Mon YYYY-MM-DD (user-local)
  weekEnd        String
  /// Which copy of the week this is: "live" (one per week, enforced by the
  /// unique below), "superseded:<iso>" (a live review replaced by a manual
  /// re-run — kept whole, with its chat and actions), "test:<iso>" (fixture run)
  slot           String   @default("live")
  status         String                      // generating | ready | failed | blocked_budget
  trigger        String                      // cron | manual | test
  isTest         Boolean  @default(false)
  modelTier      String                      // sol | terra | luna
  model          String                      // the resolved model id, for the record
  factsJson      Json
  reviewJson     Json?
  markdown       String?                     // plain rendering: chat seed, export
  checksJson     Json?                       // unverified/uncited/medical/action flags, retry count
  inputTokens    Int      @default(0)
  outputTokens   Int      @default(0)
  costUsd        Decimal  @default(0) @db.Decimal(10, 6)
  durationMs     Int      @default(0)
  error          String?
  actionsJson    Json     @default("[]")      // [{index, kind, payload, confirmedAt, result}]
  conversationId String?  @unique
  conversation   ChatConversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  generatedAt    DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([weekStart, slot])
  @@index([generatedAt])
  @@map("coach_reviews")
}
```

`ChatConversation` gains the virtual back-relation `coachReview CoachReview?`
(no column). Idempotency: the cron inserts the `live` slot and a second run
hits the unique and stops. A manual **Run again** first moves the current live
row to `superseded:<iso>` and then inserts a new live row — the old review,
its chat and its actions stay readable under "Past reviews".

**Coach settings** live in `user_settings.data.coach`
(`{enabled, monthlyBudgetUsd, modelTier}`; defaults `true, 3, "sol"`), read by
`lib/coach/settings.ts` and written by `PUT /api/health/coach/settings`, which
merges. `"coach"` joins `SERVER_OWNED_KEYS` in `app/api/settings/route.ts`
(one line) so a stale client copy of the settings cannot flip the switch.

**Registry:** one `table` entry `coach_reviews` in `lib/ai/data-registry.ts`
(fields `weekStart, weekEnd, status, markdown, modelTier, costUsd,
generatedAt`; `factsJson`/`reviewJson` excluded) so the chat and MCP
`query_data` can read past reviews — "whatever I enable in our app, the AI is
able to interpret."

### 2.5 Persistent sessions — talk to a review

A live review owns a `ChatConversation` created at generation
(`title: "Coach · week of Oct 12"`, `titleSource: "user"`). Its first message
is an **assistant** row holding the review's markdown, so the thread reads as
the Coach having spoken first.

"Talk to this review" navigates to **`/chat?c=<conversationId>`**. The chat
page gains a ~15-line deep link: when `?c=` is present the initial load opens
that conversation instead of the gap-rule default (D5). No second chat UI is
built — the full Chat (voice, photos, proposal cards, the dock) is the
session.

In `app/api/ai/chat/stream/route.ts`, after `instructions` is composed, one
hook: `const coach = await coachChatContext(conversation.id)` (one indexed
lookup on `coach_reviews.conversationId`); when non-null, the facts digest and
the review are appended under `COACH REVIEW CONTEXT` with the same
evidence-bound rules, and the turn is metered as `surface: "coach-chat"`
(so Settings → Coach can show what the conversations cost). Everything else
about that chat — tools, proposals, the model (`CHAT_MODEL`, terra) — is
unchanged (D8).

### 2.6 Execute buttons = proposals

Each move renders as a card in the same confirm-first shape as the dock's
proposal cards, showing exactly what will be written:

| Action | Card shows | Confirm writes through | Record |
|---|---|---|---|
| `plan_week` | each day: weekday · title · routine/trail · target kg; "replaces this week's planned days" when `replaceWeek` | `POST /api/health/planner {days, replaceWeek}` (the chat's `plan_week` payload, verbatim) | `{kind, payload, result: {created, remindersCreated}}` |
| `adjust_targets` | current → proposed for kcal and each macro (grams and %), with the fact chips that justify it | `saveSettingsToServer({calorieTarget, proteinPct, carbsPct, fatPct})` — the `MacroTargetsSheet` path, `PUT /api/settings` | before/after |
| `set_reminder` | title · local day and time | `POST /api/reminders {title, body, remindAt, url: "/health/coach"}` | reminder id |
| `log_measurement` | the row to be written with an input per requested field (he types the value; nothing proposed by the model) | `POST /api/health/body` | measurement id |
| `none` | the move as text, "nothing to write" | — | — |

After the endpoint returns OK the client calls
`PATCH /api/health/coach/reviews/[id] {action: {index, kind, payload, result}}`,
which appends to `actionsJson`; the card flips to "Done · time". Test reviews
render the cards disabled ("Test review — actions are off"). Nothing is ever
written without the tap; the endpoints keep their own validation.

### 2.7 Metering, budget, switch, Test

- Every model call carries `surface: "coach"` (review) or `"coach-chat"`
  (follow-up chat). The review row stores tokens, cost, duration, model,
  trigger.
- `getSurfaceSpendMonthToDate(surfaces, timeZone)` in `lib/ai-usage.ts`
  sums `ai_usage_events.costUsd` since the first of the calendar month in the
  user's timezone (additive helper beside `getAISpend`).
- **Budget** (default $3, D7): checked before generation (cron, manual and
  test — test runs cost real money). Exceeded → no model call; the cron
  writes a `blocked_budget` row once per week and notifies once ("Coach
  paused — $3 monthly budget reached; raise it in Settings → Coach"). The
  manual button says the same inline. Follow-up chat is counted, not blocked.
- **On/Off**: off → the cron returns `{skipped: "coach off"}`, no row, no
  notification; the screen still shows past reviews; Settings explains.
- **Model picker**: `sol | terra | luna` tier keys → `MODEL_TIERS` in
  `lib/openai.ts`; the Settings card shows each tier's price per 1M tokens
  from `lib/ai-usage.ts` and the estimated cost of one review.
- **Test**: `POST /api/health/coach/run {mode: "test"}` runs the whole
  pipeline with `fixtureSource()` as the `CoachSource`, writes a
  `coach_reviews` row with `isTest: true`, `slot: "test:<iso>"`, **no**
  conversation, **no** notification, actions disabled; real metering. The
  proof is a unit test that mocks `@/lib/prisma` with throwing delegates for
  every data table and asserts a test run completes touching only
  `coachReview.create` and `aIUsageEvent.create` (`lib/coach/run.ts` takes
  `{source, generate, now}` injections for exactly this).

### 2.8 Schedule and notification

- `vercel.json`: `{"path": "/api/cron/coach-weekly", "schedule": "0 0 * * 1"}`
  — Monday 00:00 UTC = **Sunday 19:00** in Bogotá (UTC−5, no DST) and in
  Houston until DST ends (then 18:00). A second entry `"0 12 * * 1"` (Monday
  07:00 Bogotá) is the catch-up: idempotent, so a missed Sunday heals and a
  normal week is a no-op (D2).
- `GET /api/cron/coach-weekly`: verifies `CRON_SECRET`; reads coach settings;
  picks the week — the current Mon–Sun on Sunday, the week that just ended on
  Monday; skips if a `live` row exists; budget check; `runCoachReview({trigger:
  "cron"})`; `notify({category: "coachReview", title: "The Coach · week of …",
  body: headline, url: "/health/coach?review=<id>", tag, dedupeKey:
  "coach-review:<weekStart>"})`. Quiet hours are respected by `notify()` as
  for every category. `maxDuration = 60`.
- New category `coachReview` → `lib/notify.ts` union + gate,
  `lib/notification-prefs.ts` `CategoryPrefs`/`CATEGORY_KEYS`/defaults, and
  one `SENDERS` entry in `app/(tabs)/settings/notifications/page.tsx`
  ("Coach review — Sunday evening, when the week's review is written").

---

## 3. API surface (all cookie-gated by `proxy.ts` unless noted)

| Route | Method | Purpose |
|---|---|---|
| `/api/health/coach` | GET | `{ latest, reviews: summaries[], settings, spend: {monthToDateUsd, budgetUsd, reviewsThisMonth} }` — replaces the old GET |
| `/api/health/coach/run` | POST `{mode: "manual" \| "test", week?}` | Runs the pipeline now; returns `{review}`; 409 on budget, 423 when off (manual only) |
| `/api/health/coach/reviews/[id]` | GET | Full review: facts, review, checks, actions, conversation summary |
| `/api/health/coach/reviews/[id]` | PATCH `{action}` | Appends a confirmed action |
| `/api/health/coach/settings` | GET / PUT | `{enabled, monthlyBudgetUsd, modelTier}` (merging write) |
| `/api/cron/coach-weekly` | GET, `Bearer CRON_SECRET` | The Sunday run (self-authenticating, already under the `/api/cron/` allowlist) |
| `/api/ai/chat/stream` | POST | unchanged contract; coach context hook + `coach-chat` surface |
| `/api/settings` | PUT | unchanged contract; `coach` added to `SERVER_OWNED_KEYS` |

Removed: the old `GET`/`POST /api/health/coach` handlers (rule tasks → todos).

---

## 4. UI (components/coach/*.tsx — self-contained, token classes, no hex, Pitaya icons only)

No design slice exists for the Coach (flagged in state.md per CLAUDE.md §5).
It is built from the Sunday Report's and the Activity screen's card language.
Michael's feel rule binds every surface: *dense and structured, numbers as the
hero, no paragraph over three sentences.*

**`/health/coach`** (`app/(tabs)/health/coach/page.tsx` → `<CoachScreen />`)

1. Header: back to Today · micro-label `WEEK 42 · OCT 12 – OCT 18` · title
   "The Coach" · older/newer week pills (same as the Sunday Report).
2. **Hero** (`bg-primary`, white type): `WRITTEN SUN OCT 18 · 7:01 PM`, the
   headline, three stats (sessions `6 / 4 planned`, intake `1,850 vs 2,000`,
   weight `−0.4 kg`) each with a `FactChip`.
3. **WHAT HAPPENED**: a 2-column grid of `MetricTile`s — Training, Records,
   Intake, Protein, Body, Recovery, Steps (hidden when the group is absent) —
   each: hero number, unit, one-line delta vs last week (`↑ 12% vs last
   week` in success/warning tone), `FactChip`.
4. **WHAT IT MEANS**: ≤ 3 lines, each ≤ 28 words, cites rendered as chips;
   an `unverified` item gets an amber chip and a dotted underline on the
   number.
5. **THREE MOVES**: `MoveCard` × 3 — title, one-line why with chips, the
   preview block (what will be written), `Confirm` (primary pill) / `Skip`
   (ghost). Confirmed → "Done · 7:42 pm".
6. **Provenance strip**: `gpt-5.6-sol · 6.1k / 1.4k tok · $0.07 · 9.3 s ·
   cron` and a `TEST` badge on test reviews. A failed run shows the error in
   one line and a `Run again`.
7. **Talk to this review** → `/chat?c=…` (message count shown). Hidden on
   test reviews.
8. **PAST REVIEWS**: rows — week range · headline · cost · `TEST`/`superseded`
   badges — tap opens.
9. Empty state (no review yet): one card "The Coach writes every Sunday
   evening. Run it now for last week?" with `Run now` and `Test`.

**`FactChip`** — grey pill `workouts · 6 rows`; tap → `SheetPortal` sheet:
label, value + unit, table, field, dates, the first ids (truncated), note,
field source. Pure text, no new icons.

**Today** (`app/(tabs)/dashboard/page.tsx`): one `<CoachRow />` above the
Sunday Report row, same row shape as `ActivityRow`: "The Coach · *headline*"
or "writes itself Sunday evening" · `Open →`. Two lines inserted.

**Settings → Coach** (`<CoachSettingsCard />`, inserted with one line above
the HR-zones card in `app/(tabs)/settings/page.tsx`): On/Off switch · budget
input (USD) · model segmented control with price hints · spend bar
(`$0.21 of $3 this month · 3 reviews`) · last run line · `Run now` · `Test`.

Screenshots (Phase 4, fixture data only): phone 390×844 light and dark,
desktop 1280×900 — the review, a fact sheet open, a move's confirm, Settings
→ Coach, the Today row.

---

## 5. Test strategy

- `tests/coach-facts.test.ts` — synthetic fixture week: every group present;
  an **empty week** (every fact honest-null, no hydration group, "no plan
  set"); a **partial week** (food on 2 days, one weigh-in, recovery on 3
  days — day counts correct); deltas vs previous week; trail comparison;
  ids/dates on every fact; derived facts cite their parents.
- `tests/coach-checks.test.ts` — number extraction and matching; the 1–3
  rule; uncited numbers; unknown ids; medical lint; action validation
  (dates, names, ±25 %, field allowlist).
- `tests/coach-review.test.ts` — the generator with an injected `generate`:
  parses JSON, retries once on violations, keeps flags, builds markdown;
  budget block path; model tier resolution never leaves `lib/openai.ts`.
- `tests/coach-run.test.ts` — **Test mode never touches real rows**: prisma
  mock whose data delegates throw; only `coachReview.create` and
  `aIUsageEvent.create` are reached. Live mode with the fixture source creates
  the conversation and the first message; cron idempotency on the unique.
- `tests/coach-chat-context.test.ts` — the stream hook returns null for an
  ordinary conversation and the digest for a review's.
- `tests/notifications.test.ts` — `coachReview` category present in prefs and
  gate.
- `tests/proxy.test.ts` — unchanged (the cron prefix already covers the route).
- Self-smoke on `:3102`: cron with the bearer (401 without), manual run,
  test run, the screen in Chromium, a confirmed move landing in
  `planned_workouts` (then deleted), the chat deep link, the Settings card.

---

## 6. Decisions (recorded, proceeding under the defaults)

| # | Decision | Default taken | Why |
|---|---|---|---|
| D1 | Week and timezone | Mon–Sun in `getUserTimeZone()` (settings `timeZone`, America/Bogota) via `getWeekStartDateString` — the Sunday Report's week | One definition of "the week" in the app; activity rows join by calendar date |
| D2 | Schedule | `0 0 * * 1` (Sun 19:00 Bogotá/Houston) + `0 12 * * 1` Monday catch-up; idempotent per week | "Every Sunday evening"; Hobby crons are ±59 min and once-a-day, a second entry heals a miss |
| D3 | Storage | New `coach_reviews`; `weekly_reports` untouched | Test runs must never land in the Sunday Report's table; the Coach's row carries provenance fields the report has no place for |
| D4 | One review per week | `live` slot unique; manual **Run again** supersedes (old row kept with its chat and actions) | "Re-reading never rewrites"; an explicit re-run is his choice and stays visible |
| D5 | Talk to a review | Deep link `/chat?c=<id>` into the existing Chat; facts injected into that chat's instructions; first message = the review | No parallel chat UI; proposals, voice and the dock come free; a second text panel would add to the "wall of text" |
| D6 | Test mode | Fixture source; `isTest` row; no conversation; no notification; actions disabled; **real** metering | "Without touching real rows" — but spend is real and must count |
| D7 | Budget | $3/month, calendar month in the user's timezone, surfaces `coach` + `coach-chat`; blocks review runs (cron, manual, test), never blocks chat | Blocking a chat mid-sentence is hostile; the review is the expensive, schedulable thing |
| D8 | Model picker scope | Governs the review model (default sol); follow-up chat stays on `CHAT_MODEL` (terra) | The stream route's model is app-wide; changing it per conversation is a bigger change than this lane should make |
| D9 | Action menu and guardrails | Four kinds + none; targets within ±25 %, plan dates inside next week, routine/trail names must exist; invalid → text-only move | A staffer proposes, within limits; the existing endpoints keep their own validation |
| D10 | Water | Keep the intake; Coach shows hydration only when rows exist; followup to Lane C to de-emphasise `/health/water` | Zero rows ever; the tool costs nothing to keep |
| D11 | Journal | Keep; quote ≤ 3 short excerpts when present; flat "no pages" fact otherwise, never a scolding | The Journal tab is in the design IA; a notification/review "is never a summons" |
| D12 | daily_activity | Read merged rows via `loadActivityRows()`; "no step data this week" when empty | Not dead — the iPhone app's push shipped today |
| D13 | Citation strictness | Every number must match a fact value; bare 1–3 without a unit allowed; flagged items shown with an amber chip, one retry, never silently dropped | "Every number cites the row it came from" made enforceable without making the prose unwritable |
| D14 | Reasoning | `reasoningEffort: "low"`, 2,400/3,400 token budgets | The Sunday Report's proven setting; cost stays at cents |
| D15 | Old coach API | Delete `GET`/`POST /api/health/coach` handlers (todo-task generator) | No other consumer; the page that used them is replaced |
| D16 | Notification | Category `coachReview`, default on, deep link to the review; quiet hours apply | Same contract as "Weekly report ready" |
| D17 | Records this week | Current bests whose `achievedAt` falls in the week, with `previousValue` | The table holds current bests only (`@@unique([exercise, kind])`); a record beaten twice in one week shows once |
| D18 | Chat deep link | `?c=<conversationId>` support added to `/chat` (~15 lines) | Needed for D5; the only touch outside `components/coach/*` and the stream hook |
| D19 | Registry | `coach_reviews` becomes a readable dataset (no facts/review JSON) | Chat and MCP can quote past reviews |
| D20 | Sunday Report | Untouched; the Coach links to it | Michael's call to keep it where it is |

---

## 7. Phases, files, verification

**Phase 2 — facts + storage.** `lib/coach/facts.ts`, `lib/coach/types.ts`,
`lib/coach/source.ts` (interface), `lib/coach/source-prisma.ts`,
`lib/coach/fixture-week.ts` (+ `tests/fixtures/coach-week.ts` re-export),
`prisma/schema.prisma` (`CoachReview`, back-relation),
`prisma/migrations/20261018120000_coach_reviews/migration.sql`,
`lib/weekly-report.ts` (export `isoWeekNumber`), `tests/coach-facts.test.ts`.
Verify: vitest, tsc, `prisma migrate deploy` on `pitaya_lane_b`, build.

**Phase 3 — generation, checks, metering, budget, switch, Test, cron,
notification.** `lib/coach/review.ts`, `lib/coach/checks.ts`,
`lib/coach/run.ts`, `lib/coach/settings.ts`, `lib/coach/chat-context.ts`,
`lib/openai.ts` (`MODEL_TIERS`), `lib/ai-usage.ts`
(`getSurfaceSpendMonthToDate`), `lib/notify.ts` + `lib/notification-prefs.ts`
(`coachReview`), `app/api/cron/coach-weekly/route.ts`,
`app/api/health/coach/{route,run/route,reviews/[id]/route,settings/route}.ts`,
`app/api/settings/route.ts` (`coach` server-owned),
`app/api/ai/chat/stream/route.ts` (hook + surface), `lib/ai/data-registry.ts`
(dataset), `vercel.json`, tests for each. Verify: tests incl. the
never-touches-real-rows proof; cron 401/200 on `:3102`; a manual run against
the prod copy (output not committed).

**Phase 4 — UI.** `components/coach/{coach-screen,fact-chip,metric-tile,
move-card,coach-row,coach-settings-card,review-list}.tsx`,
`app/(tabs)/health/coach/page.tsx` (replaced),
`app/(tabs)/dashboard/page.tsx` (two lines), `app/(tabs)/settings/page.tsx`
(one line), `app/(tabs)/settings/notifications/page.tsx` (one `SENDERS`
entry), `app/(tabs)/chat/page.tsx` (`?c=`), Playwright screenshot script in
`scripts/` writing to `docs/coach-screens/` (fixture data only).

**Phase 5 — real run, decisions executed, docs, PR.** Manual run on the
prod copy and a hand check of every number against SQL; `docs/state.md` top
entry (with the "no design slice" flag); `docs/followups.md`; draft PR.

---

## 8. Risks and how they are held

- **Model ignores the citation contract.** The post-check flags, retries
  once, and renders flags — the review is still useful and visibly honest.
  Tested on canned bad outputs.
- **A move proposes a routine that does not exist.** Name validation against
  the facts' routine list; the planner also resolves names case-insensitively
  and stores `sequenceId: null` when unknown.
- **Vercel 60 s ceiling.** One model call (~5–15 s) plus ~10 small queries;
  the generator has a 40 s soft deadline after which it writes a `failed` row
  with the reason rather than timing out silently.
- **Budget race (cron and manual at once).** Both check spend then write;
  worst case one review over budget by one call. Acceptable; noted in the
  Settings copy ("may exceed by one run").
- **Private data in the repo.** Fixture is synthetic; screenshots come from
  test runs; the real run's output is checked by hand and not committed.
- **Lane C restyle.** All UI in `components/coach/*` with token classes and
  no hex; three insertion points of one or two lines each.
