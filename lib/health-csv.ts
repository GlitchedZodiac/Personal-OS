import { type CsvOptions, type CsvValue, toCsv } from "@/lib/csv";
import { COMPOSITION_FIELDS, TAPE_FIELDS } from "@/lib/body-measurements";
import { addDaysToDateString, getDateStringInTimeZone } from "@/lib/timezone";
import type { HealthExportPayload } from "@/lib/health-export";

// Spreadsheet projections over an already-built export payload. This layer
// never touches Prisma — buildHealthExport() has already resolved the range,
// timezone and settings — which is what makes it unit-testable with a fixture.
//
// Rule for what gets a CSV: a collection whose value lives in a JSON column
// does not. Workout plans, plan completions and progress photos flatten badly
// (schedule/actualExercises/base64) and stay correct in the JSON export.

export type HealthCsvDatasetKey =
  | "measurements"
  | "daily"
  | "food-logs"
  | "workouts"
  | "workout-sets"
  | "water-logs";

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

function num(value: unknown): CsvValue {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): CsvValue {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

/** Local calendar day + wall-clock time for an ISO instant. */
function localParts(iso: unknown, timeZone: string) {
  if (typeof iso !== "string") return { date: null, time: null };
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return { date: null, time: null };
  return {
    date: getDateStringInTimeZone(at, timeZone),
    time: new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at),
  };
}

const SKINFOLD_KEYS = [
  "chest", "abdomen", "thigh", "triceps", "suprailiac", "subscapular", "midaxillary",
] as const;

export const MEASUREMENT_CSV_HEADERS = [
  "id", "date", "time", "measuredAtUtc", "timeZone",
  "weightKg", "bodyFatPct",
  ...COMPOSITION_FIELDS,
  ...TAPE_FIELDS,
  ...SKINFOLD_KEYS.map((k) => `skinfold${k[0].toUpperCase()}${k.slice(1)}Mm`),
  "skinfoldDataJson",
  "source", "notes", "createdAtUtc", "updatedAtUtc",
] as const;

function measurementRows(payload: HealthExportPayload): CsvValue[][] {
  const timeZone = payload.requestedRange.timeZone;
  return asRows(payload.rawData?.bodyMeasurements).map((row) => {
    const { date, time } = localParts(row.measuredAt, timeZone);
    const skinfold = (row.skinfoldData ?? null) as Record<string, unknown> | null;
    return [
      str(row.id), date, time, str(row.measuredAt), timeZone,
      num(row.weightKg), num(row.bodyFatPct),
      ...COMPOSITION_FIELDS.map((f) => num(row[f])),
      ...TAPE_FIELDS.map((f) => num(row[f])),
      ...SKINFOLD_KEYS.map((k) => num(skinfold?.[k])),
      // Raw passthrough so a future skinfold key is never silently dropped.
      skinfold ? JSON.stringify(skinfold) : null,
      str(row.source), str(row.notes),
      str(row.createdAt), str(row.updatedAt),
    ];
  });
}

const DAILY_HEADERS = [
  "date", "loggedAnything",
  "mealCount", "calories", "proteinG", "carbsG", "fatG",
  "workoutCount", "workoutMinutes", "caloriesBurned", "workoutDistanceMeters",
  "workoutLoggedSteps",
  "manualWaterMl", "totalWaterMl",
  "measurementCount", "latestWeightKg", "latestBodyFatPct", "latestWaistCm",
  "steps", "restingHeartRateBpm", "activeEnergyKcal", "walkingRunningDistanceMeters",
] as const;

