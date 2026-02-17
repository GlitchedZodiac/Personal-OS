import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { subDays, startOfDay, endOfDay, format } from "date-fns";
import crypto from "crypto";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

function hashData(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

// GET - AI-generated weekly insights (cached)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const calorieTarget = parseInt(searchParams.get("calorieTarget") || "2000");
    const proteinTargetG = parseInt(searchParams.get("proteinTargetG") || "150");
    const carbsTargetG = parseInt(searchParams.get("carbsTargetG") || "200");
    const fatTargetG = parseInt(searchParams.get("fatTargetG") || "67");
    const forceRefresh = searchParams.get("refresh") === "true";
    const aiLanguage = searchParams.get("aiLanguage") || "english";
    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish (Español)",
      portuguese: "Portuguese (Português)",
      french: "French (Français)",
    };
    const responseLang = languageMap[aiLanguage] || "English";

    const endDate = endOfDay(new Date());
    const startDate = startOfDay(subDays(new Date(), 7));

    // Fetch last 7 days of data (only fields needed for the AI prompt)
    const [foodLogs, bodyMeasurements, workoutLogs] = await Promise.all([
      prisma.foodLog.findMany({
        where: { loggedAt: { gte: startDate, lte: endDate } },
        select: { loggedAt: true, calories: true, proteinG: true, carbsG: true, fatG: true },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.bodyMeasurement.findMany({
        where: { measuredAt: { gte: startDate, lte: endDate } },
        select: { measuredAt: true, weightKg: true, bodyFatPct: true, waistCm: true },
        orderBy: { measuredAt: "asc" },
      }),
      prisma.workoutLog.findMany({
        where: { startedAt: { gte: startDate, lte: endDate } },
        select: { startedAt: true, workoutType: true, durationMinutes: true, caloriesBurned: true },
        orderBy: { startedAt: "asc" },
      }),
    ]);

    // Aggregate daily stats
    const dailyStats: Record<
      string,
      { calories: number; protein: number; carbs: number; fat: number; meals: number }
    > = {};
    foodLogs.forEach((log) => {
      const day = format(new Date(log.loggedAt), "yyyy-MM-dd");
      if (!dailyStats[day]) {
        dailyStats[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
      }
      dailyStats[day].calories += log.calories;
      dailyStats[day].protein += log.proteinG;
      dailyStats[day].carbs += log.carbsG;
      dailyStats[day].fat += log.fatG;
      dailyStats[day].meals += 1;
    });

    const daysLogged = Object.keys(dailyStats).length;

    if (daysLogged === 0 && workoutLogs.length === 0 && bodyMeasurements.length === 0) {
      return NextResponse.json({
        insight: "No data logged this week. Start tracking your meals, workouts, and body measurements to get personalized insights!",
        generated: false,
        cached: false,
      });
    }

    // Build data summary for hashing
    const nutritionSummary = Object.entries(dailyStats)
      .map(([date, s]) => `${date}: ${Math.round(s.calories)} kcal, P:${Math.round(s.protein)}g, C:${Math.round(s.carbs)}g, F:${Math.round(s.fat)}g, ${s.meals} meals`)
      .join("\n");

    const workoutSummary = workoutLogs
      .map(
        (w) =>
          `${format(new Date(w.startedAt), "yyyy-MM-dd")}: ${w.workoutType} ${w.durationMinutes}min ${w.caloriesBurned ? Math.round(w.caloriesBurned) + " cal" : ""}`
      )
      .join("\n");

    const measurementSummary = bodyMeasurements
      .map((m) => {
        const parts: string[] = [];
        if (m.weightKg) parts.push(`${m.weightKg}kg`);
        if (m.bodyFatPct) parts.push(`${m.bodyFatPct}% BF`);
        if (m.waistCm) parts.push(`waist:${m.waistCm}cm`);
        return `${format(new Date(m.measuredAt), "yyyy-MM-dd")}: ${parts.join(", ")}`;
      })
      .join("\n");

    // Create a hash of all the data to detect changes
    const dataFingerprint = `${nutritionSummary}|${workoutSummary}|${measurementSummary}|${calorieTarget}|${proteinTargetG}|${carbsTargetG}|${fatTargetG}`;
    const dataHash = hashData(dataFingerprint);
    const cacheKey = `weekly_insight_${format(new Date(), "yyyy-MM-dd")}`;

    // Check cache unless force refresh
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

    // Generate new insight
    const prompt = `You are a concise health coach analyzing a user's weekly data. Give exactly 2-3 SHORT sentences of insight. Be specific with numbers. Mention what's going well and one thing to improve. Be motivating but honest. ALWAYS respond in ${responseLang}.

TARGETS:
- Calories: ${calorieTarget} kcal/day
- Protein: ${proteinTargetG}g/day
- Carbs: ${carbsTargetG}g/day  
- Fat: ${fatTargetG}g/day

NUTRITION (${daysLogged}/7 days logged):
${nutritionSummary || "No food logged"}

WORKOUTS:
${workoutSummary || "No workouts logged"}

MEASUREMENTS:
${measurementSummary || "No measurements taken"}

Give your insight in 2-3 sentences. No bullet points, no headers.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_completion_tokens: 150,
    });

    const insight =
      completion.choices[0].message?.content?.trim() ||
      "Keep logging your data to get personalized insights!";

    // Upsert cache
    await prisma.aIInsightCache.upsert({
      where: { cacheKey },
      create: { cacheKey, insight, dataHash },
      update: { insight, dataHash },
    });

    return NextResponse.json({ insight, generated: true, cached: false });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json({
      insight:
        "Keep tracking your meals and workouts — insights will appear as more data comes in.",
      generated: false,
      cached: false,
    });
  }
}
