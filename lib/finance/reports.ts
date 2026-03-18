import { prisma } from "@/lib/prisma";
import { endOfMonth, format, startOfMonth } from "date-fns";

export interface MerchantReport {
  id: string;
  name: string;
  totalSpent: number;
  totalTax: number;
  totalTip: number;
  transactionCount: number;
}

export interface BudgetRiskCard {
  category: string;
  planned: number;
  actual: number;
  remaining: number;
  percentUsed: number;
  status: "on_track" | "warning" | "off_track";
}

export function calculateBudgetRiskCards(
  categories: Array<{ category: string; planned: number; actual: number }>
): BudgetRiskCard[] {
  return categories.map((item) => {
    const percentUsed = item.planned > 0 ? Math.round((item.actual / item.planned) * 100) : 0;
    return {
      category: item.category,
      planned: item.planned,
      actual: item.actual,
      remaining: item.planned - item.actual,
      percentUsed,
      status:
        percentUsed > 100 ? "off_track" : percentUsed > 85 ? "warning" : "on_track",
    };
  });
}

export function calculateVendorConcentration(merchants: MerchantReport[]) {
  const total = merchants.reduce((sum, merchant) => sum + merchant.totalSpent, 0);
  return merchants.map((merchant) => ({
    ...merchant,
    shareOfSpend: total > 0 ? Math.round((merchant.totalSpent / total) * 100) : 0,
  }));
}

export async function getFinanceReportSummary(referenceDate = new Date()) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  const [transactions, reviewCount, upcomingPayments, merchants, budget] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: {
        transactedAt: { gte: monthStart, lte: monthEnd },
        type: "expense",
        excludedFromBudget: false,
        status: "posted",
        reviewState: "resolved",
        OR: [
          { sourceDocumentId: null },
          {
            sourceDocument: {
              classification: {
                in: [
                  "expense_receipt",
                  "income_notice",
                  "refund_notice",
                  "transfer_notice",
                  "subscription_notice",
                ],
              },
            },
          },
        ],
      },
      select: {
        id: true,
        amount: true,
        category: true,
        merchantId: true,
        taxAmount: true,
        tipAmount: true,
        merchantRef: { select: { id: true, name: true } },
      },
    }),
    prisma.financeReviewItem.count({ where: { status: "pending" } }),
    prisma.upcomingPayment.findMany({
      where: { dueDate: { gte: referenceDate }, status: { in: ["detected", "confirmed"] } },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { merchant: true },
    }),
    prisma.merchant.findMany({
      orderBy: { totalSpent: "desc" },
      take: 8,
    }),
    prisma.budget.findUnique({
      where: {
        month_year: {
          month: referenceDate.getMonth() + 1,
          year: referenceDate.getFullYear(),
        },
      },
      include: { items: { include: { category: true } } },
    }),
  ]);

  const merchantTotals = new Map<string, MerchantReport>();
  for (const tx of transactions) {
    const id = tx.merchantRef?.id || tx.merchantId || "unknown";
    const name = tx.merchantRef?.name || "Unassigned";
    const current = merchantTotals.get(id) || {
      id,
      name,
      totalSpent: 0,
      totalTax: 0,
      totalTip: 0,
      transactionCount: 0,
    };
    current.totalSpent += Math.abs(tx.amount);
    current.totalTax += tx.taxAmount || 0;
    current.totalTip += tx.tipAmount || 0;
    current.transactionCount += 1;
    merchantTotals.set(id, current);
  }

  const actualByCategory = new Map<string, number>();
  for (const tx of transactions) {
    actualByCategory.set(tx.category, (actualByCategory.get(tx.category) || 0) + Math.abs(tx.amount));
  }

  const categoryBudgetRows =
    budget?.items
      .filter((item) => item.category.type === "expense")
      .map((item) => ({
        category: item.category.name,
        planned: item.planned,
        actual: actualByCategory.get(item.category.name.toLowerCase().replace(/\s+/g, "_")) || 0,
      })) || [];

  const budgetRisk = calculateBudgetRiskCards(categoryBudgetRows).sort(
    (a, b) => b.percentUsed - a.percentUsed
  );

  return {
    monthLabel: format(referenceDate, "MMMM yyyy"),
    pendingReviews: reviewCount,
    topMerchants: calculateVendorConcentration(
      Array.from(merchantTotals.values()).sort((a, b) => b.totalSpent - a.totalSpent)
    ).slice(0, 6),
    merchantLeaderboard: merchants.map((merchant) => ({
      id: merchant.id,
      name: merchant.name,
      totalSpent: merchant.totalSpent,
      transactionCount: merchant.transactionCount,
      totalTax: merchant.totalTax,
      totalTip: merchant.totalTip,
    })),
    upcomingPayments: upcomingPayments.map((payment) => ({
      id: payment.id,
      description: payment.description,
      amount: payment.amount,
      minimumDue: payment.minimumDue,
      dueDate: payment.dueDate,
      status: payment.status,
      merchantName: payment.merchant?.name || null,
    })),
    budgetRisk,
    possibleSavings: budgetRisk.filter((item) => item.status !== "on_track").slice(0, 4),
  };
}
