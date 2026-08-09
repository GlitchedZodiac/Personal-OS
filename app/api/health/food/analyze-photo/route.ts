import { NextRequest, NextResponse } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import {
  capDemoCompletionTokens,
  enforceDemoAIBudget,
  getDemoChatModel,
  recordDemoAISpend,
} from "@/lib/demo-ai-budget";

// Allow up to 60s for vision analysis (Vercel Pro)
export const maxDuration = 60;

const MEAL_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          foodDescription: {
            type: "string",
            description: "Food name with estimated portion",
          },
          calories: { type: "number" },
          proteinG: { type: "number" },
          carbsG: { type: "number" },
          fatG: { type: "number" },
        },
        required: ["foodDescription", "calories", "proteinG", "carbsG", "fatG"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "string",
      description: "Brief one-line description of the meal",
    },
  },
  required: ["items", "summary"],
  additionalProperties: false,
} as const;

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

    const blocked = await enforceDemoAIBudget();
    if (blocked) return blocked;

    const completion = await openai.chat.completions.create({
      model: getDemoChatModel(CHAT_MODEL),
      messages: [
        {
          role: "system",
          content: `You are a precise nutritionist analyzing food photos. Identify every visible food item and estimate its macronutrients.

RULES:
- List EACH distinct food item separately (e.g. "Grilled chicken breast" and "White rice" as separate items)
- Estimate realistic portion sizes from the photo — use visible reference objects (plate diameter, cutlery, hands) to calibrate
- Be specific about the food (e.g. "Pan-seared salmon fillet ~6oz" not just "fish")
- You are an expert in Colombian and Latin American cuisine (arepas, bandeja paisa, sancocho, patacones, etc.)
- Include sauces, dressings, beverages if visible
- If unsure about a portion, estimate conservatively
- Round calories to nearest 5, macros to nearest 1g`,
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
      max_completion_tokens: capDemoCompletionTokens(1000),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "meal_analysis",
          strict: true,
          schema: MEAL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });
    await recordDemoAISpend(completion.usage);

    const raw = completion.choices[0].message?.content?.trim() || "";

    let parsed: { items: Array<{ foodDescription: string; calories: number; proteinG: number; carbsG: number; fatG: number }>; summary: string };
    try {
      parsed = JSON.parse(raw);
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
