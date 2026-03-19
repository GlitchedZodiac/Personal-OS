import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyInboxAction } from "@/lib/finance/ingestion";
import type { ReviewAction } from "@/lib/finance/constants";
import { withRequestPrisma } from "@/lib/prisma-request";

export async function GET() {
  try {
    return await withRequestPrisma(async (db) => {
      const newSources = await db.financeSource.findMany({
        where: {
          trustLevel: { in: ["new", "learning"] },
          defaultDisposition: { not: "always_ignore" },
          documentCount: { gt: 0 },
        },
        orderBy: [{ documentCount: "desc" }, { lastSeenAt: "desc" }],
        take: 8,
        select: {
          id: true,
          label: true,
          senderEmail: true,
          senderDomain: true,
          trustLevel: true,
          defaultDisposition: true,
          documentCount: true,
          signalCount: true,
        },
      });

      const pendingSignals = await db.financeSignal.findMany({
        where: {
          promotionState: "pending_review",
          settlementStatus: { notIn: ["ignored"] },
          kind: { in: ["purchase", "subscription", "income", "refund", "transfer", "unknown"] },
        },
        orderBy: [{ transactedAt: "desc" }, { createdAt: "desc" }],
        take: 24,
        select: {
          id: true,
          kind: true,
          messageSubtype: true,
          settlementStatus: true,
          description: true,
          amount: true,
          sourceAmount: true,
          sourceCurrency: true,
          category: true,
          promotionState: true,
          confidence: true,
          dueDate: true,
          fxRate: true,
          requiresCurrencyReview: true,
          source: {
            select: {
              id: true,
              label: true,
              senderEmail: true,
              senderDomain: true,
              trustLevel: true,
              defaultDisposition: true,
              documentCount: true,
              signalCount: true,
            },
          },
          document: {
            select: {
              id: true,
              sender: true,
              subject: true,
              filename: true,
              classification: true,
              messageSubtype: true,
              processingStage: true,
              status: true,
              passwordSecretKey: true,
            },
          },
          merchant: { select: { id: true, name: true } },
        },
      });

      const upcomingBills = await db.financeSignal.findMany({
        where: {
          kind: { in: ["bill_due", "statement", "subscription"] },
          settlementStatus: { notIn: ["ignored", "failed", "rejected"] },
          status: { not: "ignored" },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 12,
        select: {
          id: true,
          kind: true,
          messageSubtype: true,
          settlementStatus: true,
          description: true,
          amount: true,
          sourceAmount: true,
          sourceCurrency: true,
          category: true,
          promotionState: true,
          confidence: true,
          dueDate: true,
          fxRate: true,
          requiresCurrencyReview: true,
          source: {
            select: {
              id: true,
              label: true,
              senderEmail: true,
              senderDomain: true,
              trustLevel: true,
              defaultDisposition: true,
              documentCount: true,
              signalCount: true,
            },
          },
          document: {
            select: {
              id: true,
              sender: true,
              subject: true,
              filename: true,
              classification: true,
              messageSubtype: true,
              processingStage: true,
              status: true,
              passwordSecretKey: true,
            },
          },
          merchant: { select: { id: true, name: true } },
        },
      });

      const ignoredNoise = await db.financeDocument.findMany({
        where: { classification: "ignored" },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: 12,
        select: {
          id: true,
          sender: true,
          subject: true,
          classification: true,
          sourceRef: {
            select: {
              id: true,
              label: true,
              trustLevel: true,
              defaultDisposition: true,
            },
          },
        },
      });

      const pendingReviews = await db.financeReviewItem.count({ where: { status: "pending" } });

      return NextResponse.json({
        counts: {
          newSources: newSources.length,
          pendingTransactions: pendingSignals.length,
          upcomingBills: upcomingBills.length,
          ignoredNoise: ignoredNoise.length,
          pendingReviews,
        },
        sections: {
          newSources,
          pendingTransactions: pendingSignals,
          upcomingBills,
          ignoredNoise,
        },
      });
    });
  } catch (error) {
    console.error("Finance inbox error:", error);
    return NextResponse.json({ error: "Failed to load finance inbox" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as ReviewAction;

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const result = await applyInboxAction(action, {
      reviewId: body.reviewId,
      signalId: body.signalId,
      documentId: body.documentId,
      sourceId: body.sourceId,
      ...(body.payload || {}),
    });
    return NextResponse.json({ success: true, item: result });
  } catch (error) {
    console.error("Finance inbox action error:", error);
    return NextResponse.json({ error: "Failed to apply inbox action" }, { status: 500 });
  }
}
