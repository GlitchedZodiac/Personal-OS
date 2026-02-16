import { NextResponse } from "next/server";

// Check OpenAI billing / credit balance
// Tries multiple endpoints since OpenAI has changed these over time
export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "No API key configured" },
      { status: 500 }
    );
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    // Try the newer organization billing endpoint first
    // This provides credit grants (prepaid credits)
    const creditRes = await fetch(
      "https://api.openai.com/dashboard/billing/credit_grants",
      { headers }
    );

    if (creditRes.ok) {
      const creditData = await creditRes.json();
      return NextResponse.json({
        available: true,
        totalGranted: creditData.total_granted ?? null,
        totalUsed: creditData.total_used ?? null,
        totalAvailable: creditData.total_available ?? null,
        grants: creditData.grants?.data?.map(
          (g: { id: string; grant_amount: number; used_amount: number; effective_at: number; expires_at: number }) => ({
            id: g.id,
            amount: g.grant_amount,
            used: g.used_amount,
            effectiveAt: g.effective_at,
            expiresAt: g.expires_at,
          })
        ) ?? [],
      });
    }

    // Try the subscription endpoint as fallback
    const subRes = await fetch(
      "https://api.openai.com/dashboard/billing/subscription",
      { headers }
    );

    if (subRes.ok) {
      const subData = await subRes.json();

      // Also try to get usage for current month
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const endDay = now.getDate() + 1;
      const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;

      let usageTotal: number | null = null;
      try {
        const usageRes = await fetch(
          `https://api.openai.com/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
          { headers }
        );
        if (usageRes.ok) {
          const usageData = await usageRes.json();
          usageTotal = usageData.total_usage
            ? usageData.total_usage / 100
            : null; // Comes in cents
        }
      } catch {
        // Usage endpoint failed — that's ok
      }

      return NextResponse.json({
        available: true,
        plan: subData.plan?.title ?? subData.plan?.id ?? "Unknown",
        hardLimitUsd: subData.hard_limit_usd ?? null,
        softLimitUsd: subData.soft_limit_usd ?? null,
        monthlyUsageUsd: usageTotal,
        accessUntil: subData.access_until
          ? new Date(subData.access_until * 1000).toISOString()
          : null,
      });
    }

    // Both endpoints failed — key might be valid but doesn't have billing access
    // Verify key works by checking models
    const modelsRes = await fetch("https://api.openai.com/v1/models", {
      headers,
      method: "GET",
    });

    return NextResponse.json({
      available: false,
      keyValid: modelsRes.ok,
      message: modelsRes.ok
        ? "API key is valid but billing endpoints are not accessible. Check your balance at platform.openai.com"
        : "API key appears to be invalid or expired.",
      dashboardUrl: "https://platform.openai.com/settings/organization/billing/overview",
    });
  } catch (error) {
    console.error("Balance check error:", error);
    return NextResponse.json(
      {
        available: false,
        error: "Failed to check balance",
        dashboardUrl: "https://platform.openai.com/settings/organization/billing/overview",
      },
      { status: 500 }
    );
  }
}
