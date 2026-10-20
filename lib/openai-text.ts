import { openai, CHAT_MODEL } from "@/lib/openai";
import { recordAIUsage } from "@/lib/ai-usage";

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
  /** Metering label shown in AI usage stats. */
  surface?: string;
  /** Per-request timeout in ms, with no SDK retries (a caller with a hard ceiling). */
  timeoutMs?: number;
  /** Epoch ms after which no further `length` retry is started. */
  deadline?: number;
};

export async function generateChatText({
  messages,
  model = CHAT_MODEL,
  maxCompletionTokens,
  retryMaxCompletionTokens,
  reasoningEffort = "none",
  surface = "text",
  timeoutMs,
  deadline,
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
  // Summed over every call this makes (a `length` retry is a second call), so
  // a caller that stores what a result cost can (the Coach, 2026-10-17).
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  for (const [attempt, budget] of budgets.entries()) {
    if (attempt > 0 && deadline !== undefined && deadline - Date.now() < 5_000) break;
    let completion;
    try {
      completion = await openai.chat.completions.create(
        {
          model,
          messages,
          reasoning_effort: reasoningEffort,
          max_completion_tokens: budget,
        },
        timeoutMs !== undefined ? { timeout: timeoutMs, maxRetries: 0 } : undefined
      );
    } catch (error) {
      // What the earlier calls cost travels with the failure.
      if (error && typeof error === "object") (error as { usage?: typeof usage }).usage = { ...usage };
      throw error;
    }

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.calls += 1;
    recordAIUsage({ surface, model, inputTokens, outputTokens });

    const choice = completion.choices[0];
    const text = choice?.message?.content?.trim() || "";
    finishReason = choice?.finish_reason ?? null;

    if (text) {
      return {
        text,
        finishReason,
        usage,
      };
    }

    if (finishReason !== "length") {
      break;
    }
  }

  return {
    text: null,
    finishReason,
    usage,
  };
}
