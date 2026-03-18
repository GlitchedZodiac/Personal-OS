import { NextResponse } from "next/server";
import { getDemoAIBudgetSummary, isDemoModeServer } from "@/lib/demo-ai-budget";

export async function GET() {
  if (!isDemoModeServer()) {
    return NextResponse.json({
      demoMode: false,
      message: "Demo mode is disabled.",
    });
  }

  try {
    const summary = await getDemoAIBudgetSummary();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[demo-budget] Failed to load summary:", error);
    return NextResponse.json(
      { error: "Failed to read demo AI budget" },
      { status: 500 }
    );
  }
}
