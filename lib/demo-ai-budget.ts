import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEMO_SPEND_CACHE_KEY = "demo_ai_spend_usd_v1";

type UsageLike = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
} | null | undefined;

export interface DemoAIBudgetSummary {
  demoMode: boolean;
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
}

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(cleanEnv(value));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function readCurrentSpend(rowValue: string | null | undefined): number {
  if (!rowValue) return 0;
  const parsed = Number(rowValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

async function getSpendRow() {
  return prisma.aIInsightCache.findUnique({
    where: { cacheKey: DEMO_SPEND_CACHE_KEY },
  });
}

async function setSpend(usd: number) {
  await prisma.aIInsightCache.upsert({
    where: { cacheKey: DEMO_SPEND_CACHE_KEY },
    create: {
      cacheKey: DEMO_SPEND_CACHE_KEY,
      insight: usd.toFixed(6),
      dataHash: "demo-ai-budget",
    },
    update: {
      insight: usd.toFixed(6),
    },
  });
}

function estimateCostUsd(usage: UsageLike): number {
  if (!usage) return 0;

  const promptTokens = Math.max(0, Number(usage.prompt_tokens ?? 0));
  const completionTokens = Math.max(
    0,
    Number(usage.completion_tokens ?? usage.total_tokens ?? 0)
  );

  const inputPer1M = readPositiveNumber(
    process.env.DEMO_AI_INPUT_COST_PER_1M_TOKENS,
    0.4
  );
  const outputPer1M = readPositiveNumber(
    process.env.DEMO_AI_OUTPUT_COST_PER_1M_TOKENS,
    1.6
  );

  const inputCost = (promptTokens / 1_000_000) * inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * outputPer1M;

  const total = inputCost + outputCost;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return total;
}

export function isDemoModeServer(): boolean {
  const demoMode = cleanEnv(process.env.DEMO_MODE).toLowerCase();
  const publicDemoMode = cleanEnv(process.env.NEXT_PUBLIC_DEMO_MODE).toLowerCase();
  return (
    demoMode === "true" || publicDemoMode === "true"
  );
}

export function getDemoChatModel(defaultModel = "gpt-5.2"): string {
  const demoModel = cleanEnv(process.env.DEMO_OPENAI_MODEL);
  const openaiModel = cleanEnv(process.env.OPENAI_MODEL);
  if (!isDemoModeServer()) {
    return openaiModel || defaultModel;
  }
  return demoModel || openaiModel || "gpt-4.1-mini";
}

export function capDemoCompletionTokens(requested: number): number {
  if (!isDemoModeServer()) return requested;
  const hardCap = Math.max(
    64,
    Math.floor(readPositiveNumber(process.env.DEMO_AI_MAX_COMPLETION_TOKENS, 1200))
  );
  return Math.min(requested, hardCap);
}

export async function enforceDemoAIBudget(): Promise<NextResponse | null> {
  if (!isDemoModeServer()) return null;

  try {
    const summary = await getDemoAIBudgetSummary();
    if (!summary) return null;

    if (summary.spentUsd >= summary.limitUsd) {
      return NextResponse.json(
        {
          error:
            "Demo AI budget reached. Increase DEMO_AI_SPEND_LIMIT_USD or reset demo spend.",
          code: "DEMO_AI_BUDGET_EXCEEDED",
          spentUsd: Number(summary.spentUsd.toFixed(4)),
          limitUsd: Number(summary.limitUsd.toFixed(4)),
        },
        { status: 429 }
      );
    }
  } catch (error) {
    console.error("[demo-ai-budget] Failed to enforce budget:", error);
  }

  return null;
}

export async function getDemoAIBudgetSummary(): Promise<DemoAIBudgetSummary | null> {
  if (!isDemoModeServer()) return null;

  const limitUsd = readPositiveNumber(process.env.DEMO_AI_SPEND_LIMIT_USD, 0.1);
  const row = await getSpendRow();
  const spentUsd = readCurrentSpend(row?.insight);
  const remainingUsd = Math.max(0, limitUsd - spentUsd);

  return {
    demoMode: true,
    limitUsd,
    spentUsd,
    remainingUsd,
  };
}

export async function recordDemoAISpend(usage: UsageLike): Promise<void> {
  if (!isDemoModeServer()) return;

  const deltaUsd = estimateCostUsd(usage);
  if (deltaUsd <= 0) return;

  try {
    const row = await getSpendRow();
    const currentSpend = readCurrentSpend(row?.insight);
    const nextSpend = currentSpend + deltaUsd;
    await setSpend(nextSpend);
  } catch (error) {
    console.error("[demo-ai-budget] Failed to record usage:", error);
  }
}

export async function recordDemoAIFixedCharge(costUsd: number): Promise<void> {
  if (!isDemoModeServer()) return;
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;

  try {
    const row = await getSpendRow();
    const currentSpend = readCurrentSpend(row?.insight);
    await setSpend(currentSpend + costUsd);
  } catch (error) {
    console.error("[demo-ai-budget] Failed to record fixed charge:", error);
  }
}
