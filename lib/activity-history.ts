// Steps and calories over his whole history (2026-10-17, his ask: "a
// general view for steps — days, weeks, months, all time, and trends").
// Pure, like lib/activity-summary.ts: the route loads rows, this shapes them.
//
// Rules, decided here once:
//   - History counts COMPLETE days: everything runs through yesterday
//     (Central). Today's partial count would drag every average down.
//   - Weeks, months and years show the DAILY AVERAGE over the days that
//     arrived, with the total beside it. A month with ten days of data is
//     not a bad month — it is a month with ten days of data.
//   - Best week needs 4+ days in, best month 15+, so a single huge day does
//     not crown its week.
//   - Two sources: the Health Shortcut's table wins; on a day it has not
//     sent, the iPhone app's own push (daily_health_snapshots) fills in, and
//     is marked so the screen can say so. That app push can be a partial day.

import type { ActivityRow } from "@/lib/activity-summary";
import { addDaysToDateString, dateStringDiffDays, getWeekStartDateString } from "@/lib/timezone";

export const HISTORY_METRICS = [
  "steps",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "walkingRunningDistanceKm",
] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];

type Values = Record<HistoryMetric, number | null>;

const PLACES: Record<HistoryMetric, number> = {
  steps: 0,
  activeEnergyKcal: 0,
  restingEnergyKcal: 0,
  walkingRunningDistanceKm: 2,
};

export const TEN_K = 10_000;

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ————— Sources —————

export interface SnapshotDay {
  localDate: string;
  steps: number | null;
  activeEnergyKcal: number | null;
  walkingRunningDistanceMeters: number | null;
}

/**
 * The Shortcut's row for a date, else the iPhone app's. The app keys its push
 * by date AND timezone, so a travel day can hold two rows for one date —
 * the one with more steps is the fuller read of that day.
 */
