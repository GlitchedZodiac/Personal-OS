import { NextRequest, NextResponse } from "next/server";
import { endOfDay, endOfMonth, startOfDay, startOfMonth, subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ingestFinanceCandidate } from "@/lib/finance/ingestion";
import {
  assignTransactionToPocket,
  ensurePaycheckAllocationRunForTransaction,
  ensurePrimaryCashAccount,
  removePocketEffectsForTransaction,
  syncPocketEffectsForTransactionUpdate,
} from "@/lib/finance/planning";
import { parseLocalDate } from "@/lib/utils";

const POSTED_DOCUMENT_CLASSES = [
  "expense_receipt",
  "income_notice",
  "refund_notice",
  "transfer_notice",
  "subscription_notice",
];

function getDateRange(searchParams: URLSearchParams) {
  const range = searchParams.get("range") || "30";
  const month = searchParams.get("month");

  if (month) {
    const [year, mo] = month.split("-").map(Number);
    const monthDate = new Date(year, mo - 1, 1);
    return {
      dateStart: startOfMonth(monthDate),
      dateEnd: endOfMonth(monthDate),
    };
  }

  const today = searchParams.get("date")
    ? parseLocalDate(searchParams.get("date")!)
    : new Date();

  return {
    dateStart: startOfDay(subDays(today, parseInt(range, 10))),
    dateEnd: endOfDay(today),
  };
}

