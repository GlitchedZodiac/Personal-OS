// A synthetic week for the Coach (2026-10-17, lane B). NOTHING here is his
// data: the routines, trails, weights, meals and journal lines are invented,
// so Test mode, the screenshots and the unit tests never carry a real row.
//
// Rows are generated relative to `weekStart`, so a Test run always reads as
// a current week, and the shapes are exactly what lib/coach/source-prisma.ts
// selects. Three weeks: "full" exercises every group, "partial" has gaps
// everywhere (the common real case), "empty" has nothing but settings.

import { addDaysToDateString, zonedLocalDateTimeToUtc } from "@/lib/timezone";
import type {
  ActivityRow,
  BodyRow,
  CoachSource,
  FoodRow,
  JournalRow,
  PlanRow,
  ProgressionRow,
  RecordRow,
  SequenceRow,
  SnapshotRow,
  TrailRow,
  WaterRow,
  WorkoutRow,
} from "./types";

export const FIXTURE_WEEK_START = "2026-10-05";
export const FIXTURE_TIME_ZONE = "America/Bogota";

export type FixtureKind = "full" | "partial" | "empty";

/** Protein target 2200 × 30 % ÷ 4 = 165 g; carbs 248 g; fat 61 g. */
export const FIXTURE_SETTINGS = {
  calorieTarget: 2200,
  proteinPct: 30,
  carbsPct: 45,
  fatPct: 25,
  workoutGoals: { daysPerWeek: 4 },
  timeZone: FIXTURE_TIME_ZONE,
};

export interface FixtureRows {
  food: FoodRow[];
  workouts: WorkoutRow[];
  records: RecordRow[];
  body: BodyRow[];
  snapshots: SnapshotRow[];
  activity: ActivityRow[];
  plans: PlanRow[];
  sequences: SequenceRow[];
  trails: TrailRow[];
  water: WaterRow[];
  journal: JournalRow[];
  progression: ProgressionRow[];
}

const SEQ_ALPHA = "fx-seq-alpha";
const SEQ_BRAVO = "fx-seq-bravo";
const TRAIL_RIDGE = "fx-trail-ridge";
const TRAIL_QUARRY = "fx-trail-quarry";

