import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assignTransactionToPocket,
  ensureCanonicalCashSetup,
  ensurePrimaryCashAccount,
} from "@/lib/finance/planning";
import { TX_CATEGORY_TO_BUDGET_CATEGORY_NAME } from "@/lib/finance/constants";

export async function GET() {
  try {
    const { primaryAccount, pockets } = await ensureCanonicalCashSetup();

    const [transactions, categories] = await Promise.all([
      prisma.financialTransaction.findMany({
        where: {
          accountId: primaryAccount.id,
          type: "expense",
          cashImpactType: "cash",
          needsCategorization: true,
          status: "posted",
        },
        orderBy: [{ transactedAt: "desc" }, { createdAt: "desc" }],
        include: {
          pocket: true,
          sourceDocument: {
            select: {
              id: true,
              sender: true,
              subject: true,
              source: true,
            },
          },
        },
      }),
      prisma.budgetCategory.findMany({
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: {
          defaultPocket: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
    ]);

    const categoryPocketMap = new Map(
      categories.map((category) => [category.name, category.defaultPocketId || null])
    );

    return NextResponse.json({
      pending: transactions.map((transaction) => ({
        ...transaction,
        suggestedPocketId:
          categoryPocketMap.get(
            TX_CATEGORY_TO_BUDGET_CATEGORY_NAME[transaction.category] || ""
          ) || null,
      })),
      pockets: pockets.map((pocket) => ({
        id: pocket.id,
        name: pocket.name,
        slug: pocket.slug,
        currentBalance: pocket.currentBalance,
        color: pocket.color,
        icon: pocket.icon,
      })),
      categories,
    });
  } catch (error) {
    console.error("Finance pending categorization error:", error);
    return NextResponse.json(
      { error: "Failed to load pending categorization queue" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensurePrimaryCashAccount();
    const body = await request.json();

    if (!body.id || !body.pocketId || !body.category) {
      return NextResponse.json(
        { error: "Transaction id, category, and pocket are required" },
        { status: 400 }
      );
    }

    const transaction = await assignTransactionToPocket({
      transactionId: body.id,
      pocketId: body.pocketId,
      category: body.category,
      subcategory: body.subcategory ?? null,
      notes: body.notes ?? null,
      saveDefaultPocket: Boolean(body.saveDefaultPocket),
    });

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error("Finance pending categorization update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to categorize transaction" },
      { status: 500 }
    );
  }
}