function mapPendingSignal(signal: {
  id: string;
  transactedAt: Date | null;
  dueDate: Date | null;
  amount: number | null;
  description: string;
  category: string | null;
  subcategory: string | null;
  type: string | null;
  kind: string;
  promotionState: string;
  confidence: number | null;
  messageSubtype: string;
  settlementStatus: string;
  sourceAmount: number | null;
  sourceCurrency: string | null;
  fxRate: number | null;
  requiresCurrencyReview: boolean;
  source: { label: string } | null;
  document: {
    classification: string;
    messageSubtype: string;
    sender: string | null;
    source: string;
    sourceKey: string | null;
  };
}) {
  return {
    id: signal.id,
    recordType: "signal",
    accountId: null,
    transactedAt: (signal.transactedAt || signal.dueDate || new Date()).toISOString(),
    amount:
      signal.amount == null
        ? null
        : signal.type === "income"
        ? Math.abs(signal.amount)
        : signal.type === "expense"
        ? -Math.abs(signal.amount)
        : signal.amount,
    description: signal.description,
    category: signal.category || "other",
    subcategory: signal.subcategory,
    type: signal.type || "expense",
    isRecurring: signal.kind === "subscription",
    merchant: signal.source?.label || signal.document.sender || null,
    notes: null,
    source: signal.document.source,
    status: signal.promotionState,
    reviewState: "pending_review",
    confidence: signal.confidence,
    messageSubtype: signal.messageSubtype,
    settlementStatus: signal.settlementStatus,
    sourceAmount: signal.sourceAmount,
    sourceCurrency: signal.sourceCurrency,
    fxRate: signal.fxRate,
    requiresCurrencyReview: signal.requiresCurrencyReview,
    signalKind: signal.kind,
    documentClassification: signal.document.classification,
    account: { name: "Finance Inbox", icon: "Inbox", color: null },
    sourceDocument: {
      id: signal.id,
      source: signal.document.source,
      documentType: "email",
      sender: signal.document.sender,
      filename: null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const status = searchParams.get("status") || "posted";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const { dateStart, dateEnd } = getDateRange(searchParams);

    if (status === "pending" || status === "ignored") {
      const signalWhere = {
        transactedAt: { gte: dateStart, lte: dateEnd },
        category: category || undefined,
        type: type || undefined,
        promotionState:
          status === "pending"
            ? "pending_review"
            : { in: ["ignored", "dismissed"] },
        settlementStatus:
          status === "pending"
            ? { notIn: ["ignored"] }
            : status === "ignored"
            ? { in: ["ignored"] }
            : undefined,
      };

      const [signals, total] = await Promise.all([
        prisma.financeSignal.findMany({
          where: signalWhere,
          orderBy: [{ transactedAt: "desc" }, { createdAt: "desc" }],
          take: limit,
          skip: offset,
          include: {
            source: { select: { label: true } },
            document: {
              select: {
                classification: true,
                messageSubtype: true,
                sender: true,
                source: true,
                sourceKey: true,
              },
            },
          },
        }),
        prisma.financeSignal.count({ where: signalWhere }),
      ]);

      const mapped = signals.map(mapPendingSignal);
      const incomeTotal = mapped
        .filter((item) => item.type === "income")
        .reduce((sum, item) => sum + Math.abs(item.amount ?? 0), 0);
      const expenseTotal = mapped
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + Math.abs(item.amount ?? 0), 0);

      return NextResponse.json({
        transactions: mapped,
        total,
        income: { total: incomeTotal, count: mapped.filter((item) => item.type === "income").length },
        expenses: {
          total: expenseTotal,
          count: mapped.filter((item) => item.type === "expense").length,
        },
        pagination: { limit, offset, hasMore: offset + limit < total },
      });
    }

    const where: Record<string, unknown> = {
      transactedAt: { gte: dateStart, lte: dateEnd },
      status: status === "all" ? undefined : status,
      reviewState: "resolved",
      settlementStatus: { notIn: ["provisional", "failed", "rejected", "ignored"] },
      OR: [
        { sourceDocumentId: null },
        {
          sourceDocument: {
            classification: { in: POSTED_DOCUMENT_CLASSES },
          },
        },
      ],
    };

    if (accountId) where.accountId = accountId;
    if (category) where.category = category;
    if (type) where.type = type;

    const [transactions, total, incomeAgg, expenseAgg] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        orderBy: { transactedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          account: { select: { name: true, icon: true, color: true } },
          pocket: { select: { id: true, name: true, slug: true, color: true } },
          merchantRef: { select: { id: true, name: true, normalizedName: true } },
          sourceDocument: {
            select: {
              id: true,
              source: true,
              documentType: true,
              sender: true,
              filename: true,
              classification: true,
              messageSubtype: true,
            },
          },
        },
      }),
      prisma.financialTransaction.count({ where }),
      prisma.financialTransaction.aggregate({
        where: { ...where, type: "income", excludedFromBudget: false },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.financialTransaction.aggregate({
        where: { ...where, type: "expense", excludedFromBudget: false },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((transaction) => ({
        ...transaction,
        recordType: "transaction",
        documentClassification: transaction.sourceDocument?.classification || null,
        messageSubtype: transaction.sourceDocument?.messageSubtype || null,
      })),
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
    const primaryAccount = await ensurePrimaryCashAccount();
    const resolvedAccountId = body.accountId || primaryAccount.id;
    const cashImpactType =
      body.cashImpactType ||
      (resolvedAccountId === primaryAccount.id && body.type === "expense"
        ? "cash"
        : "non_cash");
    const needsCategorization =
      body.needsCategorization ??
      (body.type === "expense" && cashImpactType === "cash" && !body.pocketId);

    const result = await ingestFinanceCandidate({
      accountId: resolvedAccountId,
      transactedAt: body.transactedAt ? new Date(body.transactedAt) : new Date(),
      amount: typeof body.amount === "number" ? Math.abs(body.amount) : Number(body.amount),
      currency: body.currency || "COP",
      description: body.description,
      category: body.category,
      subcategory: body.subcategory ?? null,
      type: body.type,
      pocketId: body.pocketId ?? null,
      needsCategorization,
      instrumentType: body.instrumentType ?? null,
      instrumentLast4: body.instrumentLast4 ?? null,
      cashImpactType,
      isRecurring: body.isRecurring ?? false,
      merchant: body.merchant ?? body.description,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      source: body.source || "manual",
      tags:
        typeof body.tags === "string"
          ? body.tags.split(",").map((tag: string) => tag.trim())
          : body.tags,
      deductible: body.deductible ?? false,
      excludedFromBudget: body.excludedFromBudget ?? false,
      subtotalAmount: body.subtotalAmount ?? null,
      taxAmount: body.taxAmount ?? null,
      tipAmount: body.tipAmount ?? null,
      confidence: body.confidence ?? 1,
      promotionPreference: "manual_post",
      signalKind:
        body.type === "income" ? "income" : body.type === "transfer" ? "transfer" : "purchase",
      documentClassification:
        body.type === "income" ? "income_notice" : body.type === "transfer" ? "transfer_notice" : "expense_receipt",
      document: {
        source: "manual_entry",
        externalId: `manual:${Date.now()}`,
        documentType: "manual_entry",
        contentText: body.notes || body.description,
        receivedAt: body.transactedAt ? new Date(body.transactedAt) : new Date(),
        status: "processed",
      },
    });

    if (result.transaction) {
      if (
        result.transaction.type === "expense" &&
        result.transaction.cashImpactType === "cash" &&
        result.transaction.pocketId
      ) {
        await assignTransactionToPocket({
          transactionId: result.transaction.id,
          pocketId: result.transaction.pocketId,
          category: result.transaction.category,
          subcategory: result.transaction.subcategory,
          notes: result.transaction.notes,
        });
      }

      await ensurePaycheckAllocationRunForTransaction({
        transactionId: result.transaction.id,
        grossAmount: Math.abs(result.transaction.amount),
        category: result.transaction.category,
        subcategory: result.transaction.subcategory,
        description: result.transaction.description,
        source: result.transaction.source,
        type: result.transaction.type,
      });
    }

    return NextResponse.json(
      {
        transaction: result.transaction,
        signal: result.signal,
      },
      { status: 201 }
    );
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
      select: {
        amount: true,
        accountId: true,
        pocketId: true,
        cashImpactType: true,
        type: true,
        transactedAt: true,
        notes: true,
      },
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
    const nextType = updates.type || existing.type;
    const nextCashImpactType = updates.cashImpactType || existing.cashImpactType;
    const nextPocketId =
      updates.pocketId !== undefined ? updates.pocketId : existing.pocketId;
    const nextNeedsCategorization =
      updates.needsCategorization ??
      (nextType === "expense" && nextCashImpactType === "cash" && !nextPocketId);

    const transaction = await prisma.financialTransaction.update({
      where: { id },
      data: {
        ...updates,
        amount: nextAmount,
        pocketId: nextPocketId,
        cashImpactType: nextCashImpactType,
        needsCategorization: nextNeedsCategorization,
        transactedAt: updates.transactedAt ? new Date(updates.transactedAt) : undefined,
        reviewState: updates.reviewState || "resolved",
        status: updates.status || "posted",
      },
    });

    if (nextAmount !== undefined && nextAmount !== existing.amount) {
      await prisma.financialAccount.update({
        where: { id: existing.accountId },
        data: { balance: { increment: nextAmount - existing.amount } },
      });
    }

    await syncPocketEffectsForTransactionUpdate({
      transactionId: transaction.id,
      previousAmount: existing.amount,
      previousPocketId: existing.pocketId,
      previousCashImpactType: existing.cashImpactType,
      previousType: existing.type,
      nextAmount: transaction.amount,
      nextPocketId: transaction.pocketId,
      nextCashImpactType: transaction.cashImpactType,
      nextType: transaction.type,
      transactedAt: transaction.transactedAt,
      notes: transaction.notes,
    });

    await ensurePaycheckAllocationRunForTransaction({
      transactionId: transaction.id,
      grossAmount: Math.abs(transaction.amount),
      category: transaction.category,
      subcategory: transaction.subcategory,
      description: transaction.description,
      source: transaction.source,
      type: transaction.type,
    });

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

    await removePocketEffectsForTransaction(id);
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
