import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";
import {
  getDateStringInTimeZone,
  getUtcDayBoundsForTimeZone,
  getWeekStartDateString,
  zonedLocalDateTimeToUtc,
} from "@/lib/timezone";

// Server-side execution of the chat's read tool (get_health_data). Returns
// compact JSON the model can quote from — ids included so edit/delete
// proposals can reference real rows.

const DAY_MS = 86_400_000;

function clampDays(days: unknown, fallback = 3) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(30, Math.round(n));
}

interface SettingsData {
  calorieTarget?: number;
  proteinPct?: number;
  carbsPct?: number;
  fatPct?: number;
}

function parseIsoDay(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function executeGetHealthData(
  args: { query?: string; days?: number; from?: string; to?: string },
  timeZone: string,
  todayStr: string
): Promise<object> {
  const query = args.query ?? "today_summary";
  const days = clampDays(args.days);
  // Optional from/to (YYYY-MM-DD, user-local) — point recent_* at any slice
  // of history instead of a today-anchored lookback.
  const fromDay = parseIsoDay(args.from);
  const toDay = parseIsoDay(args.to);
  const rangeStart = fromDay
    ? getUtcDayBoundsForTimeZone(fromDay, timeZone).dayStart
    : null;
  const rangeEnd = toDay ? getUtcDayBoundsForTimeZone(toDay, timeZone).dayEnd : null;
  const since = rangeStart ?? new Date(Date.now() - days * DAY_MS);
  const until = rangeEnd ?? new Date();

  switch (query) {
    case "prs": {
      const prs = await prisma.personalRecord.findMany({
        orderBy: { achievedAt: "desc" },
      });
      return {
        prs: prs.map((p) => ({
          exercise: p.exerciseName,
          kind: p.kind,
          value: p.value,
          unit: p.unit,
          previousValue: p.previousValue,
          achievedAt: p.achievedAt.toISOString().slice(0, 10),
        })),
      };
    }

    case "recent_food": {
      const rows = await prisma.foodLog.findMany({
        where: { loggedAt: { gte: since, lte: until } },
        orderBy: { loggedAt: "desc" },
        take: 60,
      });
      return {
        food: rows.map((f) => ({
          id: f.id,
          loggedAt: f.loggedAt.toISOString(),
          mealType: f.mealType,
          foodDescription: f.foodDescription,
          calories: Math.round(f.calories),
          proteinG: Math.round(f.proteinG),
          carbsG: Math.round(f.carbsG),
          fatG: Math.round(f.fatG),
        })),
      };
    }

    case "recent_workouts": {
      const rows = await prisma.workoutLog.findMany({
        where: { startedAt: { gte: since, lte: until } },
        orderBy: { startedAt: "desc" },
        take: 30,
      });
      return {
        workouts: rows.map((w) => {
          const m = (w.metricsData ?? {}) as {
            timeInZones?: { pct: number[]; totalSeconds: number };
            loadScore?: number;
            relativeEffort?: number;
            sequenceId?: string;
            sequenceName?: string;
            roundsCompleted?: number;
            stepSeconds?: number[];
            emom?: { roundsCompleted?: number; totalRounds?: number };
          };
          return {
            id: w.id,
            startedAt: w.startedAt.toISOString(),
            workoutType: w.workoutType,
            description: w.description,
            durationMinutes: w.durationMinutes,
            volumeKg: sessionVolumeKg(w.exercises),
            exercises: w.exercises,
            // zone analytics when an HR stream existed (Strava/watch)
            zonePct: m.timeInZones?.pct,
            loadScore: m.loadScore,
            relativeEffort: m.relativeEffort,
            // routine-run metadata (watch circuit/EMOM runs; web runner)
            sequenceId: m.sequenceId,
            sequenceName: m.sequenceName,
            roundsCompleted: m.roundsCompleted ?? m.emom?.roundsCompleted,
            stepSeconds: m.stepSeconds,
          };
        }),
      };
    }

    case "workout_history": {
      // Full-history Mon-week training series — the coaching backbone.
      // ~90 weeks of data stays compact; from/to narrows when asked.
      const rows = await prisma.workoutLog.findMany({
        where: rangeStart ? { startedAt: { gte: since, lte: until } } : {},
        orderBy: { startedAt: "asc" },
        select: {
          startedAt: true,
          workoutType: true,
          durationMinutes: true,
          caloriesBurned: true,
          distanceMeters: true,
          exercises: true,
          metricsData: true,
        },
      });
      const weeks = new Map<
        string,
        {
          sessions: number;
          strength: number;
          outdoor: number;
          volumeKg: number;
          activeMinutes: number;
          kcal: number;
          km: number;
          load: number[];
        }
      >();
      for (const w of rows) {
        const week = getWeekStartDateString(
          getDateStringInTimeZone(w.startedAt, timeZone),
          1
        );
        const b =
          weeks.get(week) ??
          { sessions: 0, strength: 0, outdoor: 0, volumeKg: 0, activeMinutes: 0, kcal: 0, km: 0, load: [] };
        const m = (w.metricsData ?? {}) as { loadScore?: number };
        const outdoor = (w.distanceMeters ?? 0) > 0;
        b.sessions += 1;
        if (outdoor) b.outdoor += 1;
        else b.strength += 1;
        b.volumeKg += sessionVolumeKg(w.exercises);
        b.activeMinutes += w.durationMinutes ?? 0;
        b.kcal += Math.round(w.caloriesBurned ?? 0);
        b.km += (w.distanceMeters ?? 0) / 1000;
        if (typeof m.loadScore === "number") b.load.push(m.loadScore);
        weeks.set(week, b);
      }
      return {
        weeks: [...weeks.entries()].map(([weekStart, b]) => ({
          weekStart,
          sessions: b.sessions,
          strength: b.strength,
          outdoor: b.outdoor,
          volumeKg: Math.round(b.volumeKg),
          activeMinutes: b.activeMinutes,
          kcalBurned: b.kcal,
          outdoorKm: Math.round(b.km * 10) / 10,
          avgLoadScore:
            b.load.length > 0
              ? Math.round(b.load.reduce((s, x) => s + x, 0) / b.load.length)
              : null,
        })),
      };
    }

    case "food_history": {
      // Full-history weekly intake vs the current targets — "how's my
      // eating trended" answerable over any horizon.
      const [rows, settingsRow] = await Promise.all([
        prisma.foodLog.findMany({
          where: rangeStart ? { loggedAt: { gte: since, lte: until } } : {},
          orderBy: { loggedAt: "asc" },
          select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
        }),
        prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
      ]);
      const byDay = new Map<string, { kcal: number; p: number; c: number; f: number }>();
      for (const r of rows) {
        const day = getDateStringInTimeZone(r.loggedAt, timeZone);
        const b = byDay.get(day) ?? { kcal: 0, p: 0, c: 0, f: 0 };
        b.kcal += r.calories;
        b.p += r.proteinG;
        b.c += r.carbsG;
        b.f += r.fatG;
        byDay.set(day, b);
      }
      const weeks = new Map<string, { days: number; kcal: number; p: number; c: number; f: number }>();
      for (const [day, d] of byDay) {
        const week = getWeekStartDateString(day, 1);
        const b = weeks.get(week) ?? { days: 0, kcal: 0, p: 0, c: 0, f: 0 };
        b.days += 1;
        b.kcal += d.kcal;
        b.p += d.p;
        b.c += d.c;
        b.f += d.f;
        weeks.set(week, b);
      }
      const settings = (settingsRow?.data ?? {}) as SettingsData;
      return {
        calorieTarget: settings.calorieTarget ?? 2000,
        weeks: [...weeks.entries()].map(([weekStart, b]) => ({
          weekStart,
          loggedDays: b.days,
          avgKcalPerLoggedDay: Math.round(b.kcal / b.days),
          avgProteinG: Math.round(b.p / b.days),
          avgCarbsG: Math.round(b.c / b.days),
          avgFatG: Math.round(b.f / b.days),
        })),
      };
    }

    case "routines": {
      const rows = await prisma.sequence.findMany({
        where: { isArchived: false },
        orderBy: { updatedAt: "desc" },
      });
      return {
        routines: rows.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          durationMinutes: s.durationMinutes,
          rounds: s.rounds,
          restSecondsDefault: s.restSecondsDefault,
          steps: s.steps,
        })),
      };
    }

    case "weight_trend": {
      // Weight is long-horizon: recent raw rows (with ids, for edits) PLUS a
      // full-history weekly series so "how's my weight going" gets the whole
      // journey (VeSync history: daily readings since Dec 2025), compactly.
      const [recent, all] = await Promise.all([
        prisma.bodyMeasurement.findMany({
          where: { weightKg: { not: null } },
          orderBy: { measuredAt: "desc" },
          take: 20,
        }),
        prisma.bodyMeasurement.findMany({
          where: { weightKg: { not: null } },
          orderBy: { measuredAt: "asc" },
          select: {
            measuredAt: true,
            weightKg: true,
            bodyFatPct: true,
            muscleMassKg: true,
          },
        }),
      ]);

      // Mon-start weekly averages in the user's timezone.
      const weeks = new Map<
        string,
        { w: number[]; bf: number[]; mm: number[] }
      >();
      for (const m of all) {
        const week = getWeekStartDateString(
          getDateStringInTimeZone(m.measuredAt, timeZone),
          1
        );
        const bucket = weeks.get(week) ?? { w: [], bf: [], mm: [] };
        bucket.w.push(m.weightKg as number);
        if (m.bodyFatPct != null) bucket.bf.push(m.bodyFatPct);
        if (m.muscleMassKg != null) bucket.mm.push(m.muscleMassKg);
        weeks.set(week, bucket);
      }
      const avg = (xs: number[], digits = 1) =>
        xs.length > 0
          ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10 ** digits) /
            10 ** digits
          : null;

      return {
        weeklyTrend: [...weeks.entries()].map(([weekStart, b]) => ({
          weekStart,
          avgWeightKg: avg(b.w),
          avgBodyFatPct: avg(b.bf),
          avgMuscleMassKg: avg(b.mm),
        })),
        measurements: recent.map((m) => ({
          id: m.id,
          measuredAt: m.measuredAt.toISOString().slice(0, 10),
          weightKg: m.weightKg,
          bodyFatPct: m.bodyFatPct,
          waistCm: m.waistCm,
        })),
      };
    }

    case "today_summary":
    default: {
      const { dayStart, dayEnd } = getUtcDayBoundsForTimeZone(todayStr, timeZone);
      const weekStart = zonedLocalDateTimeToUtc(
        getWeekStartDateString(todayStr, 1),
        timeZone
      );
      const [settingsRow, food, workouts, water] = await Promise.all([
        prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } }),
        prisma.foodLog.findMany({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          select: { calories: true, proteinG: true, carbsG: true, fatG: true, foodDescription: true, mealType: true },
        }),
        prisma.workoutLog.findMany({
          where: { startedAt: { gte: weekStart } },
          select: { exercises: true, startedAt: true, workoutType: true },
        }),
        prisma.waterLog.aggregate({
          where: { loggedAt: { gte: dayStart, lte: dayEnd } },
          _sum: { amountMl: true },
        }),
      ]);

      const settings = (settingsRow?.data ?? {}) as SettingsData;
      const goal = settings.calorieTarget ?? 2000;
      let calories = 0, proteinG = 0, carbsG = 0, fatG = 0;
      for (const f of food) {
        calories += f.calories;
        proteinG += f.proteinG;
        carbsG += f.carbsG;
        fatG += f.fatG;
      }

      return {
        date: todayStr,
        caloriesEaten: Math.round(calories),
        calorieGoal: goal,
        proteinG: Math.round(proteinG),
        proteinGoalG: Math.round((goal * (settings.proteinPct ?? 30)) / 100 / 4),
        carbsG: Math.round(carbsG),
        carbsGoalG: Math.round((goal * (settings.carbsPct ?? 40)) / 100 / 4),
        fatG: Math.round(fatG),
        fatGoalG: Math.round((goal * (settings.fatPct ?? 30)) / 100 / 9),
        mealsToday: food.map((f) => `${f.mealType}: ${f.foodDescription}`),
        waterMlToday: water._sum.amountMl ?? 0,
        weekTrainingVolumeKg: workouts.reduce((s, w) => s + sessionVolumeKg(w.exercises), 0),
        weekWorkouts: workouts.length,
      };
    }
  }
}

