import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from "date-fns";
import { parseLocalDate } from "@/lib/utils";

// GET /api/finance/transactions — list transactions with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const category = searchParams.get("category");
    const type = searchParams.get("type"); // income, expense, transfer
    const range = searchParams.get("range") || "30"; // days
    const month = searchParams.get("month"); // "2026-02" format
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build date range
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
      dateStart = startOfDay(subDays(today, parseInt(range)));
    }

    // Build where clause
    const where: Record<string, unknown> = {
      transactedAt: { gte: dateStart, lte: dateEnd },
    };
    if (accountId) where.accountId = accountId;
    if (category) where.category = category;
    if (type) where.type = type;

    const [transactions, total, aggregates] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        orderBy: { transactedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          account: { select: { name: true, icon: true, color: true } },
        },
      }),
      prisma.financialTransaction.count({ where }),
      prisma.financialTransaction.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    // Separate income/expenses
    const incomeWhere = { ...where, type: "income" };
    const expenseWhere = { ...where, type: "expense" };

    const [incomeAgg, expenseAgg] = await Promise.all([
      prisma.financialTransaction.aggregate({
        where: incomeWhere,
        _sum: { amount: true },
        _count: true,
      }),
      prisma.financialTransaction.aggregate({
        where: expenseWhere,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      transactions,
      total,
      totalAmount: aggregates._sum.amount || 0,
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
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

// POST /api/finance/transactions — create a transaction
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountId,
      transactedAt,
      amount,
      currency = "COP",
      description,
      category,
      subcategory,
      type,
      isRecurring = false,
      merchant,
      reference,
      notes,
      source = "manual",
      tags,
    } = body;

    if (!accountId || !description || !category || !type || amount === undefined) {
      return NextResponse.json(
        { error: "accountId, description, category, type, and amount are required" },
        { status: 400 }
      );
    }

    // Ensure amount sign matches type
    let normalizedAmount = Math.abs(amount);
    if (type === "expense") normalizedAmount = -normalizedAmount;

    const transaction = await prisma.financialTransaction.create({
      data: {
        accountId,
        transactedAt: transactedAt ? new Date(transactedAt) : new Date(),
        amount: normalizedAmount,
        currency,
        description,
        category,
        subcategory: subcategory ?? null,
        type,
        isRecurring,
        merchant: merchant ?? null,
        reference: reference ?? null,
        notes: notes ?? null,
        source,
        tags: tags ?? null,
      },
    });

    // Update account balance
    await prisma.financialAccount.update({
      where: { id: accountId },
      data: { balance: { increment: normalizedAmount } },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}

// PATCH /api/finance/transactions — update a transaction
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    // Get old transaction to adjust balance
    const oldTx = await prisma.financialTransaction.findUnique({
      where: { id },
      select: { amount: true, accountId: true },
    });

    if (!oldTx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Normalize amount if type changed
    if (updates.amount !== undefined && updates.type) {
      updates.amount = Math.abs(updates.amount);
      if (updates.type === "expense") updates.amount = -updates.amount;
    }

    if (updates.transactedAt) {
      updates.transactedAt = new Date(updates.transactedAt);
    }

    const transaction = await prisma.financialTransaction.update({
      where: { id },
      data: updates,
    });

    // Adjust account balance if amount changed
    if (updates.amount !== undefined) {
      const diff = transaction.amount - oldTx.amount;
      if (diff !== 0) {
        await prisma.financialAccount.update({
          where: { id: oldTx.accountId },
          data: { balance: { increment: diff } },
        });
      }
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

// DELETE /api/finance/transactions — delete a transaction and adjust balance
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    const tx = await prisma.financialTransaction.findUnique({
      where: { id },
      select: { amount: true, accountId: true },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await prisma.financialTransaction.delete({ where: { id } });

    // Reverse the balance effect
    await prisma.financialAccount.update({
      where: { id: tx.accountId },
      data: { balance: { decrement: tx.amount } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
