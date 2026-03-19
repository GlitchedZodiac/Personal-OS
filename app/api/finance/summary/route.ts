import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { getFinanceReportSummary } from "@/lib/finance/reports";

const ACTIVE_TRANSACTION_FILTER: Prisma.FinancialTransactionWhereInput = {
  excludedFromBudget: false,
  status: "posted",
  settlementStatus: { notIn: ["provisional", "failed", "rejected", "ignored"] },
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
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");

    const now = new Date();
    const currentMonth = monthParam
      ? new Date(parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1)
      : now;
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const prevMonthStart = startOfMonth(subMonths(currentMonth, 1));
    const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));

    const accounts = await prisma.financialAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        accountType: true,
        balance: true,
        creditLimit: true,
        institution: true,
        icon: true,
        color: true,
        currency: true,
      },
    });

    const thisMonthIncome = await prisma.financialTransaction.aggregate({
      where: {
        transactedAt: { gte: monthStart, lte: monthEnd },
        type: "income",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
      _count: true,
    });

    const thisMonthExpenses = await prisma.financialTransaction.aggregate({
      where: {
        transactedAt: { gte: monthStart, lte: monthEnd },
        type: "expense",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
      _count: true,
    });

    const prevMonthIncome = await prisma.financialTransaction.aggregate({
      where: {
        transactedAt: { gte: prevMonthStart, lte: prevMonthEnd },
        type: "income",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
    });

    const prevMonthExpenses = await prisma.financialTransaction.aggregate({
      where: {
        transactedAt: { gte: prevMonthStart, lte: prevMonthEnd },
        type: "expense",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
    });

    const todayExpenses = await prisma.financialTransaction.aggregate({
      where: {
        transactedAt: { gte: startOfDay(now), lte: endOfDay(now) },
        type: "expense",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
      _count: true,
    });

    const categoryBreakdown = await prisma.financialTransaction.groupBy({
      by: ["category"],
      where: {
        transactedAt: { gte: monthStart, lte: monthEnd },
        type: "expense",
        ...ACTIVE_TRANSACTION_FILTER,
      },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "asc" } },
    });

    const recentTransactions = await prisma.financialTransaction.findMany({
      where: ACTIVE_TRANSACTION_FILTER,
      orderBy: { transactedAt: "desc" },
      take: 8,
      select: {
        id: true,
        transactedAt: true,
        amount: true,
        description: true,
        category: true,
        type: true,
        status: true,
        reviewState: true,
        taxAmount: true,
        tipAmount: true,
        account: { select: { name: true, icon: true } },
        merchantRef: { select: { id: true, name: true } },
      },
    });

    const recurringTransactions = await prisma.recurringTransaction.findMany({
      where: { isActive: true },
      orderBy: { nextDueDate: "asc" },
      take: 8,
    });

    const savingsGoals = await prisma.savingsGoal.findMany({
      where: { isCompleted: false },
      orderBy: { createdAt: "asc" },
      take: 8,
    });

    const last7DaysSpending: Array<{
      date: string;
      fullDate: string;
      amount: number;
    }> = [];
    for (let i = 0; i < 7; i += 1) {
      const day = subDays(now, i);
      const result = await prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: startOfDay(day), lte: endOfDay(day) },
          type: "expense",
          ...ACTIVE_TRANSACTION_FILTER,
        },
        _sum: { amount: true },
      });

      last7DaysSpending.push({
        date: format(day, "EEE"),
        fullDate: format(day, "yyyy-MM-dd"),
        amount: Math.abs(result._sum.amount || 0),
      });
    }

    const pendingReviews = await prisma.financeReviewItem.count({ where: { status: "pending" } });
    const upcomingPayments = await prisma.upcomingPayment.findMany({
      where: {
        dueDate: { gte: now },
        status: { in: ["detected", "confirmed"] },
      },
      include: { merchant: true },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    const reportSummary = await getFinanceReportSummary(currentMonth);
    const pendingSignals = await prisma.financeSignal.count({
      where: { promotionState: "pending_review" },
    });
    const ignoredSignals = await prisma.financeSignal.count({
      where: { promotionState: { in: ["ignored", "dismissed"] } },
    });
    const provisionalSignals = await prisma.financeSignal.count({
      where: { settlementStatus: "provisional" },
    });
    const failedSignals = await prisma.financeSignal.count({
      where: { settlementStatus: { in: ["failed", "rejected"] } },
    });
    const totalSources = await prisma.financeSource.count();
    const trustedSources = await prisma.financeSource.count({
      where: { trustLevel: "trusted" },
    });
    const ignoredSources = await prisma.financeSource.count({
      where: { defaultDisposition: "always_ignore" },
    });
    const mailboxConnection = await prisma.googleMailboxConnection.findUnique({
      where: { id: "default" },
    });
    const errorDocuments = await prisma.financeDocument.count({
      where: { status: "error" },
    });
    const ignoredDocuments = await prisma.financeDocument.count({
      where: { classification: "ignored" },
    });

    const budget = await prisma.budget.findUnique({
      where: {
        month_year: {
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
        },
      },
      include: { items: { include: { category: true } } },
    });

    const netWorth = accounts.reduce((sum, account) => {
      if (account.accountType === "credit_card" || account.accountType === "loan") {
        return sum - Math.abs(account.balance);
      }
      return sum + account.balance;
    }, 0);

    const totalDebt = accounts
      .filter((account) => account.accountType === "credit_card" || account.accountType === "loan")
      .reduce((sum, account) => sum + Math.abs(account.balance), 0);

    const income = Math.abs(thisMonthIncome._sum.amount || 0);
    const expenses = Math.abs(thisMonthExpenses._sum.amount || 0);
    const prevIncome = Math.abs(prevMonthIncome._sum.amount || 0);
    const prevExpenses = Math.abs(prevMonthExpenses._sum.amount || 0);

    const totalBudgeted =
      budget?.items
        .filter((item) => item.category.type === "expense")
        .reduce((sum, item) => sum + item.planned, 0) || 0;

    return NextResponse.json({
      accounts,
      overview: {
        netWorth,
        totalDebt,
        income,
        expenses,
        savings: income - expenses,
        todaySpent: Math.abs(todayExpenses._sum.amount || 0),
        todayTransactions: todayExpenses._count,
        pendingReviews,
        pendingSignals,
        ignoredSignals,
        provisionalSignals,
        failedSignals,
      },
      comparison: {
        incomeChange: prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0,
        expenseChange:
          prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : 0,
      },
      budget: {
        totalBudgeted,
        totalSpent: expenses,
        remaining: totalBudgeted - expenses,
        percentUsed: totalBudgeted > 0 ? Math.round((expenses / totalBudgeted) * 100) : 0,
      },
      categoryBreakdown: categoryBreakdown.map((category) => ({
        category: category.category,
        amount: Math.abs(category._sum.amount || 0),
        count: category._count,
      })),
      recentTransactions,
      recurringTransactions,
      savingsGoals,
      dailySpending: last7DaysSpending.reverse(),
      upcomingPayments: upcomingPayments.map((payment) => ({
        id: payment.id,
        description: payment.description,
        amount: payment.amount,
        dueDate: payment.dueDate,
        status: payment.status,
        merchantName: payment.merchant?.name || null,
      })),
      topMerchants: reportSummary.topMerchants,
      budgetRisk: reportSummary.budgetRisk,
      possibleSavings: reportSummary.possibleSavings,
      sourceCounts: {
        total: totalSources,
        trusted: trustedSources,
        ignored: ignoredSources,
        learning: Math.max(totalSources - trustedSources - ignoredSources, 0),
        provisionalSignals,
        failedSignals,
      },
      pendingCounts: {
        reviews: pendingReviews,
        signals: pendingSignals,
        upcomingBills: upcomingPayments.length,
      },
      ignoredCounts: {
        signals: ignoredSignals,
        documents: ignoredDocuments,
      },
      backfillCoverage: {
        oldestSyncedDate: null,
        lastBackfillAt: mailboxConnection?.lastBackfillAt || null,
        lastSyncAt: mailboxConnection?.lastSyncAt || null,
        documentsByMonth: [],
        errorCount: errorDocuments,
      },
    });
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    return NextResponse.json({ error: "Failed to fetch financial summary" }, { status: 500 });
  }
}
