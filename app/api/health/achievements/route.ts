import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, format, startOfDay } from "date-fns";

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  earned: boolean;
  earnedAt?: string;       // date earned (approx)
  progress?: number;       // 0-100
  progressLabel?: string;  // e.g. "7 / 30 days"
  tier: "bronze" | "silver" | "gold" | "diamond";
}

// GET - Calculate achievements/badges from real data
// Optimized: uses count/aggregate where possible, only fetches rows when needed for date logic
export async function GET() {
  try {
    const now = new Date();
    const since365 = subDays(now, 365);

    // Gather data in parallel — use the lightest query possible for each
    const [
      foodDates,        // Only need loggedAt for streak + food day count
      workoutAgg,       // count + sum of minutes
      bodyMeasurements, // need first/last weight (small dataset)
      waterCount,       // just a count
      progressPhotos,   // just a count
      proteinData,      // loggedAt + proteinG for high-protein-day calc
    ] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: since365 } },
        select: { loggedAt: true },
        orderBy: { loggedAt: "desc" },
      }),
      prisma.workoutLog.aggregate({
        where: { startedAt: { gte: since365 } },
        _count: true,
        _sum: { durationMinutes: true },
      }),
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: since365 }, weightKg: { not: null } },
        select: { weightKg: true },
        orderBy: { measuredAt: "asc" },
      }),
      prisma.waterLog.count({
        where: { loggedAt: { gte: since365 } },
      }),
      prisma.progressPhoto.count(),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: since365 } },
        select: { loggedAt: true, proteinG: true },
      }),
    ]);

    // ── Derived stats ──────────────────────────────────────────────
    const foodDateSet = new Set(
      foodDates.map((l) => format(l.loggedAt, "yyyy-MM-dd"))
    );

    // Compute food logging streak
    let streak = 0;
    let d = startOfDay(now);
    const todayStr = format(d, "yyyy-MM-dd");
    if (foodDateSet.has(todayStr)) {
      streak = 1;
      d = subDays(d, 1);
    } else {
      d = subDays(d, 1);
    }
    while (foodDateSet.has(format(d, "yyyy-MM-dd"))) {
      streak++;
      d = subDays(d, 1);
    }

    const totalFoodDays = foodDateSet.size;
    const totalWorkouts = workoutAgg._count;
    const totalWorkoutMinutes = workoutAgg._sum.durationMinutes ?? 0;

    // Weight loss progress
    const firstWeight = bodyMeasurements.length > 0 ? bodyMeasurements[0].weightKg : null;
    const lastWeight = bodyMeasurements.length > 0 ? bodyMeasurements[bodyMeasurements.length - 1].weightKg : null;
    const weightLost =
      firstWeight && lastWeight ? Math.max(firstWeight - lastWeight, 0) : 0;

    // Total water glasses (from count)
    const totalWaterGlasses = waterCount;

    // Protein days over 100g
    const proteinDaysMap: Record<string, number> = {};
    for (const l of proteinData) {
      const dateKey = format(l.loggedAt, "yyyy-MM-dd");
      proteinDaysMap[dateKey] = (proteinDaysMap[dateKey] || 0) + l.proteinG;
    }
    const highProteinDays = Object.values(proteinDaysMap).filter(
      (p) => p >= 100
    ).length;

    // ── Build achievements ─────────────────────────────────────────
    const achievements: Achievement[] = [
      // ── Logging streaks ──
      {
        id: "streak_3",
        icon: "🔥",
        title: "On Fire",
        description: "3-day logging streak",
        earned: streak >= 3,
        progress: Math.min((streak / 3) * 100, 100),
        progressLabel: `${Math.min(streak, 3)} / 3 days`,
        tier: "bronze",
      },
      {
        id: "streak_7",
        icon: "🔥",
        title: "Week Warrior",
        description: "7-day logging streak",
        earned: streak >= 7,
        progress: Math.min((streak / 7) * 100, 100),
        progressLabel: `${Math.min(streak, 7)} / 7 days`,
        tier: "silver",
      },
      {
        id: "streak_30",
        icon: "🔥",
        title: "Iron Discipline",
        description: "30-day logging streak",
        earned: streak >= 30,
        progress: Math.min((streak / 30) * 100, 100),
        progressLabel: `${Math.min(streak, 30)} / 30 days`,
        tier: "gold",
      },
      {
        id: "streak_100",
        icon: "💎",
        title: "Centurion",
        description: "100-day logging streak",
        earned: streak >= 100,
        progress: Math.min((streak / 100) * 100, 100),
        progressLabel: `${Math.min(streak, 100)} / 100 days`,
        tier: "diamond",
      },

      // ── Food logging milestones ──
      {
        id: "food_7",
        icon: "🍽️",
        title: "First Week",
        description: "Log food 7 different days",
        earned: totalFoodDays >= 7,
        progress: Math.min((totalFoodDays / 7) * 100, 100),
        progressLabel: `${Math.min(totalFoodDays, 7)} / 7 days`,
        tier: "bronze",
      },
      {
        id: "food_30",
        icon: "📊",
        title: "Data-Driven",
        description: "Log food 30 different days",
        earned: totalFoodDays >= 30,
        progress: Math.min((totalFoodDays / 30) * 100, 100),
        progressLabel: `${Math.min(totalFoodDays, 30)} / 30 days`,
        tier: "silver",
      },
      {
        id: "food_100",
        icon: "🏆",
        title: "Nutrition Master",
        description: "Log food 100 different days",
        earned: totalFoodDays >= 100,
        progress: Math.min((totalFoodDays / 100) * 100, 100),
        progressLabel: `${Math.min(totalFoodDays, 100)} / 100 days`,
        tier: "gold",
      },

      // ── Workout milestones ──
      {
        id: "workout_1",
        icon: "💪",
        title: "First Step",
        description: "Log your first workout",
        earned: totalWorkouts >= 1,
        progress: Math.min(totalWorkouts * 100, 100),
        progressLabel: `${Math.min(totalWorkouts, 1)} / 1`,
        tier: "bronze",
      },
      {
        id: "workout_10",
        icon: "🏋️",
        title: "Getting Strong",
        description: "Complete 10 workouts",
        earned: totalWorkouts >= 10,
        progress: Math.min((totalWorkouts / 10) * 100, 100),
        progressLabel: `${Math.min(totalWorkouts, 10)} / 10`,
        tier: "silver",
      },
      {
        id: "workout_50",
        icon: "⚡",
        title: "Beast Mode",
        description: "Complete 50 workouts",
        earned: totalWorkouts >= 50,
        progress: Math.min((totalWorkouts / 50) * 100, 100),
        progressLabel: `${Math.min(totalWorkouts, 50)} / 50`,
        tier: "gold",
      },
      {
        id: "workout_hours_10",
        icon: "⏱️",
        title: "10 Hour Club",
        description: "Accumulate 10 hours of workouts",
        earned: totalWorkoutMinutes >= 600,
        progress: Math.min((totalWorkoutMinutes / 600) * 100, 100),
        progressLabel: `${Math.round(totalWorkoutMinutes / 60)}h / 10h`,
        tier: "silver",
      },

      // ── Body composition ──
      {
        id: "weight_loss_1",
        icon: "📉",
        title: "First Kilo Down",
        description: "Lose your first kilogram",
        earned: weightLost >= 1,
        progress: firstWeight ? Math.min((weightLost / 1) * 100, 100) : 0,
        progressLabel: firstWeight ? `${weightLost.toFixed(1)} / 1 kg` : "Weigh in first!",
        tier: "bronze",
      },
      {
        id: "weight_loss_5",
        icon: "🎯",
        title: "Five Down",
        description: "Lose 5 kilograms",
        earned: weightLost >= 5,
        progress: firstWeight ? Math.min((weightLost / 5) * 100, 100) : 0,
        progressLabel: firstWeight ? `${weightLost.toFixed(1)} / 5 kg` : "Weigh in first!",
        tier: "silver",
      },
      {
        id: "weight_loss_10",
        icon: "🏅",
        title: "Transformation",
        description: "Lose 10 kilograms",
        earned: weightLost >= 10,
        progress: firstWeight ? Math.min((weightLost / 10) * 100, 100) : 0,
        progressLabel: firstWeight ? `${weightLost.toFixed(1)} / 10 kg` : "Weigh in first!",
        tier: "gold",
      },

      // ── Hydration ──
      {
        id: "water_50",
        icon: "💧",
        title: "Stay Hydrated",
        description: "Log 50 glasses of water",
        earned: totalWaterGlasses >= 50,
        progress: Math.min((totalWaterGlasses / 50) * 100, 100),
        progressLabel: `${Math.min(totalWaterGlasses, 50)} / 50`,
        tier: "bronze",
      },
      {
        id: "water_500",
        icon: "🌊",
        title: "Water Champion",
        description: "Log 500 glasses of water",
        earned: totalWaterGlasses >= 500,
        progress: Math.min((totalWaterGlasses / 500) * 100, 100),
        progressLabel: `${Math.min(totalWaterGlasses, 500)} / 500`,
        tier: "gold",
      },

      // ── Protein ──
      {
        id: "protein_7",
        icon: "🥩",
        title: "Protein Week",
        description: "Hit 100g+ protein 7 days",
        earned: highProteinDays >= 7,
        progress: Math.min((highProteinDays / 7) * 100, 100),
        progressLabel: `${Math.min(highProteinDays, 7)} / 7 days`,
        tier: "silver",
      },

      // ── Progress photos ──
      {
        id: "photo_1",
        icon: "📸",
        title: "First Snapshot",
        description: "Take your first progress photo",
        earned: progressPhotos >= 1,
        progress: Math.min(progressPhotos * 100, 100),
        progressLabel: `${Math.min(progressPhotos, 1)} / 1`,
        tier: "bronze",
      },
      {
        id: "photo_10",
        icon: "🖼️",
        title: "Documenting the Journey",
        description: "Take 10 progress photos",
        earned: progressPhotos >= 10,
        progress: Math.min((progressPhotos / 10) * 100, 100),
        progressLabel: `${Math.min(progressPhotos, 10)} / 10`,
        tier: "silver",
      },
    ];

    const earned = achievements.filter((a) => a.earned).length;

    return NextResponse.json({
      achievements,
      totalEarned: earned,
      totalAvailable: achievements.length,
      stats: {
        currentStreak: streak,
        totalFoodDays,
        totalWorkouts,
        totalWorkoutHours: Math.round(totalWorkoutMinutes / 60),
        weightLost: Math.round(weightLost * 10) / 10,
        totalWaterGlasses,
        highProteinDays,
        progressPhotos,
      },
    });
  } catch (error) {
    console.error("Achievements error:", error);
    return NextResponse.json(
      { error: "Failed to calculate achievements" },
      { status: 500 }
    );
  }
}
