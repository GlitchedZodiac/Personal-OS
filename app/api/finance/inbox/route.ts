import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildFinanceInboxFingerprint,
  getFinanceInboxState,
  saveFinanceInboxState,
  type FinanceInboxItem,
} from "@/lib/finance-inbox";
import { parseTransactionsFromEmail } from "@/lib/finance-email-parser";

function getGmailConfigStatus() {
  const configured = Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN &&
      process.env.GMAIL_USER_EMAIL
  );

  return {
    configured,
    user: configured ? process.env.GMAIL_USER_EMAIL || null : null,
  };
}

// GET /api/finance/inbox - list pending/reviewed imported email transactions
export async function GET() {
  try {
    const { state } = await getFinanceInboxState();
    const pendingCount = state.items.filter((item) => item.status === "pending").length;
    const approvedCount = state.items.filter((item) => item.status === "approved").length;
    const rejectedCount = state.items.filter((item) => item.status === "rejected").length;

    return NextResponse.json({
      items: state.items,
      meta: state.meta,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: state.items.length,
      },
      gmail: getGmailConfigStatus(),
    });
  } catch (error) {
    console.error("Finance inbox fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load finance inbox" },
      { status: 500 }
    );
  }
}

// POST /api/finance/inbox - parse a manual email text into review queue
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawText =
      typeof body.rawText === "string" ? body.rawText.trim() : "";
    const sender =
      typeof body.sender === "string" && body.sender.trim().length > 0
        ? body.sender.trim()
        : null;
    const subject =
      typeof body.subject === "string" && body.subject.trim().length > 0
        ? body.subject.trim()
        : null;
    const accountId =
      typeof body.accountId === "string" && body.accountId.trim().length > 0
        ? body.accountId.trim()
        : null;

    if (!rawText) {
      return NextResponse.json(
        { error: "rawText is required" },
        { status: 400 }
      );
    }

    const parsedTransactions = await parseTransactionsFromEmail({
      sender,
      subject,
      bodyText: rawText,
    });

    if (parsedTransactions.length === 0) {
      return NextResponse.json(
        {
          error:
            "No transaction candidates found in this email text. Try a bank alert or statement snippet.",
        },
        { status: 422 }
      );
    }

    const { data, state } = await getFinanceInboxState();
    const existingFingerprints = new Set(state.items.map((item) => item.fingerprint));

    const nowIso = new Date().toISOString();
    const createdItems: FinanceInboxItem[] = [];
    for (const tx of parsedTransactions) {
      const fingerprint = buildFinanceInboxFingerprint({
        source: "manual",
        sender,
        subject,
        transactedAt: tx.transactedAt,
        amount: tx.amount,
        description: tx.description,
      });
      if (existingFingerprints.has(fingerprint)) continue;
      existingFingerprints.add(fingerprint);

      createdItems.push({
        id: randomUUID(),
        status: "pending",
        source: "manual",
        sender,
        subject,
        sourceMessageId: null,
        receivedAt: nowIso,
        accountId,
        rawSnippet: rawText.slice(0, 5000),
        fingerprint,
        parsed: tx,
        createdAt: nowIso,
        reviewedAt: null,
        reviewNotes: null,
        linkedTransactionId: null,
      });
    }

    if (createdItems.length === 0) {
      return NextResponse.json({
        added: 0,
        skippedDuplicates: parsedTransactions.length,
      });
    }

    await saveFinanceInboxState(data, {
      ...state,
      items: [...createdItems, ...state.items],
    });

    return NextResponse.json({
      added: createdItems.length,
      skippedDuplicates: parsedTransactions.length - createdItems.length,
      items: createdItems,
    });
  } catch (error) {
    console.error("Finance inbox manual parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse manual email text" },
      { status: 500 }
    );
  }
}