// Proposal tools — the model proposes, the USER confirms in the UI, then the
// client persists via the normal CRUD endpoints. Anything here is terminal
// for the agentic loop.
export const PROPOSAL_TOOL_NAMES = new Set([
  "log_food",
  "log_measurement",
  "log_workout",
  "log_water",
  "edit_food_log",
  "delete_entry",
  "create_routine",
  "update_routine",
  "create_exercise",
  "edit_workout_entry",
  "save_food_product",
]);

/// Numeric measurement fields — the ones the model zero-fills.
const MEASUREMENT_NUMERIC_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "chestCm",
  "armsCm",
  "legsCm",
  "hipsCm",
  "shouldersCm",
  "neckCm",
  "forearmsCm",
  "calvesCm",
] as const;

/**
 * Strip zero-filled measurements out of a `log_measurement` tool call.
 *
 * The model pads the schema: asked for a waist, it returns a waist plus
 * `weightKg: 0, bodyFatPct: 0, legsCm: 0` and nine more. Zero is not a
 * missing value, it's a claim he measured his weight and it was nothing —
 * and the card used to print all of it ("weight 0 kg · arms 0 cm"), which
 * reads as a broken app promising a save that never happens (the CRUD route
 * coerces `0 || null` on the way in, so the zeros were never stored either).
 *
 * Told not to in the system prompt AND in the tool description, it still
 * does it (verified live 2026-08-20), so this is enforced in code rather
 * than asked for in English.
 */
