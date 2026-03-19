import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";

const DEFAULT_CATEGORIES: Prisma.BudgetCategoryCreateManyInput[] = [
  { name: "Housing", icon: "🏠", color: "#3b82f6", type: "expense", sortOrder: 1 },
  { name: "Food & Groceries", icon: "🛒", color: "#22c55e", type: "expense", sortOrder: 2 },
  { name: "Dining Out", icon: "🍽️", color: "#f59e0b", type: "expense", sortOrder: 3 },
  { name: "Transport", icon: "🚗", color: "#8b5cf6", type: "expense", sortOrder: 4 },
  { name: "Utilities", icon: "💡", color: "#06b6d4", type: "expense", sortOrder: 5 },
  { name: "Entertainment", icon: "🎬", color: "#ec4899", type: "expense", sortOrder: 6 },
  { name: "Health & Fitness", icon: "💪", color: "#ef4444", type: "expense", sortOrder: 7 },
  { name: "Shopping", icon: "🛍️", color: "#f97316", type: "expense", sortOrder: 8 },
  { name: "Education", icon: "📚", color: "#14b8a6", type: "expense", sortOrder: 9 },
  { name: "Personal Care", icon: "✨", color: "#a855f7", type: "expense", sortOrder: 10 },
  { name: "Insurance", icon: "🛡️", color: "#64748b", type: "expense", sortOrder: 11 },
  { name: "Debt Payments", icon: "💳", color: "#dc2626", type: "expense", sortOrder: 12 },
  { name: "Savings", icon: "🏦", color: "#059669", type: "savings", sortOrder: 13 },
  { name: "Salary", icon: "💰", color: "#16a34a", type: "income", sortOrder: 14 },
  { name: "Freelance", icon: "💻", color: "#2563eb", type: "income", sortOrder: 15 },
  { name: "Other Income", icon: "📈", color: "#65a30d", type: "income", sortOrder: 16 },
  { name: "Other", icon: "📦", color: "#94a3b8", type: "expense", sortOrder: 99 },
] as const;

const BUDGET_NAME_TO_TX_CATEGORY: Record<string, string[]> = {
  Housing: ["housing"],
  "Food & Groceries": ["food"],
  "Dining Out": ["dining_out"],
  Transport: ["transport"],
  Utilities: ["utilities"],
  Entertainment: ["entertainment"],
  "Health & Fitness": ["health"],
  Shopping: ["shopping"],
  Education: ["education"],
  "Personal Care": ["personal"],
  Insurance: ["insurance"],
  "Debt Payments": ["debt_payment"],
  Savings: ["savings"],
  Salary: ["income"],
  Freelance: ["income"],
  "Other Income": ["income"],
  Other: ["other"],
};

