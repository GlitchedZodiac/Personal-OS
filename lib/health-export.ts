import type { PrismaClient } from "@prisma/client";
import { subDays } from "date-fns";
import {
  addDaysToDateString,
  dateStringDiffDays,
  getDateStringInTimeZone,
  getUtcDateRangeForTimeZone,
  normalizeTimeZone,
} from "@/lib/timezone";
import { estimateFluidMlFromFoodLog } from "@/lib/hydration";

type HealthSettingsLike = {
  calorieTarget?: number;
  proteinPct?: number;
  carbsPct?: number;
  fatPct?: number;
  units?: "metric" | "imperial";
  gender?: "male" | "female" | "";
  birthYear?: number | null;
  aiLanguage?: string;
  timeZone?: string;
  aiInstructions?: {
    health?: string;
  };
  bodyGoals?: {
    goalWeightKg?: number | null;
    goalWaistCm?: number | null;
  };
  workoutGoals?: {
    goal?: string;
    fitnessLevel?: string;
    daysPerWeek?: number;
    sessionMinutes?: number;
    equipment?: string[];
    focusAreas?: string[];
    injuries?: string;
  };
};

export interface BuildHealthExportOptions {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  timeZone?: string | null;
  includeProgressPhotoData?: boolean;
  includeWorkoutRoutes?: boolean;
}

function round(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(total: number, count: number) {
  if (!count) return 0;
  return total / count;
}

function toIso(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function getMacroTargets(settings: HealthSettingsLike | null) {
  const calorieTarget = Number(settings?.calorieTarget ?? 2000);
  const proteinPct = Number(settings?.proteinPct ?? 30);
  const carbsPct = Number(settings?.carbsPct ?? 40);
  const fatPct = Number(settings?.fatPct ?? 30);

  return {
    calorieTarget,
    proteinG: Math.round((calorieTarget * proteinPct) / 100 / 4),
    carbsG: Math.round((calorieTarget * carbsPct) / 100 / 4),
    fatG: Math.round((calorieTarget * fatPct) / 100 / 9),
  };
}

function findChange<T>(rows: T[], getValue: (row: T) => number | null | undefined) {
  const validRows = rows.filter((row) => getValue(row) != null);
  if (validRows.length < 2) {
    return {
      first: null,
      latest: validRows[0] ?? null,
      change: null,
    };
  }

  const first = validRows[0];
  const latest = validRows[validRows.length - 1];
  const firstValue = Number(getValue(first));
  const latestValue = Number(getValue(latest));

  return {
    first,
    latest,
    change: round(latestValue - firstValue, 2),
  };
}

function buildCoverage(rows: Array<{ date: Date }>) {
  if (!rows.length) {
    return {
      count: 0,
      earliest: null,
      latest: null,
    };
  }

  return {
    count: rows.length,
    earliest: rows[0].date.toISOString(),
    latest: rows[rows.length - 1].date.toISOString(),
  };
}

function normalizePrompt(timeZone: string) {
  return [
    "You are reviewing my personal health export JSON from Personal OS.",
    "Use the summary for high-level trends, dailyRollups for pattern detection, and rawData for specifics.",
    "Do not assume missing logs mean zero behavior; call out likely missing data separately from real declines.",
    `Respect that dates are grouped in the ${timeZone} time zone unless a raw timestamp says otherwise.`,
    "Give me:",
    "1. the biggest positive patterns",
    "2. the biggest risks, bottlenecks, or inconsistencies",
    "3. what the data suggests about nutrition, recovery, training, and body composition",
    "4. the 3 highest-leverage next actions",
    "5. any questions you need answered to interpret the data better",
  ].join("\n");
}

function buildDateWindow(input: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
  timeZone: string;
}) {
  const today = new Date();
  const todayStr = getDateStringInTimeZone(today, input.timeZone);

  if (input.from || input.to) {
    const startDate = input.from ?? input.to ?? todayStr;
    const endDate = input.to ?? input.from ?? todayStr;
    const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
      startDate,
      endDate,
      input.timeZone
    );
    return {
      mode: "custom" as const,
      from: startDate,
      to: endDate,
      where: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    };
  }

  if (input.range && input.range !== "all") {
    const parsedRange = Number(input.range);
    const safeRange = Number.isFinite(parsedRange)
      ? Math.max(1, Math.min(parsedRange, 3660))
      : 90;
    const from = addDaysToDateString(todayStr, -(safeRange - 1));
    const { rangeStart, rangeEnd } = getUtcDateRangeForTimeZone(
      from,
      todayStr,
      input.timeZone
    );
    return {
      mode: "window" as const,
      from,
      to: todayStr,
      where: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    };
  }

  return {
    mode: "all" as const,
    from: null,
    to: null,
    where: undefined,
  };
}

