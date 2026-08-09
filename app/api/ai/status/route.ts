import { NextResponse } from "next/server";
import {
  openai,
  hasOpenAIKey,
  CHAT_MODEL,
  COACH_MODEL,
  TRANSCRIBE_MODEL,
} from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { classifyOpenAIError, getAISpend } from "@/lib/ai-usage";

export const maxDuration = 15;

/**
 * One-stop diagnostics: is the AI reachable, is the database reachable,
 * which models are configured, and what has AI usage cost lately.
 *
 * Note: OpenAI does not expose remaining account balance to API keys —
 * spend here is metered locally from per-call token usage at published
 * rates, and the billing link is where top-ups happen.
 */
export async function GET() {
  const [ai, db, spend] = await Promise.all([
    checkOpenAI(),
    checkDatabase(),
    getAISpend().catch(() => null),
  ]);

  return NextResponse.json({
    ai,
    db,
    models: { chat: CHAT_MODEL, coach: COACH_MODEL, transcribe: TRANSCRIBE_MODEL },
    spend,
    billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
    checkedAt: new Date().toISOString(),
  });
}

async function checkOpenAI() {
  if (!hasOpenAIKey) {
    return {
      ok: false,
      kind: "auth" as const,
      detail: "No OPENAI_API_KEY configured.",
      latencyMs: null,
    };
  }
  const t0 = Date.now();
  try {
    // models.list is free and fast — proves key validity + reachability.
    await openai.models.list();
    return { ok: true, kind: null, detail: "Connected", latencyMs: Date.now() - t0 };
  } catch (error) {
    const { kind, userMessage } = classifyOpenAIError(error);
    return { ok: false, kind, detail: userMessage, latencyMs: Date.now() - t0 };
  }
}

async function checkDatabase() {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, detail: "Connected", latencyMs: Date.now() - t0 };
  } catch (error) {
    const msg = error instanceof Error ? error.message.split("\n")[0] : "unknown";
    return { ok: false, detail: `Database error: ${msg}`, latencyMs: Date.now() - t0 };
  }
}
