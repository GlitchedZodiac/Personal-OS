import {
  BODY_START,
  type DayPoint,
  type MetricKey,
  type Milestone,
  type SegmentKey,
  type Segments,
  TAPE_SITES,
  type TapeSite,
} from "@/lib/body-view";
import { DEFAULT_HEALTH_GOALS, type HealthGoals } from "@/lib/settings";
import { getDateStringInTimeZone } from "@/lib/timezone";

// Shapes the Body screen's one payload from raw body_measurements rows. Pure:
// the route does the queries, this does the arithmetic, the tests drive this.

/** The scale metrics a series is built for (waist comes from the tape). */
export type SeriesKey = Exclude<MetricKey, "waist"> | "bmi";

export interface BodySummary {
  today: string;
  timeZone: string;
  start: { day: string; weightKg: number };
  profile: { age: number | null; heightCm: number | null };
  latest: {
    measuredAt: string;
    day: string;
    isToday: boolean;
    weightKg: number;
    bodyFatPct: number | null;
    source: string | null;
    externalId: string | null;
    fieldSources: Record<string, string>;
    /** When this reading last changed in Pitaya — the "Synced … ago" clock. */
    arrivedAt: string;
  } | null;
  previous: { day: string; weightKg: number } | null;
  series: Record<SeriesKey, DayPoint[]>;
  tape: Record<TapeSite, DayPoint[]>;
  segments: { day: string; values: Segments } | null;
  goals: HealthGoals;
  milestones: Milestone[];
  sync: { enabled: boolean; lastRunAt: string | null; lastRunOk: boolean | null };
  /** The first day the current scale reported composition, when an older
   *  scale's estimates precede it. The two do not agree — body fat stepped
   *  from 20.7% to 14.5% across the swap — so anything drawn across this day
   *  owes him a sentence saying so. */
  scaleChangedOn: string | null;
}

