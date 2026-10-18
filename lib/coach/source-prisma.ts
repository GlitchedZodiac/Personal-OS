// The real CoachSource (2026-10-17, lane B): thin selects over the tables the
// facts layer reads. Nothing is computed here — lib/coach/facts.ts does the
// arithmetic on rows, and the fixture source (lib/coach/fixture-week.ts)
// returns the same shapes, which is what lets Test mode never touch a row.

import { loadActivityRows } from "@/lib/activity-reports";
import { prisma } from "@/lib/prisma";
import { buildProgressionSuggestions } from "@/lib/progression-db";
import type { CoachSource, WorkoutRow } from "./types";

const WORKOUT_SELECT = {
  id: true,
  startedAt: true,
  workoutType: true,
  durationMinutes: true,
  caloriesBurned: true,
  distanceMeters: true,
  elevationGainM: true,
  avgHeartRateBpm: true,
  exercises: true,
  metricsData: true,
  trailId: true,
} as const;

export function prismaCoachSource(): CoachSource {
  return {
    async settings() {
      const row = await prisma.userSettings.findUnique({
        where: { id: "default" },
        select: { data: true },
      });
      return row?.data ?? null;
    },

    foodLogs({ start, end }) {
      return prisma.foodLog.findMany({
        where: { loggedAt: { gte: start, lte: end } },
        orderBy: { loggedAt: "asc" },
        select: { id: true, loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
      });
    },

    workouts({ start, end }) {
      return prisma.workoutLog.findMany({
        where: { startedAt: { gte: start, lte: end } },
        orderBy: { startedAt: "asc" },
        select: WORKOUT_SELECT,
      });
    },

    records({ start, end }) {
      return prisma.personalRecord.findMany({
        where: { achievedAt: { gte: start, lte: end } },
        orderBy: { achievedAt: "asc" },
        select: {
          id: true,
          exercise: true,
          exerciseName: true,
          kind: true,
          value: true,
          unit: true,
          previousValue: true,
          achievedAt: true,
          workoutLogId: true,
        },
      });
    },

    bodyMeasurements({ start, end }) {
      return prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: start, lte: end }, weightKg: { not: null } },
        orderBy: { measuredAt: "asc" },
        select: {
          id: true,
          measuredAt: true,
          weightKg: true,
          bodyFatPct: true,
          skeletalMuscleKg: true,
          skeletalMusclePct: true,
          source: true,
          fieldSources: true,
        },
      });
    },

    snapshots({ from, to }) {
      return prisma.dailyHealthSnapshot.findMany({
        where: { localDate: { gte: from, lte: to } },
        orderBy: { localDate: "asc" },
        select: {
          id: true,
          localDate: true,
          timeZone: true,
          sleepMinutes: true,
          hrvMs: true,
          restingHeartRateBpm: true,
        },
      });
    },

    activityRows({ from, to }) {
      return loadActivityRows(from, to);
    },

    plannedWorkouts({ from, to }) {
      return prisma.plannedWorkout.findMany({
        where: { localDate: { gte: from, lte: to } },
        orderBy: [{ localDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          localDate: true,
          title: true,
          status: true,
          sequenceId: true,
          trailId: true,
          targetWeightKg: true,
        },
      });
    },

    sequences() {
      return prisma.sequence.findMany({
        where: { isArchived: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, kind: true },
      });
    },

    trails() {
      return prisma.trail.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, distanceMeters: true, elevationGainM: true },
      });
    },

    async previousTrailRuns(trailIds, before) {
      if (trailIds.length === 0) return [];
      const rows = await prisma.workoutLog.findMany({
        where: { trailId: { in: trailIds }, startedAt: { lt: before } },
        orderBy: { startedAt: "desc" },
        take: 60,
        select: WORKOUT_SELECT,
      });
      const seen = new Set<string>();
      const latest: WorkoutRow[] = [];
      for (const row of rows) {
        if (!row.trailId || seen.has(row.trailId)) continue;
        seen.add(row.trailId);
        latest.push(row);
      }
      return latest;
    },

    waterLogs({ start, end }) {
      return prisma.waterLog.findMany({
        where: { loggedAt: { gte: start, lte: end } },
        orderBy: { loggedAt: "asc" },
        select: { id: true, loggedAt: true, amountMl: true },
      });
    },

    journalEntries({ from, to }) {
      return prisma.journalEntry.findMany({
        where: { localDate: { gte: from, lte: to } },
        orderBy: { localDate: "asc" },
        select: { id: true, localDate: true, text: true },
      });
    },

    async progression() {
      const suggestions = await buildProgressionSuggestions();
      return suggestions.map((s) => ({
        sequenceId: s.sequenceId,
        sequenceName: s.sequenceName,
        type: s.type,
        reason: s.reason,
      }));
    },
  };
}
