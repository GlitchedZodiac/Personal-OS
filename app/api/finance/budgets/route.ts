import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";

// Default budget categories to seed when first budget is created
const DEFAULT_CATEGORIES = [
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
];

async function ensureCategories() {
  const count = await prisma.budgetCategory.count();
  if (count === 0) {
    await prisma.budgetCategory.createMany({ data: DEFAULT_CATEGORIES });
  }
}

// GET /api/finance/budgets — get budget for a given month (or current month)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month"); // "2026-02" format
    const listAll = searchParams.get("list") === "true";

    await ensureCategories();

    // List all categories
    if (listAll) {
      const categories = await prisma.budgetCategory.findMany({
        orderBy: { sortOrder: "asc" },
      });
      const budgets = await prisma.budget.findMany({
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 12,
      });
      return NextResponse.json({ categories, budgets });
    }

    const now = new Date();
    const month = monthParam
      ? parseInt(monthParam.split("-")[1])
      : now.getMonth() + 1;
    const year = monthParam
      ? parseInt(monthParam.split("-")[0])
      : now.getFullYear();

    // Get or create the budget for this month
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
      // Create a new budget for this month
      budget = await prisma.budget.create({
        data: {
          name: `${new Date(year, month - 1).toLocaleDateString("en", { month: "long", year: "numeric" })}`,
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

    // Calculate actual spending per category for this month
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));

    const transactions = await prisma.financialTransaction.groupBy({
      by: ["category"],
      where: {
        transactedAt: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
      _count: true,
    });

    // Map category names from transactions to budget category mappings
    const TRANSACTION_TO_BUDGET: Record<string, string> = {
      food: "Food & Groceries",
      dining_out: "Dining Out",
      transport: "Transport",
      housing: "Housing",
      entertainment: "Entertainment",
      health: "Health & Fitness",
      education: "Education",
      shopping: "Shopping",
      personal: "Personal Care",
      insurance: "Insurance",
      debt_payment: "Debt Payments",
      savings: "Savings",
      income: "Salary",
      other: "Other",
    };

    const categoryActuals = new Map<string, { actual: number; count: number }>();
    for (const tx of transactions) {
      const budgetCatName = TRANSACTION_TO_BUDGET[tx.category] || "Other";
      const existing = categoryActuals.get(budgetCatName) || { actual: 0, count: 0 };
      categoryActuals.set(budgetCatName, {
        actual: existing.actual + Math.abs(tx._sum.amount || 0),
        count: existing.count + tx._count,
      });
    }

    // Get all categories for the response
    const categories = await prisma.budgetCategory.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // Build response with planned vs actual per category
    const budgetWithActuals = categories.map((cat) => {
      const item = budget!.items.find((i) => i.categoryId === cat.id);
      const actuals = categoryActuals.get(cat.name) || { actual: 0, count: 0 };

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
        categoryType: cat.type,
        planned: item?.planned || 0,
        actual: actuals.actual,
        transactionCount: actuals.count,
        isFixed: item?.isFixed || false,
        difference: (item?.planned || 0) - actuals.actual,
        percentUsed: item?.planned ? Math.round((actuals.actual / item.planned) * 100) : 0,
      };
    });

    const totalPlanned = budgetWithActuals
      .filter((b) => b.categoryType === "expense")
      .reduce((sum, b) => sum + b.planned, 0);
    const totalActual = budgetWithActuals
      .filter((b) => b.categoryType === "expense")
      .reduce((sum, b) => sum + b.actual, 0);
    const totalIncomePlanned = budgetWithActuals
      .filter((b) => b.categoryType === "income")
      .reduce((sum, b) => sum + b.planned, 0);
    const totalIncomeActual = budgetWithActuals
      .filter((b) => b.categoryType === "income")
      .reduce((sum, b) => sum + b.actual, 0);

    return NextResponse.json({
      budget: {
        id: budget.id,
        name: budget.name,
        month,
        year,
        totalIncome: budget.totalIncome,
        totalBudget: budget.totalBudget,
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
    });
  } catch (error) {
    console.error("Error fetching budget:", error);
    return NextResponse.json({ error: "Failed to fetch budget" }, { status: 500 });
  }
}

// POST /api/finance/budgets — create or update budget items
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { month, year, items, totalIncome, totalBudget } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: "Month and year are required" },
        { status: 400 }
      );
    }

    await ensureCategories();

    // Upsert the budget
    const budget = await prisma.budget.upsert({
      where: { month_year: { month, year } },
      create: {
        name: `${new Date(year, month - 1).toLocaleDateString("en", { month: "long", year: "numeric" })}`,
        month,
        year,
        totalIncome: totalIncome || 0,
        totalBudget: totalBudget || 0,
      },
      update: {
        totalIncome: totalIncome || undefined,
        totalBudget: totalBudget || undefined,
      },
    });

    // Upsert budget items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await prisma.budgetItem.upsert({
          where: {
            budgetId_categoryId: {
              budgetId: budget.id,
              categoryId: item.categoryId,
            },
          },
          create: {
            budgetId: budget.id,
            categoryId: item.categoryId,
            planned: item.planned || 0,
            isFixed: item.isFixed || false,
            notes: item.notes || null,
          },
          update: {
            planned: item.planned,
            isFixed: item.isFixed !== undefined ? item.isFixed : undefined,
            notes: item.notes !== undefined ? item.notes : undefined,
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
