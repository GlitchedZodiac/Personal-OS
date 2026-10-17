// Morning and weekly activity reports (2026-10-17) — pure arithmetic over
// daily_activity rows, so every number on the screen and in the push is
// tested without a database. lib/activity-reports.ts loads the rows and
// sends the notifications.
//
// Rules, decided once here so the screen, the push and the assistant agree:
//   - "7-day average" is the 7 days BEFORE the reported day — yesterday is
//     compared with the week that led up to it, not with itself.
//   - Averages count only days that have the metric. A day the Shortcut
//     never delivered is missing, not a zero (a zero would drag every
//     average down for a phone that was simply locked).
//   - Week-over-week compares DAILY AVERAGES. For two full weeks that is the
//     same as comparing totals; for the week in progress it is the only fair
//     comparison.
//   - Best and worst day are by steps.

import { addDaysToDateString } from "@/lib/timezone";

export interface ActivityRow {
  date: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  restingEnergyKcal: number | null;
  walkingRunningDistanceKm: number | null;
  source?: string | null;
  receivedAt?: Date | string | null;
  /** shortcut = daily_activity; app = the iPhone app's own push, filling a gap */
  origin?: "shortcut" | "app";
}

export const ACTIVITY_METRICS = [
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "walkingRunningDistanceKm",
] as const;
export type ActivityMetric = (typeof ACTIVITY_METRICS)[number];