function dailyRows(payload: HealthExportPayload): CsvValue[][] {
  const rollups = asRows(payload.dailyRollups);
  const byDate = new Map(rollups.map((r) => [String(r.date), r]));

  // dailyRollups is built from a lazily-populated Map, so days with zero logs
  // are ABSENT rows, not zero rows. Charting that in Sheets silently compresses
  // a two-week gap into one line segment — so fill the calendar.
  const first = payload.requestedRange.from ?? String(rollups[0]?.date ?? "");
  const last =
    payload.requestedRange.to ??
    String(rollups[rollups.length - 1]?.date ?? "");

  const dates: string[] = [];
  if (first && last && first <= last) {
    for (let d = first; d <= last; d = addDaysToDateString(d, 1)) {
      dates.push(d);
      if (dates.length > 4000) break; // pathological-range guard
    }
  } else {
    for (const r of rollups) dates.push(String(r.date));
  }

  return dates.map((date) => {
    const r = byDate.get(date);
    const nutrition = (r?.nutrition ?? {}) as Row;
    const workouts = (r?.workouts ?? {}) as Row;
    const hydration = (r?.hydration ?? {}) as Row;
    const body = (r?.body ?? {}) as Row;
    const activity = (r?.activity ?? {}) as Row;
    return [
      date, r ? 1 : 0,
      num(nutrition.mealCount), num(nutrition.calories), num(nutrition.proteinG),
      num(nutrition.carbsG), num(nutrition.fatG),
      num(workouts.count), num(workouts.durationMinutes),
      num(workouts.caloriesBurned), num(workouts.distanceMeters),
      num(workouts.loggedSteps),
      num(hydration.manualWaterMl), num(hydration.totalWaterMl),
      num(body.measurementCount), num(body.latestWeightKg),
      num(body.latestBodyFatPct), num(body.latestWaistCm),
      num(activity.steps), num(activity.restingHeartRateBpm),
      num(activity.activeEnergyKcal), num(activity.walkingRunningDistanceMeters),
    ];
  });
}

const FOOD_HEADERS = [
  "id", "date", "time", "loggedAtUtc", "mealType", "foodDescription",
  "calories", "proteinG", "carbsG", "fatG", "source", "notes",
] as const;

function foodRows(payload: HealthExportPayload): CsvValue[][] {
  const timeZone = payload.requestedRange.timeZone;
  return asRows(payload.rawData?.foodLogs).map((row) => {
    const { date, time } = localParts(row.loggedAt, timeZone);
    return [
      str(row.id), date, time, str(row.loggedAt), str(row.mealType),
      str(row.foodDescription), num(row.calories), num(row.proteinG),
      num(row.carbsG), num(row.fatG), str(row.source), str(row.notes),
    ];
  });
}

const WORKOUT_HEADERS = [
  "id", "date", "startTime", "startedAtUtc", "endedAtUtc", "durationMinutes",
  "workoutType", "description", "caloriesBurned", "distanceMeters", "stepCount",
  "avgHeartRateBpm", "maxHeartRateBpm", "elevationGainM", "exerciseCount",
  "deviceType", "externalSource", "syncStatus", "stravaActivityId", "source",
] as const;

function workoutRows(payload: HealthExportPayload): CsvValue[][] {
  const timeZone = payload.requestedRange.timeZone;
  return asRows(payload.rawData?.workoutLogs).map((row) => {
    const { date, time } = localParts(row.startedAt, timeZone);
    const exercises = Array.isArray(row.exercises) ? row.exercises.length : null;
    // No hasRoute column: routeData is conditionally selected, so with routes
    // off the field is ABSENT and emitting false would be a lie.
    return [
      str(row.id), date, time, str(row.startedAt), str(row.endedAt),
      num(row.durationMinutes), str(row.workoutType), str(row.description),
      num(row.caloriesBurned), num(row.distanceMeters), num(row.stepCount),
      num(row.avgHeartRateBpm), num(row.maxHeartRateBpm), num(row.elevationGainM),
      exercises, str(row.deviceType), str(row.externalSource),
      str(row.syncStatus), str(row.stravaActivityId), str(row.source),
    ];
  });
}

const WORKOUT_SET_HEADERS = [
  "workoutId", "date", "startTime", "workoutType", "sequenceName",
  "exerciseName", "setNumber", "reps", "weightKg", "volumeKg", "granularity",
] as const;

