import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Calculate workout streak
export async function GET() {
  try {
    const completions = await prisma.workoutPlanCompletion.findMany({
      where: { completed: true },
      orderBy: { scheduledDate: "desc" },
      select: { scheduledDate: true },
    });

    if (completions.length === 0) {
      return NextResponse.json({
        currentStreak: 0,
        longestStreak: 0,
        totalWorkouts: 0,
        thisWeek: 0,
        thisMonth: 0,
      });
    }

    // Get unique workout dates
    const uniqueDates = [
      ...new Set(
        completions.map((c) => {
          const d = new Date(c.scheduledDate);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })
      ),
    ].sort((a, b) => b.localeCompare(a)); // Most recent first

    // Calculate current streak (consecutive workout days, allowing rest days in between)
    // We define streak as: workouts in consecutive SCHEDULED weeks (at least 1 workout per week)
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    startOfThisWeek.setHours(0, 0, 0, 0);

    let currentStreak = 0;
    const weekStart = new Date(startOfThisWeek);

    // Count consecutive weeks with at least one workout
    for (let i = 0; i < 52; i++) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const hasWorkoutThisWeek = uniqueDates.some((dateStr) => {
        const d = new Date(dateStr + "T00:00:00");
        return d >= weekStart && d < weekEnd;
      });

      if (hasWorkoutThisWeek) {
        currentStreak++;
      } else if (i === 0) {
        // Current week has no workouts yet — check if we're early in the week
        const dayOfWeek = now.getDay();
        if (dayOfWeek <= 3) {
          // It's Mon–Wed, give them the benefit of the doubt
          continue;
        }
        break;
      } else {
        break;
      }

      weekStart.setDate(weekStart.getDate() - 7);
    }

    // This week count
    const weekEndDate = new Date(startOfThisWeek);
    weekEndDate.setDate(startOfThisWeek.getDate() + 7);
    const thisWeek = uniqueDates.filter((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      return d >= startOfThisWeek && d < weekEndDate;
    }).length;

    // This month count
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const thisMonth = uniqueDates.filter((dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      return d >= startOfMonth && d <= endOfMonth;
    }).length;

    return NextResponse.json({
      currentStreak,
      longestStreak: currentStreak, // Simplified — could track separately
      totalWorkouts: completions.length,
      thisWeek,
      thisMonth,
    });
  } catch (error) {
    console.error("Workout streak error:", error);
    return NextResponse.json({
      currentStreak: 0,
      longestStreak: 0,
      totalWorkouts: 0,
      thisWeek: 0,
      thisMonth: 0,
    });
  }
}
