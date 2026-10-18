// The Coach's evidence model (2026-10-17, lane B — docs/coach-plan.md §2.1).
//
// A weekly review is written from FACTS and nothing else. A fact is one value
// with the rows it came from — table, ids, local days — so every number the
// model says can be traced back to a row, and anything it says that is not
// here can be flagged. The model is handed this object; it never sees the
// database.
//
// Plain data throughout: JSON-serialisable, no Prisma, no Dates except on the
// INPUT rows, which lib/coach/facts.ts converts to local days in the user's
// timezone. lib/coach/source.ts loads the rows through a CoachSource — the
// real one reads Postgres, the fixture one is synthetic — so the builder and
// everything downstream of it can run without touching a real row.

import type { ActivityRow } from "@/lib/activity-summary";
import type { CoachTargets } from "@/lib/health-coach";

export type { ActivityRow };

export type FactGroup =
  | "week"
  | "training"
  | "records"
  | "trails"
  | "intake"
  | "hydration"
  | "body"
  | "recovery"
  | "activity"
  | "plan"
  | "journal"
  | "compare";

/** Canonical order — the order the screen and the prompt list groups in. */
export const FACT_GROUPS: readonly FactGroup[] = [
  "week",
  "training",
  "records",
  "trails",
  "intake",
  "hydration",
  "body",
  "recovery",
  "activity",
  "plan",
  "journal",
  "compare",
];

export interface FactSource {
  /** The table the value came from, as named in the database. */
  table: string;
  /** The column, when one column carries the value. */
  field?: string;
  /** Row ids behind the value (at most 50; `count` has the true number). */
  ids?: string[];
  /** Local days (YYYY-MM-DD) the value covers (at most 14). */
  dates?: string[];
  /** Rows behind an aggregate. */
  count?: number;
  /** A caveat the reader deserves: "training burn only — no BMR model". */
  note?: string;
  /** Body rows: where THIS value came from (renpho_report, apple_health, manual…). */
  fieldSource?: string;
}

export interface Fact {
  /** "f12" — what the model cites in its prose. Sequential within one week. */
  id: string;
  /** "training.sessions" — what tests, tiles and the hero address. Unique. */
  key: string;
  group: FactGroup;
  label: string;
  /**
   * A number, a short string (an honest "no food logged this week", a planned
   * day's title, a journal excerpt), or null. Numbers inside a string value are
   * also facts: the post-check indexes them.
   */
  value: number | string | null;
  unit?: string;
  source: FactSource;
  /** A derived value (a delta, a percentage) names the facts it was computed from. */
  derivedFrom?: string[];
}

/**
 * How much of the week the facts cover. The Sunday-evening review reads
 * Mon–Sat in full and Sunday through the hour it ran; the previous week is
 * truncated to the same weekday and time so every delta compares like for
 * like (review round 1, HIGH 1).
 */
export interface WeekCoverage {
  /** The whole week was over when the facts were built. */
  complete: boolean;
  /** The instant the week was read through (≤ the end of its Sunday), ISO. */
  cutoff: string;
  /** "Sun, Oct 11 · 7:00 pm" — labels only. */
  cutoffLocal: string;
  /** Calendar days of the week with any coverage, 1–7. */
  daysCovered: number;
  /** "Monday to Saturday in full, Sunday through 7:00 pm" / "the full week, Monday to Sunday" */
  label: string;
}

export interface WeekFacts {
  /** Monday, YYYY-MM-DD, user-local. */
  weekStart: string;
  /** Sunday. */
  weekEnd: string;
  weekNumber: number;
  timeZone: string;
  builtAt: string;
  coverage: WeekCoverage;
  targets: CoachTargets;
  /** The groups that have at least one fact, in canonical order. */
  groups: FactGroup[];
  facts: Fact[];
  /** Routine names the planner can resolve — the only names a plan move may use. */
  routines: Array<{ id: string; name: string; kind: string }>;
  /** Named trails, likewise. */
  trails: Array<{ id: string; name: string }>;
  /** The week a plan move lands on. */
  nextWeek: { weekStart: string; weekEnd: string; dates: string[] };
}

/**
 * The copy the MODEL is given: the same facts without row ids and dates,
 * which are provenance for the screen's chips, not evidence the prose needs,
 * and at ~20 tokens a UUID would double the cost of a review.
 */
export interface ModelFactSource {
  table: string;
  field?: string;
  count?: number;
  note?: string;
  fieldSource?: string;
}
export type ModelFact = Omit<Fact, "source"> & { source: ModelFactSource };
export interface ModelWeekFacts extends Omit<WeekFacts, "facts"> {
  facts: ModelFact[];
}

export interface FactsOptions {
  /**
   * Quote up to three short journal excerpts as facts. OFF by default: the
   * page count is always a fact, but his own words become model context —
   * and persist on the review — only when he switches it on in Settings →
   * Coach (review round 1, LOW 19).
   */
  journalExcerpts: boolean;
}

