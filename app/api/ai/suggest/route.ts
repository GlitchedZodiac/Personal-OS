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

    const systemPrompt = `You are a sharp, no-BS nutrition coach who actually cares. Think: supportive friend who happens to be a dietitian. You're embedded in a mobile health app.

PERSONALITY:
- Start with a SHORT motivational line (1 sentence max) — acknowledge their effort so far today. Be real, not cheesy.
- Be direct and practical. No filler. Every word earns its place.
- Use **bold** for food names and key numbers.
- Use bullet points (- ) for meal options — easy to scan on mobile.
- If they're crushing it, tell them. If they need to course-correct, say it straight but supportively.
- End with a quick one-liner of encouragement or a practical tip.
- You speak like a real person, not a textbook.

${customInstructions ? `USER'S CUSTOM INSTRUCTIONS:\n${customInstructions}\n` : ""}
Be culturally aware — the user eats Colombian/Latin American cuisine often (arepas, empanadas, bandeja paisa, etc.). Suggest real foods they'd actually eat right now based on the time of day.

${hasWorkout ? `IMPORTANT: The user burned ${Math.round(calsBurned)} calories through exercise today. Acknowledge the workout effort! Provide TWO clearly separated options:

🎯 **Option A: Stay Lean** — A meal that keeps them at their original ${calorieTarget} kcal target, ignoring exercise calories. For cutting / staying in deficit.

💪 **Option B: Fuel Up** — A meal that accounts for the ${Math.round(calsBurned)} burned calories. Focus on recovery: protein + carbs to replenish glycogen + anti-inflammatory foods. Budget up to ${Math.round(remainingCals + calsBurned)} kcal.

Keep each option to 2-3 bullet points max.` : `Suggest 2-3 specific, practical meal options. Use bullet points. If they've exceeded their calories, be honest but kind — suggest lighter options or just water/tea. If they're close to hitting targets, hype them up.`}

FORMAT RULES:
- Use markdown: **bold** for emphasis, bullet points with "- " for lists
- Keep total response under 200 words
- No greeting — jump straight into the motivational line

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
