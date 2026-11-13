// The day ledger (2026-11-12, MCP v2 Phase D; gaps #5, #6, #18).
//
// One row per local day with every ingredient of "how did today go": what he
// ate against the day's target, what workouts burned, steps, the energy
// estimate and the deficit, plus a weekly block that answers "is it working"
// — what the deficit math predicts against what the scale did.
//
// Before this, net and deficit were worked out by hand every day, and the
// biggest single finding about a stalled scale (two weeks averaging ~2,500
// steps a day) came from a phone screenshot — the steps were in
// daily_health all along, but nothing put them next to the food.
//
// The energy estimate (TDEE) is deliberately simple and fully shown, so its
// parts can be argued with:
//   BMR       latest scale estimate (or a fixed number in targets.tdee)
//   + TEF     digestion, tefPct of kcal eaten
//   + NEAT    steps OUTSIDE logged workouts × kcalPerStep — a walk counted
//             as a workout is not counted again as steps
//   + workout kcal of the day's logged sessions
// Apple's "active energy" is shown but never used: some days it reads 0.2–
// 1.3 kcal on a day with thousands of steps.
//
// Pure core (buildDayRow / buildWeekly) + one loader (loadDayLedger).

import { prisma } from "@/lib/prisma";
import {
  addDaysToDateString,
  getDateStringInTimeZone,
  getUtcDayBoundsForTimeZone,
} from "@/lib/timezone";
import { readTargets, resolveDayTarget, type DayType, type MacroTarget, type Targets } from "@/lib/targets";

export const LOW_LOG_KCAL = 800;
export const OUTLIER_KG = 2.5;
export const KCAL_PER_KG = 7700;
export const MAX_LEDGER_DAYS = 31;

export interface DayInputs {
  date: string;
  isToday: boolean;
  food: { calories: number; proteinG: number; carbsG: number; fatG: number }[];
  workouts: { id: string; workoutType: string; caloriesBurned: number | null; stepCount: number | null; source: string }[];
  health: {
    steps: number | null;
    activeEnergyKcal: number | null;
    restingHeartRateBpm: number | null;
    hrvMs: number | null;
  } | null;
  bmr: { kcal: number; source: string } | null;
}