/** The columns this builder reads. */
export interface SummaryRow {
  measuredAt: Date;
  createdAt: Date;
  updatedAt: Date;
  source: string | null;
  externalId: string | null;
  fieldSources: unknown;
  referenceRanges: unknown;
  weightKg: number | null;
  bodyFatPct: number | null;
  bmi: number | null;
  fatFreeWeightKg: number | null;
  fatMassKg: number | null;
  skeletalMuscleKg: number | null;
  skeletalMusclePct: number | null;
  bodyWaterKg: number | null;
  bodyWaterPct: number | null;
  visceralFat: number | null;
  bmrKcal: number | null;
  metabolicAge: number | null;
  [column: string]: unknown;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One metric's value for a row. The RENPHO rows carry kg values directly; the
 * older Etekcity rows carry percentages, so the kg figure is derived the same
 * way the scale's own report does it. That keeps one continuous series — with
 * the caveat, stated on the screen's behalf in docs, that the two scales do
 * not agree and the join shows as a step.
 */
export function metricValue(row: SummaryRow, key: SeriesKey, heightM: number | null): number | null {
  const w = row.weightKg;
  const pctOfWeight = (pct: number | null) => (pct != null && w != null ? round2((pct * w) / 100) : null);
  switch (key) {
    case "weight": return w;
    case "fat": return row.bodyFatPct;
    case "fatMass": return row.fatMassKg ?? pctOfWeight(row.bodyFatPct);
    case "skm": return row.skeletalMuscleKg ?? pctOfWeight(row.skeletalMusclePct);
    case "ffm": {
      if (row.fatFreeWeightKg != null) return row.fatFreeWeightKg;
      const fat = row.fatMassKg ?? pctOfWeight(row.bodyFatPct);
      return fat != null && w != null ? round2(w - fat) : null;
    }
    case "water": return row.bodyWaterKg ?? pctOfWeight(row.bodyWaterPct);
    case "visceral": return row.visceralFat;
    case "bmr": return row.bmrKcal;
    case "metAge": return row.metabolicAge;
    case "bmi":
      if (row.bmi != null) return row.bmi;
      return w != null && heightM ? Math.round((w / (heightM * heightM)) * 10) / 10 : null;
  }
}

const SERIES_KEYS: readonly SeriesKey[] = [
  "weight", "fat", "fatMass", "skm", "ffm", "water", "visceral", "bmr", "metAge", "bmi",
];

const SEGMENT_COLUMNS: Record<SegmentKey, { muscle: string; fat: string }> = {
  armLeft: { muscle: "muscleLeftArmKg", fat: "fatLeftArmKg" },
  armRight: { muscle: "muscleRightArmKg", fat: "fatRightArmKg" },
  trunk: { muscle: "muscleTrunkKg", fat: "fatTrunkKg" },
  legLeft: { muscle: "muscleLeftLegKg", fat: "fatLeftLegKg" },
  legRight: { muscle: "muscleRightLegKg", fat: "fatRightLegKg" },
};

function asMap(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readGoals(settingsData: unknown): HealthGoals {
  const raw = asMap(asMap(settingsData).healthGoals);
  const weightKg = Number(raw.weightKg);
  const bodyFatPct = Number(raw.bodyFatPct);
  const byDate = typeof raw.byDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.byDate) ? raw.byDate : null;
  return {
    weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : DEFAULT_HEALTH_GOALS.weightKg,
    bodyFatPct: Number.isFinite(bodyFatPct) && bodyFatPct > 0 ? bodyFatPct : DEFAULT_HEALTH_GOALS.bodyFatPct,
    byDate: byDate ?? DEFAULT_HEALTH_GOALS.byDate,
  };
}

export interface SummaryInput {
  /** Rows on or after the start day, oldest first. */
  rows: readonly SummaryRow[];
  timeZone: string;
  now: Date;
  settingsData: unknown;
  birthYear?: number | null;
  /** Age the scale used for its latest reading, when settings have none. */
  scaleAge?: number | null;
  loggedMilestones: readonly { day: string; title: string; note: string | null; weightKg: number | null }[];
  sync: BodySummary["sync"];
}

export function buildBodySummary(input: SummaryInput): BodySummary {
  const { rows, timeZone, now } = input;
  const today = getDateStringInTimeZone(now, timeZone);
  const dayOf = (row: SummaryRow) => getDateStringInTimeZone(row.measuredAt, timeZone);

  // Height from the newest row that has both weight and BMI — the scale knows
  // it, and it is the only place it is recorded.
  let heightM: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.weightKg != null && r.bmi != null && r.bmi > 0) {
      heightM = Math.sqrt(r.weightKg / r.bmi);
      break;
    }
  }

  // One point per metric per local day: the day's first reading that has it
  // (the morning weigh-in, when he re-weighs later).
  const series = Object.fromEntries(SERIES_KEYS.map((k) => [k, [] as DayPoint[]])) as Record<SeriesKey, DayPoint[]>;
  const tape = Object.fromEntries(TAPE_SITES.map((s) => [s.key, [] as DayPoint[]])) as Record<TapeSite, DayPoint[]>;
  const push = (points: DayPoint[], day: string, value: number) => {
    if (points.length === 0 || points[points.length - 1].day !== day) points.push({ day, value });
  };
  for (const row of rows) {
    const day = dayOf(row);
    if (day < BODY_START.day) continue;
    for (const key of SERIES_KEYS) {
      const value = metricValue(row, key, heightM);
      if (value != null) push(series[key], day, value);
    }
    for (const site of TAPE_SITES) {
      const value = row[site.field];
      // The tape is the exception to "first of the day": a re-taped site is a
      // correction, so the latest reading that day stands.
      if (typeof value === "number") {
        const points = tape[site.key];
        if (points.length > 0 && points[points.length - 1].day === day) points[points.length - 1].value = value;
        else points.push({ day, value });
      }
    }
  }
  // The fixed start leads the weight series; every "since start" derives from it.
  if (series.weight.length === 0 || series.weight[0].day > BODY_START.day) {
    series.weight.unshift({ day: BODY_START.day, value: BODY_START.weightKg });
  }
  if (heightM && (series.bmi.length === 0 || series.bmi[0].day > BODY_START.day)) {
    series.bmi.unshift({
      day: BODY_START.day,
      value: Math.round((BODY_START.weightKg / (heightM * heightM)) * 10) / 10,
    });
  }

  const weighIns = rows.filter((r) => r.weightKg != null);
  const last = weighIns[weighIns.length - 1] ?? null;
  const prev = weighIns.length > 1 ? weighIns[weighIns.length - 2] : null;

  let segments: BodySummary["segments"] = null;
  for (let i = rows.length - 1; i >= 0 && !segments; i--) {
    const row = rows[i];
    const ranges = asMap(row.referenceRanges);
    const num = (column: string) => (typeof row[column] === "number" ? (row[column] as number) : null);
    const pct = (column: string, kg: number | null) => {
      const std = Number(asMap(ranges[column]).std);
      return kg != null && Number.isFinite(std) && std > 0 ? Math.round((kg / std) * 1000) / 10 : null;
    };
    const values = Object.fromEntries(
      (Object.keys(SEGMENT_COLUMNS) as SegmentKey[]).map((key) => {
        const muscleKg = num(SEGMENT_COLUMNS[key].muscle);
        const fatKg = num(SEGMENT_COLUMNS[key].fat);
        return [key, {
          muscleKg, fatKg,
          musclePct: pct(SEGMENT_COLUMNS[key].muscle, muscleKg),
          fatPct: pct(SEGMENT_COLUMNS[key].fat, fatKg),
        }];
      })
    ) as Segments;
    if (Object.values(values).some((v) => v.muscleKg != null || v.fatKg != null)) {
      segments = { day: dayOf(row), values };
    }
  }

  let scaleChangedOn: string | null = null;
  const firstNew = rows.findIndex((r) => r.externalId?.startsWith("renpho:") && r.bodyFatPct != null);
  if (firstNew > 0 && rows.slice(0, firstNew).some((r) => r.bodyFatPct != null)) {
    scaleChangedOn = dayOf(rows[firstNew]);
  }

  const year = Number(today.slice(0, 4));
  const age = input.birthYear ? year - input.birthYear : (input.scaleAge ?? null);

  return {
    today,
    timeZone,
    start: { day: BODY_START.day, weightKg: BODY_START.weightKg },
    profile: { age, heightCm: heightM ? Math.round(heightM * 100) : null },
    latest: last
      ? {
          measuredAt: last.measuredAt.toISOString(),
          day: dayOf(last),
          isToday: dayOf(last) === today,
          weightKg: last.weightKg as number,
          bodyFatPct: last.bodyFatPct,
          source: last.source,
          externalId: last.externalId,
          fieldSources: Object.fromEntries(
            Object.entries(asMap(last.fieldSources)).filter(([, v]) => typeof v === "string")
          ) as Record<string, string>,
          arrivedAt: new Date(Math.max(last.createdAt.getTime(), last.updatedAt.getTime())).toISOString(),
        }
      : null,
    previous: prev ? { day: dayOf(prev), weightKg: prev.weightKg as number } : null,
    series,
    tape,
    segments,
    goals: readGoals(input.settingsData),
    milestones: input.loggedMilestones.map((m) => ({
      day: m.day,
      title: m.title,
      ...(m.note ? { note: m.note } : {}),
      weightKg: m.weightKg,
      kind: "logged" as const,
    })),
    sync: input.sync,
    scaleChangedOn,
  };
}
