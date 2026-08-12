import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDemoAIBudgetSummary, isDemoModeServer } from "@/lib/demo-ai-budget";

// AI spend, best available truth:
// 1. An org ADMIN key is connected (Settings → AI status) → REAL
//    month-to-date costs from /v1/organization/costs.
// 2. No admin key → honest "estimate only" answer; the card explains and
//    offers the connect flow. The legacy dashboard/billing endpoints are
//    gone for modern keys — don't probe them.

export async function GET() {
  if (isDemoModeServer()) {
    const summary = await getDemoAIBudgetSummary();
    if (summary) {
      return NextResponse.json({
        available: true,
        ...summary,
        message: "Demo AI budget mode is active.",
      });
    }
  }

  const secret = await prisma.integrationSecret.findUnique({
    where: { name: "openai_admin_key" },
  });
  const adminKey = secret?.value ?? process.env.OPENAI_ADMIN_KEY;

  if (!adminKey) {
    return NextResponse.json({
      available: false,
      adminKeyConnected: false,
      message:
        "OpenAI doesn't expose spend to regular API keys. Connect an org admin key to see real month-to-date costs.",
      dashboardUrl:
        "https://platform.openai.com/settings/organization/billing/overview",
    });
  }

  try {
    const now = new Date();
    const monthStart = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000
    );
    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${monthStart}&limit=31`,
      { headers: { Authorization: `Bearer ${adminKey}` } }
    );
    if (!res.ok) {
      return NextResponse.json({
        available: false,
        adminKeyConnected: true,
        message: `Costs endpoint answered ${res.status} — the admin key may have been revoked. Reconnect it in Settings.`,
      });
    }
    const body = (await res.json()) as {
      data?: { start_time: number; results?: { amount?: { value?: number } }[] }[];
    };
    let monthSpendUsd = 0;
    const days: { date: string; usd: number }[] = [];
    for (const bucket of body.data ?? []) {
      let dayUsd = 0;
      for (const r of bucket.results ?? []) {
        dayUsd += r.amount?.value ?? 0;
      }
      monthSpendUsd += dayUsd;
      days.push({
        date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
        usd: Math.round(dayUsd * 100) / 100,
      });
    }
    return NextResponse.json({
      available: true,
      adminKeyConnected: true,
      monthSpendUsd: Math.round(monthSpendUsd * 100) / 100,
      days,
      monthStart: new Date(monthStart * 1000).toISOString().slice(0, 10),
    });
  } catch (error) {
    console.error("Costs fetch error:", error);
    return NextResponse.json(
      { available: false, adminKeyConnected: true, error: "Costs fetch failed" },
      { status: 500 }
    );
  }
}
