import { openai, CHAT_MODEL } from "@/lib/openai";

type ChatTextMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateChatTextInput = {
  messages: ChatTextMessage[];
  model?: string;
  maxCompletionTokens: number;
  retryMaxCompletionTokens?: number;
  /** GPT-5.6 reasoning depth. Text-only calls may reason; default off for speed. */
  reasoningEffort?: "none" | "low" | "medium" | "high";
};

export async function generateChatText({
  messages,
  model = CHAT_MODEL,
  maxCompletionTokens,
  retryMaxCompletionTokens,
  reasoningEffort = "none",
}: GenerateChatTextInput) {
  const budgets = Array.from(
    new Set(
      [maxCompletionTokens, retryMaxCompletionTokens]
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value) && value > 0
        )
        .map((value) => Math.round(value))
    )
  );

  let finishReason: string | null = null;

  for (const budget of budgets) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      reasoning_effort: reasoningEffort,
      max_completion_tokens: budget,
    });

    const choice = completion.choices[0];
    const text = choice?.message?.content?.trim() || "";
    finishReason = choice?.finish_reason ?? null;

    if (text) {
      return {
        text,
        finishReason,
      };
    }

    if (finishReason !== "length") {
      break;
    }
  }

  return {
    text: null,
    finishReason,
  };
}