export interface DayRow {
  date: string;
  partial?: true;
  dayType: DayType;
  target: MacroTarget;
  eaten: { kcal: number; proteinG: number; carbsG: number; fatG: number; entries: number };
  remaining: { kcal: number; proteinG: number };
  /** Total burn of the day's logged workouts. */
  workoutKcal: number;
  /**
   * The workouts themselves, kept at the row's top level: query_data clips
   * anything nested deeper than four levels, so days[i].exercise.workouts[j]
   * would arrive as "[nested object]".
   */
  workouts: { id: string; type: string; kcal: number | null; source: string }[];
  activity: {
    steps: number | null;
    stepsInWorkouts: number;
    stepsOutsideWorkouts: number | null;
    restingHrBpm: number | null;
    hrvMs: number | null;
    activeEnergyKcal: number | null;
    activeEnergyTrusted: boolean | null;
  };
  net: number;
  tdee: { total: number; bmr: number; bmrSource: string; tef: number; neat: number; workouts: number } | null;
  deficit: number | null;
  dataQuality: string[];
}

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildDayRow(input: DayInputs, targets: Targets): DayRow {
  const eaten = input.food.reduce(
    (s, f) => ({
      kcal: s.kcal + (f.calories || 0),
      proteinG: s.proteinG + (f.proteinG || 0),
      carbsG: s.carbsG + (f.carbsG || 0),
      fatG: s.fatG + (f.fatG || 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
  const workoutKcal = input.workouts.reduce((s, w) => s + (w.caloriesBurned ?? 0), 0);
  const stepsInWorkouts = input.workouts.reduce((s, w) => s + (w.stepCount ?? 0), 0);
  const { dayType, target } = resolveDayTarget(targets, workoutKcal);
  const quality: string[] = [];

  const steps = input.health?.steps ?? null;
  const stepsOutside = steps == null ? null : Math.max(0, steps - stepsInWorkouts);
  const active = input.health?.activeEnergyKcal ?? null;
  const activeTrusted =
    active == null ? null : !(active < 50 && (steps ?? 0) > 1000);
  if (active != null && activeTrusted === false) {
    quality.push(`Apple active energy looks wrong (${r1(active)} kcal with ${steps} steps) — not used`);
  }
  if (steps == null) quality.push("No step count for this day yet");
  for (const w of input.workouts) {
    if (w.caloriesBurned == null) quality.push(`Workout ${w.id} (${w.workoutType}) has no calories — the burn is undercounted`);
  }
  if (input.food.length > 0 && eaten.kcal < LOW_LOG_KCAL && !input.isToday) {
    quality.push(`Only ${r0(eaten.kcal)} kcal logged — probably incomplete logging`);
  }
  if (input.food.length === 0 && !input.isToday) quality.push("No food logged");

  let tdee: DayRow["tdee"] = null;
  let deficit: number | null = null;
  if (input.bmr) {
    const tef = r0((eaten.kcal * targets.tdee.tefPct) / 100);
    const neat = r0((stepsOutside ?? 0) * targets.tdee.kcalPerStep);
    const total = r0(input.bmr.kcal + tef + neat + workoutKcal);
    tdee = { total, bmr: r0(input.bmr.kcal), bmrSource: input.bmr.source, tef, neat, workouts: r0(workoutKcal) };
    deficit = r0(total - eaten.kcal);
  } else {
    quality.push("No BMR yet — log a scale reading with BMR or set targets.tdee.bmr to fixed");
  }

  return {
    date: input.date,
    ...(input.isToday ? { partial: true as const } : {}),
    dayType,
    target,
    eaten: { kcal: r0(eaten.kcal), proteinG: r0(eaten.proteinG), carbsG: r0(eaten.carbsG), fatG: r0(eaten.fatG), entries: input.food.length },
    remaining: { kcal: r0(target.kcal - eaten.kcal), proteinG: r0(target.proteinG - eaten.proteinG) },
    workoutKcal: r0(workoutKcal),
    workouts: input.workouts.map((w) => ({
      id: w.id,
      type: w.workoutType,
      kcal: w.caloriesBurned == null ? null : r0(w.caloriesBurned),
      source: w.source,
    })),
    activity: {
      steps,
      stepsInWorkouts,
      stepsOutsideWorkouts: stepsOutside,
      restingHrBpm: input.health?.restingHeartRateBpm ?? null,
      hrvMs: input.health?.hrvMs ?? null,
      activeEnergyKcal: active == null ? null : r1(active),
      activeEnergyTrusted: activeTrusted,
    },
    net: r0(eaten.kcal - workoutKcal),
    tdee,
    deficit,
    dataQuality: quality,
  };
}

// ── The weekly block ────────────────────────────────────────────────────────

export interface WeighIn {
  id: string;
  date: string; // local day
  kg: number;
}

export interface WeeklyBlock {
  window: { from: string; to: string; note: string };
  intake: { avgKcal: number | null; loggedDays: number; lowLogDays: string[] };
  deficit: { avgKcal: number | null; days: number };
  weight: {
    avgKg: number | null;
    previousAvgKg: number | null;
    changeKg: number | null;
    weighIns: number;
    outliersExcluded: { id: string; date: string; kg: number }[];
    daysSinceLastWeighIn: number | null;
  };
  predictedChangeKg: number | null;
  gapKg: number | null;
  verdict: string;
  dataQuality: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/**
 * The last 7 COMPLETE days (today is half-logged and would drag every
 * average down), against the 7 before for weight.
 */
export function buildWeekly(days: DayRow[], weighIns: WeighIn[], todayStr: string): WeeklyBlock {
  const to = addDaysToDateString(todayStr, -1);
  const from = addDaysToDateString(todayStr, -7);
  const prevFrom = addDaysToDateString(todayStr, -14);
  const prevTo = addDaysToDateString(todayStr, -8);
  const inWindow = (d: string, a: string, b: string) => d >= a && d <= b;
  const week = days.filter((d) => inWindow(d.date, from, to));
  const quality: string[] = [];

  const logged = week.filter((d) => d.eaten.entries > 0);
  const lowLogDays = logged.filter((d) => d.eaten.kcal < LOW_LOG_KCAL).map((d) => d.date);
  const fullDays = logged.filter((d) => d.eaten.kcal >= LOW_LOG_KCAL);
  const avgKcal = mean(fullDays.map((d) => d.eaten.kcal));
  const deficitDays = fullDays.filter((d) => d.deficit != null);
  const avgDeficit = mean(deficitDays.map((d) => d.deficit as number));
  if (lowLogDays.length) quality.push(`Left out of the averages, probably incomplete logging: ${lowLogDays.join(", ")}`);
  const missingSteps = week.filter((d) => d.activity.steps == null).map((d) => d.date);
  if (missingSteps.length) quality.push(`No step count on: ${missingSteps.join(", ")}`);

  // Weight: drop readings far from the 14-day median (someone else on the
  // scale, a misread) before averaging.
  const recent = weighIns.filter((w) => inWindow(w.date, prevFrom, todayStr));
  const med = median(recent.map((w) => w.kg));
  const outliers = med == null ? [] : recent.filter((w) => Math.abs(w.kg - med) > OUTLIER_KG);
  const kept = recent.filter((w) => !outliers.includes(w));
  const avgKg = mean(kept.filter((w) => inWindow(w.date, from, todayStr)).map((w) => w.kg));
  const previousAvgKg = mean(kept.filter((w) => inWindow(w.date, prevFrom, prevTo)).map((w) => w.kg));
  const changeKg = avgKg != null && previousAvgKg != null ? avgKg - previousAvgKg : null;
  if (outliers.length) {
    quality.push(
      `Weigh-ins left out as outliers (more than ${OUTLIER_KG} kg from the 14-day median): ${outliers
        .map((o) => `${o.kg} kg on ${o.date}`)
        .join(", ")}`
    );
  }
  const lastDate = [...kept].map((w) => w.date).sort().pop() ?? null;
  const daysSince = lastDate ? daysBetween(lastDate, todayStr) : null;
  if (daysSince == null) quality.push("No weigh-ins in the last 14 days");
  else if (daysSince >= 5) quality.push(`No weigh-in for ${daysSince} days`);

  const predicted = avgDeficit != null ? -(avgDeficit * 7) / KCAL_PER_KG : null;
  const gap = changeKg != null && predicted != null ? changeKg - predicted : null;

  let verdict: string;
  if (changeKg == null || predicted == null) {
    verdict = "Not enough data yet for a weekly verdict — it needs complete food logs and weigh-ins in both weeks.";
  } else if (Math.abs(gap!) < 0.25) {
    verdict = `On track: the scale moved ${fmtKg(changeKg)} this week, close to the ${fmtKg(predicted)} the deficit predicts.`;
  } else if (gap! > 0) {
    verdict = `Losing ${fmtKg(Math.abs(gap!), false)} a week less than the math predicts (${fmtKg(changeKg)} vs ${fmtKg(predicted)}): either some food isn't logged, portions are under-estimated, or the energy estimate is too high.`;
  } else {
    verdict = `Losing ${fmtKg(Math.abs(gap!), false)} a week more than the math predicts (${fmtKg(changeKg)} vs ${fmtKg(predicted)}): water shifts, or the energy estimate is too low.`;
  }

  return {
    window: { from, to, note: "The last 7 complete days; weight compares them with the 7 days before." },
    intake: { avgKcal: avgKcal == null ? null : r0(avgKcal), loggedDays: fullDays.length, lowLogDays },
    deficit: { avgKcal: avgDeficit == null ? null : r0(avgDeficit), days: deficitDays.length },
    weight: {
      avgKg: avgKg == null ? null : Math.round(avgKg * 100) / 100,
      previousAvgKg: previousAvgKg == null ? null : Math.round(previousAvgKg * 100) / 100,
      changeKg: changeKg == null ? null : Math.round(changeKg * 100) / 100,
      weighIns: kept.filter((w) => inWindow(w.date, from, todayStr)).length,
      outliersExcluded: outliers.map((o) => ({ id: o.id, date: o.date, kg: o.kg })),
      daysSinceLastWeighIn: daysSince,
    },
    predictedChangeKg: predicted == null ? null : Math.round(predicted * 100) / 100,
    gapKg: gap == null ? null : Math.round(gap * 100) / 100,
    verdict,
    dataQuality: quality,
  };
}

function fmtKg(kg: number, signed = true): string {
  const v = Math.round(kg * 100) / 100;
  return `${signed && v > 0 ? "+" : ""}${v} kg`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// ── Loader ─────────────────────────────────────────────────────────────────

export interface LedgerRange {
  from: string;
  to: string;
}

/** from/to/days → a clamped local-day range ending today by default. */
export function ledgerRange(
  args: { from?: string; to?: string; days?: number },
  todayStr: string
): LedgerRange {
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = iso(args.to) ?? todayStr;
  let from = iso(args.from);
  if (!from) {
    const n = Number(args.days);
    const days = Number.isFinite(n) && n >= 1 ? Math.min(MAX_LEDGER_DAYS, Math.round(n)) : 1;
    from = addDaysToDateString(to, -(days - 1));
  }
  if (from > to) from = to;
  if (daysBetween(from, to) >= MAX_LEDGER_DAYS) from = addDaysToDateString(to, -(MAX_LEDGER_DAYS - 1));
  return { from, to };
}

function dayList(range: LedgerRange): string[] {
  const out: string[] = [];
  for (let d = range.from; d <= range.to; d = addDaysToDateString(d, 1)) out.push(d);
  return out;
}

/**
 * Load the rows for `range` (local days in `timeZone`), plus the weekly block
 * computed over the 14 days before today. One query per table.
 */
export async function loadDayLedger(input: {
  range: LedgerRange;
  timeZone: string;
  todayStr: string;
  settings: Record<string, unknown>;
  includeWeekly: boolean;
}): Promise<{ days: DayRow[]; weekly?: WeeklyBlock; targets: Targets }> {
  const { range, timeZone, todayStr } = input;
  const targets = readTargets(input.settings);
  // The weekly block needs the 14 days before today regardless of range.
  const loadFrom = input.includeWeekly
    ? [range.from, addDaysToDateString(todayStr, -14)].sort()[0]
    : range.from;
  const loadTo = [range.to, todayStr].sort()[1];
  const start = getUtcDayBoundsForTimeZone(loadFrom, timeZone).dayStart;
  const end = getUtcDayBoundsForTimeZone(loadTo, timeZone).dayEnd;

  const [food, workouts, health, activity, bmrRows, weights] = await Promise.all([
    prisma.foodLog.findMany({
      where: { loggedAt: { gte: start, lte: end } },
      select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
    }),
    prisma.workoutLog.findMany({
      where: { startedAt: { gte: start, lte: end } },
      select: { id: true, startedAt: true, workoutType: true, caloriesBurned: true, stepCount: true, source: true, externalSource: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.dailyHealthSnapshot.findMany({
      where: { localDate: { gte: loadFrom, lte: loadTo } },
      select: { localDate: true, steps: true, activeEnergyKcal: true, restingHeartRateBpm: true, hrvMs: true, updatedAt: true },
    }),
    // The iPhone app's own per-day totals (2026-10-17): the designated steps
    // table going forward. Preferred when a day has it; the Apple Health
    // snapshot fills the days it doesn't (docs/deferred-items "two step tables").
    prisma.dailyActivity.findMany({
      where: { date: { gte: loadFrom, lte: loadTo } },
      select: { date: true, steps: true, activeEnergyKcal: true },
    }),
    prisma.bodyMeasurement.findMany({
      where: { bmrKcal: { not: null }, measuredAt: { lte: end } },
      select: { measuredAt: true, bmrKcal: true },
      orderBy: { measuredAt: "desc" },
      take: 60,
    }),
    input.includeWeekly
      ? prisma.bodyMeasurement.findMany({
          where: { weightKg: { not: null }, measuredAt: { gte: start, lte: end } },
          select: { id: true, measuredAt: true, weightKg: true },
          orderBy: { measuredAt: "asc" },
        })
      : Promise.resolve([] as { id: string; measuredAt: Date; weightKg: number | null }[]),
  ]);

  const localDay = (d: Date) => getDateStringInTimeZone(d, timeZone);
  const foodByDay = groupBy(food, (f) => localDay(f.loggedAt));
  const workoutsByDay = groupBy(workouts, (w) => localDay(w.startedAt));
  // One snapshot per day: several sources/time zones can write the same day;
  // keep the one with the most steps.
  const healthByDay = new Map<string, (typeof health)[number]>();
  for (const h of health) {
    const prev = healthByDay.get(h.localDate);
    if (!prev || (h.steps ?? 0) > (prev.steps ?? 0)) healthByDay.set(h.localDate, h);
  }

  const bmrFor = (day: string): DayInputs["bmr"] => {
    if (targets.tdee.bmr.source === "fixed" && targets.tdee.bmr.kcal) {
      return { kcal: targets.tdee.bmr.kcal, source: "fixed in targets" };
    }
    const dayEnd = getUtcDayBoundsForTimeZone(day, timeZone).dayEnd;
    const row = bmrRows.find((b) => b.measuredAt <= dayEnd && b.bmrKcal != null);
    return row ? { kcal: row.bmrKcal as number, source: `scale ${localDay(row.measuredAt)}` } : null;
  };

  const activityByDay = new Map(activity.filter((a) => a.steps != null).map((a) => [a.date, a]));

  const build = (day: string) => {
    const snap = healthByDay.get(day);
    const act = activityByDay.get(day);
    const h = act
      ? {
          steps: act.steps,
          activeEnergyKcal: act.activeEnergyKcal ?? snap?.activeEnergyKcal ?? null,
          restingHeartRateBpm: snap?.restingHeartRateBpm ?? null,
          hrvMs: snap?.hrvMs ?? null,
        }
      : snap;
    return buildDayRow(
      {
        date: day,
        isToday: day === todayStr,
        food: foodByDay.get(day) ?? [],
        workouts: (workoutsByDay.get(day) ?? []).map((w) => ({
          id: w.id,
          workoutType: w.workoutType,
          caloriesBurned: w.caloriesBurned,
          stepCount: w.stepCount,
          source: w.externalSource ?? w.source,
        })),
        health: h
          ? { steps: h.steps, activeEnergyKcal: h.activeEnergyKcal, restingHeartRateBpm: h.restingHeartRateBpm, hrvMs: h.hrvMs }
          : null,
        bmr: bmrFor(day),
      },
      targets
    );
  };

  const days = dayList(range).map(build);
  if (!input.includeWeekly) return { days, targets };

  const weeklyDays = dayList({ from: addDaysToDateString(todayStr, -14), to: addDaysToDateString(todayStr, -1) }).map(build);
  const weighIns: WeighIn[] = weights
    .filter((w) => w.weightKg != null)
    .map((w) => ({ id: w.id, date: localDay(w.measuredAt), kg: w.weightKg as number }));
  return { days, weekly: buildWeekly(weeklyDays, weighIns, todayStr), targets };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
