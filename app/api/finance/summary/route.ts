import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  subDays,
  format,
} from "date-fns";

// GET /api/finance/summary — financial dashboard data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // "2026-02"

    const now = new Date();
    const currentMonth = monthParam
      ? new Date(parseInt(monthParam.split("-")[0]), parseInt(monthParam.split("-")[1]) - 1)
      : now;
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const prevMonthStart = startOfMonth(subMonths(currentMonth, 1));
    const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));

    const [
      accounts,
      thisMonthIncome,
      thisMonthExpenses,
      prevMonthIncome,
      prevMonthExpenses,
      todayExpenses,
      categoryBreakdown,
      recentTransactions,
      recurringTransactions,
      savingsGoals,
      last7DaysSpending,
    ] = await Promise.all([
      // Active accounts
      prisma.financialAccount.findMany({
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
      }),

      // This month income
      prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: monthStart, lte: monthEnd },
          type: "income",
        },
        _sum: { amount: true },
        _count: true,
      }),

      // This month expenses
      prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: monthStart, lte: monthEnd },
          type: "expense",
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Previous month income (for comparison)
      prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: prevMonthStart, lte: prevMonthEnd },
          type: "income",
        },
        _sum: { amount: true },
      }),

      // Previous month expenses (for comparison)
      prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: prevMonthStart, lte: prevMonthEnd },
          type: "expense",
        },
        _sum: { amount: true },
      }),

      // Today's expenses
      prisma.financialTransaction.aggregate({
        where: {
          transactedAt: { gte: startOfDay(now), lte: endOfDay(now) },
          type: "expense",
        },
        _sum: { amount: true },
        _count: true,
      }),

      // Category breakdown for this month (expenses)
      prisma.financialTransaction.groupBy({
        by: ["category"],
        where: {
          transactedAt: { gte: monthStart, lte: monthEnd },
          type: "expense",
        },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: "asc" } }, // most negative first
      }),

      // Recent transactions (last 10)
      prisma.financialTransaction.findMany({
        orderBy: { transactedAt: "desc" },
        take: 10,
        select: {
          id: true,
          transactedAt: true,
          amount: true,
          description: true,
          category: true,
          type: true,
          account: { select: { name: true, icon: true } },
        },
      }),

      // Recurring transactions
      prisma.recurringTransaction.findMany({
        where: { isActive: true },
        orderBy: { nextDueDate: "asc" },
      }),

      // Savings goals
      prisma.savingsGoal.findMany({
        where: { isCompleted: false },
        orderBy: { createdAt: "asc" },
      }),

      // Last 7 days daily spending
      Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const day = subDays(now, i);
          return prisma.financialTransaction
            .aggregate({
              where: {
                transactedAt: { gte: startOfDay(day), lte: endOfDay(day) },
                type: "expense",
              },
              _sum: { amount: true },
            })
            .then((r) => ({
              date: format(day, "EEE"),
              fullDate: format(day, "yyyy-MM-dd"),
              amount: Math.abs(r._sum.amount || 0),
            }));
        })
      ),
    ]);

    // Calculate net worth
    const netWorth = accounts.reduce((sum, a) => {
      if (a.accountType === "credit_card" || a.accountType === "loan") {
        return sum - Math.abs(a.balance);
      }
      return sum + a.balance;
    }, 0);

    const totalDebt = accounts
      .filter((a) => a.accountType === "credit_card" || a.accountType === "loan")
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const income = Math.abs(thisMonthIncome._sum.amount || 0);
    const expenses = Math.abs(thisMonthExpenses._sum.amount || 0);
    const prevIncome = Math.abs(prevMonthIncome._sum.amount || 0);
    const prevExpenses = Math.abs(prevMonthExpenses._sum.amount || 0);

    // Get current month budget
    const budget = await prisma.budget.findUnique({
      where: {
        month_year: {
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
        },
      },
      include: {
        items: {
          include: { category: true },
        },
      },
    });

    const totalBudgeted = budget?.items
      .filter((i) => i.category.type === "expense")
      .reduce((sum, i) => sum + i.planned, 0) || 0;

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
      },
      comparison: {
        incomeChange: prevIncome > 0 ? Math.round(((income - prevIncome) / prevIncome) * 100) : 0,
        expenseChange: prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 100) : 0,
      },
      budget: {
        totalBudgeted,
        totalSpent: expenses,
        remaining: totalBudgeted - expenses,
        percentUsed: totalBudgeted > 0 ? Math.round((expenses / totalBudgeted) * 100) : 0,
      },
      categoryBreakdown: categoryBreakdown.map((c) => ({
        category: c.category,
        amount: Math.abs(c._sum.amount || 0),
        count: c._count,
      })),
      recentTransactions,
      recurringTransactions,
      savingsGoals,
      dailySpending: last7DaysSpending.reverse(), // oldest first
    });
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial summary" },
      { status: 500 }
    );
  }
}
