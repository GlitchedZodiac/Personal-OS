// The facts layer (2026-10-17, lane B — docs/coach-plan.md §2.1). Pure: rows
// in, facts out. No Prisma, no clock, no model. Every number the review may
// contain is minted here as a Fact with the rows behind it — INCLUDING the
// derived ones (deltas, percentages, averages, day counts), so the post-check
// can hold the model to "every number is a fact".
//
// Honesty rules, per group: an empty week is a fact ("no food logged this
// week"), never a zero that looks like data; an average always travels with
// the count of days it was taken over; optional intakes (water, trails) with
// nothing in them simply have no group; nothing is estimated.
//
// COVERAGE. The Sunday-evening review runs before the week is over, so the
// week is read through a cutoff (input.cutoff): rows after it are ignored,
// and the previous week is cut at the same weekday and time, so a delta
// never sets six and a half days against seven. The coverage is itself a
// fact ("week.coverage") the model must state when it is partial.

import { isDistanceType } from "@/lib/activities";
import { buildWeeklyReport } from "@/lib/activity-summary";
import { getCoachTargets, type CoachTargets } from "@/lib/health-coach";
import { jumpSecondsOf } from "@/lib/jump-rope";
import { sessionVolumeKg } from "@/lib/prs";
import {
  addDaysToDateString,
  dateStringDiffDays,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  getZonedDateParts,
  isoWeekNumber,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";
import {
  FACT_GROUPS,
  type BodyRow,
  type Fact,
  type FactGroup,
  type FactSource,
  type FoodRow,
  type ModelFact,
  type ModelWeekFacts,
  type PlanRow,
  type SnapshotRow,
  type WeekCoverage,
  type WeekFacts,
  type WeekInput,
  type WorkoutRow,
} from "./types";

const MAX_IDS = 50;
const MAX_DATES = 14;
const MAX_EXCERPTS = 3;
const EXCERPT_CHARS = 160;
const TEN_K_STEPS = 10_000;
/** The weight trend wants at least this many weigh-ins over at least this span. */
const TREND_MIN_POINTS = 3;
const TREND_MIN_SPAN_DAYS = 14;

type SettingsLike = Parameters<typeof getCoachTargets>[0];

class FactBook {
  readonly facts: Fact[] = [];
  private readonly groups = new Set<FactGroup>();
  private readonly keys = new Set<string>();

  add(fact: Omit<Fact, "id">): Fact {
    if (this.keys.has(fact.key)) throw new Error(`duplicate fact key: ${fact.key}`);
    this.keys.add(fact.key);
    const minted: Fact = { id: `f${this.facts.length + 1}`, ...fact };
    this.facts.push(minted);
    this.groups.add(fact.group);
    return minted;
  }

  presentGroups(): FactGroup[] {
    return FACT_GROUPS.filter((g) => this.groups.has(g));
  }
}

const round = (n: number, places = 0): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number | null => (xs.length ? sum(xs) / xs.length : null);
const idsOf = (rows: { id: string }[]) => rows.slice(0, MAX_IDS).map((r) => r.id);
const daysOf = (list: string[]) => [...new Set(list)].sort().slice(0, MAX_DATES);
const pctChange = (now: number, before: number): number | null =>
  before === 0 ? null : round(((now - before) / Math.abs(before)) * 100);

/** "Tue, Oct 13" from a local day — labels only, never a value. */
function labelDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const typeLabel = (type: string) => type.replace(/_/g, " ");

function leastSquaresSlope(xs: number[], ys: number[]): number {
  const mx = mean(xs) ?? 0;
  const my = mean(ys) ?? 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

interface Ctx {
  book: FactBook;
  input: WeekInput;
  weekStart: string;
  weekEnd: string;
  prevStart: string;
  prevEnd: string;
  nextStart: string;
  nextEnd: string;
  targets: CoachTargets;
  /** The instant the week is read through, and its like-for-like twin a week earlier. */
  cutoff: Date;
  prevCutoff: Date;
  cutoffDay: string;
  prevCutoffDay: string;
  complete: boolean;
  dayOf(d: Date): string;
  /** Timestamped rows: inside the week and not after the cutoff. */
  tsInWeek(t: Date): boolean;
  tsInPrev(t: Date): boolean;
  /** Day-keyed rows: inside the week and not after the cutoff's day. */
  dayInWeek(day: string): boolean;
  dayInPrev(day: string): boolean;
}

const byStart = (a: { startedAt: Date }, b: { startedAt: Date }) =>
  a.startedAt.getTime() - b.startedAt.getTime();

// ————— week (what the facts cover) —————

function localClock(t: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone })
    .format(t)
    .toLowerCase();
}