async function ensureCategories() {
  const count = await prisma.budgetCategory.count();
  if (count === 0) {
    await prisma.budgetCategory.createMany({ data: DEFAULT_CATEGORIES });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const listAll = searchParams.get("list") === "true";

    await ensureCategories();

    if (listAll) {
      const [categories, budgets] = await Promise.all([
        prisma.budgetCategory.findMany({ orderBy: { sortOrder: "asc" } }),
        prisma.budget.findMany({
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 12,
        }),
      ]);
      return NextResponse.json({ categories, budgets });
    }

    const now = new Date();
    const month = monthParam ? parseInt(monthParam.split("-")[1], 10) : now.getMonth() + 1;
    const year = monthParam ? parseInt(monthParam.split("-")[0], 10) : now.getFullYear();

    let budget = await prisma.budget.findUnique({
      where: { month_year: { month, year } },
      include: {
        items: {
          include: { category: true },
          orderBy: { category: { sortOrder: "asc" } },
        },
      },
    });

    if (!budget) {
      budget = await prisma.budget.create({
        data: {
          name: `${new Date(year, month - 1).toLocaleDateString("en", {
            month: "long",
            year: "numeric",
          })}`,
          month,
          year,
        },
        include: {
          items: {
            include: { category: true },
            orderBy: { category: { sortOrder: "asc" } },
          },
        },
      });
    }

    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));

    const [transactions, categories, merchants] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          transactedAt: { gte: monthStart, lte: monthEnd },
          status: "posted",
          reviewState: "resolved",
          excludedFromBudget: false,
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
          amount: true,
          category: true,
          merchantId: true,
          merchantRef: { select: { id: true, name: true } },
        },
      }),
      prisma.budgetCategory.findMany({
        orderBy: { sortOrder: "asc" },
      }),
      prisma.merchant.findMany({
        orderBy: { totalSpent: "desc" },
        take: 12,
      }),
    ]);

    const obligationOccurrences = await prisma.scheduledObligationOccurrence.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      include: {
        obligation: true,
        transaction: {
          select: {
            id: true,
            amount: true,
            transactedAt: true,
          },
        },
      },
    });

    const budgetWithActuals = categories.map((category) => {
      const budgetItem = budget!.items.find((item) => item.categoryId === category.id);
      const matchingCategories = BUDGET_NAME_TO_TX_CATEGORY[category.name] || [category.name.toLowerCase()];
      const actual = transactions
        .filter((tx) => matchingCategories.includes(tx.category))
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      const transactionCount = transactions.filter((tx) => matchingCategories.includes(tx.category)).length;
      const planned = budgetItem?.planned || 0;
      const percentUsed = planned > 0 ? Math.round((actual / planned) * 100) : 0;

      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryIcon: category.icon,
        categoryColor: category.color,
        categoryType: category.type,
        isTaxRelevant: category.isTaxRelevant,
        planned,
        actual,
        transactionCount,
        isFixed: budgetItem?.isFixed || false,
        rolloverEnabled: budgetItem?.rolloverEnabled || false,
        difference: planned - actual,
        percentUsed,
        status: percentUsed > 100 ? "off_track" : percentUsed > 85 ? "warning" : "on_track",
      };
    });

    const totalPlanned = budgetWithActuals
      .filter((item) => item.categoryType === "expense")
      .reduce((sum, item) => sum + item.planned, 0);
    const totalActual = budgetWithActuals
      .filter((item) => item.categoryType === "expense")
      .reduce((sum, item) => sum + item.actual, 0);
    const totalIncomePlanned = budgetWithActuals
      .filter((item) => item.categoryType === "income")
      .reduce((sum, item) => sum + item.planned, 0);
    const totalIncomeActual = budgetWithActuals
      .filter((item) => item.categoryType === "income")
      .reduce((sum, item) => sum + item.actual, 0);

    return NextResponse.json({
      budget: {
        id: budget.id,
        name: budget.name,
        month,
        year,
        totalIncome: budget.totalIncome,
        totalBudget: budget.totalBudget,
        rolloverMode: budget.rolloverMode,
      },
      categories: budgetWithActuals,
      summary: {
        totalPlanned,
        totalActual,
        totalIncomePlanned,
        totalIncomeActual,
        remaining: totalPlanned - totalActual,
        percentUsed: totalPlanned ? Math.round((totalActual / totalPlanned) * 100) : 0,
        surplus: totalIncomeActual - totalActual,
      },
      merchantSummary: merchants.map((merchant) => ({
        id: merchant.id,
        name: merchant.name,
        totalSpent: merchant.totalSpent,
        transactionCount: merchant.transactionCount,
      })),
      plannedObligations: obligationOccurrences.map((occurrence) => ({
        id: occurrence.id,
        obligationId: occurrence.obligationId,
        name: occurrence.obligation.name,
        category: occurrence.obligation.category,
        subcategory: occurrence.obligation.subcategory,
        frequency: occurrence.obligation.frequency,
        dueDate: occurrence.dueDate,
        expectedAmount: occurrence.expectedAmount,
        status: occurrence.status,
        paidAt: occurrence.paidAt,
        transactionId: occurrence.transactionId,
        notes: occurrence.notes || occurrence.obligation.notes || null,
      })),
      planning: {
        plannedObligationsTotal: obligationOccurrences.reduce(
          (sum, occurrence) => sum + Math.abs(occurrence.expectedAmount || 0),
          0
        ),
        dueObligationCount: obligationOccurrences.filter((occurrence) =>
          ["due", "overdue"].includes(occurrence.status)
        ).length,
      },
    });
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, year, items, totalIncome, totalBudget, rolloverMode = "none" } = body;

    if (!month || !year) {
      return NextResponse.json({ error: "Month and year are required" }, { status: 400 });
    }

    await ensureCategories();

    const budget = await prisma.budget.upsert({
      where: { month_year: { month, year } },
      create: {
        name: `${new Date(year, month - 1).toLocaleDateString("en", {
          month: "long",
          year: "numeric",
        })}`,
        month,
        year,
        totalIncome: totalIncome || 0,
        totalBudget: totalBudget || 0,
        rolloverMode,
      },
      update: {
        totalIncome: totalIncome ?? undefined,
        totalBudget: totalBudget ?? undefined,
        rolloverMode,
      },
    });

    if (Array.isArray(items)) {
      for (const item of items) {
        await prisma.budgetItem.upsert({
          where: {
            budgetId_categoryId: { budgetId: budget.id, categoryId: item.categoryId },
          },
          create: {
            budgetId: budget.id,
            categoryId: item.categoryId,
            planned: item.planned || 0,
            isFixed: item.isFixed || false,
            rolloverEnabled: item.rolloverEnabled || false,
            notes: item.notes || null,
          },
          update: {
            planned: item.planned,
            isFixed: item.isFixed ?? undefined,
            rolloverEnabled: item.rolloverEnabled ?? undefined,
            notes: item.notes ?? undefined,
          },
        });
      }
    }

    return NextResponse.json({ success: true, budgetId: budget.id });
  } catch (error) {
    console.error("Error saving budget:", error);
    return NextResponse.json({ error: "Failed to save budget" }, { status: 500 });
  }
}