export function sanitizeMeasurementArgs(
  args: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...args };
  for (const field of MEASUREMENT_NUMERIC_FIELDS) {
    const value = clean[field];
    if (value === null || value === undefined) {
      delete clean[field];
      continue;
    }
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
      delete clean[field];
    } else {
      clean[field] = n;
    }
  }
  return clean;
}

/// Applied to every proposal before it's persisted or sent to the client.
export function sanitizeProposalArgs(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  return toolName === "log_measurement" ? sanitizeMeasurementArgs(args) : args;
}

export type ProposalKind =
  | "food"
  | "measurement"
  | "workout"
  | "water"
  | "edit_food"
  | "delete"
  | "routine"
  | "routine_update"
  | "exercise"
  | "edit_workout"
  | "product";

export function proposalKindFor(toolName: string): ProposalKind | null {
  switch (toolName) {
    case "log_food":
      return "food";
    case "log_measurement":
      return "measurement";
    case "log_workout":
      return "workout";
    case "log_water":
      return "water";
    case "edit_food_log":
      return "edit_food";
    case "delete_entry":
      return "delete";
    case "create_routine":
      return "routine";
    case "update_routine":
      return "routine_update";
    case "create_exercise":
      return "exercise";
    case "edit_workout_entry":
      return "edit_workout";
    case "save_food_product":
      return "product";
    default:
      return null;
  }
}
