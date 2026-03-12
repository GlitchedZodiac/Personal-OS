import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { buildCoachStyleGuide, getCoachLanguageLabel } from "@/lib/health-coach";

// Allow up to 60s for AI generation (Vercel Pro)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const totalCalories = Number(body.totalCalories || 0);
    const totalProtein = Number(body.totalProtein || 0);
    const totalCarbs = Number(body.totalCarbs || 0);
    const totalFat = Number(body.totalFat || 0);
    const calorieTarget = Number(body.calorieTarget || 2000);
    const proteinTargetG = Number(body.proteinTargetG || 150);
    const carbsTargetG = Number(body.carbsTargetG || 200);
    const fatTargetG = Number(body.fatTargetG || 67);
    const mealCount = Number(body.mealCount || 0);
    const workoutCaloriesBurned = Number(body.workoutCaloriesBurned || 0);
    const localHour = Number(body.localHour ?? new Date().getHours());
    const customInstructions =
      typeof body.customInstructions === "string" ? body.customInstructions : "";
    const responseLang = getCoachLanguageLabel(
      typeof body.aiLanguage === "string" ? body.aiLanguage : "english"
    );

    const remainingCals = calorieTarget - totalCalories;
    const remainingProtein = proteinTargetG - totalProtein;
    const remainingCarbs = carbsTargetG - totalCarbs;
    const remainingFat = fatTargetG - totalFat;
    const timeContext =
      localHour < 12 ? "morning" : localHour < 17 ? "afternoon" : "evening";
    const workoutAdjustedBudget = Math.max(
      0,
      Math.round(Math.max(remainingCals, 0) + workoutCaloriesBurned)
    );

    const systemPrompt = [
      buildCoachStyleGuide(responseLang),
      "You are giving the user the next meal recommendation.",
      "Be practical and food-specific.",
      "Use markdown with short bullets.",
      "Give 2 meal options max.",
      "Each option must include a rough calorie and protein estimate.",
      "Reference Colombian or Latin-friendly foods when appropriate.",
      "End with one short execution note.",
      customInstructions
        ? `User custom instructions:\n${customInstructions}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const userMessage = `Time of day: ${timeContext}

Today so far:
- Calories: ${Math.round(totalCalories)} / ${Math.round(calorieTarget)}
- Protein: ${Math.round(totalProtein)}g / ${Math.round(proteinTargetG)}g
- Carbs: ${Math.round(totalCarbs)}g / ${Math.round(carbsTargetG)}g
- Fat: ${Math.round(totalFat)}g / ${Math.round(fatTargetG)}g
- Meals logged: ${mealCount}
- Workout calories burned: ${Math.round(workoutCaloriesBurned)}

Current gaps:
- Calories remaining to base target: ${Math.round(remainingCals)}
- Protein remaining: ${Math.max(0, Math.round(remainingProtein))}g
- Carbs remaining: ${Math.max(0, Math.round(remainingCarbs))}g
- Fat remaining: ${Math.max(0, Math.round(remainingFat))}g
- Workout-adjusted calorie budget: ${workoutAdjustedBudget}

Rules:
- If protein is lagging, bias the meal toward protein first.
- If workout calories were burned, make one option more recovery-oriented.
- If calories are already over target, suggest something lighter and say so directly.
- Do not be generic.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 250,
      temperature: 0.5,
    });

    const suggestion =
      completion.choices[0]?.message?.content ||
      "Keep it simple: anchor the next meal around lean protein and vegetables.";

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("AI suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
