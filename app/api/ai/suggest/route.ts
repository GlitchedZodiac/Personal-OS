import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(request: NextRequest) {
  try {
    const {
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      calorieTarget,
      proteinTargetG,
      carbsTargetG,
      fatTargetG,
      mealCount,
      workoutCaloriesBurned,
      customInstructions,
      aiLanguage,
    } = await request.json();

    const languageMap: Record<string, string> = {
      english: "English",
      spanish: "Spanish (Español)",
      portuguese: "Portuguese (Português)",
      french: "French (Français)",
    };
    const responseLang = languageMap[aiLanguage || "english"] || "English";

    const remainingCals = Math.max(calorieTarget - totalCalories, 0);
    const remainingProtein = Math.max(proteinTargetG - totalProtein, 0);
    const remainingCarbs = Math.max(carbsTargetG - totalCarbs, 0);
    const remainingFat = Math.max(fatTargetG - totalFat, 0);

    const hour = new Date().getHours();
    let timeContext = "morning";
    if (hour >= 12 && hour < 17) timeContext = "afternoon";
    else if (hour >= 17) timeContext = "evening";

    const calsBurned = workoutCaloriesBurned || 0;
    const hasWorkout = calsBurned > 0;

    const systemPrompt = `You are a concise, friendly nutrition coach in a mobile app. The user wants brief meal suggestions to hit their daily nutrition targets.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}
Be practical and culturally aware (the user eats Colombian/Latin American cuisine often). Keep suggestions SHORT — use food the user can realistically eat right now based on the time of day.

${hasWorkout ? `IMPORTANT: The user burned ${Math.round(calsBurned)} calories through exercise today. You MUST provide TWO separate suggestions:

🎯 **Option A: Stay on Target** — Suggest a meal that keeps them at their original calorie target (${calorieTarget} kcal) regardless of exercise. This is for fat loss / staying in a deficit.

💪 **Option B: Fuel Recovery** — Suggest a meal that accounts for the ${Math.round(calsBurned)} calories burned. Focus on recovery nutrition: higher protein, moderate carbs to replenish glycogen, and anti-inflammatory foods to prevent fatigue and support muscle recovery. The meal can be up to ${Math.round(remainingCals + calsBurned)} kcal.

Keep each option to 2-3 bullet points.` : `Suggest 2-3 specific, practical meals. If they've exceeded their calories, gently suggest lighter options or just water. If they're close to targets, congratulate them.`}

ALWAYS respond in ${responseLang}.`;

    const userMessage = `It's ${timeContext} (${hour}:00). Here's my daily intake so far:

Eaten: ${Math.round(totalCalories)} kcal (${mealCount} meals)
- Protein: ${Math.round(totalProtein)}g / ${proteinTargetG}g target
- Carbs: ${Math.round(totalCarbs)}g / ${carbsTargetG}g target
- Fat: ${Math.round(totalFat)}g / ${fatTargetG}g target

Remaining to hit targets:
- ${Math.round(remainingCals)} kcal
- ${Math.round(remainingProtein)}g protein
- ${Math.round(remainingCarbs)}g carbs
- ${Math.round(remainingFat)}g fat
${hasWorkout ? `\n🏋️ Exercise today: burned ${Math.round(calsBurned)} calories` : ""}

What should I eat next?`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: hasWorkout ? 500 : 300,
      temperature: 0.7,
    });

    const suggestion =
      completion.choices[0]?.message?.content ||
      "Eat a balanced meal with protein and vegetables!";

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error("AI suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 }
    );
  }
}