export const DEFAULT_FACTS_OPTIONS: FactsOptions = { journalExcerpts: false };

// ————— Input rows (thin selects; shapes shared by the Prisma and fixture sources) —————

export interface FoodRow {
  id: string;
  loggedAt: Date;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface WorkoutRow {
  id: string;
  startedAt: Date;
  workoutType: string;
  durationMinutes: number;
  caloriesBurned: number | null;
  distanceMeters: number | null;
  elevationGainM: number | null;
  avgHeartRateBpm: number | null;
  /** The exercise list as stored — lib/prs.ts reads it. */
  exercises: unknown;
  /** metricsData as stored — jump-rope intervals and the routine name live here. */
  metricsData: unknown;
  trailId: string | null;
}

export interface RecordRow {
  id: string;
  exercise: string;
  exerciseName: string;
  kind: string;
  value: number;
  unit: string;
  previousValue: number | null;
  achievedAt: Date;
  workoutLogId: string | null;
}

export interface BodyRow {
  id: string;
  measuredAt: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  skeletalMuscleKg: number | null;
  skeletalMusclePct: number | null;
  source: string | null;
  /** { weightKg: "apple_health", bodyFatPct: "renpho_report", … } as stored. */
  fieldSources: unknown;
}

export interface SnapshotRow {
  id: string;
  localDate: string;
  timeZone: string;
  sleepMinutes: number | null;
  hrvMs: number | null;
  restingHeartRateBpm: number | null;
}

export interface PlanRow {
  id: string;
  localDate: string;
  title: string;
  /** planned | done | skipped */
  status: string;
  sequenceId: string | null;
  trailId: string | null;
  targetWeightKg: number | null;
}

export interface SequenceRow {
  id: string;
  name: string;
  kind: string;
}

export interface TrailRow {
  id: string;
  name: string;
  distanceMeters: number | null;
  elevationGainM: number | null;
}

export interface WaterRow {
  id: string;
  loggedAt: Date;
  amountMl: number;
}

export interface JournalRow {
  id: string;
  localDate: string;
  text: string;
}

export interface ProgressionRow {
  sequenceId: string;
  sequenceName: string;
  type: "raise" | "deload";
  reason: string;
}

/** UTC instants bounding a span of local days (lib/timezone getUtcDateRangeForTimeZone). */
export interface DateRange {
  start: Date;
  end: Date;
}

/** Inclusive local-day strings, for tables keyed by YYYY-MM-DD. */
export interface DayRange {
  from: string;
  to: string;
}

/**
 * Where the rows come from. lib/coach/source-prisma.ts is the real one;
 * lib/coach/fixture-week.ts is synthetic. Test mode and every unit test use
 * the fixture, so neither can read or write a real row by construction.
 */
export interface CoachSource {
  settings(): Promise<unknown>;
  foodLogs(range: DateRange): Promise<FoodRow[]>;
  workouts(range: DateRange): Promise<WorkoutRow[]>;
  records(range: DateRange): Promise<RecordRow[]>;
  bodyMeasurements(range: DateRange): Promise<BodyRow[]>;
  snapshots(days: DayRange): Promise<SnapshotRow[]>;
  /** Merged Apple Health days — lib/activity-reports.ts loadActivityRows. */
  activityRows(days: DayRange): Promise<ActivityRow[]>;
  plannedWorkouts(days: DayRange): Promise<PlanRow[]>;
  sequences(): Promise<SequenceRow[]>;
  trails(): Promise<TrailRow[]>;
  /** The most recent run of each trail strictly before `before` (one row per trail). */
  previousTrailRuns(trailIds: string[], before: Date): Promise<WorkoutRow[]>;
  waterLogs(range: DateRange): Promise<WaterRow[]>;
  journalEntries(days: DayRange): Promise<JournalRow[]>;
  progression(): Promise<ProgressionRow[]>;
}

/** Everything buildWeekFacts needs, already loaded. Rows cover the week AND the week before. */
export interface WeekInput {
  weekStart: string;
  timeZone: string;
  now: Date;
  /**
   * The instant the week is read through: `now` when the week is still
   * running, the end of its Sunday once it is over. Rows after it are
   * ignored, and the previous week is cut at the same weekday and time.
   */
  cutoff: Date;
  options: FactsOptions;
  settings: unknown;
  food: FoodRow[];
  workouts: WorkoutRow[];
  records: RecordRow[];
  /** Four weeks ending on weekEnd — the trend needs more than the week. */
  body: BodyRow[];
  snapshots: SnapshotRow[];
  activity: ActivityRow[];
  /** This week and next. */
  plans: PlanRow[];
  sequences: SequenceRow[];
  trails: TrailRow[];
  previousTrailRuns: WorkoutRow[];
  water: WaterRow[];
  journal: JournalRow[];
  progression: ProgressionRow[];
}