/** Steps and kcal are whole numbers on screen; distance keeps two places. */
const PLACES: Record<ActivityMetric, number> = {
  steps: 0,
  activeEnergyKcal: 0,
  restingEnergyKcal: 0,
  walkingRunningDistanceKm: 2,
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Whole-percent change, or null when there is nothing honest to compare with. */
export function pctChange(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) return null;
  return Math.round(((value - base) / base) * 100);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

function byDate(rows: ActivityRow[]): Map<string, ActivityRow> {
  return new Map(rows.map((r) => [r.date, r]));
}

function valuesOf(rows: (ActivityRow | undefined)[], metric: ActivityMetric): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const v = row?.[metric];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

function hasAnyMetric(row: ActivityRow | undefined): row is ActivityRow {
  return !!row && ACTIVITY_METRICS.some((m) => typeof row[m] === "number");
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// ————— Morning —————

export interface Comparison {
  value: number | null;
  /** mean of the 7 days before, over the days that have this metric */
  avg7: number | null;
  avg7Days: number;
  vsAvg7Pct: number | null;
  /** the same weekday one week earlier */
  lastWeek: number | null;
  vsLastWeekPct: number | null;
}

export interface MorningReport {
  date: string;
  weekday: string;
  /** the date a week earlier, for "vs last Thursday" */
  lastWeekDate: string;
  hasData: boolean;
  source: string | null;
  receivedAt: string | null;
  metrics: Record<ActivityMetric, Comparison>;
}

/** `rows` must cover date−7 … date; extra rows are ignored. */
export function buildMorningReport(rows: ActivityRow[], date: string): MorningReport {
  const index = byDate(rows);
  const day = index.get(date);
  const lastWeekDate = addDaysToDateString(date, -7);
  const prior = Array.from({ length: 7 }, (_, i) => index.get(addDaysToDateString(date, -7 + i)));

  const metrics = {} as Record<ActivityMetric, Comparison>;
  for (const metric of ACTIVITY_METRICS) {
    const places = PLACES[metric];
    const raw = day?.[metric];
    const value = typeof raw === "number" ? roundTo(raw, places) : null;
    const priorValues = valuesOf(prior, metric);
    const avg = mean(priorValues);
    const avg7 = avg === null ? null : roundTo(avg, places);
    const lw = index.get(lastWeekDate)?.[metric];
    const lastWeek = typeof lw === "number" ? roundTo(lw, places) : null;
    metrics[metric] = {
      value,
      avg7,
      avg7Days: priorValues.length,
      // Percentages from the unrounded numbers, so 0.4 km vs 0.35 km is not "+0%".
      vsAvg7Pct: pctChange(typeof raw === "number" ? raw : null, avg),
      lastWeek,
      vsLastWeekPct: pctChange(typeof raw === "number" ? raw : null, typeof lw === "number" ? lw : null),
    };
  }

  return {
    date,
    weekday: weekdayOf(date),
    lastWeekDate,
    hasData: hasAnyMetric(day),
    source: day?.source ?? null,
    receivedAt: iso(day?.receivedAt),
    metrics,
  };
}

// ————— Weekly —————

export interface WeeklyDay {
  date: string;
  /** Mon … Sun */
  label: string;
  hasData: boolean;
  steps: number | null;
  activeEnergyKcal: number | null;
  restingEnergyKcal: number | null;
  walkingRunningDistanceKm: number | null;
}

export interface WeekStats {
  weekStart: string;
  daysWithData: number;
  totals: Record<ActivityMetric, number | null>;
  dailyAvg: Record<ActivityMetric, number | null>;
}

export interface DayPick {
  date: string;
  label: string;
  steps: number;
}

export interface WeeklyReport extends WeekStats {
  weekEnd: string;
  days: WeeklyDay[];
  /** all seven days are in */
  complete: boolean;
  best: DayPick | null;
  /** only when two or more days have steps — one day is not "worst" */
  worst: DayPick | null;
  previous: WeekStats;
  /** week-over-week change in the DAILY AVERAGE, whole percent */
  change: Record<ActivityMetric, number | null>;
}

function weekStats(index: Map<string, ActivityRow>, weekStart: string): WeekStats & { rows: (ActivityRow | undefined)[] } {
  const rows = Array.from({ length: 7 }, (_, i) => index.get(addDaysToDateString(weekStart, i)));
  const totals = {} as Record<ActivityMetric, number | null>;
  const dailyAvg = {} as Record<ActivityMetric, number | null>;
  for (const metric of ACTIVITY_METRICS) {
    const values = valuesOf(rows, metric);
    const t = sum(values);
    const a = mean(values);
    totals[metric] = t === null ? null : roundTo(t, PLACES[metric]);
    dailyAvg[metric] = a === null ? null : roundTo(a, PLACES[metric]);
  }
  return { weekStart, daysWithData: rows.filter(hasAnyMetric).length, totals, dailyAvg, rows };
}

/** `weekStart` is a Monday; `rows` must cover the week before it too. */
export function buildWeeklyReport(rows: ActivityRow[], weekStart: string): WeeklyReport {
  const index = byDate(rows);
  const { rows: weekRows, ...current } = weekStats(index, weekStart);
  const { rows: prevRows, ...previous } = weekStats(index, addDaysToDateString(weekStart, -7));

  const days: WeeklyDay[] = weekRows.map((row, i) => {
    const date = addDaysToDateString(weekStart, i);
    return {
      date,
      label: weekdayOf(date).slice(0, 3),
      hasData: hasAnyMetric(row),
      steps: row?.steps ?? null,
      activeEnergyKcal: row?.activeEnergyKcal == null ? null : roundTo(row.activeEnergyKcal, 0),
      restingEnergyKcal: row?.restingEnergyKcal == null ? null : roundTo(row.restingEnergyKcal, 0),
      walkingRunningDistanceKm:
        row?.walkingRunningDistanceKm == null ? null : roundTo(row.walkingRunningDistanceKm, 2),
    };
  });

  const stepped = days
    .filter((d): d is WeeklyDay & { steps: number } => typeof d.steps === "number")
    .map((d) => ({ date: d.date, label: d.label, steps: d.steps }));
  // Ties go to the earlier day, so the answer never depends on sort stability.
  const best = stepped.reduce<DayPick | null>((b, d) => (!b || d.steps > b.steps ? d : b), null);
  const worst =
    stepped.length >= 2
      ? stepped.reduce<DayPick | null>((w, d) => (!w || d.steps < w.steps ? d : w), null)
      : null;

  const change = {} as Record<ActivityMetric, number | null>;
  for (const metric of ACTIVITY_METRICS) {
    const now = mean(valuesOf(weekRows, metric));
    const before = mean(valuesOf(prevRows, metric));
    change[metric] = pctChange(now, before);
  }

  return {
    ...current,
    weekEnd: addDaysToDateString(weekStart, 6),
    days,
    complete: current.daysWithData === 7,
    best,
    worst,
    previous,
    change,
  };
}

// ————— Words —————

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const km = (n: number) => `${n.toFixed(1)} km`;

function signed(pct: number | null, against: string): string | null {
  if (pct === null) return null;
  if (pct === 0) return `even with ${against}`;
  return `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct)}% vs ${against}`;
}

/** The 7 am push. Null when there is nothing to say. */
export function morningNotification(report: MorningReport): { title: string; body: string } | null {
  if (!report.hasData) return null;
  const { steps, activeEnergyKcal, restingEnergyKcal, walkingRunningDistanceKm } = report.metrics;
  const title =
    steps.value !== null ? `Yesterday · ${fmt(steps.value)} steps` : `Yesterday · ${report.weekday}`;
  const parts = [
    signed(steps.vsAvg7Pct, "7-day avg"),
    signed(steps.vsLastWeekPct, `last ${report.weekday.slice(0, 3)}`),
    activeEnergyKcal.value !== null || restingEnergyKcal.value !== null
      ? `${fmt(activeEnergyKcal.value ?? 0)} active + ${fmt(restingEnergyKcal.value ?? 0)} resting kcal`
      : null,
    walkingRunningDistanceKm.value !== null ? km(walkingRunningDistanceKm.value) : null,
  ].filter(Boolean);
  return { title, body: parts.join(" · ") };
}

/** The Sunday-evening push. Null when the week has no data at all. */
export function weeklyNotification(report: WeeklyReport): { title: string; body: string } | null {
  if (report.daysWithData === 0) return null;
  const { totals, dailyAvg, change, best } = report;
  const title =
    totals.steps !== null ? `Your week · ${fmt(totals.steps)} steps` : "Your week in activity";
  const parts = [
    dailyAvg.steps !== null ? `${fmt(dailyAvg.steps)}/day` : null,
    best ? `best ${best.label} ${fmt(best.steps)}` : null,
    signed(change.steps, "last week"),
    totals.activeEnergyKcal !== null ? `${fmt(totals.activeEnergyKcal)} active kcal` : null,
    totals.walkingRunningDistanceKm !== null ? km(totals.walkingRunningDistanceKm) : null,
    report.complete ? null : `${report.daysWithData} of 7 days in`,
  ].filter(Boolean);
  return { title, body: parts.join(" · ") };
}