function workoutSetRows(payload: HealthExportPayload): CsvValue[][] {
  const timeZone = payload.requestedRange.timeZone;
  const out: CsvValue[][] = [];
  for (const row of asRows(payload.rawData?.workoutLogs)) {
    const entries = Array.isArray(row.exercises) ? (row.exercises as Row[]) : [];
    if (entries.length === 0) continue;
    const { date, time } = localParts(row.startedAt, timeZone);
    const metrics = (row.metricsData ?? null) as Row | null;
    const sequenceName =
      typeof metrics?.sequenceName === "string" ? metrics.sequenceName : null;
    for (const entry of entries) {
      const sets =
        typeof entry.sets === "number" && entry.sets > 0
          ? Math.min(Math.round(entry.sets), 200)
          : 1;
      const reps = num(entry.reps);
      const weightKg = num(entry.weightKg ?? entry.weight);
      for (let setNumber = 1; setNumber <= sets; setNumber++) {
        out.push([
          str(row.id), date, time, str(row.workoutType), sequenceName,
          str(entry.name), setNumber, reps, weightKg,
          typeof reps === "number" && typeof weightKg === "number"
            ? reps * weightKg
            : null,
          // Honesty column: entries arrive as {sets × reps × weight} groups
          // (the watch aggregates per-set logs before sync), so rows are a
          // uniform expansion — not per-set capture.
          "aggregated",
        ]);
      }
    }
  }
  return out;
}

const WATER_HEADERS = ["id", "date", "time", "loggedAtUtc", "amountMl"] as const;

function waterRows(payload: HealthExportPayload): CsvValue[][] {
  const timeZone = payload.requestedRange.timeZone;
  return asRows(payload.rawData?.waterLogs).map((row) => {
    const { date, time } = localParts(row.loggedAt, timeZone);
    return [str(row.id), date, time, str(row.loggedAt), num(row.amountMl)];
  });
}

export interface HealthCsvDataset {
  key: HealthCsvDatasetKey;
  label: string;
  description: string;
  headers: readonly string[];
  build: (payload: HealthExportPayload) => CsvValue[][];
}

export const HEALTH_CSV_DATASETS: Record<HealthCsvDatasetKey, HealthCsvDataset> = {
  measurements: {
    key: "measurements",
    label: "Body measurements",
    description:
      "Every check-in with all 23 columns — weight, tape, and full smart-scale composition.",
    headers: MEASUREMENT_CSV_HEADERS,
    build: measurementRows,
  },
  daily: {
    key: "daily",
    label: "Daily rollup",
    description:
      "One row per calendar day: intake, training, hydration, weight, steps and sleep-adjacent activity.",
    headers: DAILY_HEADERS,
    build: dailyRows,
  },
  "food-logs": {
    key: "food-logs",
    label: "Food log",
    description: "Every logged item with its macros.",
    headers: FOOD_HEADERS,
    build: foodRows,
  },
  workouts: {
    key: "workouts",
    label: "Workouts",
    description: "Every session with duration, heart rate, distance and source.",
    headers: WORKOUT_HEADERS,
    build: workoutRows,
  },
  "workout-sets": {
    key: "workout-sets",
    label: "Workout sets",
    description:
      "One row per set with movement, reps and weight — training history for a spreadsheet.",
    headers: WORKOUT_SET_HEADERS,
    build: workoutSetRows,
  },
  "water-logs": {
    key: "water-logs",
    label: "Water log",
    description: "Hydration entries.",
    headers: WATER_HEADERS,
    build: waterRows,
  },
};

export const HEALTH_CSV_KEYS = Object.keys(
  HEALTH_CSV_DATASETS
) as HealthCsvDatasetKey[];

export function isHealthCsvDatasetKey(
  value: string | null
): value is HealthCsvDatasetKey {
  return value != null && value in HEALTH_CSV_DATASETS;
}

export function buildHealthCsv(
  payload: HealthExportPayload,
  key: HealthCsvDatasetKey,
  options?: CsvOptions
): { csv: string; rowCount: number } {
  const dataset = HEALTH_CSV_DATASETS[key];
  const rows = dataset.build(payload);
  return { csv: toCsv(dataset.headers, rows, options), rowCount: rows.length };
}

export function healthCsvFilename(key: HealthCsvDatasetKey, stamp: string) {
  return `personal-os-health-${key}-${stamp}.csv`;
}
