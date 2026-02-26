import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getFinanceInboxState,
  saveFinanceInboxState,
  type FinanceInboxParsedTransaction,
  type FinanceTransactionType,
} from "@/lib/finance-inbox";
import { FINANCE_CATEGORY_OPTIONS } from "@/lib/finance-email-parser";

type ReviewAction = "approve" | "reject" | "reopen";

function normalizeType(value: unknown, fallback: FinanceTransactionType) {
  if (value === "income" || value === "expense" || value === "transfer") {
    return value;
  }
  return fallback;
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

function normalizeAmount(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0.01, Math.abs(parsed));
}

function applyEdits(
  parsed: FinanceInboxParsedTransaction,
  edits: Record<string, unknown> | null
): FinanceInboxParsedTransaction {
  if (!edits) return parsed;

  const nextType = normalizeType(edits.type, parsed.type);
  const nextCategoryCandidate =
    typeof edits.category === "string" ? edits.category.trim().toLowerCase() : parsed.category;
  const nextCategory = FINANCE_CATEGORY_OPTIONS.includes(
    nextCategoryCandidate as (typeof FINANCE_CATEGORY_OPTIONS)[number]
  )
    ? nextCategoryCandidate
    : parsed.category;

  return {
    ...parsed,
    transactedAt: normalizeDate(edits.transactedAt, parsed.transactedAt),
    amount: normalizeAmount(edits.amount, parsed.amount),
    currency:
      typeof edits.currency === "string" && edits.currency.trim().length > 0
        ? edits.currency.trim().toUpperCase()
        : parsed.currency,
    description:
      typeof edits.description === "string" && edits.description.trim().length > 0
        ? edits.description.trim().slice(0, 180)
        : parsed.description,
    category: nextCategory,
    subcategory:
      typeof edits.subcategory === "string" && edits.subcategory.trim().length > 0
        ? edits.subcategory.trim().toLowerCase()
        : null,
    type: nextType,
    merchant:
      typeof edits.merchant === "string" && edits.merchant.trim().length > 0
        ? edits.merchant.trim().slice(0, 120)
        : parsed.merchant ?? null,
    reference:
      typeof edits.reference === "string" && edits.reference.trim().length > 0
        ? edits.reference.trim().slice(0, 120)
        : parsed.reference ?? null,
    confidence:
      typeof edits.confidence === "number" && Number.isFinite(edits.confidence)
        ? edits.confidence
        : parsed.confidence ?? null,
  };
}

// POST /api/finance/inbox/review - approve/reject/reopen queue items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action as ReviewAction;
    const edits =
      body.edits && typeof body.edits === "object"
        ? (body.edits as Record<string, unknown>)
        : null;
    const accountId =
      typeof body.accountId === "string" && body.accountId.trim().length > 0
        ? body.accountId.trim()
        : null;
    const reviewNotes =
      typeof body.reviewNotes === "string" && body.reviewNotes.trim().length > 0
        ? body.reviewNotes.trim().slice(0, 500)
        : null;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!["approve", "reject", "reopen"].includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: approve, reject, reopen" },
        { status: 400 }
      );
    }

    const { data, state } = await getFinanceInboxState();
    const itemIndex = state.items.findIndex((item) => item.id === id);
    if (itemIndex < 0) {
      return NextResponse.json({ error: "Queue item not found" }, { status: 404 });
    }

    const item = state.items[itemIndex];
    const editedParsed = applyEdits(item.parsed, edits);
    const nowIso = new Date().toISOString();

    if (action === "approve") {
      const effectiveAccountId = accountId || item.accountId;
      if (!effectiveAccountId) {
        return NextResponse.json(
          { error: "accountId is required to approve a transaction" },
          { status: 400 }
        );
      }

      const account = await prisma.financialAccount.findUnique({
        where: { id: effectiveAccountId },
        select: { id: true },
      });
      if (!account) {
        return NextResponse.json(
          { error: "Selected account does not exist" },
          { status: 404 }
        );
      }

      const normalizedAmount =
        editedParsed.type === "expense"
          ? -Math.abs(editedParsed.amount)
          : Math.abs(editedParsed.amount);

      const createdTransaction = await prisma.$transaction(async (tx) => {
        const transaction = await tx.financialTransaction.create({
          data: {
            accountId: effectiveAccountId,
            transactedAt: new Date(editedParsed.transactedAt),
            amount: normalizedAmount,
            currency: editedParsed.currency,
            description: editedParsed.description,
            category: editedParsed.category,
            subcategory: editedParsed.subcategory ?? null,
            type: editedParsed.type,
            merchant: editedParsed.merchant ?? null,
            reference: editedParsed.reference ?? null,
            source: item.source === "gmail" ? "email" : "manual",
            notes: reviewNotes,
          },
        });

        await tx.financialAccount.update({
          where: { id: effectiveAccountId },
          data: {
            balance: { increment: normalizedAmount },
            lastSyncedAt: new Date(),
          },
        });

        return transaction;
      });

      state.items[itemIndex] = {
        ...item,
        status: "approved",
        accountId: effectiveAccountId,
        parsed: editedParsed,
        reviewedAt: nowIso,
        reviewNotes,
        linkedTransactionId: createdTransaction.id,
      };
    } else if (action === "reject") {
      state.items[itemIndex] = {
        ...item,
        status: "rejected",
        accountId: accountId || item.accountId,
        parsed: editedParsed,
        reviewedAt: nowIso,
        reviewNotes,
      };
    } else {
      state.items[itemIndex] = {
        ...item,
        status: "pending",
        accountId: accountId || item.accountId,
        parsed: editedParsed,
        reviewedAt: null,
        reviewNotes: null,
        linkedTransactionId: null,
      };
    }

    await saveFinanceInboxState(data, state);

    return NextResponse.json({
      success: true,
      item: state.items[itemIndex],
    });
  } catch (error) {
    console.error("Finance inbox review error:", error);
    return NextResponse.json(
      { error: "Failed to review inbox item" },
      { status: 500 }
    );
  }
}

