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

The review covers Monday to Saturday in full and Sunday up to the moment it
was written, and it says so at the top ("through Sunday 7:00 pm"). Averages
(intake, steps, sleep, heart data) use whole days only — Monday to Saturday
in both weeks — and Sunday so far is shown on its own line ("Sunday so far:
800 kcal"), so one Sunday lunch can never make the week's average look like
a starving day. Counts (sessions, records) run to 7 pm in both weeks, so
"fewer sessions than last week" is never an artifact of Sunday night not
having happened yet.

The screen is numbers first, not an essay:

1. **A raspberry hero card**: the one-line verdict, and three big numbers —
   sessions trained vs planned, average intake vs target, weight change — each
   with a small grey chip like `workouts · 6 rows` that opens the exact rows
   the number came from.
2. **"What happened"**: six compact tiles — Training, Records, Intake,
   Protein, Body, Recovery — each a hero number, a one-line delta against last
   week, and a provenance chip. A tile for something that has no data this
   week says so flatly ("no step data this week") instead of guessing.
3. **"What it means"**: at most three short sentences. Every number in them
   wears a chip naming where it came from; tap it and the rows appear. If the
   model wrote a number the facts do not contain, that sentence carries an
   amber **unverified** chip — the app checks the model, not the other way
   round.
4. **"Three moves for next week"**: three action cards. Each says what it
   will write *before* it writes it — the planned days with their routine and
   date, the new macro targets beside the current ones, the reminder text and
   time (in his timezone, named), the measurement row with the field for him
   to fill. Nothing persists until he taps **Confirm**. A confirmed move shows
   "Done · Sun 7:42 pm" on the card and is logged on the review.
5. **A footer line**: "Written automatically · Sun Oct 18, 7:01 pm · Sol (the
   thorough model) · 7¢ · 9 s" — and "Test review" or "Replaced by a re-run"
   when that is what it is.
6. **"Talk to this review"** opens the ordinary Chat on a conversation named
   "Coach · week of Oct 12" that starts with the review as its first message.
   The conversation is created the first time he taps — so it never becomes
   the chat he lands in by default on Sunday night. "Why do you say my
   protein slipped?" is answered from the same facts, which ride along as
   hidden context on every turn of that chat.
7. **Past reviews**: a list — week, verdict, cost — any one reopens exactly
   as it was written. Reviews never rewrite themselves.

In **Settings → Coach**: an On/Off switch, the monthly budget (default $3),
the model (Sol / Terra / Luna with what one review costs on each), this
month's spend as a bar against the budget (the reviews, and separately what
talking to them cost), a switch to let the Coach quote his journal (off until
he turns it on), **Run now** and **Test**. Test runs the entire pipeline on a
made-up week of synthetic data and shows the result marked **Test review** —
it never reads his logs, never creates a chat, never notifies, and still runs
when the budget is spent, because it is how he checks the thing works.

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

**Coverage (review rounds 1 and 2).** The facts are built through a
`cutoff` — `now` while the week is running, the end of its Sunday once it is
over — and the previous week is cut at the same weekday, hour, minute,
second and millisecond. Two rules then apply:

- **Counts of events** (sessions, training days, records, journal pages)
  run to the cutoff in both weeks.
- **Averages and the day counts behind them** (intake, protein days,
  hydration, sleep, HRV, resting HR, steps) use **whole days only**, in both
  weeks: on a Sunday-evening run, Monday to Saturday against Monday to
  Saturday. The partial day is shown on its own — `intake.partialDay.kcal`,
  `intake.partialDay.proteinG`, `activity.partialDay.steps`, labelled
  "Sunday so far (through 7:00 pm)" — and never averaged in. (Measured on
  the prod copy: 2 of 6 recent Sundays had food after 19:00, 17 % of Sunday
  calories; one 800 kcal lunch before the cutoff would have turned a +33
  kcal/day week into −171.)

