import type { Prisma } from "@prisma/client";
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

type FinanceReportDb = Pick<
  typeof prisma,
  "financialTransaction" | "financeReviewItem" | "upcomingPayment" | "merchant" | "budget"
>;

const ACTIVE_EXPENSE_FILTER: Prisma.FinancialTransactionWhereInput = {
  type: "expense",
  excludedFromBudget: false,
  status: "posted",
  reviewState: "resolved",
  settlementStatus: { notIn: ["provisional", "failed", "rejected", "ignored"] },
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
};

export async function getFinanceReportSummary(
  referenceDate = new Date(),
  db: FinanceReportDb = prisma
) {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  const merchantSpendRows = await db.financialTransaction.groupBy({
    by: ["merchantId"],
    where: {
      transactedAt: { gte: monthStart, lte: monthEnd },
      ...ACTIVE_EXPENSE_FILTER,
    },
    _sum: {
      amount: true,
      taxAmount: true,
      tipAmount: true,
    },
    _count: {
      _all: true,
    },
  });

  const categorySpendRows = await db.financialTransaction.groupBy({
    by: ["category"],
    where: {
      transactedAt: { gte: monthStart, lte: monthEnd },
      ...ACTIVE_EXPENSE_FILTER,
    },
    _sum: { amount: true },
  });

  const reviewCount = await db.financeReviewItem.count({ where: { status: "pending" } });

  const upcomingPayments = await db.upcomingPayment.findMany({
    where: { dueDate: { gte: referenceDate }, status: { in: ["detected", "confirmed"] } },
    orderBy: { dueDate: "asc" },
    take: 8,
    include: { merchant: true },
  });

  const merchantIds = merchantSpendRows
    .map((row) => row.merchantId)
    .filter((merchantId): merchantId is string => Boolean(merchantId));
  const merchants = merchantIds.length
    ? await db.merchant.findMany({
        where: { id: { in: merchantIds } },
        select: {
          id: true,
          name: true,
          totalSpent: true,
          transactionCount: true,
          totalTax: true,
          totalTip: true,
        },
      })
    : [];

  const budget = await db.budget.findUnique({
    where: {
      month_year: {
        month: referenceDate.getMonth() + 1,
        year: referenceDate.getFullYear(),
      },
    },
    include: { items: { include: { category: true } } },
  });

  const merchantMap = new Map(merchants.map((merchant) => [merchant.id, merchant]));
  const merchantTotals = merchantSpendRows.map((row) => {
    const merchant = row.merchantId ? merchantMap.get(row.merchantId) : null;
    const count =
      typeof row._count === "object" && row._count ? ("_all" in row._count ? row._count._all || 0 : 0) : 0;
    return {
      id: row.merchantId || "unknown",
      name: merchant?.name || "Unassigned",
      totalSpent: Math.abs(row._sum?.amount || 0),
      totalTax: row._sum?.taxAmount || 0,
      totalTip: row._sum?.tipAmount || 0,
      transactionCount: count,
    };
  });

  const actualByCategory = new Map<string, number>();
  for (const row of categorySpendRows) {
    actualByCategory.set(row.category, Math.abs(row._sum?.amount || 0));
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
      merchantTotals.sort((a, b) => b.totalSpent - a.totalSpent)
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
