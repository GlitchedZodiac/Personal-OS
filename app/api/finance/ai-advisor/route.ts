import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
} from "date-fns";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// GET /api/finance/ai-advisor — AI financial planning and insights
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "monthly_review"; // monthly_review, budget_advice, debt_plan, savings_plan
    const language = searchParams.get("language") || "english";

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    // Gather financial data for the last 3 months
    const months = Array.from({ length: 3 }, (_, i) => {
      const m = subMonths(now, i);
      return {
        start: startOfMonth(m),
        end: endOfMonth(m),
        label: format(m, "MMMM yyyy"),
      };
    });

    const [accounts, budget, recurringTx, savingsGoals, ...monthlyData] =
      await Promise.all([
        prisma.financialAccount.findMany({
          where: { isActive: true },
          select: {
            name: true,
            accountType: true,
            balance: true,
            creditLimit: true,
            interestRate: true,
            institution: true,
            currency: true,
          },
        }),
        prisma.budget.findUnique({
          where: {
            month_year: { month: now.getMonth() + 1, year: now.getFullYear() },
          },
          include: { items: { include: { category: true } } },
        }),
        prisma.recurringTransaction.findMany({
          where: { isActive: true },
          select: {
            description: true,
            amount: true,
            type: true,
            frequency: true,
            category: true,
          },
        }),
        prisma.savingsGoal.findMany({
          where: { isCompleted: false },
        }),
        ...months.map((m) =>
          Promise.all([
            prisma.financialTransaction.aggregate({
              where: {
                transactedAt: { gte: m.start, lte: m.end },
                type: "income",
              },
              _sum: { amount: true },
            }),
            prisma.financialTransaction.aggregate({
              where: {
                transactedAt: { gte: m.start, lte: m.end },
                type: "expense",
              },
              _sum: { amount: true },
            }),
            prisma.financialTransaction.groupBy({
              by: ["category"],
              where: {
                transactedAt: { gte: m.start, lte: m.end },
                type: "expense",
              },
              _sum: { amount: true },
            }),
          ]).then(([income, expenses, categories]) => ({
            month: m.label,
            income: Math.abs(income._sum.amount || 0),
            expenses: Math.abs(expenses._sum.amount || 0),
            categories: categories.map((c) => ({
              category: c.category,
              amount: Math.abs(c._sum.amount || 0),
            })),
          }))
        ),
      ]);

    const netWorth = accounts.reduce((sum, a) => {
      if (a.accountType === "credit_card" || a.accountType === "loan") {
        return sum - Math.abs(a.balance);
      }
      return sum + a.balance;
    }, 0);

    const totalDebt = accounts
      .filter((a) => a.accountType === "credit_card" || a.accountType === "loan")
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const budgetSummary = budget?.items.map((i) => ({
      category: i.category.name,
      planned: i.planned,
      isFixed: i.isFixed,
    })) || [];

    const financialContext = `
## Financial Profile
- Net Worth: ${formatCOP(netWorth)}
- Total Debt: ${formatCOP(totalDebt)}
- Accounts: ${accounts.map((a) => `${a.name} (${a.accountType}): ${formatCOP(a.balance)}${a.interestRate ? `, ${a.interestRate}% APR` : ""}`).join("; ")}
- Currency: COP (Colombian Pesos)

## Monthly Budget (Current Month)
${budgetSummary.length > 0 ? budgetSummary.map((b) => `- ${b.category}: ${formatCOP(b.planned)} (${b.isFixed ? "fixed" : "variable"})`).join("\n") : "No budget set up yet."}

## Last 3 Months Overview
${monthlyData.map((m) => `### ${m.month}
- Income: ${formatCOP(m.income)}
- Expenses: ${formatCOP(m.expenses)}
- Savings: ${formatCOP(m.income - m.expenses)}
- Top spending: ${m.categories.slice(0, 5).map((c) => `${c.category}: ${formatCOP(c.amount)}`).join(", ")}`).join("\n\n")}

## Recurring Expenses/Income
${recurringTx.length > 0 ? recurringTx.map((r) => `- ${r.description}: ${formatCOP(Math.abs(r.amount))} (${r.type}, ${r.frequency})`).join("\n") : "None configured."}

## Savings Goals
${savingsGoals.length > 0 ? savingsGoals.map((g) => `- ${g.name}: ${formatCOP(g.currentAmount)} / ${formatCOP(g.targetAmount)}${g.deadline ? ` by ${format(g.deadline, "MMM yyyy")}` : ""}`).join("\n") : "None set."}
`;

    const systemPrompts: Record<string, string> = {
      monthly_review: `You are a personal financial advisor. Provide a monthly financial review with:
1. **Monthly Score** (A-F grade based on budget adherence, savings rate, debt management)
2. **Key Highlights** (3-5 bullet points: what went well, what needs attention)
3. **Spending Analysis** (which categories are over/under budget)
4. **Actionable Tips** (3 specific, practical recommendations)
5. **Next Month Focus** (one priority area to improve)

Be encouraging but honest. Use specific numbers from the data.${language !== "english" ? ` Respond in ${language}.` : ""}`,

      budget_advice: `You are a personal financial planner helping set up a monthly budget. Based on the user's income, expenses, and financial profile:
1. **Recommended Budget** - Suggest specific amounts for each category using the 50/30/20 rule adapted to their situation
2. **Fixed vs Variable** - Identify which expenses are fixed (rent, subscriptions) vs variable (food, entertainment)
3. **Savings Target** - How much should they save each month
4. **Quick Wins** - 3 areas where they could immediately reduce spending
5. **Priority Order** - If money is tight, which categories to cut first

Be specific with COP amounts. Consider Colombian cost of living.${language !== "english" ? ` Respond in ${language}.` : ""}`,

      debt_plan: `You are a debt management specialist. Create a debt payoff plan:
1. **Debt Overview** - List all debts with balances and interest rates
2. **Strategy** - Recommend avalanche (highest interest first) or snowball (smallest balance first) based on their situation
3. **Monthly Payment Plan** - Specific amounts to pay each debt
4. **Timeline** - Estimated payoff dates
5. **Extra Payment Strategy** - How to accelerate payoff
6. **Warning Signs** - Things to avoid

Be realistic about Colombian financial products and interest rates.${language !== "english" ? ` Respond in ${language}.` : ""}`,

      savings_plan: `You are a savings and investment advisor. Create a personalized savings plan:
1. **Emergency Fund** - Target amount (3-6 months expenses) and timeline
2. **Savings Goals Assessment** - Review their current goals and suggest adjustments
3. **Investment Options** - Suggest Colombian-friendly options (CDTs, FICs, stocks)
4. **Automation** - How to automate savings
5. **Monthly Savings Target** - Specific amount based on income

Consider Colombian financial products: CDTs (certificados de depósito a término), FICs (fondos de inversión colectiva), and typical Colombian bank savings rates.${language !== "english" ? ` Respond in ${language}.` : ""}`,
    };

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: systemPrompts[type] || systemPrompts.monthly_review,
        },
        {
          role: "user",
          content: financialContext,
        },
      ],
    });

    const advice = response.choices[0].message.content || "";

    return NextResponse.json({
      type,
      advice,
      generatedAt: new Date().toISOString(),
      dataPoints: {
        netWorth,
        totalDebt,
        monthlyIncome: monthlyData[0]?.income || 0,
        monthlyExpenses: monthlyData[0]?.expenses || 0,
        savingsRate:
          monthlyData[0]?.income > 0
            ? Math.round(
                ((monthlyData[0].income - monthlyData[0].expenses) /
                  monthlyData[0].income) *
                  100
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("Error generating financial advice:", error);
    return NextResponse.json(
      { error: "Failed to generate financial advice" },
      { status: 500 }
    );
  }
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