A `week` group states it: `week.coverage` ("Monday to Saturday in full,
Sunday through 7:00 pm"), `week.fullDays`, `week.number`; a planned session
still ahead of the cutoff is `upcoming`, not `missed`.

**Honesty rule.** A COUNT of zero is a fact — "0 sessions" is the honest
statement. A SUM, AVERAGE or DELTA with no rows behind it is never minted:
no "Training burn 0 kcal" beside a session that recorded none, no delta
between two empty weeks, no "previous week" fact when the previous week has
no rows.

**The model's copy.** `factsForModel(facts)` keeps every fact and value but
drops provenance: row ids and dates, and the ids in the routine/trail lists
(notes carry no ids at all). That is 30–40 % fewer input tokens on a real
week (21 % on the synthetic week, whose ids are short) and no UUID ever
reaches the model — tested by asserting no fixture row id appears anywhere
in it. Journal excerpts are facts only when the Coach's journal switch is
on (default off); the page count always is.

What the facts cover (group → facts; each says "none" honestly):

| Group | Facts | Source | Honest-when-empty |
|---|---|---|---|
| week | ISO week number, whole days in the averages (`week.fullDays`), what the review covers (the cutoff, in words) | calendar | always present |
| training | sessions and **distinct days trained** (the weekly target counts days), planned sessions/days done/missed/upcoming, tonnage (`sessionVolumeKg`, cites only lifting rows), minutes, training kcal (each session rounded then summed, as the Sunday Report does), jump-rope minutes, sessions by type, per-session list | `workout_logs`, `planned_workouts` | `0 sessions` / `0 days` are facts; tonnage, minutes and burn are absent when no row carries them; "no plan was set" is a fact (never "0 of 0") |
| records | each record achieved in the week: exercise, kind, value, previous, date | `personal_records` | "no new records" |
| trails | each named-trail run: trail, minutes, km, gain, vs the trail's previous run — a second run in the same week is compared with that week's first; the pre-week run is asked for per trail | `workout_logs.trailId` + `trails` | omitted group when no linked runs |
| intake | whole days with food, avg kcal (rounded, over whole logged days), vs target, week vs target, avg protein/carbs/fat, protein vs target (unrounded average, capped at 100 — the Sunday Report's adherence), protein days hit, per-day kcal; **"Sunday so far"** kcal and protein | `food_logs`, `user_settings` | `0 days` + "no food logged"; no averages |
| hydration | days logged, total and per-day ml over whole days | `water_logs` | **group omitted** (D10) |
| body | days with a weigh-in, first/last weight (each day read by its FIRST reading, as `lib/body-summary.ts`), delta, 4-week slope, latest fat % and skeletal muscle (+ids, fieldSource) | `body_measurements` | "no weigh-in this week" + days since the last one, however old, counted to the cutoff |
| recovery | sleep/HRV/resting-HR averages over whole days + their day counts, each vs previous week; a day's duplicate rows merged **per field** in a fixed order (source, timezone, id), so a sleep-only row and an HRV row of the same day both count | `daily_health_snapshots` | each metric states its day count; a metric with 0 days is a single "none" fact; the partial day is left out (its sleep often arrives the next morning) |
| activity | steps avg over whole days that arrived, total, 10k days, best day, active kcal, km, vs previous week; **"Sunday so far"** steps | `loadActivityRows()` | "no step data this week" |
| plan | next week's planned sessions and days (a routine or trail named like the title is not repeated); progression suggestions | `planned_workouts`, `lib/progression-db.ts` | "nothing planned yet" |
| journal | pages written (count); up to 3 excerpts ≤ 160 chars **only when the journal switch is on** | `journal_entries` | "no journal pages this week" |
| compare | previous-week counterparts and their deltas | same tables, previous week cut like for like | **omitted** when either side has no rows |

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

Reworked in review round 3; the rule is **every number against the facts
its own sentence cites**.

1. **Cited evidence, with units.** A sentence's evidence is the facts it
   cites plus their `derivedFrom` parents. Every number in it must equal one
   of those values (integers exact or by rounding, decimals within 1 % or
   0.05, by absolute value so "down 0.3 kg" is −0.3) **in a compatible
   unit**: "6 days" does not pass a fact counted in sessions, "lb" never
   passes kilograms. A number equal to some *other* fact does not pass.
2. **Read like a person writes.** Number words that quantify something
   measured ("seven days", "a dozen sessions"), both ends of a range
   ("3–4 kg"), digits glued to letters ("x4321"). Fact ids and heart-rate
   zone names (`f12`, `Z2`) are names, not numbers; a digit 1–3 before a
   structural noun ("3 moves") is the review's own shape.
3. **Dates and times are their own tokens.** A month-name or ISO date
   passes only inside the window (the reviewed week, the one before, and the
   reminder horizon) or when a cited fact names it; a clock time only when a
   cited fact states it or the move's reminder sets it.
4. **A move's own evidence is its structured payload** — kcal, %, the grams
   those imply, target kg, the number of days planned, the reminder's date
   and time — never the free text of a title or note.
5. **The headline cites nothing, so it states no number.**
6. **Medical framing** is matched as phrases in context (a condition named,
   a diagnosis implied, a treatment, a dose, a supplement to take, "see a
   doctor") — "treat yourself", "a full dose of sleep", "supplement your
   walks" are coaching. A matching line is **removed visibly**: it stays in
   its slot, empty and marked, and its original words are kept in
   `checksJson.medicalRemoved`. A move is never dropped.
7. **Actions** are validated: plan dates inside next week, known
   routine/trail names, no planner reminders, **never "replace the week"**;
   calories within ±25 %, macros a complete set adding to 100 and each
   moving at most 10 points; reminders within the horizon; measurement
   fields from `MEASURED_FIELDS`, a suggested date only inside the review's
   weeks. Invalid → a text-only move with the reason kept.
8. **Recorded, not hidden.** An invalid verdict (shown as "mixed") and items
   beyond the section limits are flagged in `checksJson`.
9. **One retry** when more than two items are unverified/uncited, a cite is
   unknown, anything was removed, or fewer than three usable moves remain.

### 2.4 Storage — `coach_reviews`

New table (D3). Additive migration `prisma/migrations/20261017230000_coach_reviews/migration.sql`,
applied with `prisma migrate deploy`.

```prisma
model CoachReview {
  id             String   @id @default(uuid())
  weekStart      String                      // Mon YYYY-MM-DD (user-local)
  weekEnd        String
  kind           String   @default("live")   // live | superseded | test — one field (LOW 16)
  liveWeekStart  String?  @unique            // = weekStart on the live row only; null otherwise
  status         String                      // generating | ready | failed | blocked_budget
  trigger        String                      // cron | manual
  modelTier      String                      // sol | terra | luna
  model          String                      // the resolved model id, for the record
  factsJson      Json                        // the stored facts WITH ids/dates (the chips read them)
  reviewJson     Json?
  markdown       String?                     // plain rendering: chat seed, export
  checksJson     Json?                       // unverified/uncited/medical/action flags, retry count
  inputTokens    Int      @default(0)
  outputTokens   Int      @default(0)
  costUsd        Decimal  @default(0) @db.Decimal(10, 6)
  durationMs     Int      @default(0)
  error          String?
  actionsJson    Json     @default("[]")      // [{index, kind, payload, confirmedAt, result}]
  conversationId String?  @unique            // created lazily on the first "Talk to this review"
  conversation   ChatConversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  generatedAt    DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([weekStart, kind])
  @@index([generatedAt])
  @@map("coach_reviews")
}
```

`ChatConversation` gains the virtual back-relation `coachReview CoachReview?`
(no column). **One live review per week is a database fact** (MEDIUM 10):
`liveWeekStart` is unique and set only on the live row, so a second cron run
hits the unique and stops; superseded and test rows have it null. A manual
**Run again** supersedes inside one `$transaction` — the old row gets
`kind: "superseded"`, `liveWeekStart: null`; the new row takes the slot — so
the old review, its chat and its actions stay readable under "Past reviews"
and there is never a moment with two live rows or none. A `failed` row, or a
`generating` row older than the function ceiling, is what the Monday catch-up
is allowed to supersede; a `ready` live row never is.

**Coach settings** live in `user_settings.data.coach`
(`{enabled, monthlyBudgetUsd, modelTier, journalExcerpts}`; defaults `true,
3, "sol", false`), read by `lib/coach/settings.ts` and written **server-side
through Prisma** by `PUT /api/health/coach/settings` (read-merge-write of the
one key). `"coach"` joins `SERVER_OWNED_KEYS` in `app/api/settings/route.ts`,
whose PUT is a wholesale replace of the blob (MEDIUM 11): the route already
preserves server-owned keys from the stored row and discards the client's
copy of them, which is exactly what keeps a stale client from flipping the
switch.

**Registry:** one `table` entry `coach_reviews` in `lib/ai/data-registry.ts`
(fields `weekStart, weekEnd, status, markdown, modelTier, costUsd,
generatedAt`; `factsJson`/`reviewJson` excluded) so the chat and MCP
`query_data` can read past reviews — "whatever I enable in our app, the AI is
able to interpret."

### 2.5 Persistent sessions — talk to a review

A live review's `ChatConversation` is created **lazily, on the first "Talk to
this review" tap** (HIGH 3), not at generation: the chat tab opens on the
newest conversation by `lastMessageAt`, so a conversation minted Sunday 19:00
would have been the default thread until Monday morning — a food log typed
that night would have landed in "Coach · week of …", been given the coach
instructions and metered as coach-chat. The tap calls
`POST /api/health/coach/reviews/[id]/conversation`, which (in one
transaction) creates the conversation (`title: "Coach · week of Oct 12"`,
`titleSource: "user"` so the AI namer leaves it alone), writes the review's
markdown as its first **assistant** message, links it to the review, and
returns the id. A second tap finds the existing id.

"Talk to this review" then navigates to **`/chat?c=<conversationId>`**. The
chat page has no `useSearchParams` today and its initial load applies the
quiet-gap rule (`if (target && !pickedByHim.current && isStale(...))
applyConversation(null)` — a review opened Monday morning would silently start
a new chat, HIGH 2). The deep link therefore: reads `?c=` inside a `Suspense`
boundary (the pattern of `app/(tabs)/health/activity/page.tsx`), fetches that
conversation, and sets `pickedByHim.current = true` before applying it, so the
gap rule leaves it alone. One insertion, kept small because Lane D edits the
same file (MEDIUM 13). No second chat UI is built — the full Chat (voice,
photos, proposal cards, the dock) is the session.

In `app/api/ai/chat/stream/route.ts`, the coach lookup joins the existing
`Promise.all` of settings/conversation/history (one indexed query on
`coach_reviews.conversationId`); when it finds a review, the facts digest and
the review are appended to `instructions` under `COACH REVIEW CONTEXT` with
the same evidence-bound rules, and the turn is metered as
`surface: "coach-chat"`. Everything else about that chat — tools, proposals,
the model (`CHAT_MODEL`, terra) — is unchanged (D8). Lane D edits
`CHAT_SYSTEM_PROMPT` in the same route; the hook is one `await` and one
string append, in one place.

### 2.6 Execute buttons = proposals — confirmed on the server

Each move renders as a card in the confirmation-dock shape, showing exactly
what will be written: the planned days; current → new targets in kcal,
grams and %; the reminder's text, local time **and named time zone**; an
input per measurement field (he types the values — nothing is proposed).

**Confirm is one server route** (review round 3, item 3):
`POST /api/health/coach/reviews/[id]/moves/[n]/confirm`
(`lib/coach/confirm.ts`). Under a row lock, in one transaction, it loads
the **stored** move (the client sends nothing but a measurement's typed
values), refuses Test reviews, re-runs `validateAction` against the stored
facts and `stillWritable()` in his zone, returns the earlier result if the
move was already confirmed (idempotent — two taps write once), then writes
through the existing lib paths and records the move:

| Action | Written by |
|---|---|
| `plan_week` | `planWeek(…, tx)` — the stored days only, no reminders, never replacing the week, `source: "coach"` |
| `adjust_targets` | read-merge-write of `user_settings.data` (the keys the macro sheet writes); the record keeps `before` |
| `set_reminder` | a `reminders` row; the stored local time converted **on the server** in his device's zone (D21) |
| `log_measurement` | a `body_measurements` row from the typed values, validated against the field vocabulary, `source: "manual"` |

The card then shows "Done · time". **Undo** only where the row's own
endpoint already offers a way back: targets are re-saved through the
settings write (the record's `before`), a measurement is deleted through
`DELETE /api/health/body?id=`; the card then marks the record taken back
(`PATCH /api/health/coach/reviews/[id] {action: {index, undo: true}}` — the
PATCH's only job now). Plans and reminders have no delete path, so their
cards say where to change them. Test reviews render the cards disabled.

### 2.7 Metering, budget, switch, Test

- Every model call carries `surface: "coach"` (review) or `"coach-chat"`
  (follow-up chat). `generateChatText` returns `usage` (all calls summed),
  takes a per-request `timeoutMs` (no SDK retries) and a `deadline`, and a
  failed call throws with the usage of the calls before it.
- **Every call is paid for once and recorded** (review round 3, item 1). A
  failed run writes its tokens and cost on the `failed` row. A run in
  flight (`generating`, under two minutes old) owns its week: a second
  "Run now" or "Write again" gets it back (409 `in_flight`), and a lost
  supersede race returns the winner — never a 500, never a second model
  call. The generation ends within 50 s: each call is capped at 35 s and no
  retry starts with under 15 s left.
- **Cost** is priced conservatively: a model missing from the price table
  is costed at the highest tier and `checksJson.costEstimated` says so.
- **Spend** (`lib/coach/spend.ts`): review spend is the sum of
  `coach_reviews.costUsd` for the calendar month in his timezone, **Test
  runs excluded**; Test spend and chat spend are shown beside it.
- **Budget** (default $3, D7): blocks the cron and the manual "run this
  week" on review spend only, leaving ONE `blocked_budget` marker per week
  that never replaces a review and never stacks; a run after the budget is
  raised replaces it. A **Test** he taps runs past the budget and the
  switch, but at most **5 a day** (429 after). Chat is counted, never
  blocked.
- **On/Off**: off → the cron returns `{skipped: "coach off"}`, no row, no
  notification; past reviews stay readable.
- **Model picker**: `sol | terra | luna` → `MODEL_TIERS` in `lib/openai.ts`.
- **Journal switch**: `journalExcerpts` (default off).
- **Test**: the full pipeline on `fixtureSource()`; a `kind: "test"` row, no
  conversation, no notification, actions off, real metering. Proven by a
  recording Prisma double: a Test run writes only `coach_reviews` and
  `ai_usage_events` and reads only `user_settings`.

### 2.8 Schedule and notification

- `vercel.json`: `{"path": "/api/cron/coach-weekly", "schedule": "0 0 * * 1"}`
  — Monday 00:00 UTC = **Sunday 19:00** in Bogotá (UTC−5, no DST) and in
  Houston until DST ends (then 18:00). The review covers the week through
  that moment and says so (§2.1 coverage). A second entry `"0 12 * * 1"`
  (Monday 07:00 Bogotá, 06:00 Houston — held by quiet hours until 07:00) is
  the catch-up: it writes the week only when **no live row exists**, or the
  live row is `failed` / stuck in `generating` past the 60 s ceiling, which it
  supersedes; a `ready` live row is never touched (D2). 31 + 2 = 33 crons.
- `GET /api/cron/coach-weekly`: verifies `CRON_SECRET` with a constant-time
  compare and fails closed (401) when the variable is unset — the shape Lane
  A's shared `requireCronSecret()` will have; swapped for it at merge
  (followups.md); reads coach settings;
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
| `/api/health/coach/reviews` | GET | `{ latest, reviews: summaries[], settings, spend: {reviewsUsd, reviewsCount, chatUsd, chatCalls, budgetUsd, remainingUsd, blocked}, timeZone }` — the old `GET`/`POST /api/health/coach` stays untouched until Phase 4 replaces its page (D15) |
| `/api/health/coach/run` | POST `{mode: "manual" \| "test", week?, again?}` | Runs the pipeline now; `{review}` (or `{review, existed: true}`); 409 `budget`, 409 `in_flight` (a run is writing this week), 423 when off (manual only), 429 `test_limit`; `again` supersedes a healthy review, never one in flight |
| `/api/health/coach/reviews/[id]` | GET | Full review: facts, review, checks, actions, conversation summary |
| `/api/health/coach/reviews/[id]` | PATCH `{action: {index, undo: true}}` | Marks a confirmed move taken back (after the card undid it through the row's own endpoint) |
| `/api/health/coach/reviews/[id]/moves/[n]/confirm` | POST `{values?}` | **The only path that writes a move**: stored move, re-validated, `stillWritable()`, idempotent, one transaction (§2.6) |
| `/api/health/coach/reviews/[id]/conversation` | POST | Creates the review's chat on the first "Talk to this review" (idempotent) |
| `/api/health/coach/settings` | GET / PUT | `{settings: {enabled, monthlyBudgetUsd, modelTier, journalExcerpts}, spend, tiers: [{tier, label, model, inputUsdPerM, outputUsdPerM, reviewEstimateUsd}]}` (merging, server-side write) |
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
  ids/dates on every fact; derived facts cite their parents; the Sunday
  19:00 coverage label; a mid-week run truncating both weeks at the same
  weekday and minute; the journal switch; the model copy stripped of
  ids/dates; local-day boundaries.
- `tests/coach-checks.test.ts` — number extraction and matching; the 1–3
  rule; uncited numbers; unknown ids; medical lint; action validation
  (dates, names, ±25 %, field allowlist).
- `tests/coach-review.test.ts` — the generator with an injected `generate`:
  parses JSON, retries once on violations, keeps flags, builds markdown;
  budget block path; model tier resolution never leaves `lib/openai.ts`.
- `tests/coach-run.test.ts` — **Test mode never touches real rows**: prisma
  mock whose data delegates throw on any write; a test run completes with no
  write outside `coach_reviews` and `ai_usage_events` (settings reads are
  allowed). Live mode writes the row without a conversation; the lazy
  conversation route creates it once; cron idempotency on `liveWeekStart`;
  supersede is one transaction.
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
| D2 | Schedule and cutoff | `0 0 * * 1` (Sun 19:00 Bogotá/Houston): the review covers Mon–Sat in full + Sunday through the run, says so on the page, and compares the previous week through the same weekday and minute. `0 12 * * 1` Monday catch-up writes only a missing week or supersedes a `failed`/stuck-`generating` live row; never a `ready` one | "Every Sunday evening" as he asked, without a biased delta (review HIGH 1); a catch-up that overwrote a good review would break "re-reading never rewrites" |
| D3 | Storage | New `coach_reviews`; `weekly_reports` untouched | Test runs must never land in the Sunday Report's table; the Coach's row carries provenance fields the report has no place for |
| D4 | One review per week | `liveWeekStart` unique on the live row (`kind` live/superseded/test is one field); manual **Run again** supersedes in one transaction, old row kept with its chat and actions | "Re-reading never rewrites"; a database unique beats a convention (review MEDIUM 10, LOW 16) |
| D5 | Talk to a review | Conversation created **lazily on the first tap**; deep link `/chat?c=<id>` into the existing Chat with `pickedByHim` set (gap rule bypassed) inside a Suspense boundary; facts injected into that chat's instructions; first message = the review | No parallel chat UI; a conversation minted at generation would become Sunday night's default chat and swallow a food log (review HIGH 2, 3) |
| D6 | Test mode | Fixture source; `kind: "test"` row; no conversation; no notification; actions disabled; **real** metering; runs even past the budget when he taps it | "Without touching real rows" — but spend is real and must count; a Test he asks for is a diagnostic |
| D7 | Budget | $3/month, calendar month in his timezone, measured on **review spend only** — Test rows and chat excluded, both shown; blocks the cron and the manual "run this week"; a Test he taps runs past it and past the switch, capped at 5 a day; a failed run's spend counts | A chatty month or a few Tests must not block Sunday; a failed run is not free (review rounds 2–3) |
| D8 | Model picker scope | Governs the review model (default sol); follow-up chat stays on `CHAT_MODEL` (terra) | The stream route's model is app-wide; changing it per conversation is a bigger change than this lane should make |
| D9 | Action menu and guardrails | Four kinds + none; targets within ±25 %, plan dates inside next week, routine/trail names must exist; invalid → text-only move | A staffer proposes, within limits; the existing endpoints keep their own validation |
| D10 | Water | Keep the intake; Coach shows hydration only when rows exist; followup to Lane C to de-emphasise `/health/water` | Zero rows ever; the tool costs nothing to keep |
| D11 | Journal | Keep; quote ≤ 3 short excerpts when present; flat "no pages" fact otherwise, never a scolding | The Journal tab is in the design IA; a notification/review "is never a summons" |
| D12 | daily_activity | Read merged rows via `loadActivityRows()`; "no step data this week" when empty | Not dead — the iPhone app's push shipped today |
| D13 | Citation strictness | Every number must equal a value of the facts ITS sentence cites (or their parents), in a compatible unit; number words and ranges read; dates only inside the window or named by a cited fact; times only from cited facts or the reminder; a move's evidence is its structured payload only; no numbers in the headline; flagged items shown, one retry, never silently fixed | The first rule ("equals any fact") let 25 of the integers 1–100 pass on a real week (review round 3, item 2) |
| D14 | Reasoning | `reasoningEffort: "low"`, 2,400/3,400 token budgets | The Sunday Report's proven setting; cost stays at cents |
| D15 | Old coach API | Delete the `GET`/`POST /api/health/coach` handlers (todo-task generator) **in Phase 4, with the page that used them**, after a consumer grep over `ios/`, `lib/mcp`, `lib/ai`, `components` and `public/sw.js` — so the removal is reviewed beside its replacement | Grep so far: only the old page and one link in `components/ai-meal-suggestion.tsx` (to the page path, which survives) |
| D16 | Notification | Category `coachReview`, default on, deep link to the review; quiet hours apply | Same contract as "Weekly report ready" |
| D17 | Records this week | Current bests whose `achievedAt` falls in the week, with `previousValue` | The table holds current bests only (`@@unique([exercise, kind])`); a record beaten twice in one week shows once |
| D18 | Chat deep link | `?c=<conversationId>` support added to `/chat` (~15 lines) | Needed for D5; the only touch outside `components/coach/*` and the stream hook |
| D19 | Registry | `coach_reviews` becomes a readable dataset (no facts/review JSON) | Chat and MCP can quote past reviews |
| D20 | Sunday Report | Untouched; the Coach links to it | Michael's call to keep it where it is |
| D21 | Reminder timezone | The stored local time is converted **on the server** in the device's zone (`notificationPrefs.timeZone`, Houston today), else `settings.timeZone`; the overview returns that zone so the card names exactly the zone the write uses | A 7 am reminder is about where he wakes up; the server, not the client, owns the conversion (review round 3, item 3) |
| D22 | Journal excerpts | Off by default; a Coach switch turns quoting on; the page count is always a fact | His words becoming model context and persisting on the review is new exposure (review LOW 19) |
| D23 | The model's copy of the facts | `factsForModel()` strips row ids, dates and the routine/trail ids; notes carry no ids; the stored facts keep provenance for the chips | 30–40 % fewer input tokens on a real week (21 % synthetic); no UUID reaches the model (review round 2, item 5) |
| D29 | A Sunday-morning preview | A review he runs by hand before the week ends is a preview: the scheduled run (Sunday 19:00, or the Monday catch-up) replaces it with the whole week's, keeping it as "replaced" | Otherwise an 8 am review would stand in for the week (review round 3, item 6) |
| D30 | Medical framing | Matched as phrases in context; a matching line is removed visibly in its slot, its original kept in `checksJson`; a move is never dropped | A silent rewrite of a saved artifact, and a dropped move forced a paid retry (review round 3, item 4) |
| D25 | Counts vs sums | A count of zero is a fact; a sum, average or delta with no rows behind it is not minted | "0 sessions" is honest; "0 kcal burned" beside a session with no recorded burn is not (review round 2, item 2) |
| D26 | The partial day | Averages and their day counts use whole days only, in both weeks; intake and steps show the partial day as "… so far"; recovery leaves it out (sleep for a night lands the next morning; HRV/RHR of a running day are partial readings) | One Sunday lunch must not move a weekly average (review round 2, item 1) |
| D27 | The weekly training target | Compared with distinct DAYS trained, not sessions | A walk and a strength session on one day are one training day (review round 2, item 3) |
| D24 | Confirming a move | One server route writes every move: the stored move, re-validated, `stillWritable()`, idempotent under a row lock, written through `planWeek`/the settings merge/a reminder row/a body row and recorded in the same transaction; the client only previews; plans never carry reminders nor replace a week | A client-side write path let a stale or edited card write anything (review round 3, item 3) |

---

## 7. Phases, files, verification

**Phase 2 — facts + storage.** `lib/coach/facts.ts` (incl. coverage and
`factsForModel`), `lib/coach/types.ts`, `lib/coach/source.ts` (loader +
cutoff), `lib/coach/source-prisma.ts`,
`lib/coach/fixture-week.ts` (+ `tests/fixtures/coach-week.ts` re-export),
`prisma/schema.prisma` (`CoachReview`, back-relation),
`prisma/migrations/20261017230000_coach_reviews/migration.sql`,
`lib/timezone.ts` (`isoWeekNumber` moves here from `lib/weekly-report.ts`),
`tests/coach-facts.test.ts`.
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
`app/(tabs)/health/coach/page.tsx` (replaced) and the old `GET`/`POST
/api/health/coach` handlers deleted after the D15 consumer grep,
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

---

## 9. Review round 1 (2026-10-17) — what changed and where it lands

| # | Finding | Landed |
|---|---|---|
| H1 | Sunday 19:00 review covers a partial week; deltas biased low; catch-up skips | **Phase 2**: cutoff + like-for-like previous week, `week.coverage` fact, `plan.thisWeek.upcoming`; D2 rewritten (catch-up supersedes only failed/stuck) |
| H2 | `/chat?c=` without `pickedByHim` → gap rule starts a new chat; needs Suspense | Phase 4 (§2.5, D5) |
| H3 | A conversation created at generation becomes the chat tab's default thread | **Phase 3**: `ensureReviewConversation` on the first tap, one transaction; `POST /api/health/coach/reviews/[id]/conversation` |
| H4 | `generateChatText` returns no usage; its `length` retry is a second call | **Phase 3**: additive `usage {inputTokens, outputTokens, calls}`; every existing caller untouched (tested) |
| M5 | 50 UUIDs a fact ≈ 10k tokens | **Phase 2**: `factsForModel()` strips ids/dates (D23) |
| M6 | Chat spend would block Sunday's review | **Phase 3**: budget on `coach_reviews.costUsd` only; `coach-chat` shown separately (D7) |
| M7 | Checker vs action payload, titles, dates, "7 days", "10k" | **Phase 3**: a writable action's numbers are its own evidence (a `none` action's reason never is); dates accepted only when written as dates inside the window (three weeks + the reminder horizon + dates named in fact labels); thresholds in labels ("10,000+") allowed; deltas match by absolute value; count nouns are units; headline numbers checked |
| M8 | `plan_week` reminders/`replaceWeek` scope/`source` | **Phase 3**: `reminders` stripped in `validateAction`; `stillWritable()` (pure, client-importable) refuses a plan for a week already begun or a past reminder at confirm; `planWeek` + planner route take an optional `source` ("coach"). Phase 4 wires the card to it |
| M9 | `set_reminder` timezone | Phase 4 (§2.6, D21) |
| M10 | `slot` smuggles a timestamp; failed/generating rows block the week; run-again not atomic | **Phase 2**: `kind` + `liveWeekStart @unique`; supersede in `$transaction`, catch-up re-runs failed/stuck (Phase 3) |
| M11 | `PUT /api/settings` is a replace | **Phase 3**: `saveCoachSettings` read-merge-writes one key; `coach` in `SERVER_OWNED_KEYS` (tested: a stale client copy is discarded) |
| M12 | Recovery rows need per-day dedupe | **Phase 2**: fullest row per day (`pickPerDay`) — reworked per field in the round-2 fixes |
| M13 | Shared files with Lane D; Lane A's cron helper | **Phase 3**: stream route = one lookup in the existing `Promise.all`, one append, one surface ternary; cron check in `lib/coach/cron-auth.ts` (sha-256 both sides, `timingSafeEqual`, closed when unset); followup filed for A |
| L14 | "only two delegates reached" unattainable | **Phase 3**: `tests/coach-run.test.ts` records every delegate call — a Test run writes only `coachReview` + `aIUsageEvent` and reads only `userSettings` |
| L15 | Fire-and-forget metering vs budget check | **Phase 3**: spend = sum of `coach_reviews.costUsd` (`lib/coach/spend.ts`) |
| L16 | `isTest` + `slot` + `trigger` say one thing three ways | **Phase 2**: `kind` alone; `trigger` is cron/manual |
| L18 | Developer words on his screen | §0 rewritten; Phase 4 copy follows it |
| L19 | Journal excerpts persist and ride every turn; water path must be tested | **Phase 2**: excerpts behind a default-off switch (D22); the fixture has water rows and the hydration path is tested |

## 10. Review round 2 (2026-10-20, of b89d28e) — what changed

| # | Finding | Landed |
|---|---|---|
| 1 | A partial Sunday averaged as a full day (intake, steps, sleep, HRV) | Whole days only in both weeks; "Sunday so far" facts; fixture Sunday with food before and after 19:00 (D26) |
| 2 | Zeros with no rows (tonnage/minutes/burn 0, deltas between empty sides) | Counts stay, sums/averages/deltas need rows; test pinning the zero replaced (D25) |
| 3 | Sessions compared with a days-per-week target; plan rows labelled days | `training.days` vs the target; plan facts in sessions plus separate day counts (D27) |
| 4 | One live review per week only half enforced | **In Phase 3 (`8fa8f34`)**: migration `20261020120000_coach_reviews_live_check` — `kind` in (live, superseded, test) and live ⇔ `liveWeekStart` = `weekStart`; proven with rolled-back inserts |
| 5 | Row ids in notes and the envelope of the model's copy | Notes carry no ids; envelope names only; tested over every fixture row id and a UUID pattern (D23) |
| 6 | Recovery dedupe order-dependent and lossy | Per-field merge, fixed order; Prisma source orders by date, source, timezone, id |
| 7 | Second trail run compared with the pre-week run; shared `take` | Chained comparison within the week; one query per trail |
| 8 | Weight change by row, not by day | Each day read by its first reading |
| 9 | "Days since last weigh-in" lost past 28 days; counted to a future Sunday | `lastWeighInBefore` on the source; counted to the cutoff |
| 10 | The two cutoffs differed in seconds | Same weekday, hour, minute, second and millisecond |
| 11 | Burn off by a calorie; protein adherence uncapped and from a rounded average | Both now computed as the Sunday Report does |
| 12 | "Ridge Loop · Ridge Loop" | A name equal to the title is not repeated |
| 13 | Previous tonnage cited a walk | Cites lifting rows only |
| 14 | Fixture targets equal to his | 2,500 kcal, 25/50/25, 5 days — plainly invented |
| Docs | §0 promise and "null when empty" untrue; token claim overstated | §0, §2.1 and the groups table rewritten to the code; the claim corrected to 30–40 % real / 21 % synthetic (the Phase 2 commit message's "~half" stands uncorrected there — commits are never amended) |

## 11. Review round 3 (2026-10-20, of 8fa8f34 + 47538f3) — what changed

| # | Finding | Landed |
|---|---|---|
| 1a | A failed run's paid calls were never recorded | Usage travels on the error (`CoachGenerationError`, and on `generateChatText`'s throw); the failed row carries tokens and cost |
| 1b | Two "Run again" taps both paid; a lost race was a 500 | A fresh `generating` row is in flight and returned; a lost supersede returns the winner; the route answers 409 `in_flight` |
| 1c | Test spend blocked Sunday's review while Tests skipped the budget | Tests excluded from the blocking sum and shown apart; 5 Test runs a day |
| 1d | An unpriced model under-counted 2.5× | `estimateChatCostUsdConservative`: highest tier, `costEstimated` flagged |
| 2 | A number passed if it equalled ANY fact | §2.3 rewritten: cited facts only, units, words, ranges, dates, times, structured payload, glued digits |
| 3 | `stillWritable()` had no caller; the client wrote moves | `POST …/moves/[n]/confirm` (§2.6); PATCH is undo-marking only; the planner route is back to exactly what `main` has |
| 4 | Medical lines silently deleted; false positives and misses | Phrase list in context; visible removal; original kept; moves never dropped |
| 5 | Two "Talk" taps made two chats | Linked with `updateMany … where conversationId is null`; the loser's transaction rolls back its chat |
| 6 | A Sunday-morning manual run stood in for the week | The scheduled run supersedes a manual preview written before the cutoff (D29) |
| 7 | A slow call could pass the 60 s ceiling | 50 s hard deadline, 35 s per call, no retry under 15 s left, cost always recorded |
| 8 | Measurement dates, macro shifts, "replace the week", silent verdict/truncation, unconstrained status/trigger | Window-only dates; ±10 points per macro; replace never offered; both flagged in `checksJson`; migration `20261020180000_coach_reviews_value_check` |