function weekdayName(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function coverageOf(c: Ctx, timeZone: string): WeekCoverage {
  const daysCovered = c.complete
    ? 7
    : Math.min(7, Math.max(1, dateStringDiffDays(c.weekStart, c.cutoffDay) + 1));
  const clock = localClock(c.cutoff, timeZone);
  let label: string;
  if (c.complete) {
    label = "the full week, Monday to Sunday";
  } else if (c.cutoffDay === c.weekStart) {
    label = `Monday through ${clock}`;
  } else {
    const lastFull = addDaysToDateString(c.cutoffDay, -1);
    const full = lastFull === c.weekStart ? "Monday" : `Monday to ${weekdayName(lastFull)}`;
    label = `${full} in full, ${weekdayName(c.cutoffDay)} through ${clock}`;
  }
  return {
    complete: c.complete,
    cutoff: c.cutoff.toISOString(),
    cutoffLocal: `${labelDay(c.cutoffDay)} · ${clock}`,
    daysCovered,
    label,
  };
}

function addWeek(c: Ctx, coverage: WeekCoverage) {
  const { book } = c;
  book.add({
    key: "week.number",
    group: "week",
    label: "Week of the year",
    value: isoWeekNumber(c.weekStart),
    source: { table: "calendar", note: "ISO week number" },
  });
  book.add({
    key: "week.daysCovered",
    group: "week",
    label: "Days of the week covered",
    value: coverage.daysCovered,
    unit: "days",
    source: { table: "calendar", dates: [c.weekStart, c.cutoffDay] },
  });
  book.add({
    key: "week.coverage",
    group: "week",
    label: "What this review covers",
    value: coverage.label,
    source: {
      table: "calendar",
      note: coverage.complete
        ? "the week was over when the review was written"
        : "the previous week is compared through the same weekday and time, so deltas are like for like",
    },
  });
}

// ————— training · plan (this week) —————

function addTraining(c: Ctx) {
  const { book, input } = c;
  const sessions = input.workouts.filter((w) => c.tsInWeek(w.startedAt)).sort(byStart);
  const prev = input.workouts.filter((w) => c.tsInPrev(w.startedAt)).sort(byStart);
  const src = (rows: WorkoutRow[], extra: Partial<FactSource> = {}): FactSource => ({
    table: "workout_logs",
    ids: idsOf(rows),
    dates: daysOf(rows.map((w) => c.dayOf(w.startedAt))),
    count: rows.length,
    ...extra,
  });

  const sessionsFact = book.add({
    key: "training.sessions",
    group: "training",
    label: "Sessions trained",
    value: sessions.length,
    unit: "sessions",
    source: src(sessions),
  });
  const prevSessions = book.add({
    key: "training.sessions.prev",
    group: "compare",
    label: "Sessions trained · previous week",
    value: prev.length,
    unit: "sessions",
    source: src(prev),
  });
  book.add({
    key: "training.sessions.delta",
    group: "compare",
    label: "Sessions vs previous week",
    value: sessions.length - prev.length,
    unit: "sessions",
    source: { table: "workout_logs", note: "this week minus the previous week" },
    derivedFrom: [sessionsFact.id, prevSessions.id],
  });

  const lifted = sessions
    .map((w) => ({ w, kg: sessionVolumeKg(w.exercises) }))
    .filter((x) => x.kg > 0);
  const volume = round(sum(lifted.map((x) => x.kg)));
  const volumeFact = book.add({
    key: "training.volumeKg",
    group: "training",
    label: "Tonnage lifted",
    value: volume,
    unit: "kg",
    source: src(
      lifted.map((x) => x.w),
      { field: "exercises", note: "sets × reps × kg; a pair counts both bells" }
    ),
  });
  const prevVolume = round(sum(prev.map((w) => sessionVolumeKg(w.exercises))));
  const prevVolumeFact = book.add({
    key: "training.volumeKg.prev",
    group: "compare",
    label: "Tonnage · previous week",
    value: prevVolume,
    unit: "kg",
    source: src(prev, { field: "exercises" }),
  });
  if (prevVolume > 0) {
    book.add({
      key: "training.volumeKg.deltaPct",
      group: "compare",
      label: "Tonnage vs previous week",
      value: pctChange(volume, prevVolume),
      unit: "%",
      source: { table: "workout_logs", note: "change in tonnage, this week over the previous" },
      derivedFrom: [volumeFact.id, prevVolumeFact.id],
    });
  }

  book.add({
    key: "training.activeMinutes",
    group: "training",
    label: "Minutes trained",
    value: sum(sessions.map((w) => w.durationMinutes)),
    unit: "min",
    source: src(sessions, { field: "durationMinutes" }),
  });
  const burned = sessions.filter((w) => (w.caloriesBurned ?? 0) > 0);
  book.add({
    key: "training.kcal",
    group: "training",
    label: "Training burn",
    value: round(sum(burned.map((w) => w.caloriesBurned ?? 0))),
    unit: "kcal",
    source: src(burned, { field: "caloriesBurned", note: "training burn only — no BMR model" }),
  });

  const roped = sessions.filter((w) => jumpSecondsOf(w) > 0);
  if (roped.length > 0) {
    book.add({
      key: "training.jumpMinutes",
      group: "training",
      label: "Time on the rope",
      value: round(sum(roped.map(jumpSecondsOf)) / 60, 1),
      unit: "min",
      source: src(roped, { field: "metricsData.intervals" }),
    });
  }

  const byType = new Map<string, WorkoutRow[]>();
  for (const w of sessions) byType.set(w.workoutType, [...(byType.get(w.workoutType) ?? []), w]);
  const types = [...byType.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );
  for (const [type, rows] of types) {
    book.add({
      key: `training.type.${type}`,
      group: "training",
      label: `${typeLabel(type)} sessions`,
      value: rows.length,
      unit: "sessions",
      source: src(rows, { field: "workoutType" }),
    });
  }

  const trailName = new Map(input.trails.map((t) => [t.id, t.name]));
  sessions.forEach((w, i) => {
    const n = i + 1;
    const day = c.dayOf(w.startedAt);
    const m = (w.metricsData ?? {}) as { sequenceName?: unknown };
    const context = w.trailId
      ? trailName.get(w.trailId)
      : typeof m.sequenceName === "string"
        ? m.sequenceName
        : undefined;
    const head = `${labelDay(day)} · ${typeLabel(w.workoutType)}`;
    book.add({
      key: `training.session.${n}.minutes`,
      group: "training",
      label: context ? `${head} · ${context}` : head,
      value: w.durationMinutes,
      unit: "min",
      source: { table: "workout_logs", field: "durationMinutes", ids: [w.id], dates: [day] },
    });
    if (isDistanceType(w.workoutType) && (w.distanceMeters ?? 0) > 0) {
      book.add({
        key: `training.session.${n}.km`,
        group: "training",
        label: `${head} · distance`,
        value: round((w.distanceMeters as number) / 1000, 1),
        unit: "km",
        source: { table: "workout_logs", field: "distanceMeters", ids: [w.id], dates: [day] },
      });
    }
    if ((w.elevationGainM ?? 0) > 0) {
      book.add({
        key: `training.session.${n}.gainM`,
        group: "training",
        label: `${head} · climb`,
        value: round(w.elevationGainM as number),
        unit: "m",
        source: { table: "workout_logs", field: "elevationGainM", ids: [w.id], dates: [day] },
      });
    }
  });

  // The plan he set for THIS week, when he set one. "No plan" is a fact of
  // its own — never "0 of 0 done".
  const plans = input.plans.filter((p) => p.localDate >= c.weekStart && p.localDate <= c.weekEnd);
  const planSrc = (rows: PlanRow[]): FactSource => ({
    table: "planned_workouts",
    ids: idsOf(rows),
    dates: daysOf(rows.map((p) => p.localDate)),
    count: rows.length,
  });
  if (plans.length === 0) {
    book.add({
      key: "plan.thisWeek.none",
      group: "plan",
      label: "Training plan for the week",
      value: "no plan was set for this week",
      source: { table: "planned_workouts", count: 0 },
    });
  } else {
    book.add({
      key: "plan.thisWeek.planned",
      group: "plan",
      label: "Days planned",
      value: plans.length,
      unit: "days",
      source: planSrc(plans),
    });
    const done = plans.filter((p) => p.status === "done");
    book.add({
      key: "plan.thisWeek.done",
      group: "plan",
      label: "Planned days trained",
      value: done.length,
      unit: "days",
      source: planSrc(done),
    });
    // A planned day that is still ahead of the cutoff is upcoming, not missed.
    const open = plans.filter((p) => p.status === "planned");
    const missed = open.filter((p) => c.complete || p.localDate < c.cutoffDay);
    const upcoming = open.filter((p) => !c.complete && p.localDate >= c.cutoffDay);
    book.add({
      key: "plan.thisWeek.missed",
      group: "plan",
      label: "Planned days not trained",
      value: missed.length,
      unit: "days",
      source: planSrc(missed),
    });
    if (upcoming.length > 0) {
      book.add({
        key: "plan.thisWeek.upcoming",
        group: "plan",
        label: "Planned days still ahead this week",
        value: upcoming.length,
        unit: "days",
        source: planSrc(upcoming),
      });
    }
    const skipped = plans.filter((p) => p.status === "skipped");
    if (skipped.length > 0) {
      book.add({
        key: "plan.thisWeek.skipped",
        group: "plan",
        label: "Planned days skipped",
        value: skipped.length,
        unit: "days",
        source: planSrc(skipped),
      });
    }
  }
  const targetDays = book.add({
    key: "plan.targetDaysPerWeek",
    group: "plan",
    label: "Training days per week · target",
    value: c.targets.plannedWorkoutDays,
    unit: "days",
    source: { table: "user_settings", field: "workoutGoals.daysPerWeek" },
  });
  book.add({
    key: "training.vsTargetDays",
    group: "training",
    label: "Sessions vs weekly target",
    value: sessions.length - c.targets.plannedWorkoutDays,
    unit: "sessions",
    source: { table: "workout_logs", note: "sessions minus the weekly target" },
    derivedFrom: [sessionsFact.id, targetDays.id],
  });

  return sessions;
}

// ————— records —————

function addRecords(c: Ctx) {
  const { book, input } = c;
  const recs = input.records
    .filter((r) => c.tsInWeek(r.achievedAt))
    .sort((a, b) => a.achievedAt.getTime() - b.achievedAt.getTime());
  const countSource: FactSource = {
    table: "personal_records",
    ids: idsOf(recs),
    dates: daysOf(recs.map((r) => c.dayOf(r.achievedAt))),
    count: recs.length,
  };
  if (recs.length === 0) countSource.note = "no new records this week";
  book.add({
    key: "records.count",
    group: "records",
    label: "New records this week",
    value: recs.length,
    unit: "records",
    source: countSource,
  });
  recs.forEach((r, i) => {
    const n = i + 1;
    const day = c.dayOf(r.achievedAt);
    const source: FactSource = {
      table: "personal_records",
      field: "value",
      ids: [r.id],
      dates: [day],
    };
    const notes: string[] = [];
    if (r.workoutLogId) notes.push(`set in workout ${r.workoutLogId}`);
    if (r.previousValue == null) notes.push("first record on this movement");
    if (notes.length) source.note = notes.join("; ");
    book.add({
      key: `records.${n}`,
      group: "records",
      label: `${r.exerciseName} · ${r.kind} record (${labelDay(day)})`,
      value: r.value,
      unit: r.unit,
      source,
    });
    if (r.previousValue != null) {
      book.add({
        key: `records.${n}.previous`,
        group: "records",
        label: `${r.exerciseName} · previous ${r.kind} best`,
        value: r.previousValue,
        unit: r.unit,
        source: { table: "personal_records", field: "previousValue", ids: [r.id] },
      });
    }
  });
}

// ————— trails (group omitted when no named trail was run) —————

function addTrails(c: Ctx, sessions: WorkoutRow[]) {
  const { book, input } = c;
  const runs = sessions.filter((w) => w.trailId);
  if (runs.length === 0) return;
  const trail = new Map(input.trails.map((t) => [t.id, t]));
  const prevByTrail = new Map(input.previousTrailRuns.map((w) => [w.trailId as string, w]));

  runs.forEach((w, i) => {
    const n = i + 1;
    const day = c.dayOf(w.startedAt);
    const name = trail.get(w.trailId as string)?.name ?? "unnamed trail";
    const rowSrc = (row: WorkoutRow, field: string): FactSource => ({
      table: "workout_logs",
      field,
      ids: [row.id],
      dates: [c.dayOf(row.startedAt)],
      note: `trail ${row.trailId}`,
    });
    const minutes = book.add({
      key: `trails.${n}.minutes`,
      group: "trails",
      label: `${name} · ${labelDay(day)}`,
      value: w.durationMinutes,
      unit: "min",
      source: rowSrc(w, "durationMinutes"),
    });
    if ((w.distanceMeters ?? 0) > 0) {
      book.add({
        key: `trails.${n}.km`,
        group: "trails",
        label: `${name} · ${labelDay(day)} · distance`,
        value: round((w.distanceMeters as number) / 1000, 1),
        unit: "km",
        source: rowSrc(w, "distanceMeters"),
      });
    }
    if ((w.elevationGainM ?? 0) > 0) {
      book.add({
        key: `trails.${n}.gainM`,
        group: "trails",
        label: `${name} · ${labelDay(day)} · climb`,
        value: round(w.elevationGainM as number),
        unit: "m",
        source: rowSrc(w, "elevationGainM"),
      });
    }

    const prev = prevByTrail.get(w.trailId as string);
    if (!prev) {
      book.add({
        key: `trails.${n}.prev.none`,
        group: "trails",
        label: `${name} · previous run`,
        value: "first recorded run of this trail",
        source: { table: "workout_logs", count: 0, note: `trail ${w.trailId}` },
      });
      return;
    }
    const prevDay = c.dayOf(prev.startedAt);
    const prevMinutes = book.add({
      key: `trails.${n}.prev.minutes`,
      group: "trails",
      label: `${name} · previous run (${labelDay(prevDay)})`,
      value: prev.durationMinutes,
      unit: "min",
      source: rowSrc(prev, "durationMinutes"),
    });
    book.add({
      key: `trails.${n}.minutes.delta`,
      group: "trails",
      label: `${name} · minutes vs previous run`,
      value: w.durationMinutes - prev.durationMinutes,
      unit: "min",
      source: { table: "workout_logs", note: "this run minus the previous run of the same trail" },
      derivedFrom: [minutes.id, prevMinutes.id],
    });
    if ((prev.distanceMeters ?? 0) > 0) {
      book.add({
        key: `trails.${n}.prev.km`,
        group: "trails",
        label: `${name} · previous run · distance`,
        value: round((prev.distanceMeters as number) / 1000, 1),
        unit: "km",
        source: rowSrc(prev, "distanceMeters"),
      });
    }
    if ((prev.elevationGainM ?? 0) > 0) {
      book.add({
        key: `trails.${n}.prev.gainM`,
        group: "trails",
        label: `${name} · previous run · climb`,
        value: round(prev.elevationGainM as number),
        unit: "m",
        source: rowSrc(prev, "elevationGainM"),
      });
    }
  });
}

// ————— intake —————

interface DayIntake {
  kcal: number;
  p: number;
  carbs: number;
  f: number;
  rows: FoodRow[];
}

function bucketFood(c: Ctx, rows: FoodRow[]): Map<string, DayIntake> {
  const out = new Map<string, DayIntake>();
  for (const f of rows) {
    const day = c.dayOf(f.loggedAt);
    const b = out.get(day) ?? { kcal: 0, p: 0, carbs: 0, f: 0, rows: [] };
    b.kcal += f.calories;
    b.p += f.proteinG;
    b.carbs += f.carbsG;
    b.f += f.fatG;
    b.rows.push(f);
    out.set(day, b);
  }
  return out;
}

function addIntake(c: Ctx) {
  const { book, input, targets } = c;
  const week = bucketFood(c, input.food.filter((f) => c.tsInWeek(f.loggedAt)));
  const prev = bucketFood(c, input.food.filter((f) => c.tsInPrev(f.loggedAt)));
  const weekRows = [...week.values()].flatMap((d) => d.rows);
  const prevRows = [...prev.values()].flatMap((d) => d.rows);
  const src = (rows: FoodRow[], extra: Partial<FactSource> = {}): FactSource => ({
    table: "food_logs",
    ids: idsOf(rows),
    dates: daysOf(rows.map((r) => c.dayOf(r.loggedAt))),
    count: rows.length,
    ...extra,
  });

  const loggedDays = book.add({
    key: "intake.loggedDays",
    group: "intake",
    label: "Days with food logged",
    value: week.size,
    unit: "days",
    source: src(weekRows),
  });
  const target = book.add({
    key: "intake.target",
    group: "intake",
    label: "Daily calorie target",
    value: targets.calorieTarget,
    unit: "kcal",
    source: { table: "user_settings", field: "calorieTarget" },
  });
  const proteinTarget = book.add({
    key: "intake.proteinTargetG",
    group: "intake",
    label: "Daily protein target",
    value: targets.proteinTargetG,
    unit: "g",
    source: { table: "user_settings", field: "proteinPct", note: "calorieTarget × protein % ÷ 4" },
  });
  book.add({
    key: "intake.carbsTargetG",
    group: "intake",
    label: "Daily carbs target",
    value: targets.carbsTargetG,
    unit: "g",
    source: { table: "user_settings", field: "carbsPct", note: "calorieTarget × carbs % ÷ 4" },
  });
  book.add({
    key: "intake.fatTargetG",
    group: "intake",
    label: "Daily fat target",
    value: targets.fatTargetG,
    unit: "g",
    source: { table: "user_settings", field: "fatPct", note: "calorieTarget × fat % ÷ 9" },
  });

  let avgKcalFact: Fact | null = null;
  let avgProteinFact: Fact | null = null;
  if (week.size === 0) {
    book.add({
      key: "intake.none",
      group: "intake",
      label: "Food this week",
      value: "no food logged this week",
      source: { table: "food_logs", count: 0 },
    });
  } else {
    const dayValues = [...week.values()];
    const avgKcal = round(mean(dayValues.map((d) => d.kcal)) as number);
    avgKcalFact = book.add({
      key: "intake.avgKcal",
      group: "intake",
      label: "Average intake on logged days",
      value: avgKcal,
      unit: "kcal",
      source: src(weekRows, { field: "calories", note: "average over logged days only" }),
    });
    book.add({
      key: "intake.avgVsTarget",
      group: "intake",
      label: "Daily intake vs target (average)",
      value: avgKcal - targets.calorieTarget,
      unit: "kcal",
      source: { table: "food_logs", note: "average intake minus target; positive = over" },
      derivedFrom: [avgKcalFact.id, target.id],
    });
    book.add({
      key: "intake.weekVsTarget",
      group: "intake",
      label: "Week intake vs target, logged days",
      value: (avgKcal - targets.calorieTarget) * week.size,
      unit: "kcal",
      source: { table: "food_logs", note: "(average − target) × logged days; positive = over" },
      derivedFrom: [avgKcalFact.id, target.id, loggedDays.id],
    });

    const avgP = round(mean(dayValues.map((d) => d.p)) as number);
    avgProteinFact = book.add({
      key: "intake.avgProteinG",
      group: "intake",
      label: "Average protein on logged days",
      value: avgP,
      unit: "g",
      source: src(weekRows, { field: "proteinG" }),
    });
    if (targets.proteinTargetG > 0) {
      book.add({
        key: "intake.proteinPctOfTarget",
        group: "intake",
        label: "Protein as % of target",
        value: round((avgP / targets.proteinTargetG) * 100),
        unit: "%",
        source: { table: "food_logs", note: "average protein ÷ protein target" },
        derivedFrom: [avgProteinFact.id, proteinTarget.id],
      });
    }
    const hit = [...week.entries()].filter(([, d]) => d.p >= targets.proteinTargetG);
    book.add({
      key: "intake.proteinDaysHit",
      group: "intake",
      label: "Days at or above the protein target",
      value: hit.length,
      unit: "days",
      source: {
        table: "food_logs",
        field: "proteinG",
        dates: daysOf(hit.map(([day]) => day)),
        count: hit.length,
      },
      derivedFrom: [proteinTarget.id],
    });
    book.add({
      key: "intake.avgCarbsG",
      group: "intake",
      label: "Average carbs on logged days",
      value: round(mean(dayValues.map((d) => d.carbs)) as number),
      unit: "g",
      source: src(weekRows, { field: "carbsG" }),
    });
    book.add({
      key: "intake.avgFatG",
      group: "intake",
      label: "Average fat on logged days",
      value: round(mean(dayValues.map((d) => d.f)) as number),
      unit: "g",
      source: src(weekRows, { field: "fatG" }),
    });
    for (const [day, d] of [...week.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      book.add({
        key: `intake.day.${day}`,
        group: "intake",
        label: `${labelDay(day)} · kcal logged`,
        value: round(d.kcal),
        unit: "kcal",
        source: src(d.rows, { field: "calories" }),
      });
    }
  }

  book.add({
    key: "intake.loggedDays.prev",
    group: "compare",
    label: "Days with food logged · previous week",
    value: prev.size,
    unit: "days",
    source: src(prevRows),
  });
  if (prev.size > 0) {
    const prevValues = [...prev.values()];
    const prevAvg = round(mean(prevValues.map((d) => d.kcal)) as number);
    const prevAvgFact = book.add({
      key: "intake.avgKcal.prev",
      group: "compare",
      label: "Average intake · previous week",
      value: prevAvg,
      unit: "kcal",
      source: src(prevRows, { field: "calories", note: "average over logged days only" }),
    });
    if (avgKcalFact) {
      book.add({
        key: "intake.avgKcal.delta",
        group: "compare",
        label: "Average intake vs previous week",
        value: (avgKcalFact.value as number) - prevAvg,
        unit: "kcal",
        source: { table: "food_logs", note: "this week's average minus the previous week's" },
        derivedFrom: [avgKcalFact.id, prevAvgFact.id],
      });
    }
    const prevP = round(mean(prevValues.map((d) => d.p)) as number);
    const prevPFact = book.add({
      key: "intake.avgProteinG.prev",
      group: "compare",
      label: "Average protein · previous week",
      value: prevP,
      unit: "g",
      source: src(prevRows, { field: "proteinG" }),
    });
    if (avgProteinFact) {
      book.add({
        key: "intake.avgProteinG.delta",
        group: "compare",
        label: "Average protein vs previous week",
        value: (avgProteinFact.value as number) - prevP,
        unit: "g",
        source: { table: "food_logs", note: "this week's average minus the previous week's" },
        derivedFrom: [avgProteinFact.id, prevPFact.id],
      });
    }
  }
}

// ————— hydration (group omitted when nothing was logged — docs/coach-plan.md D10) —————

function addHydration(c: Ctx) {
  const { book, input } = c;
  const rows = input.water.filter((w) => c.tsInWeek(w.loggedAt));
  if (rows.length === 0) return;
  const days = daysOf(rows.map((w) => c.dayOf(w.loggedAt)));
  const total = sum(rows.map((w) => w.amountMl));
  const src: FactSource = {
    table: "water_logs",
    field: "amountMl",
    ids: idsOf(rows),
    dates: days,
    count: rows.length,
  };
  const daysFact = book.add({
    key: "hydration.daysLogged",
    group: "hydration",
    label: "Days with water logged",
    value: days.length,
    unit: "days",
    source: src,
  });
  const totalFact = book.add({
    key: "hydration.totalMl",
    group: "hydration",
    label: "Water logged",
    value: total,
    unit: "ml",
    source: src,
  });
  book.add({
    key: "hydration.avgMlPerLoggedDay",
    group: "hydration",
    label: "Water per logged day",
    value: round(total / days.length),
    unit: "ml",
    source: { table: "water_logs", note: "total ÷ days with any water logged" },
    derivedFrom: [totalFact.id, daysFact.id],
  });
}

// ————— body —————

function fieldSourceOf(row: BodyRow, field: string): string | undefined {
  const fs = (row.fieldSources ?? {}) as Record<string, unknown>;
  const v = fs[field];
  if (typeof v === "string" && v) return v;
  return row.source ?? undefined;
}

function addBody(c: Ctx) {
  const { book, input } = c;
  const rows = input.body
    .filter((r) => r.weightKg != null && r.measuredAt <= c.cutoff)
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime());
  const weekRows = rows.filter((r) => c.tsInWeek(r.measuredAt));
  const prevRows = rows.filter((r) => c.tsInPrev(r.measuredAt));
  const rowSrc = (r: BodyRow, field: string): FactSource => ({
    table: "body_measurements",
    field,
    ids: [r.id],
    dates: [c.dayOf(r.measuredAt)],
    fieldSource: fieldSourceOf(r, field),
  });

  let lastFact: Fact | null = null;
  if (weekRows.length === 0) {
    book.add({
      key: "body.none",
      group: "body",
      label: "Weigh-ins this week",
      value: "no weigh-in this week",
      source: { table: "body_measurements", count: 0 },
    });
    const before = rows.filter((r) => c.dayOf(r.measuredAt) < c.weekStart).at(-1);
    if (before) {
      book.add({
        key: "body.lastWeighInDaysAgo",
        group: "body",
        label: "Days since the last weigh-in, at week end",
        value: dateStringDiffDays(c.dayOf(before.measuredAt), c.weekEnd),
        unit: "days",
        source: rowSrc(before, "weightKg"),
      });
    }
  } else {
    const first = weekRows[0];
    const last = weekRows[weekRows.length - 1];
    book.add({
      key: "body.weighIns",
      group: "body",
      label: "Weigh-ins this week",
      value: weekRows.length,
      unit: "weigh-ins",
      source: {
        table: "body_measurements",
        field: "weightKg",
        ids: idsOf(weekRows),
        dates: daysOf(weekRows.map((r) => c.dayOf(r.measuredAt))),
        count: weekRows.length,
      },
    });
    const firstFact = book.add({
      key: "body.weightFirst",
      group: "body",
      label: `Weight · ${labelDay(c.dayOf(first.measuredAt))}`,
      value: round(first.weightKg as number, 1),
      unit: "kg",
      source: rowSrc(first, "weightKg"),
    });
    if (weekRows.length > 1) {
      lastFact = book.add({
        key: "body.weightLast",
        group: "body",
        label: `Weight · ${labelDay(c.dayOf(last.measuredAt))}`,
        value: round(last.weightKg as number, 1),
        unit: "kg",
        source: rowSrc(last, "weightKg"),
      });
      book.add({
        key: "body.weightDelta",
        group: "body",
        label: "Weight change across the week",
        value: round((last.weightKg as number) - (first.weightKg as number), 1),
        unit: "kg",
        source: { table: "body_measurements", note: "last weigh-in minus the first, this week" },
        derivedFrom: [firstFact.id, lastFact.id],
      });
    } else {
      lastFact = firstFact;
    }

    const fat = [...weekRows].reverse().find((r) => r.bodyFatPct != null);
    if (fat) {
      book.add({
        key: "body.fatPct",
        group: "body",
        label: `Body fat · ${labelDay(c.dayOf(fat.measuredAt))}`,
        value: round(fat.bodyFatPct as number, 1),
        unit: "%",
        source: rowSrc(fat, "bodyFatPct"),
      });
    }
    const skm = [...weekRows]
      .reverse()
      .find((r) => r.skeletalMuscleKg != null || (r.skeletalMusclePct != null && r.weightKg != null));
    if (skm) {
      const kg =
        skm.skeletalMuscleKg ??
        ((skm.skeletalMusclePct as number) * (skm.weightKg as number)) / 100;
      book.add({
        key: "body.skeletalMuscleKg",
        group: "body",
        label: `Skeletal muscle · ${labelDay(c.dayOf(skm.measuredAt))}`,
        value: round(kg, 1),
        unit: "kg",
        source: rowSrc(skm, skm.skeletalMuscleKg != null ? "skeletalMuscleKg" : "skeletalMusclePct"),
      });
    }
  }

  if (rows.length >= TREND_MIN_POINTS) {
    const firstDay = c.dayOf(rows[0].measuredAt);
    const lastDay = c.dayOf(rows[rows.length - 1].measuredAt);
    if (dateStringDiffDays(firstDay, lastDay) >= TREND_MIN_SPAN_DAYS) {
      const xs = rows.map((r) => dateStringDiffDays(firstDay, c.dayOf(r.measuredAt)));
      const ys = rows.map((r) => r.weightKg as number);
      book.add({
        key: "body.trendKgPerWeek",
        group: "body",
        label: "Weight trend · last 4 weeks",
        value: round(leastSquaresSlope(xs, ys) * 7, 2),
        unit: "kg/week",
        source: {
          table: "body_measurements",
          field: "weightKg",
          ids: idsOf(rows),
          dates: daysOf(rows.map((r) => c.dayOf(r.measuredAt))),
          count: rows.length,
          note: "least-squares slope over the weigh-ins of the last 4 weeks",
        },
      });
    }
  }

  if (prevRows.length > 0 && lastFact) {
    const prevLast = prevRows[prevRows.length - 1];
    const prevFact = book.add({
      key: "body.weightLast.prev",
      group: "compare",
      label: `Weight · previous week's last weigh-in (${labelDay(c.dayOf(prevLast.measuredAt))})`,
      value: round(prevLast.weightKg as number, 1),
      unit: "kg",
      source: rowSrc(prevLast, "weightKg"),
    });
    book.add({
      key: "body.weightWeekOverWeek",
      group: "compare",
      label: "Weight vs previous week",
      value: round((lastFact.value as number) - (prevFact.value as number), 1),
      unit: "kg",
      source: { table: "body_measurements", note: "this week's last weigh-in minus the previous week's" },
      derivedFrom: [lastFact.id, prevFact.id],
    });
  }
}

// ————— recovery —————

type RecoveryField = "sleepMinutes" | "hrvMs" | "restingHeartRateBpm";

/** One row per day: the companion keys rows by date + timezone + source, so a
 *  travel day can have two. The fuller row wins; ties go to the first. */
function pickPerDay(rows: SnapshotRow[]): Map<string, SnapshotRow> {
  const filled = (r: SnapshotRow) =>
    [r.sleepMinutes, r.hrvMs, r.restingHeartRateBpm].filter((v) => v != null).length;
  const out = new Map<string, SnapshotRow>();
  for (const r of rows) {
    const current = out.get(r.localDate);
    if (!current || filled(r) > filled(current)) out.set(r.localDate, r);
  }
  return out;
}

const RECOVERY_METRICS: Array<{
  key: string;
  field: RecoveryField;
  label: string;
  unit: string;
  places: number;
  convert: (v: number) => number;
  countKey: string;
  countLabel: string;
  countUnit: string;
}> = [
  {
    key: "sleep",
    field: "sleepMinutes",
    label: "Sleep",
    unit: "h",
    places: 1,
    convert: (m) => m / 60,
    countKey: "sleepNights",
    countLabel: "Nights with sleep data",
    countUnit: "nights",
  },
  {
    key: "hrv",
    field: "hrvMs",
    label: "HRV",
    unit: "ms",
    places: 0,
    convert: (v) => v,
    countKey: "hrvDays",
    countLabel: "Days with HRV",
    countUnit: "days",
  },
  {
    key: "rhr",
    field: "restingHeartRateBpm",
    label: "Resting heart rate",
    unit: "bpm",
    places: 0,
    convert: (v) => v,
    countKey: "rhrDays",
    countLabel: "Days with resting heart rate",
    countUnit: "days",
  },
];

function addRecovery(c: Ctx) {
  const { book, input } = c;
  const week = pickPerDay(input.snapshots.filter((s) => c.dayInWeek(s.localDate)));
  const prev = pickPerDay(input.snapshots.filter((s) => c.dayInPrev(s.localDate)));

  for (const m of RECOVERY_METRICS) {
    const have = [...week.values()].filter((r) => r[m.field] != null);
    const src = (rows: SnapshotRow[]): FactSource => ({
      table: "daily_health_snapshots",
      field: m.field,
      ids: idsOf(rows),
      dates: daysOf(rows.map((r) => r.localDate)),
      count: rows.length,
    });
    if (have.length === 0) {
      book.add({
        key: `recovery.${m.key}.none`,
        group: "recovery",
        label: m.label,
        value: `no ${m.label.toLowerCase()} data this week`,
        source: { table: "daily_health_snapshots", field: m.field, count: 0 },
      });
      continue;
    }
    const avg = round(m.convert(mean(have.map((r) => r[m.field] as number)) as number), m.places);
    const avgFact = book.add({
      key: `recovery.${m.key}Avg`,
      group: "recovery",
      label: `${m.label} · average`,
      value: avg,
      unit: m.unit,
      source: src(have),
    });
    book.add({
      key: `recovery.${m.countKey}`,
      group: "recovery",
      label: m.countLabel,
      value: have.length,
      unit: m.countUnit,
      source: src(have),
    });
    const prevHave = [...prev.values()].filter((r) => r[m.field] != null);
    if (prevHave.length > 0) {
      const prevAvg = round(
        m.convert(mean(prevHave.map((r) => r[m.field] as number)) as number),
        m.places
      );
      const prevFact = book.add({
        key: `recovery.${m.key}Avg.prev`,
        group: "compare",
        label: `${m.label} · average, previous week`,
        value: prevAvg,
        unit: m.unit,
        source: src(prevHave),
      });
      book.add({
        key: `recovery.${m.key}Avg.delta`,
        group: "compare",
        label: `${m.label} vs previous week`,
        value: round(avg - prevAvg, m.places),
        unit: m.unit,
        source: { table: "daily_health_snapshots", note: "this week's average minus the previous week's" },
        derivedFrom: [avgFact.id, prevFact.id],
      });
    }
  }
}

// ————— activity (Apple Health days; honest when none arrived) —————

function addActivity(c: Ctx) {
  const { book, input } = c;
  const report = buildWeeklyReport(
    input.activity.filter((r) => c.dayInWeek(r.date) || c.dayInPrev(r.date)),
    c.weekStart
  );
  const base: FactSource = {
    table: "daily_activity",
    note: "Apple Health days from the iPhone app or the Shortcut, filled from daily_health_snapshots where a day is missing",
  };
  if (report.daysWithData === 0) {
    book.add({
      key: "activity.none",
      group: "activity",
      label: "Steps this week",
      value: "no step data this week",
      source: { ...base, count: 0 },
    });
    return;
  }
  const dates = report.days.filter((d) => d.hasData).map((d) => d.date);
  book.add({
    key: "activity.daysArrived",
    group: "activity",
    label: "Days with Apple Health data",
    value: report.daysWithData,
    unit: "days",
    source: { ...base, dates, count: report.daysWithData },
  });
  if (report.dailyAvg.steps != null) {
    const stepsFact = book.add({
      key: "activity.stepsAvg",
      group: "activity",
      label: "Steps per day · average over the days that arrived",
      value: report.dailyAvg.steps,
      unit: "steps",
      source: { ...base, field: "steps", dates, count: report.daysWithData },
    });
    if (report.totals.steps != null) {
      book.add({
        key: "activity.stepsTotal",
        group: "activity",
        label: "Steps · days that arrived",
        value: report.totals.steps,
        unit: "steps",
        source: { ...base, field: "steps", dates, count: report.daysWithData },
      });
    }
    const tenK = report.days.filter((d) => (d.steps ?? 0) >= TEN_K_STEPS);
    book.add({
      key: "activity.tenKDays",
      group: "activity",
      label: "Days at 10,000+ steps",
      value: tenK.length,
      unit: "days",
      source: { ...base, field: "steps", dates: tenK.map((d) => d.date), count: tenK.length },
    });
    if (report.best) {
      book.add({
        key: "activity.bestDaySteps",
        group: "activity",
        label: `Most steps · ${labelDay(report.best.date)}`,
        value: report.best.steps,
        unit: "steps",
        source: { ...base, field: "steps", dates: [report.best.date] },
      });
    }
    if (report.previous.dailyAvg.steps != null) {
      const prevFact = book.add({
        key: "activity.stepsAvg.prev",
        group: "compare",
        label: "Steps per day · previous week",
        value: report.previous.dailyAvg.steps,
        unit: "steps",
        source: { ...base, field: "steps", count: report.previous.daysWithData },
      });
      if (report.change.steps != null) {
        book.add({
          key: "activity.stepsAvg.deltaPct",
          group: "compare",
          label: "Steps per day vs previous week",
          value: report.change.steps,
          unit: "%",
          source: { ...base, note: "change in the daily average, this week over the previous" },
          derivedFrom: [stepsFact.id, prevFact.id],
        });
      }
    }
  }
  if (report.dailyAvg.activeEnergyKcal != null) {
    book.add({
      key: "activity.activeKcalAvg",
      group: "activity",
      label: "Active calories per day · average",
      value: report.dailyAvg.activeEnergyKcal,
      unit: "kcal",
      source: { ...base, field: "active_energy_kcal", dates, count: report.daysWithData },
    });
  }
  if (report.dailyAvg.walkingRunningDistanceKm != null) {
    book.add({
      key: "activity.kmAvg",
      group: "activity",
      label: "Walk + run per day · average",
      value: round(report.dailyAvg.walkingRunningDistanceKm, 1),
      unit: "km",
      source: { ...base, field: "walking_running_distance_km", dates, count: report.daysWithData },
    });
  }
}

// ————— plan (next week) · progression —————

function addNextWeek(c: Ctx) {
  const { book, input } = c;
  const plans = input.plans
    .filter((p) => p.localDate >= c.nextStart && p.localDate <= c.nextEnd)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  const seqName = new Map(input.sequences.map((s) => [s.id, s.name]));
  const trailName = new Map(input.trails.map((t) => [t.id, t.name]));
  if (plans.length === 0) {
    book.add({
      key: "plan.nextWeek.none",
      group: "plan",
      label: "Next week's plan",
      value: "nothing planned yet for next week",
      source: { table: "planned_workouts", count: 0 },
    });
  } else {
    book.add({
      key: "plan.nextWeek.planned",
      group: "plan",
      label: "Days already planned for next week",
      value: plans.length,
      unit: "days",
      source: {
        table: "planned_workouts",
        ids: idsOf(plans),
        dates: daysOf(plans.map((p) => p.localDate)),
        count: plans.length,
      },
    });
    plans.forEach((p, i) => {
      const parts = [
        p.title,
        p.sequenceId ? seqName.get(p.sequenceId) : undefined,
        p.trailId ? trailName.get(p.trailId) : undefined,
      ].filter((x): x is string => Boolean(x));
      const value = p.targetWeightKg ? `${parts.join(" · ")} · ${p.targetWeightKg} kg` : parts.join(" · ");
      book.add({
        key: `plan.nextWeek.${i + 1}`,
        group: "plan",
        label: `${labelDay(p.localDate)} · planned`,
        value,
        source: { table: "planned_workouts", ids: [p.id], dates: [p.localDate] },
      });
    });
  }
  input.progression.forEach((s, i) => {
    book.add({
      key: `plan.progression.${i + 1}`,
      group: "plan",
      label: `${s.sequenceName} · progression`,
      value: `${s.type === "raise" ? "raise earned" : "deload due"} — ${s.reason}`,
      source: {
        table: "sequences",
        ids: [s.sequenceId],
        note: "pure math from his runs of this routine; the plan's suggestion, never a command",
      },
    });
  });
}

// ————— journal —————

function addJournal(c: Ctx) {
  const { book, input } = c;
  const pages = input.journal
    .filter((j) => c.dayInWeek(j.localDate) && j.text.trim().length > 0)
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  if (pages.length === 0) {
    book.add({
      key: "journal.none",
      group: "journal",
      label: "Journal this week",
      value: "no journal pages this week",
      source: { table: "journal_entries", count: 0 },
    });
    return;
  }
  book.add({
    key: "journal.pages",
    group: "journal",
    label: "Journal pages written",
    value: pages.length,
    unit: "pages",
    source: {
      table: "journal_entries",
      ids: idsOf(pages),
      dates: daysOf(pages.map((p) => p.localDate)),
      count: pages.length,
    },
  });
  if (!input.options.journalExcerpts) return;
  pages.slice(0, MAX_EXCERPTS).forEach((p, i) => {
    const text = p.text.replace(/\s+/g, " ").trim();
    const excerpt =
      text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : text;
    book.add({
      key: `journal.excerpt.${i + 1}`,
      group: "journal",
      label: `${labelDay(p.localDate)} · journal`,
      value: excerpt,
      source: { table: "journal_entries", field: "text", ids: [p.id], dates: [p.localDate] },
    });
  });
}

// ————— the builder —————

export function buildWeekFacts(input: WeekInput): WeekFacts {
  const { weekStart, timeZone } = input;
  const weekEnd = addDaysToDateString(weekStart, 6);
  const prevStart = addDaysToDateString(weekStart, -7);
  const prevEnd = addDaysToDateString(weekStart, -1);
  const nextStart = addDaysToDateString(weekStart, 7);
  const nextEnd = addDaysToDateString(weekStart, 13);
  const targets = getCoachTargets((input.settings ?? null) as SettingsLike);
  const dayOf = (d: Date) => getDateStringInTimeZone(d, timeZone);

  // The cutoff: never before the week starts, never after its Sunday ends.
  const weekSpan = getUtcDateRangeForTimeZone(weekStart, weekEnd, timeZone);
  const prevSpan = getUtcDateRangeForTimeZone(prevStart, prevEnd, timeZone);
  const cutoff = new Date(
    Math.min(
      Math.max(input.cutoff.getTime(), weekSpan.rangeStart.getTime()),
      weekSpan.rangeEnd.getTime()
    )
  );
  const complete = cutoff.getTime() >= weekSpan.rangeEnd.getTime();
  const cutoffDay = dayOf(cutoff);
  const prevCutoffDay = addDaysToDateString(cutoffDay, -7);
  // The previous week is cut at the same local weekday and minute.
  const parts = getZonedDateParts(cutoff, timeZone);
  const prevCutoff = complete
    ? prevSpan.rangeEnd
    : zonedLocalDateTimeToUtc(prevCutoffDay, timeZone, parts.hour, parts.minute, 59);

  const book = new FactBook();
  const c: Ctx = {
    book,
    input,
    weekStart,
    weekEnd,
    prevStart,
    prevEnd,
    nextStart,
    nextEnd,
    targets,
    cutoff,
    prevCutoff,
    cutoffDay,
    prevCutoffDay,
    complete,
    dayOf,
    tsInWeek: (t) => t >= weekSpan.rangeStart && t <= cutoff,
    tsInPrev: (t) => t >= prevSpan.rangeStart && t <= prevCutoff,
    dayInWeek: (day) => day >= weekStart && day <= cutoffDay,
    dayInPrev: (day) => day >= prevStart && day <= prevCutoffDay,
  };

  const coverage = coverageOf(c, timeZone);
  addWeek(c, coverage);
  const sessions = addTraining(c);
  addRecords(c);
  addTrails(c, sessions);
  addIntake(c);
  addHydration(c);
  addBody(c);
  addRecovery(c);
  addActivity(c);
  addNextWeek(c);
  addJournal(c);

  return {
    weekStart,
    weekEnd,
    weekNumber: isoWeekNumber(weekStart),
    timeZone,
    builtAt: input.now.toISOString(),
    coverage,
    targets,
    groups: book.presentGroups(),
    facts: book.facts,
    routines: input.sequences.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
    trails: input.trails.map((t) => ({ id: t.id, name: t.name })),
    nextWeek: {
      weekStart: nextStart,
      weekEnd: nextEnd,
      dates: Array.from({ length: 7 }, (_, i) => addDaysToDateString(nextStart, i)),
    },
  };
}

/** The facts as the model sees them: provenance ids and dates stripped (they are for the chips). */
export function factsForModel(facts: WeekFacts): ModelWeekFacts {
  const trimmed: ModelFact[] = facts.facts.map(({ source, ...rest }) => {
    const { table, field, count, note, fieldSource } = source;
    return {
      ...rest,
      source: {
        table,
        ...(field !== undefined ? { field } : {}),
        ...(count !== undefined ? { count } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(fieldSource !== undefined ? { fieldSource } : {}),
      },
    };
  });
  return { ...facts, facts: trimmed };
}

export function factByKey(facts: WeekFacts, key: string): Fact | undefined {
  return facts.facts.find((f) => f.key === key);
}

export function factsInGroup(facts: WeekFacts, group: FactGroup): Fact[] {
  return facts.facts.filter((f) => f.group === group);
}
