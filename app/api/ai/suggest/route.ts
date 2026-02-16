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

    const systemPrompt = `You are a concise, friendly nutrition coach in a mobile app. The user wants brief meal suggestions to hit their daily nutrition targets.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}
Be practical and culturally aware (the user eats Colombian/Latin American cuisine often). Keep suggestions SHORT — 2-3 bullet points max. Use food the user can realistically eat right now based on the time of day.

If they've exceeded their calories, gently suggest lighter options or just water.
If they're close to targets, congratulate them.
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

What should I eat next to stay on track? Give me 2-3 specific, practical suggestions.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_completion_tokens: 300,
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
