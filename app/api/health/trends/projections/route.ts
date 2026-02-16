import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { format, subDays, startOfDay, endOfDay, addDays } from "date-fns";

interface ProjectionPoint {
  date: string;
  projected: number;
  optimistic: number;
  pessimistic: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const goalWeightKg = parseFloat(searchParams.get("goalWeightKg") || "0") || null;
    const goalWaistCm = parseFloat(searchParams.get("goalWaistCm") || "0") || null;
    const calorieTarget = parseInt(searchParams.get("calorieTarget") || "2000");
    const aiLanguage = searchParams.get("aiLanguage") || "english";

    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish (Español)",
      portuguese: "Portuguese (Português)",
      french: "French (Français)",
    };
    const responseLang = languageMap[aiLanguage] || "English";

    // Fetch historical data (last 90 days)
    const start = startOfDay(subDays(new Date(), 90));
    const end = endOfDay(new Date());

    const [measurements, foodLogs, workoutLogs] = await Promise.all([
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: start, lte: end } },
        orderBy: { measuredAt: "asc" },
      }),
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: start, lte: end } },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: start, lte: end } },
        orderBy: { startedAt: "asc" },
      }),
    ]);

    // ─── Extract weight data points ───
    const weightPoints: Array<{ date: string; value: number }> = [];
    const waistPoints: Array<{ date: string; value: number }> = [];
    const bodyFatPoints: Array<{ date: string; value: number }> = [];
    const bmiPoints: Array<{ date: string; value: number }> = [];
    const muscleMassPoints: Array<{ date: string; value: number }> = [];

    measurements.forEach((m) => {
      const d = format(new Date(m.measuredAt), "yyyy-MM-dd");
      if (m.weightKg) weightPoints.push({ date: d, value: Number(m.weightKg) });
      if (m.waistCm) waistPoints.push({ date: d, value: Number(m.waistCm) });
      if (m.bodyFatPct) bodyFatPoints.push({ date: d, value: Number(m.bodyFatPct) });
      if (m.bmi) bmiPoints.push({ date: d, value: Number(m.bmi) });
      if (m.muscleMassKg) muscleMassPoints.push({ date: d, value: Number(m.muscleMassKg) });
    });

    // ─── Calculate daily calories & workout stats ───
    const dailyCals: Record<string, number> = {};
    const dailyProtein: Record<string, number> = {};
    foodLogs.forEach((f) => {
      const d = format(new Date(f.loggedAt), "yyyy-MM-dd");
      dailyCals[d] = (dailyCals[d] || 0) + f.calories;
      dailyProtein[d] = (dailyProtein[d] || 0) + f.proteinG;
    });

    const dailyBurned: Record<string, number> = {};
    const dailyWorkoutMins: Record<string, number> = {};
    workoutLogs.forEach((w) => {
      const d = format(new Date(w.startedAt), "yyyy-MM-dd");
      dailyBurned[d] = (dailyBurned[d] || 0) + (w.caloriesBurned || 0);
      dailyWorkoutMins[d] = (dailyWorkoutMins[d] || 0) + w.durationMinutes;
    });

    const calDays = Object.keys(dailyCals);
    const avgCalories = calDays.length > 0
      ? Math.round(calDays.reduce((sum, d) => sum + dailyCals[d], 0) / calDays.length)
      : calorieTarget;
    const avgProtein = calDays.length > 0
      ? Math.round(calDays.reduce((sum, d) => sum + (dailyProtein[d] || 0), 0) / calDays.length)
      : 0;

    const burnDays = Object.keys(dailyBurned);
    const avgBurned = burnDays.length > 0
      ? Math.round(burnDays.reduce((sum, d) => sum + dailyBurned[d], 0) / burnDays.length)
      : 0;

    const workoutDays = Object.keys(dailyWorkoutMins);
    const avgWorkoutMins = workoutDays.length > 0
      ? Math.round(workoutDays.reduce((sum, d) => sum + dailyWorkoutMins[d], 0) / workoutDays.length)
      : 0;
    const workoutsPerWeek = workoutLogs.length > 0
      ? Math.round((workoutLogs.length / Math.max(1, calDays.length)) * 7 * 10) / 10
      : 0;

    // ─── Linear regression projection ───
    function projectMetric(
      points: Array<{ date: string; value: number }>,
      goal: number | null,
      daysAhead: number = 90
    ): {
      projections: ProjectionPoint[];
      currentValue: number | null;
      ratePerWeek: number;
      estimatedGoalDate: string | null;
    } {
      if (points.length < 2) {
        return { projections: [], currentValue: points[0]?.value ?? null, ratePerWeek: 0, estimatedGoalDate: null };
      }

      // Deduplicate by date (take latest)
      const byDate = new Map<string, number>();
      points.forEach((p) => byDate.set(p.date, p.value));
      const unique = Array.from(byDate.entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (unique.length < 2) {
        return { projections: [], currentValue: unique[0]?.value ?? null, ratePerWeek: 0, estimatedGoalDate: null };
      }

      // Convert dates to day indices for regression
      const baseDate = new Date(unique[0].date + "T00:00:00");
      const xs = unique.map((p) => {
        return Math.round((new Date(p.date + "T00:00:00").getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      });
      const ys = unique.map((p) => p.value);

      // Simple linear regression
      const n = xs.length;
      const sumX = xs.reduce((a, b) => a + b, 0);
      const sumY = ys.reduce((a, b) => a + b, 0);
      const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
      const sumX2 = xs.reduce((a, x) => a + x * x, 0);

      const denom = n * sumX2 - sumX * sumX;
      const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
      const intercept = (sumY - slope * sumX) / n;

      // Calculate residual std deviation for confidence bands
      const predicted = xs.map((x) => intercept + slope * x);
      const residuals = ys.map((y, i) => y - predicted[i]);
      const residualStd = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 2));

      const ratePerWeek = Math.round(slope * 7 * 100) / 100;
      const currentValue = ys[ys.length - 1];
      const lastDayIndex = xs[xs.length - 1];
      const lastDate = new Date(unique[unique.length - 1].date + "T00:00:00");

      // Project forward
      const projections: ProjectionPoint[] = [];
      for (let i = 1; i <= daysAhead; i += (daysAhead <= 30 ? 1 : 3)) {
        const futureDay = lastDayIndex + i;
        const futureDate = format(addDays(lastDate, i), "yyyy-MM-dd");
        const projectedValue = Math.round((intercept + slope * futureDay) * 100) / 100;
        const confidence = residualStd * 1.5 * Math.sqrt(1 + 1 / n + Math.pow(futureDay - sumX / n, 2) / (sumX2 - sumX * sumX / n));

        projections.push({
          date: futureDate,
          projected: Math.round(projectedValue * 10) / 10,
          optimistic: Math.round((projectedValue - confidence) * 10) / 10,
          pessimistic: Math.round((projectedValue + confidence) * 10) / 10,
        });
      }

      // Estimate goal date
      let estimatedGoalDate: string | null = null;
      if (goal && slope !== 0) {
        const daysToGoal = (goal - (intercept + slope * lastDayIndex)) / slope;
        if (daysToGoal > 0 && daysToGoal < 365) {
          estimatedGoalDate = format(addDays(lastDate, Math.round(daysToGoal)), "MMM d, yyyy");
        } else if (daysToGoal <= 0) {
          estimatedGoalDate = "Already at goal!";
        }
      }

      return { projections, currentValue, ratePerWeek, estimatedGoalDate };
    }

    const weightProjection = projectMetric(weightPoints, goalWeightKg);
    const waistProjection = projectMetric(waistPoints, goalWaistCm);
    const bodyFatProjection = projectMetric(bodyFatPoints, null);
    const bmiProjection = projectMetric(bmiPoints, null);
    const muscleMassProjection = projectMetric(muscleMassPoints, null);

    // ─── AI 90-day outlook ───
    let aiOutlook = "";
    try {
      const dataContext = `
CURRENT STATUS:
- Weight: ${weightProjection.currentValue ?? "N/A"} kg (Goal: ${goalWeightKg ?? "not set"} kg)
- Weight rate: ${weightProjection.ratePerWeek} kg/week
- Estimated goal date: ${weightProjection.estimatedGoalDate ?? "N/A"}
- Waist: ${waistProjection.currentValue ?? "N/A"} cm (Goal: ${goalWaistCm ?? "not set"} cm)
- Waist rate: ${waistProjection.ratePerWeek} cm/week
- Body Fat: ${bodyFatProjection.currentValue ?? "N/A"}%, rate: ${bodyFatProjection.ratePerWeek}%/week
- BMI: ${bmiProjection.currentValue ?? "N/A"}, rate: ${bmiProjection.ratePerWeek}/week
- Muscle Mass: ${muscleMassProjection.currentValue ?? "N/A"} kg, rate: ${muscleMassProjection.ratePerWeek} kg/week

HABITS (last 90 days averages):
- Average daily calories: ${avgCalories} kcal (target: ${calorieTarget})
- Average daily protein: ${avgProtein}g
- Average daily calories burned from exercise: ${avgBurned} kcal
- Average workout duration: ${avgWorkoutMins} min/day
- Workouts per week: ${workoutsPerWeek}
- Total weight measurements: ${weightPoints.length}
- Total workout sessions: ${workoutLogs.length}
- Days with food logged: ${calDays.length}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          {
            role: "system",
            content: `You are a personal fitness strategist giving a 90-day outlook. Be encouraging but realistic. Use the data to make specific predictions and actionable tips. Keep it to 4-5 sentences. Format with **bold** for key numbers and milestones. ALWAYS respond in ${responseLang}.`,
          },
          {
            role: "user",
            content: `Based on my data, give me a 90-day projection outlook. What will I achieve if I stay on track? What should I focus on to accelerate progress? Be specific with dates and numbers.\n${dataContext}`,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: 300,
      });

      aiOutlook = completion.choices[0].message?.content?.trim() ||
        "Keep logging consistently to get personalized 90-day projections!";
    } catch (err) {
      console.error("AI outlook error:", err);
      aiOutlook = "Keep logging consistently to get personalized 90-day projections!";
    }

    return NextResponse.json({
      weight: {
        historical: weightPoints.slice(-30), // Last 30 data points for context
        projections: weightProjection.projections,
        currentValue: weightProjection.currentValue,
        ratePerWeek: weightProjection.ratePerWeek,
        estimatedGoalDate: weightProjection.estimatedGoalDate,
        goal: goalWeightKg,
      },
      waist: {
        historical: waistPoints.slice(-30),
        projections: waistProjection.projections,
        currentValue: waistProjection.currentValue,
        ratePerWeek: waistProjection.ratePerWeek,
        estimatedGoalDate: waistProjection.estimatedGoalDate,
        goal: goalWaistCm,
      },
      bodyFat: {
        historical: bodyFatPoints.slice(-30),
        projections: bodyFatProjection.projections,
        currentValue: bodyFatProjection.currentValue,
        ratePerWeek: bodyFatProjection.ratePerWeek,
      },
      bmi: {
        historical: bmiPoints.slice(-30),
        projections: bmiProjection.projections,
        currentValue: bmiProjection.currentValue,
        ratePerWeek: bmiProjection.ratePerWeek,
      },
      muscleMass: {
        historical: muscleMassPoints.slice(-30),
        projections: muscleMassProjection.projections,
        currentValue: muscleMassProjection.currentValue,
        ratePerWeek: muscleMassProjection.ratePerWeek,
      },
      habits: {
        avgCalories,
        avgBurned,
        avgProtein,
        avgWorkoutMins,
        workoutsPerWeek,
        daysLogged: calDays.length,
        totalWorkouts: workoutLogs.length,
      },
      aiOutlook,
    });
  } catch (error) {
    console.error("Projections error:", error);
    return NextResponse.json({ error: "Failed to generate projections" }, { status: 500 });
  }
}
