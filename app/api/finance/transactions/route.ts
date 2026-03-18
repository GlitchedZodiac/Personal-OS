import { NextRequest, NextResponse } from "next/server";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ingestFinanceCandidate } from "@/lib/finance/ingestion";
import { parseLocalDate } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const range = searchParams.get("range") || "30";
    const month = searchParams.get("month");
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let dateStart: Date;
    let dateEnd: Date;

    if (month) {
      const [year, mo] = month.split("-").map(Number);
      const monthDate = new Date(year, mo - 1, 1);
      dateStart = startOfMonth(monthDate);
      dateEnd = endOfMonth(monthDate);
    } else {
      const today = searchParams.get("date")
        ? parseLocalDate(searchParams.get("date")!)
        : new Date();
      dateEnd = endOfDay(today);
      dateStart = startOfDay(subDays(today, parseInt(range, 10)));
    }

    const where: Record<string, unknown> = {
      transactedAt: { gte: dateStart, lte: dateEnd },
    };
    if (accountId) where.accountId = accountId;
    if (category) where.category = category;
    if (type) where.type = type;
    if (status) where.status = status;

    const [transactions, total, incomeAgg, expenseAgg] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        orderBy: { transactedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          account: { select: { name: true, icon: true, color: true } },
          merchantRef: { select: { id: true, name: true, normalizedName: true } },
          sourceDocument: {
            select: { id: true, source: true, documentType: true, sender: true, filename: true },
          },
        },
      }),
      prisma.financialTransaction.count({ where }),
      prisma.financialTransaction.aggregate({
        where: { ...where, type: "income", excludedFromBudget: false, status: { notIn: ["duplicate", "ignored"] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.financialTransaction.aggregate({
        where: { ...where, type: "expense", excludedFromBudget: false, status: { notIn: ["duplicate", "ignored"] } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      income: {
        total: Math.abs(incomeAgg._sum.amount || 0),
        count: incomeAgg._count,
      },
      expenses: {
        total: Math.abs(expenseAgg._sum.amount || 0),
        count: expenseAgg._count,
      },
      pagination: { limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await ingestFinanceCandidate({
      accountId: body.accountId,
      transactedAt: body.transactedAt ? new Date(body.transactedAt) : new Date(),
      amount: typeof body.amount === "number" ? Math.abs(body.amount) : Number(body.amount),
      currency: body.currency || "COP",
      description: body.description,
      category: body.category,
      subcategory: body.subcategory ?? null,
      type: body.type,
      isRecurring: body.isRecurring ?? false,
      merchant: body.merchant ?? body.description,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      source: body.source || "manual",
      tags: typeof body.tags === "string" ? body.tags.split(",").map((tag: string) => tag.trim()) : body.tags,
      deductible: body.deductible ?? false,
      excludedFromBudget: body.excludedFromBudget ?? false,
      subtotalAmount: body.subtotalAmount ?? null,
      taxAmount: body.taxAmount ?? null,
      tipAmount: body.tipAmount ?? null,
      confidence: body.confidence ?? 1,
    });

    return NextResponse.json(result.transaction, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const existing = await prisma.financialTransaction.findUnique({
      where: { id },
      select: { amount: true, accountId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const nextAmount =
      updates.amount !== undefined
        ? updates.type === "expense"
          ? -Math.abs(Number(updates.amount))
          : updates.type === "income"
          ? Math.abs(Number(updates.amount))
          : Number(updates.amount)
        : undefined;

    const transaction = await prisma.financialTransaction.update({
      where: { id },
      data: {
        ...updates,
        amount: nextAmount,
        transactedAt: updates.transactedAt ? new Date(updates.transactedAt) : undefined,
        reviewState: updates.reviewState || "resolved",
      },
    });

    if (nextAmount !== undefined && nextAmount !== existing.amount) {
      await prisma.financialAccount.update({
        where: { id: existing.accountId },
        data: { balance: { increment: nextAmount - existing.amount } },
      });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 });
    }

    const tx = await prisma.financialTransaction.findUnique({
      where: { id },
      select: { amount: true, accountId: true },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await prisma.financialTransaction.delete({ where: { id } });
    await prisma.financialAccount.update({
      where: { id: tx.accountId },
      data: { balance: { decrement: tx.amount } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json({ error: "Failed to delete transaction" }, { status: 500 });
  }
}