export async function buildHealthExport(
  db: PrismaClient,
  options: BuildHealthExportOptions = {}
) {
  const settingsRow = await db.userSettings.findUnique({
    where: { id: "default" },
    select: { data: true },
  });

  const settings = (settingsRow?.data as HealthSettingsLike | null) ?? null;
  const timeZone = normalizeTimeZone(options.timeZone ?? settings?.timeZone);
  const includeProgressPhotoData = options.includeProgressPhotoData ?? false;
  const includeWorkoutRoutes = options.includeWorkoutRoutes ?? false;
  const window = buildDateWindow({
    range: options.range,
    from: options.from,
    to: options.to,
    timeZone,
  });

  const foodWhere = window.where ? { loggedAt: window.where } : undefined;
  const workoutWhere = window.where ? { startedAt: window.where } : undefined;
  const measurementWhere = window.where ? { measuredAt: window.where } : undefined;
  const waterWhere = window.where ? { loggedAt: window.where } : undefined;
  const photoWhere = window.where ? { takenAt: window.where } : undefined;
  const snapshotWhere =
    window.from && window.to
      ? {
          localDate: {
            gte: window.from,
            lte: window.to,
          },
        }
      : undefined;
  const completionWhere = window.where
    ? {
        scheduledDate: window.where,
      }
    : undefined;

  const [
    foodLogs,
    workoutLogs,
    bodyMeasurements,
    waterLogs,
    progressPhotos,
    dailyHealthSnapshots,
    workoutPlans,
    workoutPlanCompletions,
  ] = await Promise.all([
    db.foodLog.findMany({
      where: foodWhere,
      orderBy: { loggedAt: "asc" },
      select: {
        id: true,
        loggedAt: true,
        mealType: true,
        foodDescription: true,
        calories: true,
        proteinG: true,
        carbsG: true,
        fatG: true,
        notes: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.workoutLog.findMany({
      where: workoutWhere,
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        durationMinutes: true,
        workoutType: true,
        description: true,
        caloriesBurned: true,
        distanceMeters: true,
        stepCount: true,
        avgHeartRateBpm: true,
        maxHeartRateBpm: true,
        elevationGainM: true,
        routeData: includeWorkoutRoutes,
        metricsData: true,
        exercises: true,
        deviceType: true,
        externalSource: true,
        externalId: true,
        syncStatus: true,
        stravaActivityId: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.bodyMeasurement.findMany({
      where: measurementWhere,
      orderBy: { measuredAt: "asc" },
      select: {
        id: true,
        measuredAt: true,
        weightKg: true,
        bodyFatPct: true,
        waistCm: true,
        chestCm: true,
        armsCm: true,
        legsCm: true,
        hipsCm: true,
        shouldersCm: true,
        neckCm: true,
        forearmsCm: true,
        calvesCm: true,
        skinfoldData: true,
        notes: true,
        bmi: true,
        fatFreeWeightKg: true,
        subcutaneousFatPct: true,
        visceralFat: true,
        bodyWaterPct: true,
        skeletalMusclePct: true,
        muscleMassKg: true,
        boneMassKg: true,
        proteinPct: true,
        bmrKcal: true,
        metabolicAge: true,
        heartRateBpm: true,
        source: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.waterLog.findMany({
      where: waterWhere,
      orderBy: { loggedAt: "asc" },
      select: {
        id: true,
        loggedAt: true,
        amountMl: true,
        createdAt: true,
      },
    }),
    db.progressPhoto.findMany({
      where: photoWhere,
      orderBy: { takenAt: "asc" },
      select: {
        id: true,
        takenAt: true,
        imageData: includeProgressPhotoData,
        journalNote: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.dailyHealthSnapshot.findMany({
      where: snapshotWhere,
      orderBy: [{ localDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        localDate: true,
        timeZone: true,
        steps: true,
        restingHeartRateBpm: true,
        activeEnergyKcal: true,
        walkingRunningDistanceMeters: true,
        source: true,
        rawData: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.workoutPlan.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        goal: true,
        fitnessLevel: true,
        daysPerWeek: true,
        schedule: true,
        isActive: true,
        aiGenerated: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.workoutPlanCompletion.findMany({
      where: completionWhere,
      orderBy: { scheduledDate: "asc" },
      select: {
        id: true,
        planId: true,
        scheduledDate: true,
        dayIndex: true,
        dayLabel: true,
        completed: true,
        feedback: true,
        actualExercises: true,
        caloriesBurned: true,
        durationMinutes: true,
        userNotes: true,
        aiSuggestion: true,
        createdAt: true,
      },
    }),
  ]);

  const macroTargets = getMacroTargets(settings);
  const dailyRollupMap = new Map<
    string,
    {
      date: string;
      nutrition: {
        mealCount: number;
        calories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      };
      workouts: {
        count: number;
        durationMinutes: number;
        caloriesBurned: number;
        distanceMeters: number;
        loggedSteps: number;
      };
      hydration: {
        manualWaterMl: number;
        inferredWaterMl: number;
        totalWaterMl: number;
      };
      body: {
        measurementCount: number;
        latestWeightKg: number | null;
        latestBodyFatPct: number | null;
        latestWaistCm: number | null;
      };
      activity: {
        steps: number | null;
        restingHeartRateBpm: number | null;
        activeEnergyKcal: number | null;
        walkingRunningDistanceMeters: number | null;
      };
      netCalories: number;
    }
  >();

  function getRollup(dateKey: string) {
    if (!dailyRollupMap.has(dateKey)) {
      dailyRollupMap.set(dateKey, {
        date: dateKey,
        nutrition: {
          mealCount: 0,
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
        workouts: {
          count: 0,
          durationMinutes: 0,
          caloriesBurned: 0,
          distanceMeters: 0,
          loggedSteps: 0,
        },
        hydration: {
          manualWaterMl: 0,
          inferredWaterMl: 0,
          totalWaterMl: 0,
        },
        body: {
          measurementCount: 0,
          latestWeightKg: null,
          latestBodyFatPct: null,
          latestWaistCm: null,
        },
        activity: {
          steps: null,
          restingHeartRateBpm: null,
          activeEnergyKcal: null,
          walkingRunningDistanceMeters: null,
        },
        netCalories: 0,
      });
    }
    return dailyRollupMap.get(dateKey)!;
  }

  for (const log of foodLogs) {
    const dateKey = getDateStringInTimeZone(log.loggedAt, timeZone);
    const rollup = getRollup(dateKey);
    rollup.nutrition.mealCount += 1;
    rollup.nutrition.calories += log.calories;
    rollup.nutrition.proteinG += log.proteinG;
    rollup.nutrition.carbsG += log.carbsG;
    rollup.nutrition.fatG += log.fatG;
    const inferredMl = estimateFluidMlFromFoodLog({
      foodDescription: log.foodDescription,
      notes: log.notes,
    });
    rollup.hydration.inferredWaterMl += inferredMl;
    rollup.hydration.totalWaterMl += inferredMl;
  }

  for (const workout of workoutLogs) {
    const dateKey = getDateStringInTimeZone(workout.startedAt, timeZone);
    const rollup = getRollup(dateKey);
    rollup.workouts.count += 1;
    rollup.workouts.durationMinutes += workout.durationMinutes;
    rollup.workouts.caloriesBurned += workout.caloriesBurned ?? 0;
    rollup.workouts.distanceMeters += workout.distanceMeters ?? 0;
    rollup.workouts.loggedSteps += workout.stepCount ?? 0;
  }

  for (const water of waterLogs) {
    const dateKey = getDateStringInTimeZone(water.loggedAt, timeZone);
    const rollup = getRollup(dateKey);
    rollup.hydration.manualWaterMl += water.amountMl;
    rollup.hydration.totalWaterMl += water.amountMl;
  }

  for (const measurement of bodyMeasurements) {
    const dateKey = getDateStringInTimeZone(measurement.measuredAt, timeZone);
    const rollup = getRollup(dateKey);
    rollup.body.measurementCount += 1;
    rollup.body.latestWeightKg = measurement.weightKg ?? rollup.body.latestWeightKg;
    rollup.body.latestBodyFatPct =
      measurement.bodyFatPct ?? rollup.body.latestBodyFatPct;
    rollup.body.latestWaistCm = measurement.waistCm ?? rollup.body.latestWaistCm;
  }

  for (const snapshot of dailyHealthSnapshots) {
    const rollup = getRollup(snapshot.localDate);
    rollup.activity.steps = snapshot.steps ?? rollup.activity.steps;
    rollup.activity.restingHeartRateBpm =
      snapshot.restingHeartRateBpm ?? rollup.activity.restingHeartRateBpm;
    rollup.activity.activeEnergyKcal =
      snapshot.activeEnergyKcal ?? rollup.activity.activeEnergyKcal;
    rollup.activity.walkingRunningDistanceMeters =
      snapshot.walkingRunningDistanceMeters ??
      rollup.activity.walkingRunningDistanceMeters;
  }

  const dailyRollups = Array.from(dailyRollupMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      ...day,
      nutrition: {
        ...day.nutrition,
        calories: round(day.nutrition.calories, 1) ?? 0,
        proteinG: round(day.nutrition.proteinG, 1) ?? 0,
        carbsG: round(day.nutrition.carbsG, 1) ?? 0,
        fatG: round(day.nutrition.fatG, 1) ?? 0,
      },
      workouts: {
        ...day.workouts,
        caloriesBurned: round(day.workouts.caloriesBurned, 1) ?? 0,
        distanceMeters: round(day.workouts.distanceMeters, 1) ?? 0,
      },
      hydration: {
        ...day.hydration,
        inferredWaterMl: Math.round(day.hydration.inferredWaterMl),
        totalWaterMl: Math.round(day.hydration.totalWaterMl),
      },
      netCalories:
        (round(day.nutrition.calories, 1) ?? 0) -
        (round(day.workouts.caloriesBurned, 1) ?? 0),
    }));

  const windowStart =
    window.from ??
    dailyRollups[0]?.date ??
    getDateStringInTimeZone(subDays(new Date(), 29), timeZone);
  const windowEnd =
    window.to ??
    dailyRollups[dailyRollups.length - 1]?.date ??
    getDateStringInTimeZone(new Date(), timeZone);
  const calendarDaysInWindow = Math.max(1, dateStringDiffDays(windowStart, windowEnd) + 1);
  const loggedDays = dailyRollups.length;

  const totalCaloriesEaten = foodLogs.reduce((sum, log) => sum + log.calories, 0);
  const totalProtein = foodLogs.reduce((sum, log) => sum + log.proteinG, 0);
  const totalCarbs = foodLogs.reduce((sum, log) => sum + log.carbsG, 0);
  const totalFat = foodLogs.reduce((sum, log) => sum + log.fatG, 0);
  const totalCaloriesBurned = workoutLogs.reduce(
    (sum, workout) => sum + (workout.caloriesBurned ?? 0),
    0
  );
  const totalWorkoutMinutes = workoutLogs.reduce(
    (sum, workout) => sum + workout.durationMinutes,
    0
  );
  const totalWorkoutDistanceMeters = workoutLogs.reduce(
    (sum, workout) => sum + (workout.distanceMeters ?? 0),
    0
  );
  const totalWorkoutLoggedSteps = workoutLogs.reduce(
    (sum, workout) => sum + (workout.stepCount ?? 0),
    0
  );
  const totalManualWaterMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);
  const totalInferredWaterMl = foodLogs.reduce(
    (sum, log) =>
      sum +
      estimateFluidMlFromFoodLog({
        foodDescription: log.foodDescription,
        notes: log.notes,
      }),
    0
  );
  const totalWaterMl = totalManualWaterMl + totalInferredWaterMl;
  const totalSnapshotSteps = dailyHealthSnapshots.reduce(
    (sum, snapshot) => sum + (snapshot.steps ?? 0),
    0
  );
  const totalSnapshotActiveEnergy = dailyHealthSnapshots.reduce(
    (sum, snapshot) => sum + (snapshot.activeEnergyKcal ?? 0),
    0
  );

  const latestFoodLog = foodLogs[foodLogs.length - 1] ?? null;
  const latestWorkout = workoutLogs[workoutLogs.length - 1] ?? null;
  const latestMeasurement = bodyMeasurements[bodyMeasurements.length - 1] ?? null;
  const latestWaterLog = waterLogs[waterLogs.length - 1] ?? null;
  const latestProgressPhoto = progressPhotos[progressPhotos.length - 1] ?? null;
  const latestDailySnapshot =
    dailyHealthSnapshots[dailyHealthSnapshots.length - 1] ?? null;

  const weightChange = findChange(bodyMeasurements, (row) => row.weightKg);
  const bodyFatChange = findChange(bodyMeasurements, (row) => row.bodyFatPct);
  const waistChange = findChange(bodyMeasurements, (row) => row.waistCm);

  const foodCoverage = buildCoverage(foodLogs.map((row) => ({ date: row.loggedAt })));
  const workoutCoverage = buildCoverage(
    workoutLogs.map((row) => ({ date: row.startedAt }))
  );
  const bodyCoverage = buildCoverage(
    bodyMeasurements.map((row) => ({ date: row.measuredAt }))
  );
  const waterCoverage = buildCoverage(waterLogs.map((row) => ({ date: row.loggedAt })));
  const photoCoverage = buildCoverage(
    progressPhotos.map((row) => ({ date: row.takenAt }))
  );
  const snapshotCoverage = buildCoverage(
    dailyHealthSnapshots.map((row) => ({ date: row.createdAt }))
  );
  const completionCoverage = buildCoverage(
    workoutPlanCompletions.map((row) => ({ date: row.scheduledDate }))
  );

  return {
    schemaVersion: "health-export.v1",
    generatedAt: new Date().toISOString(),
    requestedRange: {
      mode: window.mode,
      from: window.from,
      to: window.to,
      timeZone,
      calendarDays: calendarDaysInWindow,
      includeProgressPhotoData,
      includeWorkoutRoutes,
    },
    aiContext: {
      purpose:
        "Share this JSON with an external AI coach or assistant to discuss nutrition, training, recovery, body composition, and behavior trends.",
      suggestedPrompt: normalizePrompt(timeZone),
      suggestedQuestions: [
        "What patterns do you see in my calories eaten versus calories burned?",
        "How is my weight changing relative to my food intake, workouts, and body measurements?",
        "Do you see any signs of under-eating, inconsistent logging, or weak recovery?",
        "What are the strongest habits in this export, and what are the biggest bottlenecks?",
        "What should I change over the next 2 weeks based on this data?",
      ],
    },
    settingsContext: {
      timeZone,
      units: settings?.units ?? "metric",
      gender: settings?.gender ?? "",
      birthYear: settings?.birthYear ?? null,
      aiLanguage: settings?.aiLanguage ?? "english",
      targets: {
        calorieTarget: macroTargets.calorieTarget,
        proteinTargetG: macroTargets.proteinG,
        carbsTargetG: macroTargets.carbsG,
        fatTargetG: macroTargets.fatG,
      },
      bodyGoals: {
        goalWeightKg: settings?.bodyGoals?.goalWeightKg ?? null,
        goalWaistCm: settings?.bodyGoals?.goalWaistCm ?? null,
      },
      workoutGoals: settings?.workoutGoals ?? null,
      healthInstructions: settings?.aiInstructions?.health ?? "",
    },
    coverage: {
      totalLoggedDays: loggedDays,
      datasets: {
        foodLogs: foodCoverage,
        workoutLogs: workoutCoverage,
        bodyMeasurements: bodyCoverage,
        waterLogs: waterCoverage,
        progressPhotos: photoCoverage,
        dailyHealthSnapshots: snapshotCoverage,
        workoutPlanCompletions: completionCoverage,
      },
    },
    summary: {
      counts: {
        foodLogs: foodLogs.length,
        workouts: workoutLogs.length,
        bodyMeasurements: bodyMeasurements.length,
        waterLogs: waterLogs.length,
        progressPhotos: progressPhotos.length,
        dailyHealthSnapshots: dailyHealthSnapshots.length,
        workoutPlans: workoutPlans.length,
        workoutPlanCompletions: workoutPlanCompletions.length,
      },
      totals: {
        caloriesEaten: round(totalCaloriesEaten, 1) ?? 0,
        caloriesBurned: round(totalCaloriesBurned, 1) ?? 0,
        netCalories:
          (round(totalCaloriesEaten, 1) ?? 0) -
          (round(totalCaloriesBurned, 1) ?? 0),
        proteinG: round(totalProtein, 1) ?? 0,
        carbsG: round(totalCarbs, 1) ?? 0,
        fatG: round(totalFat, 1) ?? 0,
        workoutMinutes: totalWorkoutMinutes,
        workoutDistanceMeters: round(totalWorkoutDistanceMeters, 1) ?? 0,
        workoutLoggedSteps: totalWorkoutLoggedSteps,
        waterMlManual: totalManualWaterMl,
        waterMlInferredFromFoods: totalInferredWaterMl,
        waterMlTotal: totalWaterMl,
        stepsFromDailySnapshots: totalSnapshotSteps,
        activeEnergyKcalFromSnapshots: round(totalSnapshotActiveEnergy, 1) ?? 0,
      },
      averagesPerCalendarDay: {
        caloriesEaten: round(average(totalCaloriesEaten, calendarDaysInWindow), 1) ?? 0,
        caloriesBurned: round(
          average(totalCaloriesBurned, calendarDaysInWindow),
          1
        ) ?? 0,
        proteinG: round(average(totalProtein, calendarDaysInWindow), 1) ?? 0,
        carbsG: round(average(totalCarbs, calendarDaysInWindow), 1) ?? 0,
        fatG: round(average(totalFat, calendarDaysInWindow), 1) ?? 0,
        workoutMinutes: round(
          average(totalWorkoutMinutes, calendarDaysInWindow),
          1
        ) ?? 0,
        waterMl: Math.round(average(totalWaterMl, calendarDaysInWindow)),
        steps: Math.round(average(totalSnapshotSteps, calendarDaysInWindow)),
      },
      averagesPerLoggedDay: {
        caloriesEaten: round(average(totalCaloriesEaten, loggedDays), 1) ?? 0,
        caloriesBurned: round(average(totalCaloriesBurned, loggedDays), 1) ?? 0,
        proteinG: round(average(totalProtein, loggedDays), 1) ?? 0,
        carbsG: round(average(totalCarbs, loggedDays), 1) ?? 0,
        fatG: round(average(totalFat, loggedDays), 1) ?? 0,
        waterMl: Math.round(average(totalWaterMl, loggedDays)),
      },
      current: {
        latestFoodLogAt: toIso(latestFoodLog?.loggedAt),
        latestWorkoutAt: toIso(latestWorkout?.startedAt),
        latestMeasurementAt: toIso(latestMeasurement?.measuredAt),
        latestWaterLogAt: toIso(latestWaterLog?.loggedAt),
        latestProgressPhotoAt: toIso(latestProgressPhoto?.takenAt),
        latestSnapshotDate: latestDailySnapshot?.localDate ?? null,
        latestWeightKg: latestMeasurement?.weightKg ?? null,
        latestBodyFatPct: latestMeasurement?.bodyFatPct ?? null,
        latestWaistCm: latestMeasurement?.waistCm ?? null,
        latestSteps: latestDailySnapshot?.steps ?? null,
        latestRestingHeartRateBpm:
          latestDailySnapshot?.restingHeartRateBpm ?? null,
      },
    },
    trends: {
      nutrition: {
        mealCount: foodLogs.length,
        averageCaloriesPerMeal:
          foodLogs.length > 0 ? round(totalCaloriesEaten / foodLogs.length, 1) : null,
        averageCaloriesPerWorkout:
          workoutLogs.length > 0
            ? round(totalCaloriesBurned / workoutLogs.length, 1)
            : null,
      },
      workouts: {
        workoutsPerWeekEquivalent: round(
          average(workoutLogs.length, calendarDaysInWindow) * 7,
          2
        ),
        averageMinutesPerWorkout:
          workoutLogs.length > 0
            ? round(totalWorkoutMinutes / workoutLogs.length, 1)
            : null,
        averageBurnedPerWorkout:
          workoutLogs.length > 0
            ? round(totalCaloriesBurned / workoutLogs.length, 1)
            : null,
      },
      body: {
        weightChangeKg: weightChange.change,
        bodyFatChangePctPoints: bodyFatChange.change,
        waistChangeCm: waistChange.change,
        firstWeightKg: weightChange.first?.weightKg ?? null,
        latestWeightKg: weightChange.latest?.weightKg ?? null,
        firstBodyFatPct: bodyFatChange.first?.bodyFatPct ?? null,
        latestBodyFatPct: bodyFatChange.latest?.bodyFatPct ?? null,
        firstWaistCm: waistChange.first?.waistCm ?? null,
        latestWaistCm: waistChange.latest?.waistCm ?? null,
      },
      hydration: {
        averageManualWaterMlPerDay: Math.round(
          average(totalManualWaterMl, calendarDaysInWindow)
        ),
        averageInferredWaterMlPerDay: Math.round(
          average(totalInferredWaterMl, calendarDaysInWindow)
        ),
        averageTotalWaterMlPerDay: Math.round(
          average(totalWaterMl, calendarDaysInWindow)
        ),
      },
      activity: {
        averageStepsPerDay: Math.round(
          average(totalSnapshotSteps, calendarDaysInWindow)
        ),
        averageActiveEnergyKcalPerDay:
          dailyHealthSnapshots.length > 0
            ? round(totalSnapshotActiveEnergy / dailyHealthSnapshots.length, 1)
            : null,
        averageRestingHeartRateBpm:
          dailyHealthSnapshots.length > 0
            ? round(
                dailyHealthSnapshots.reduce(
                  (sum, row) => sum + (row.restingHeartRateBpm ?? 0),
                  0
                ) /
                  Math.max(
                    1,
                    dailyHealthSnapshots.filter(
                      (row) => row.restingHeartRateBpm != null
                    ).length
                  ),
                1
              )
            : null,
      },
    },
    dailyRollups,
    rawData: {
      foodLogs: foodLogs.map((row) => ({
        ...row,
        loggedAt: row.loggedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      workoutLogs: workoutLogs.map((row) => ({
        ...row,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        routeDataIncluded: includeWorkoutRoutes,
      })),
      bodyMeasurements: bodyMeasurements.map((row) => ({
        ...row,
        measuredAt: row.measuredAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      waterLogs: waterLogs.map((row) => ({
        ...row,
        loggedAt: row.loggedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      dailyHealthSnapshots: dailyHealthSnapshots.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      workoutPlans: workoutPlans.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      workoutPlanCompletions: workoutPlanCompletions.map((row) => ({
        ...row,
        scheduledDate: row.scheduledDate.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      progressPhotos: progressPhotos.map((row) => ({
        ...row,
        takenAt: row.takenAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        imageDataIncluded: includeProgressPhotoData,
      })),
    },
  };
}