export function fixtureRows(
  kind: FixtureKind = "full",
  weekStart: string = FIXTURE_WEEK_START,
  timeZone: string = FIXTURE_TIME_ZONE
): FixtureRows {
  const day = (offset: number) => addDaysToDateString(weekStart, offset);
  const at = (offset: number, hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return zonedLocalDateTimeToUtc(day(offset), timeZone, h, m, 0);
  };

  const sequences: SequenceRow[] = [
    { id: SEQ_ALPHA, name: "Routine Alpha", kind: "straight" },
    { id: SEQ_BRAVO, name: "EMOM Bravo", kind: "emom" },
  ];
  const trails: TrailRow[] = [
    { id: TRAIL_RIDGE, name: "Ridge Loop", distanceMeters: 4700, elevationGainM: 175 },
    { id: TRAIL_QUARRY, name: "Quarry Climb", distanceMeters: 7800, elevationGainM: 410 },
  ];

  if (kind === "empty") {
    return {
      food: [],
      workouts: [],
      records: [],
      body: [],
      snapshots: [],
      activity: [],
      plans: [],
      sequences: [],
      trails: [],
      water: [],
      journal: [],
      progression: [],
    };
  }

  const workout = (
    id: string,
    offset: number,
    hhmm: string,
    workoutType: string,
    durationMinutes: number,
    caloriesBurned: number,
    extra: Partial<WorkoutRow> = {}
  ): WorkoutRow => ({
    id,
    startedAt: at(offset, hhmm),
    workoutType,
    durationMinutes,
    caloriesBurned,
    distanceMeters: null,
    elevationGainM: null,
    avgHeartRateBpm: 128,
    exercises: null,
    metricsData: null,
    trailId: null,
    ...extra,
  });

  // Tonnage: 5×10×24 + 3×8×20 + 3×6×16×2 (a pair) = 1200 + 480 + 576 = 2256.
  const mondayStrength = workout("fx-w1", 0, "18:00", "strength", 45, 380, {
    exercises: [
      { name: "Kettlebell Swing", sets: 5, reps: 10, weightKg: 24 },
      { name: "Goblet Squat", sets: 3, reps: 8, weightKg: 20 },
      { name: "Kettlebell Press", sets: 3, reps: 6, weightKg: 16, implements: 2 },
    ],
    metricsData: { sequenceId: SEQ_ALPHA, sequenceName: "Routine Alpha" },
  });
  // 6×12×24 = 1728.
  const thursdayFreestyle = workout("fx-w3", 3, "18:30", "freestyle", 38, 330, {
    exercises: [{ name: "Kettlebell Swing", sets: 6, reps: 12, weightKg: 24 }],
  });

  const fullWorkouts: WorkoutRow[] = [
    mondayStrength,
    workout("fx-w2", 2, "07:00", "walk", 52, 210, {
      distanceMeters: 4800,
      elevationGainM: 180,
      trailId: TRAIL_RIDGE,
    }),
    thursdayFreestyle,
    workout("fx-w6", 4, "07:15", "walk", 40, 160, { distanceMeters: 3600 }),
    workout("fx-w4", 5, "08:00", "hike", 95, 640, {
      distanceMeters: 7900,
      elevationGainM: 420,
      trailId: TRAIL_QUARRY,
    }),
    workout("fx-w5", 6, "09:00", "jump_rope", 20, 190, {
      metricsData: {
        intervals: {
          mode: "interval",
          workSeconds: 30,
          restSeconds: 30,
          plannedRounds: 20,
          roundsCompleted: 20,
          jumpSeconds: 600,
          restSecondsTotal: 600,
          source: "declared",
        },
      },
    }),
    // The previous week: 1000 + 480 = 1480 and 800 → 2280 kg.
    workout("fx-pw1", -6, "18:00", "strength", 42, 350, {
      exercises: [
        { name: "Kettlebell Swing", sets: 5, reps: 10, weightKg: 20 },
        { name: "Goblet Squat", sets: 3, reps: 8, weightKg: 20 },
      ],
    }),
    workout("fx-pw2", -4, "07:00", "walk", 60, 230, {
      distanceMeters: 4600,
      elevationGainM: 170,
      trailId: TRAIL_RIDGE,
    }),
    workout("fx-pw3", -2, "18:30", "freestyle", 35, 300, {
      exercises: [{ name: "Kettlebell Swing", sets: 4, reps: 10, weightKg: 20 }],
    }),
  ];

  const meal = (
    id: string,
    offset: number,
    hhmm: string,
    calories: number,
    proteinG: number,
    carbsG: number,
    fatG: number
  ): FoodRow => ({ id, loggedAt: at(offset, hhmm), calories, proteinG, carbsG, fatG });

  // Day totals: Mon 2150/170 · Tue 2400/120 · Wed 1900/180 · Thu 2300/140 ·
  // Fri 2050/175 · Sat 2600/110 · Sun none → 6 days, 2233 kcal, 149 g protein.
  const fullFood: FoodRow[] = [
    meal("fx-f1", 0, "07:30", 520, 35, 60, 15),
    meal("fx-f2", 0, "13:00", 850, 70, 90, 25),
    meal("fx-f3", 0, "19:30", 780, 65, 70, 28),
    meal("fx-f4", 1, "07:30", 600, 30, 70, 22),
    meal("fx-f5", 1, "13:00", 950, 45, 110, 30),
    meal("fx-f6", 1, "20:00", 850, 45, 95, 30),
    meal("fx-f7", 2, "07:30", 450, 40, 40, 14),
    meal("fx-f8", 2, "13:00", 700, 65, 60, 22),
    meal("fx-f9", 2, "19:30", 750, 75, 55, 28),
    meal("fx-f10", 3, "07:30", 550, 35, 65, 18),
    meal("fx-f11", 3, "13:00", 900, 55, 100, 28),
    meal("fx-f12", 3, "19:30", 850, 50, 90, 30),
    meal("fx-f13", 4, "07:30", 500, 45, 50, 15),
    meal("fx-f14", 4, "13:00", 800, 70, 75, 25),
    meal("fx-f15", 4, "19:30", 750, 60, 65, 27),
    meal("fx-f16", 5, "08:00", 700, 30, 90, 25),
    meal("fx-f17", 5, "13:30", 1000, 40, 120, 35),
    meal("fx-f18", 5, "20:00", 900, 40, 100, 35),
    // Previous week: 4 days, 2050 kcal and 150 g protein on average.
    meal("fx-pf1", -7, "12:00", 2000, 150, 200, 60),
    meal("fx-pf2", -6, "12:00", 2100, 140, 220, 65),
    meal("fx-pf3", -4, "12:00", 1950, 160, 180, 62),
    meal("fx-pf4", -2, "12:00", 2150, 150, 230, 68),
  ];

  const records: RecordRow[] = [
    {
      id: "fx-r1",
      exercise: "kb-swing",
      exerciseName: "Kettlebell Swing",
      kind: "weight",
      value: 24,
      unit: "kg",
      previousValue: 20,
      achievedAt: at(0, "18:40"),
      workoutLogId: "fx-w1",
    },
    {
      id: "fx-r2",
      exercise: "kb-goblet-squat",
      exerciseName: "Goblet Squat",
      kind: "volume",
      value: 480,
      unit: "kg-reps",
      previousValue: null,
      achievedAt: at(0, "18:40"),
      workoutLogId: "fx-w1",
    },
  ];

  const weighIn = (
    id: string,
    offset: number,
    weightKg: number,
    extra: Partial<BodyRow> = {}
  ): BodyRow => ({
    id,
    measuredAt: at(offset, "07:00"),
    weightKg,
    bodyFatPct: null,
    skeletalMuscleKg: null,
    skeletalMusclePct: null,
    source: "apple_health",
    fieldSources: { weightKg: "apple_health" },
    ...extra,
  });
  // Trend over four weeks: 91.2 → 90.1, about −0.29 kg/week by least squares.
  const olderBody: BodyRow[] = [weighIn("fx-b1", -20, 91.2), weighIn("fx-b2", -13, 90.9)];
  const inWeekReport = weighIn("fx-b4", 1, 90.4, {
    bodyFatPct: 22.4,
    skeletalMuscleKg: 38.1,
    source: "renpho_report",
    fieldSources: {
      weightKg: "apple_health",
      bodyFatPct: "renpho_report",
      skeletalMuscleKg: "renpho_report",
    },
  });
  const fullBody: BodyRow[] = [
    ...olderBody,
    weighIn("fx-b3", -6, 90.6),
    inWeekReport,
    weighIn("fx-b5", 5, 90.1),
  ];

  const snapshot = (
    id: string,
    offset: number,
    sleepMinutes: number | null,
    hrvMs: number | null,
    restingHeartRateBpm: number | null,
    timeZoneOfRow: string = timeZone
  ): SnapshotRow => ({
    id,
    localDate: day(offset),
    timeZone: timeZoneOfRow,
    sleepMinutes,
    hrvMs,
    restingHeartRateBpm,
  });
  // Sleep on 3 nights (6.9 h), HRV on 5 days (48 ms), resting HR on 4 (57 bpm).
  // Monday has two rows — a travel-day duplicate with nothing in it loses.
  const fullSnapshots: SnapshotRow[] = [
    snapshot("fx-sn0a", 0, null, null, null, "America/Chicago"),
    snapshot("fx-sn0b", 0, 412, 48, 56),
    snapshot("fx-sn1", 1, null, 52, 55),
    snapshot("fx-sn2", 2, 390, 45, 58),
    snapshot("fx-sn3", 3, null, 50, null),
    snapshot("fx-sn4", 4, 445, 47, 57),
    snapshot("fx-sn5", 5, null, null, null),
    // Previous week: HRV 45 over 5 days, resting HR 58 over 3, sleep 6.5 h over 2.
    snapshot("fx-psn1", -7, null, 44, 58),
    snapshot("fx-psn2", -6, 400, 46, 59),
    snapshot("fx-psn3", -5, null, 43, null),
    snapshot("fx-psn4", -4, 380, 45, 57),
    snapshot("fx-psn5", -3, null, 47, null),
  ];

  const activityDay = (
    offset: number,
    steps: number,
    activeEnergyKcal: number,
    walkingRunningDistanceKm: number
  ): ActivityRow => ({
    date: day(offset),
    steps,
    activeEnergyKcal,
    restingEnergyKcal: 1750,
    walkingRunningDistanceKm,
    source: "mixed",
    origin: "shortcut",
  });
  // Six of seven days arrived: 9,775 steps a day, three days over 10k.
  const fullActivity: ActivityRow[] = [
    activityDay(0, 8200, 480, 5.9),
    activityDay(1, 11400, 610, 8.4),
    activityDay(2, 6900, 420, 4.8),
    activityDay(3, 10250, 560, 7.3),
    activityDay(4, 9100, 510, 6.5),
    activityDay(5, 12800, 690, 9.6),
    // Previous week: five days, 8,000 a day.
    activityDay(-7, 7800, 450, 5.5),
    activityDay(-6, 8200, 470, 5.8),
    activityDay(-5, 7600, 440, 5.3),
    activityDay(-4, 9000, 520, 6.4),
    activityDay(-3, 7400, 430, 5.2),
  ];

  const plan = (
    id: string,
    offset: number,
    title: string,
    status: string,
    extra: Partial<PlanRow> = {}
  ): PlanRow => ({
    id,
    localDate: day(offset),
    title,
    status,
    sequenceId: null,
    trailId: null,
    targetWeightKg: null,
    ...extra,
  });
  const fullPlans: PlanRow[] = [
    plan("fx-p1", 0, "Strength A", "done", { sequenceId: SEQ_ALPHA }),
    plan("fx-p2", 3, "Freestyle swings", "done"),
    plan("fx-p3", 4, "Easy walk", "planned"),
    plan("fx-p4", 7, "Strength A", "planned", { sequenceId: SEQ_ALPHA, targetWeightKg: 24 }),
    plan("fx-p5", 10, "Ridge Loop", "planned", { trailId: TRAIL_RIDGE }),
  ];

  const fullWater: WaterRow[] = [
    { id: "fx-h1", loggedAt: at(1, "10:00"), amountMl: 500 },
    { id: "fx-h2", loggedAt: at(1, "15:00"), amountMl: 250 },
    { id: "fx-h3", loggedAt: at(3, "12:00"), amountMl: 750 },
  ];

  const fullJournal: JournalRow[] = [
    {
      id: "fx-j1",
      localDate: day(1),
      text: "Felt strong on the swings. Slept badly though, maybe the late coffee.",
    },
    {
      id: "fx-j2",
      localDate: day(5),
      text: "Long climb, legs heavy by the top but the view was worth it.",
    },
  ];

  const fullProgression: ProgressionRow[] = [
    {
      sequenceId: SEQ_ALPHA,
      sequenceName: "Routine Alpha",
      type: "raise",
      reason: "3 clean runs in a row",
    },
  ];

  if (kind === "partial") {
    // Food on two days, two sessions, one weigh-in, recovery on three days
    // (one with sleep, none with resting HR), two activity days, nothing else.
    return {
      food: fullFood.filter((f) => ["fx-f1", "fx-f2", "fx-f3", "fx-f10", "fx-f11", "fx-f12"].includes(f.id)),
      workouts: [mondayStrength, thursdayFreestyle],
      records: [],
      body: [...olderBody, inWeekReport],
      snapshots: [snapshot("fx-sn0b", 0, 412, 48, null), snapshot("fx-sn1", 1, null, 52, null), snapshot("fx-sn3", 3, null, 50, null)],
      activity: [activityDay(0, 8200, 480, 5.9), activityDay(1, 11400, 610, 8.4)],
      plans: [],
      sequences,
      trails,
      water: [],
      journal: [],
      progression: [],
    };
  }

  return {
    food: fullFood,
    workouts: fullWorkouts,
    records,
    body: fullBody,
    snapshots: fullSnapshots,
    activity: fullActivity,
    plans: fullPlans,
    sequences,
    trails,
    water: fullWater,
    journal: fullJournal,
    progression: fullProgression,
  };
}

