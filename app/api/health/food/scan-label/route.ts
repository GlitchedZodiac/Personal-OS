import { NextRequest, NextResponse } from "next/server";
import { openai, CHAT_MODEL } from "@/lib/openai";
import { classifyOpenAIError, recordAIUsage } from "@/lib/ai-usage";

// Nutrition-label scan. Unlike analyze-photo (a plated meal → estimated
// items), a label states exact PER-SERVING numbers, so the model reads
// rather than estimates, and the serving size comes back with them —
// the UI multiplies by servings before logging. Not in the Pitaya design;
// added on Michael's ask (labels stored as reusable products).
export const maxDuration = 60;

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    productName: {
      type: "string",
      description:
        "Product name as printed (brand + product), e.g. 'Optimum Gold Standard Whey — Vanilla'",
    },
    servingLabel: {
      type: "string",
      description:
        "Serving size exactly as printed, e.g. '1 scoop (32 g)' or '2/3 cup (55 g)'",
    },
    servingsPerContainer: {
      type: ["number", "null"],
      description: "Servings per container if printed, else null",
    },
    perServing: {
      type: "object",
      properties: {
        calories: { type: "number" },
        proteinG: { type: "number" },
        carbsG: { type: "number" },
        fatG: { type: "number" },
      },
      required: ["calories", "proteinG", "carbsG", "fatG"],
      additionalProperties: false,
    },
    confident: {
      type: "boolean",
      description:
        "False when the label is blurry, cropped, or the numbers are a guess",
    },
  },
  required: [
    "productName",
    "servingLabel",
    "servingsPerContainer",
    "perServing",
    "confident",
  ],
  additionalProperties: false,
} as const;

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "Image data required" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You read nutrition-facts labels. Report the numbers EXACTLY as printed for ONE serving — never scale to the container, never estimate when the panel is legible. Labels may be in Spanish (Colombian products: 'Tamaño por porción', 'Grasa total', 'Proteína'); read those the same way. If the panel is unreadable or cut off, set confident=false and give your best reading anyway.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read this nutrition label: product name, serving size as printed, servings per container, and per-serving calories/protein/carbs/fat.",
            },
            {
              type: "image_url",
              image_url: {
                url: image.startsWith("data:")
                  ? image
                  : `data:image/jpeg;base64,${image}`,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nutrition_label",
          schema: LABEL_SCHEMA,
          strict: true,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: "Couldn't read the label" }, { status: 502 });
    }

    recordAIUsage({
      surface: "photo",
      model: CHAT_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });

    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    console.error("Label scan error:", error);
    const { kind, userMessage } = classifyOpenAIError(error);
    return NextResponse.json(
      {
        error:
          kind === "unknown"
            ? "Couldn't read that label. Try a straighter, closer shot."
            : userMessage,
        kind,
      },
      { status: kind === "unknown" ? 500 : 502 }
    );
  }
}
