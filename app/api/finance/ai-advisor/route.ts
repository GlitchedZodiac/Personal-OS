import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getFinanceReportSummary } from "@/lib/finance/reports";
import {
  capDemoCompletionTokens,
  enforceDemoAIBudget,
  getDemoChatModel,
  recordDemoAISpend,
} from "@/lib/demo-ai-budget";

export const maxDuration = 60;

const PROMPTS: Record<string, string> = {
  monthly_review:
    "Create a compact monthly review with score, highlights, budget risk, merchant concentration, and 3 actions.",
  budget_advice:
    "Create a compact category budget plan with fixed vs variable guidance and fast spending cuts.",
  debt_plan:
    "Create a debt and cash-flow prioritization note using upcoming payments and current category pressure.",
  savings_plan:
    "Create a savings plan using spending leaks, merchant concentration, and the current budget posture.",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "monthly_review";
    const language = searchParams.get("language") || "english";

    const summary = await getFinanceReportSummary();
    const blocked = await enforceDemoAIBudget();
    if (blocked) return blocked;

    const response = await openai.chat.completions.create({
      model: getDemoChatModel("gpt-5.2"),
      max_completion_tokens: capDemoCompletionTokens(1800),
      messages: [
        {
          role: "system",
          content: `You are a personal finance advisor inside a personal OS app. ${PROMPTS[type] || PROMPTS.monthly_review} Respond in ${language}. Use short headings and specific numbers.`,
        },
        {
          role: "user",
          content: JSON.stringify(summary, null, 2),
        },
      ],
    });
    await recordDemoAISpend(response.usage);

    return NextResponse.json({
      type,
      advice: response.choices[0].message.content || "",
      generatedAt: new Date().toISOString(),
      summary,
    });
  } catch (error) {
    console.error("Error generating finance advisor output:", error);
    return NextResponse.json({ error: "Failed to generate advice" }, { status: 500 });
  }
}
