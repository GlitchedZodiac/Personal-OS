import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { withRequestPrisma } from "@/lib/prisma-request";

function getJsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getNumericField(record: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function getStringField(record: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function inferSignalKind(classification: string, messageSubtype: string) {
  if (classification === "income_notice") return "income";
  if (classification === "refund_notice") return "refund";
  if (classification === "transfer_notice") return "transfer";
  if (classification === "bill_notice" || messageSubtype === "bill_available") return "bill_due";
  if (classification === "statement" || messageSubtype === "statement") return "statement";
  if (messageSubtype === "payment_failed") return "purchase";
  return "purchase";
}

export async function GET() {
  try {
    return await withRequestPrisma(async (prisma) => {
      const sources = await prisma.financeSource.findMany({
        orderBy: [{ documentCount: "desc" }, { lastSeenAt: "desc" }],
        take: 24,
        select: {
          id: true,
          label: true,
          senderEmail: true,
          senderDomain: true,
          trustLevel: true,
          defaultDisposition: true,
          categoryHint: true,
          subcategoryHint: true,
          countryHint: true,
          currencyHint: true,
          localeHint: true,
          documentCount: true,
          signalCount: true,
          confirmedCount: true,
          ignoredCount: true,
          autoPostCount: true,
          provisionalCount: true,
          settledCount: true,
          failedCount: true,
          isBiller: true,
          isIncomeSource: true,
          isRecurring: true,
          merchant: {
            select: { id: true, name: true },
          },
        },
      });

      const sourceIds = sources.map((source) => source.id);
      const documents = sourceIds.length
        ? await prisma.financeDocument
            .findMany({
              where: {
                sourceId: { in: sourceIds },
                classification: { not: "ignored" },
              },
              orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
              take: 96,
              select: {
                id: true,
                sourceId: true,
                classification: true,
                messageSubtype: true,
                subject: true,
                sender: true,
                extractedData: true,
              },
            })
            .catch(() => [])
        : [];
      const rules = sourceIds.length
        ? await prisma.financeRule.findMany({
            where: { isActive: true, sourceId: { in: sourceIds } },
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              sourceId: true,
              name: true,
              ruleType: true,
              priority: true,
              isActive: true,
              conditions: true,
              actions: true,
            },
            take: 160,
          })
        : [];

      const rulesBySource = new Map<string, typeof rules>();
      for (const rule of rules) {
        if (!rule.sourceId) continue;
        const bucket = rulesBySource.get(rule.sourceId) || [];
        if (bucket.length < 6) {
          bucket.push(rule);
          rulesBySource.set(rule.sourceId, bucket);
        }
      }

      const documentsBySource = new Map<
        string,
        Array<{
          id: string;
          kind: string;
          messageSubtype: string;
          settlementStatus: string;
          description: string;
          amount: number | null;
          sourceAmount: number | null;
          sourceCurrency: string | null;
          fxRate: number | null;
          requiresCurrencyReview: boolean;
          promotionState: string;
          category: string | null;
          document: {
            subject: string | null;
            sender: string | null;
          };
        }>
      >();

      for (const document of documents) {
        if (!document.sourceId) continue;
        const bucket = documentsBySource.get(document.sourceId) || [];
        if (bucket.length >= 3) continue;

        const extracted = getJsonRecord(document.extractedData);
        const sourceAmount = getNumericField(extracted, "sourceAmount", "amount", "totalAmount");
        const amount = getNumericField(extracted, "amount", "normalizedAmount", "sourceAmount");
        const sourceCurrency = getStringField(extracted, "sourceCurrency", "currency");
        const category = getStringField(extracted, "category", "categoryHint");
        const settlementStatus =
          document.messageSubtype === "payment_failed"
            ? "failed"
            : document.classification === "ignored"
            ? "ignored"
            : document.classification === "expense_receipt" ||
              document.classification === "income_notice" ||
              document.classification === "refund_notice"
            ? "settled"
            : "provisional";

        bucket.push({
          id: document.id,
          kind: inferSignalKind(document.classification, document.messageSubtype),
          messageSubtype: document.messageSubtype || "unknown",
          settlementStatus,
          description: document.subject || document.classification.replace(/_/g, " "),
          amount,
          sourceAmount,
          sourceCurrency,
          fxRate: getNumericField(extracted, "fxRate"),
          requiresCurrencyReview: Boolean(extracted?.requiresCurrencyReview),
          promotionState:
            document.classification === "ignored"
              ? "ignored"
              : document.classification === "unclassified"
              ? "pending_review"
              : "user_confirmed",
          category,
          document: {
            subject: document.subject,
            sender: document.sender,
          },
        });

        documentsBySource.set(document.sourceId, bucket);
      }

      return NextResponse.json({
        sources: sources.map((source) => ({
          ...source,
          signals: documentsBySource.get(source.id) || [],
          rules: rulesBySource.get(source.id) || [],
          exampleSubtypes: [
            ...new Set((documentsBySource.get(source.id) || []).map((signal) => signal.messageSubtype)),
          ],
        })),
      });
    });
  } catch (error) {
    console.error("Finance sources error:", error);
    return NextResponse.json({ error: "Failed to load finance sources" }, { status: 500 });
  }
}