const within = (d: Date, start: Date, end: Date) => d >= start && d <= end;
const withinDays = (day: string, from: string, to: string) => day >= from && day <= to;

/** A CoachSource that answers every question from the synthetic rows. */
export function fixtureSource(
  kind: FixtureKind = "full",
  opts: { weekStart?: string; timeZone?: string } = {}
): CoachSource {
  const timeZone = opts.timeZone ?? FIXTURE_TIME_ZONE;
  const rows = fixtureRows(kind, opts.weekStart ?? FIXTURE_WEEK_START, timeZone);
  return {
    settings: async () => ({ ...FIXTURE_SETTINGS, timeZone }),
    foodLogs: async ({ start, end }) => rows.food.filter((r) => within(r.loggedAt, start, end)),
    workouts: async ({ start, end }) => rows.workouts.filter((r) => within(r.startedAt, start, end)),
    records: async ({ start, end }) => rows.records.filter((r) => within(r.achievedAt, start, end)),
    bodyMeasurements: async ({ start, end }) =>
      rows.body.filter((r) => within(r.measuredAt, start, end)),
    snapshots: async ({ from, to }) => rows.snapshots.filter((r) => withinDays(r.localDate, from, to)),
    activityRows: async ({ from, to }) => rows.activity.filter((r) => withinDays(r.date, from, to)),
    plannedWorkouts: async ({ from, to }) =>
      rows.plans.filter((r) => withinDays(r.localDate, from, to)),
    sequences: async () => rows.sequences,
    trails: async () => rows.trails,
    previousTrailRuns: async (trailIds, before) => {
      const latest = new Map<string, WorkoutRow>();
      for (const w of [...rows.workouts].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())) {
        if (!w.trailId || !trailIds.includes(w.trailId) || w.startedAt >= before) continue;
        if (!latest.has(w.trailId)) latest.set(w.trailId, w);
      }
      return [...latest.values()];
    },
    waterLogs: async ({ start, end }) => rows.water.filter((r) => within(r.loggedAt, start, end)),
    journalEntries: async ({ from, to }) =>
      rows.journal.filter((r) => withinDays(r.localDate, from, to)),
    progression: async () => rows.progression,
  };
}
