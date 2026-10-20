// Settings → Coach (2026-10-17, lane B). GET the switch, budget, model and
// journal switch with this month's spend and what one review costs on each
// tier; PUT merges a patch into user_settings.data.coach server-side. The
// general settings PUT preserves this key (SERVER_OWNED_KEYS).

import { NextRequest, NextResponse } from "next/server";
import { estimateChatCostUsd } from "@/lib/ai-usage";
import { getCoachSettings, saveCoachSettings } from "@/lib/coach/settings";
import { getCoachSpend } from "@/lib/coach/spend";
import { MODEL_TIERS, type ModelTier } from "@/lib/openai";
import { getUserTimeZone } from "@/lib/server-timezone";

/** A typical review once ids are stripped from the facts: ~7k tokens in, ~1.5k out (an estimate). */
const REVIEW_TOKENS = { input: 7_000, output: 1_500 };

const TIER_LABEL: Record<ModelTier, string> = {
  sol: "Sol — the thorough one",
  terra: "Terra — balanced",
  luna: "Luna — quick and cheap",
};

function tiers() {
  return (Object.keys(MODEL_TIERS) as ModelTier[]).map((tier) => {
    const model = MODEL_TIERS[tier];
    return {
      tier,
      label: TIER_LABEL[tier],
      model,
      inputUsdPerM: estimateChatCostUsd(model, 1_000_000, 0),
      outputUsdPerM: estimateChatCostUsd(model, 0, 1_000_000),
      reviewEstimateUsd: Math.round(estimateChatCostUsd(model, REVIEW_TOKENS.input, REVIEW_TOKENS.output) * 1000) / 1000,
    };
  });
}

async function payload() {
  const [settings, timeZone] = await Promise.all([getCoachSettings(), getUserTimeZone(null)]);
  const spend = await getCoachSpend({ timeZone, budgetUsd: settings.monthlyBudgetUsd });
  return { settings, spend, tiers: tiers() };
}

export async function GET() {
  try {
    return NextResponse.json(await payload());
  } catch (error) {
    console.error("Coach settings error:", error);
    return NextResponse.json({ error: "Failed to load Coach settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await saveCoachSettings((body as { settings?: unknown })?.settings ?? body);
    return NextResponse.json(await payload());
  } catch (error) {
    console.error("Coach settings save error:", error);
    return NextResponse.json({ error: "Failed to save Coach settings" }, { status: 500 });
  }
}
