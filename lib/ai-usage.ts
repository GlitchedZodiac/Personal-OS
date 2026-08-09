import { prisma } from "@/lib/prisma";

// Published OpenAI prices per 1M tokens (input, output) — July 2026 rates.
// Unknown models fall back to terra rates and are flagged as estimates.
const MODEL_PRICES_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
};

const FALLBACK_PRICE = MODEL_PRICES_PER_M["gpt-5.6-terra"];

// gpt-transcribe billing isn't token-based from our vantage point; use a
// per-minute estimate (override via env if OpenAI publishes new rates).
const TRANSCRIBE_COST_PER_MIN = Number(
  process.env.TRANSCRIBE_COST_PER_MIN || "0.006"
);
const TRANSCRIBE_FLAT_ESTIMATE_USD = 0.004; // when duration is unknown

export function estimateChatCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  const price = MODEL_PRICES_PER_M[model] || FALLBACK_PRICE;
  return (
    (inputTokens / 1_000_000) * price.input +
    (outputTokens / 1_000_000) * price.output
  );
}

type RecordArgs = {
  surface: string; // chat | transcribe | photo | plan | insights | projections | text
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number | null;
};

/**
 * Fire-and-forget usage metering. Never throws, never blocks the response —
 * a metering failure must not break a user-facing AI call.
 */
export function recordAIUsage({
  surface,
  model,
  inputTokens = 0,
  outputTokens = 0,
  audioSeconds = null,
}: RecordArgs) {
  try {
    const costUsd =
      surface === "transcribe"
        ? audioSeconds != null
          ? (audioSeconds / 60) * TRANSCRIBE_COST_PER_MIN
          : TRANSCRIBE_FLAT_ESTIMATE_USD
        : estimateChatCostUsd(model, inputTokens, outputTokens);

    void prisma.aIUsageEvent
      .create({
        data: { surface, model, inputTokens, outputTokens, audioSeconds, costUsd },
      })
      .catch((error: Error) => {
        console.warn("[ai-usage] failed to record usage:", error.message);
      });
  } catch (error) {
    // Metering must never take down an AI call — even on a stale client.
    console.warn("[ai-usage] metering skipped:", (error as Error)?.message);
  }
}

export async function getAISpend() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [today, month] = await Promise.all([
    prisma.aIUsageEvent.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: { costUsd: true },
      _count: true,
    }),
    prisma.aIUsageEvent.aggregate({
      where: { createdAt: { gte: thirtyDaysAgo } },
      _sum: { costUsd: true },
      _count: true,
    }),
  ]);

  return {
    todayUsd: Number(today._sum.costUsd || 0),
    todayCalls: today._count,
    last30dUsd: Number(month._sum.costUsd || 0),
    last30dCalls: month._count,
  };
}

export type AIErrorKind =
  | "quota"
  | "auth"
  | "rate_limit"
  | "network"
  | "server"
  | "unknown";

/**
 * Turn an OpenAI SDK error into something Michael can act on. The generic
 * "Failed to process message" told him nothing when the account/connection
 * was the problem.
 */
export function classifyOpenAIError(error: unknown): {
  kind: AIErrorKind;
  userMessage: string;
} {
  const e = error as {
    status?: number;
    code?: string | null;
    error?: { type?: string; code?: string | null; message?: string };
    message?: string;
  };
  const code = e?.error?.code || e?.code || "";
  const type = e?.error?.type || "";
  const msg = e?.error?.message || e?.message || "";

  if (code === "insufficient_quota" || /exceeded your current quota/i.test(msg)) {
    return {
      kind: "quota",
      userMessage:
        "OpenAI balance is empty — top up at platform.openai.com → Billing, then retry.",
    };
  }
  if (e?.status === 401 || type === "authentication_error") {
    return {
      kind: "auth",
      userMessage:
        "OpenAI rejected the API key. Check OPENAI_API_KEY in Vercel → Settings → Environment Variables.",
    };
  }
  if (e?.status === 429) {
    return {
      kind: "rate_limit",
      userMessage: "OpenAI rate limit hit — wait a few seconds and retry.",
    };
  }
  if (e?.status && e.status >= 500) {
    return {
      kind: "server",
      userMessage: "OpenAI is having a moment (server error). Retry shortly.",
    };
  }
  if (/fetch failed|ENOTFOUND|ECONNRE|ETIMEDOUT/i.test(msg)) {
    return {
      kind: "network",
      userMessage: "Couldn't reach OpenAI (network). Check connectivity and retry.",
    };
  }
  return {
    kind: "unknown",
    userMessage: "AI request failed. Check Settings → AI status for diagnostics.",
  };
}
