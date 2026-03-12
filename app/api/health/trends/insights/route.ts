import crypto from "crypto";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { buildCoachStyleGuide, getCoachLanguageLabel } from "@/lib/health-coach";
import { generateChatText } from "@/lib/openai-text";
import { prisma } from "@/lib/prisma";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

function hashData(data: string) {
  return crypto.createHash("md5").update(data).digest("hex");
}

// GET - AI-generated weekly insights (cached)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const calorieTarget = parseInt(searchParams.get("calorieTarget") || "2000", 10);
    const proteinTargetG = parseInt(searchParams.get("proteinTargetG") || "150", 10);
    const carbsTargetG = parseInt(searchParams.get("carbsTargetG") || "200", 10);
    const fatTargetG = parseInt(searchParams.get("fatTargetG") || "67", 10);
    const forceRefresh = searchParams.get("refresh") === "true";
    const aiLanguage = searchParams.get("aiLanguage") || "english";
    const responseLang = getCoachLanguageLabel(aiLanguage);

    const endDate = endOfDay(new Date());
    const startDate = startOfDay(subDays(new Date(), 7));

    const [foodLogs, bodyMeasurements, workoutLogs] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: startDate, lte: endDate } },
        select: {
          loggedAt: true,
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: startDate, lte: endDate } },
        select: {
          measuredAt: true,
          weightKg: true,
          bodyFatPct: true,
          waistCm: true,
        },
        orderBy: { measuredAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: startDate, lte: endDate } },
        select: {
          startedAt: true,
          workoutType: true,
          durationMinutes: true,
          caloriesBurned: true,
          distanceMeters: true,
          stepCount: true,
        },
        orderBy: { startedAt: "asc" },
      }),
    ]);

    const dailyStats: Record<
      string,
      { calories: number; protein: number; carbs: number; fat: number; meals: number }
    > = {};

    for (const log of foodLogs) {
      const day = format(new Date(log.loggedAt), "yyyy-MM-dd");
      if (!dailyStats[day]) {
        dailyStats[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
      }
      dailyStats[day].calories += log.calories;
      dailyStats[day].protein += log.proteinG;
      dailyStats[day].carbs += log.carbsG;
      dailyStats[day].fat += log.fatG;
      dailyStats[day].meals += 1;
    }

    const daysLogged = Object.keys(dailyStats).length;
    if (daysLogged === 0 && workoutLogs.length === 0 && bodyMeasurements.length === 0) {
      return NextResponse.json({
        insight:
          "No data logged this week. Start tracking meals, workouts, and measurements to unlock sharper coaching.",
        generated: false,
        cached: false,
      });
    }

    const nutritionSummary = Object.entries(dailyStats)
      .map(
        ([date, stats]) =>
          `${date}: ${Math.round(stats.calories)} kcal, P:${Math.round(stats.protein)}g, C:${Math.round(
            stats.carbs
          )}g, F:${Math.round(stats.fat)}g, ${stats.meals} meals`
      )
      .join("\n");

    const workoutSummary = workoutLogs
      .map((workout) => {
        const base = `${format(new Date(workout.startedAt), "yyyy-MM-dd")}: ${workout.workoutType} ${workout.durationMinutes}min`;
        const parts = [];
        if (workout.caloriesBurned) parts.push(`${Math.round(workout.caloriesBurned)} cal`);
        if (workout.distanceMeters) parts.push(`${(workout.distanceMeters / 1000).toFixed(1)} km`);
        if (workout.stepCount) parts.push(`${Math.round(workout.stepCount)} steps`);
        return `${base}${parts.length ? ` (${parts.join(", ")})` : ""}`;
      })
      .join("\n");

    const measurementSummary = bodyMeasurements
      .map((measurement) => {
        const parts: string[] = [];
        if (measurement.weightKg) parts.push(`${measurement.weightKg}kg`);
        if (measurement.bodyFatPct) parts.push(`${measurement.bodyFatPct}% BF`);
        if (measurement.waistCm) parts.push(`waist:${measurement.waistCm}cm`);
        return `${format(new Date(measurement.measuredAt), "yyyy-MM-dd")}: ${parts.join(", ")}`;
      })
      .join("\n");

    const dataFingerprint = [
      nutritionSummary,
      workoutSummary,
      measurementSummary,
      calorieTarget,
      proteinTargetG,
      carbsTargetG,
      fatTargetG,
    ].join("|");
    const dataHash = hashData(dataFingerprint);
    const cacheKey = `weekly_insight_v2_${format(new Date(), "yyyy-MM-dd")}`;

    if (!forceRefresh) {
      const cached = await prisma.aIInsightCache.findUnique({
        where: { cacheKey },
      });

      if (cached && cached.dataHash === dataHash) {
        return NextResponse.json({
          insight: cached.insight,
          generated: true,
          cached: true,
        });
      }
    }

    const prompt = `${buildCoachStyleGuide(responseLang)}

Analyze the user's last 7 days and respond with exactly 2-3 short sentences.
Sentence 1: what is working, with numbers.
Sentence 2: what is off, with numbers.
Sentence 3: the single best adjustment.

Targets:
- Calories: ${calorieTarget} kcal/day
- Protein: ${proteinTargetG}g/day
- Carbs: ${carbsTargetG}g/day
- Fat: ${fatTargetG}g/day

Nutrition (${daysLogged}/7 days logged):
${nutritionSummary || "No food logged"}

Workouts:
${workoutSummary || "No workouts logged"}

Measurements:
${measurementSummary || "No measurements taken"}

No bullet points. No headers. No invented numbers.`;

    const completion = await generateChatText({
      messages: [{ role: "user", content: prompt }],
      maxCompletionTokens: 220,
      retryMaxCompletionTokens: 320,
    });

    const insight =
      completion.text ||
      "Keep logging the basics. The next useful coaching layer comes from consistency.";

    if (completion.text) {
      await prisma.aIInsightCache.upsert({
        where: { cacheKey },
        create: { cacheKey, insight, dataHash },
        update: { insight, dataHash },
      });
    }

    return NextResponse.json({ insight, generated: Boolean(completion.text), cached: false });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json({
      insight:
        "Keep tracking meals and workouts. The coach will get sharper as the data fills in.",
      generated: false,
      cached: false,
    });
  }
}
