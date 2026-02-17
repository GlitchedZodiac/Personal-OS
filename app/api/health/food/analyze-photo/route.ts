import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

// Allow up to 60s for GPT-5.2 vision analysis (Vercel Pro)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { image, mealType } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "Image data required" },
        { status: 400 }
      );
    }

    // Determine the meal type hint based on current hour if not provided
    const hour = new Date().getHours();
    const mealHint =
      mealType ||
      (hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 20 ? "dinner" : "snack");

    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are a precise nutritionist analyzing food photos. Identify every visible food item and estimate its macronutrients.

RULES:
- List EACH distinct food item separately (e.g. "Grilled chicken breast" and "White rice" as separate items)
- Estimate realistic portion sizes from the photo
- Be specific about the food (e.g. "Pan-seared salmon fillet ~6oz" not just "fish")
- Include sauces, dressings, beverages if visible
- If unsure about a portion, estimate conservatively
- Round calories to nearest 5, macros to nearest 1g

Respond ONLY with valid JSON in this exact format:
{
  "items": [
    {
      "foodDescription": "Food name with estimated portion",
      "calories": 000,
      "proteinG": 00,
      "carbsG": 00,
      "fatG": 00
    }
  ],
  "summary": "Brief one-line description of the meal"
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${mealHint} photo. Identify all food items and estimate their macronutrients.`,
            },
            {
              type: "image_url",
              image_url: {
                url: image.startsWith("data:")
                  ? image
                  : `data:image/jpeg;base64,${image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_completion_tokens: 1000,
    });

    const raw = completion.choices[0].message?.content?.trim() || "";

    // Parse the JSON response — strip markdown fences if present
    const jsonStr = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: { items: Array<{ foodDescription: string; calories: number; proteinG: number; carbsG: number; fatG: number }>; summary: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[analyze-photo] Failed to parse AI response:", raw);
      return NextResponse.json(
        { error: "AI returned an unparseable response. Please try again." },
        { status: 422 }
      );
    }

    // Attach mealType to each item
    const items = (parsed.items || []).map((item) => ({
      ...item,
      mealType: mealHint,
    }));

    return NextResponse.json({
      items,
      summary: parsed.summary || "Food photo analyzed",
      message: `📸 Found ${items.length} item${items.length !== 1 ? "s" : ""}: ${parsed.summary || ""}`,
    });
  } catch (error) {
    console.error("Photo analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze photo. Please try again." },
      { status: 500 }
    );
  }
}