export function mergeActivitySources(shortcut: ActivityRow[], snapshots: SnapshotDay[]): ActivityRow[] {
  const out = new Map<string, ActivityRow>();
  for (const row of shortcut) out.set(row.date, { ...row, origin: "shortcut" });

  const fullest = new Map<string, SnapshotDay>();
  for (const snap of snapshots) {
    const hasAny =
      (num(snap.steps) ?? 0) > 0 || num(snap.activeEnergyKcal) != null || num(snap.walkingRunningDistanceMeters) != null;
    if (!hasAny) continue;
    const seen = fullest.get(snap.localDate);
    if (!seen || (num(snap.steps) ?? 0) > (num(seen.steps) ?? 0)) fullest.set(snap.localDate, snap);
  }
  for (const [date, snap] of fullest) {
    if (out.has(date)) continue;
    const meters = num(snap.walkingRunningDistanceMeters);
    out.set(date, {
      date,
      steps: num(snap.steps) && snap.steps! > 0 ? Math.round(snap.steps!) : null,
      activeEnergyKcal: num(snap.activeEnergyKcal),
      restingEnergyKcal: null,
      walkingRunningDistanceKm: meters == null ? null : roundTo(meters / 1000, 3),
      source: null,
      origin: "app",
    });
  }
  return [...out.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ————— Buckets —————

export interface HistoryBucket {
  start: string;
  end: string;
  /** days in the bucket with any data */
  days: number;
  /** daily average over the days that have that metric */
  avg: Values;
  total: Values;
}

function emptyValues(): Values {
  return { steps: null, activeEnergyKcal: null, restingEnergyKcal: null, walkingRunningDistanceKm: null };
}

function bucketOf(rows: ActivityRow[], start: string, end: string): HistoryBucket {
  const inside = rows.filter((r) => r.date >= start && r.date <= end);
  const avg = emptyValues();
  const total = emptyValues();
  for (const metric of HISTORY_METRICS) {
    const values = inside.map((r) => num(r[metric])).filter((v): v is number => v !== null);
    if (values.length === 0) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    total[metric] = roundTo(sum, PLACES[metric]);
    avg[metric] = roundTo(sum / values.length, PLACES[metric]);
  }
  const days = inside.filter((r) => HISTORY_METRICS.some((m) => num(r[m]) !== null)).length;
  return { start, end, days, avg, total };
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(monthFirst: string, n: number): string {
  const [y, m] = monthFirst.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function monthEnd(monthFirst: string): string {
  return addDaysToDateString(addMonths(monthFirst, 1), -1);
}

// ————— Trends and records —————

export interface TrendWindow {
  /** "7d" | "30d" | "90d" | "365d" */
  key: string;
  days: number;
  avg: Values;
  prevAvg: Values;
  /** whole-percent change of the daily average vs the window before */
  change: Values;
  covered: number;
  prevCovered: number;
}

export interface DayRecord {
  date: string;
  value: number;
}

export interface PeriodRecord {
  start: string;
  end: string;
  avg: number;
  days: number;
}

export interface ActivityHistory {
  /** the last complete day — everything here runs through it */
  asOf: string;
  firstDate: string | null;
  daysWithData: number;
  origins: { shortcut: number; app: number };
  /** 30 days, oldest first */
  days: HistoryBucket[];
  /** 26 Monday-start weeks */
  weeks: HistoryBucket[];
  /** 24 months */
  months: HistoryBucket[];
  /** every year since the first day */
  years: HistoryBucket[];
  trends: TrendWindow[];
  allTime: {
    total: Values;
    dailyAvg: Values;
    bestDay: Record<HistoryMetric, DayRecord | null>;
    bestWeek: PeriodRecord | null;
    bestMonth: PeriodRecord | null;
    daysOver10k: number;
    longest10kStreak: number;
    current10kStreak: number;
    /** average steps per weekday, Monday first */
    weekdaySteps: (number | null)[];
  };
}

function pct(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function trend(rows: ActivityRow[], asOf: string, days: number): TrendWindow {
  const start = addDaysToDateString(asOf, -(days - 1));
  const prevEnd = addDaysToDateString(start, -1);
  const prevStart = addDaysToDateString(prevEnd, -(days - 1));
  const now = bucketOf(rows, start, asOf);
  const before = bucketOf(rows, prevStart, prevEnd);
  const change = emptyValues();
  for (const m of HISTORY_METRICS) change[m] = pct(now.avg[m], before.avg[m]);
  return {
    key: `${days}d`,
    days,
    avg: now.avg,
    prevAvg: before.avg,
    change,
    covered: now.days,
    prevCovered: before.days,
  };
}

export function buildActivityHistory(allRows: ActivityRow[], today: string): ActivityHistory {
  const asOf = addDaysToDateString(today, -1);
  const rows = allRows.filter((r) => r.date <= asOf && HISTORY_METRICS.some((m) => num(r[m]) !== null));
  const firstDate = rows[0]?.date ?? null;

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = addDaysToDateString(asOf, i - 29);
    return bucketOf(rows, d, d);
  });

  const thisWeek = getWeekStartDateString(asOf);
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const start = addDaysToDateString(thisWeek, (i - 25) * 7);
    const end = addDaysToDateString(start, 6) > asOf ? asOf : addDaysToDateString(start, 6);
    return bucketOf(rows, start, end);
  });

  const thisMonth = monthStart(asOf);
  const months = Array.from({ length: 24 }, (_, i) => {
    const start = addMonths(thisMonth, i - 23);
    const end = monthEnd(start) > asOf ? asOf : monthEnd(start);
    return bucketOf(rows, start, end);
  });

  const years: HistoryBucket[] = [];
  if (firstDate) {
    for (let y = Number(firstDate.slice(0, 4)); y <= Number(asOf.slice(0, 4)); y++) {
      const end = `${y}-12-31` > asOf ? asOf : `${y}-12-31`;
      years.push(bucketOf(rows, `${y}-01-01`, end));
    }
  }

  // ——— all time ———
  const everything = firstDate ? bucketOf(rows, firstDate, asOf) : bucketOf([], asOf, asOf);
  const bestDay = {} as Record<HistoryMetric, DayRecord | null>;
  for (const m of HISTORY_METRICS) {
    let best: DayRecord | null = null;
    for (const r of rows) {
      const v = num(r[m]);
      // Ties go to the earlier day.
      if (v !== null && (!best || v > best.value)) best = { date: r.date, value: roundTo(v, PLACES[m]) };
    }
    bestDay[m] = best;
  }

  const best = (buckets: HistoryBucket[], minDays: number): PeriodRecord | null =>
    buckets.reduce<PeriodRecord | null>((acc, b) => {
      const avg = b.avg.steps;
      if (avg === null || b.days < minDays) return acc;
      return !acc || avg > acc.avg ? { start: b.start, end: b.end, avg, days: b.days } : acc;
    }, null);

  // Every week and month since the first day, not just the ones on screen.
  const allWeeks: HistoryBucket[] = [];
  const allMonths: HistoryBucket[] = [];
  if (firstDate) {
    for (let w = getWeekStartDateString(firstDate); w <= asOf; w = addDaysToDateString(w, 7)) {
      const end = addDaysToDateString(w, 6);
      allWeeks.push(bucketOf(rows, w, end > asOf ? asOf : end));
    }
    for (let mth = monthStart(firstDate); mth <= asOf; mth = addMonths(mth, 1)) {
      const end = monthEnd(mth);
      allMonths.push(bucketOf(rows, mth, end > asOf ? asOf : end));
    }
  }

  // 10k days and streaks — a missing day breaks a streak like a short one.
  let daysOver10k = 0;
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const r of rows) {
    const hit = (num(r.steps) ?? 0) >= TEN_K;
    const consecutive = prev !== null && dateStringDiffDays(prev, r.date) === 1;
    if (hit) {
      daysOver10k++;
      run = consecutive && run > 0 ? run + 1 : 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    prev = r.date;
  }
  const lastRow = rows[rows.length - 1];
  const current = lastRow && lastRow.date === asOf ? run : 0;

  const weekdayTotals = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  for (const r of rows) {
    const steps = num(r.steps);
    if (steps === null) continue;
    const [y, m, d] = r.date.split("-").map(Number);
    const idx = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
    weekdayTotals[idx].sum += steps;
    weekdayTotals[idx].n++;
  }

  return {
    asOf,
    firstDate,
    daysWithData: rows.length,
    origins: {
      shortcut: rows.filter((r) => r.origin !== "app").length,
      app: rows.filter((r) => r.origin === "app").length,
    },
    days,
    weeks,
    months,
    years,
    trends: [7, 30, 90, 365].map((n) => trend(rows, asOf, n)),
    allTime: {
      total: everything.total,
      dailyAvg: everything.avg,
      bestDay,
      bestWeek: best(allWeeks, 4),
      bestMonth: best(allMonths, 15),
      daysOver10k,
      longest10kStreak: longest,
      current10kStreak: current,
      weekdaySteps: weekdayTotals.map((t) => (t.n ? Math.round(t.sum / t.n) : null)),
    },
  };
}
