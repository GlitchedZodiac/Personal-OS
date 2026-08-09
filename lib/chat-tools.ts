import { prisma } from "@/lib/prisma";
import { sessionVolumeKg } from "@/lib/prs";
import { getUtcDayBoundsForTimeZone, getWeekStartDateString, zonedLocalDateTimeToUtc } from "@/lib/timezone";

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

export async function executeGetHealthData(
  args: { query?: string; days?: number },
  timeZone: string,
  todayStr: string
): Promise<object> {
  const query = args.query ?? "today_summary";
  const days = clampDays(args.days);
  const since = new Date(Date.now() - days * DAY_MS);

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
        where: { loggedAt: { gte: since } },
        orderBy: { loggedAt: "desc" },
        take: 40,
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
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: "desc" },
        take: 20,
      });
      return {
        workouts: rows.map((w) => {
          const m = (w.metricsData ?? {}) as {
            timeInZones?: { pct: number[]; totalSeconds: number };
            loadScore?: number;
            relativeEffort?: number;
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
          };
        }),
      };
    }

    case "weight_trend": {
      // No window: weight is long-horizon — always return the latest rows,
      // however old (weeks between weigh-ins is normal).
      const rows = await prisma.bodyMeasurement.findMany({
        where: { weightKg: { not: null } },
        orderBy: { measuredAt: "desc" },
        take: 20,
      });
      return {
        measurements: rows.map((m) => ({
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
]);

export type ProposalKind =
  | "food"
  | "measurement"
  | "workout"
  | "water"
  | "edit_food"
  | "delete"
  | "routine";

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
    default:
      return null;
  }
}
