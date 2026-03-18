import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { analyzeFinanceText } from "@/lib/finance/ai";
import { ingestFinanceCandidate } from "@/lib/finance/ingestion";

export async function POST(request: NextRequest) {
  try {
    const { message, accountId, aiLanguage = "english" } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const parsed = await analyzeFinanceText(message, aiLanguage);
    if (parsed instanceof Response) return parsed;

    const result = await ingestFinanceCandidate({
      accountId: accountId || null,
      description: parsed.description,
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: parsed.merchant,
      category: parsed.category,
      subcategory: parsed.subcategory,
      type: parsed.type,
      transactedAt: parsed.transactedAt ? new Date(parsed.transactedAt) : new Date(),
      taxAmount: parsed.taxAmount,
      tipAmount: parsed.tipAmount,
      deductible: parsed.deductible,
      notes: parsed.notes,
      source: "voice",
      confidence: parsed.confidence,
      signalKind:
        parsed.type === "income"
          ? "income"
          : parsed.type === "transfer"
          ? "transfer"
          : "purchase",
      documentClassification:
        parsed.type === "income"
          ? "income_notice"
          : parsed.type === "transfer"
          ? "transfer_notice"
          : "expense_receipt",
      promotionPreference: "manual_post",
      document: {
        source: "voice_note",
        externalId: `voice:${Date.now()}`,
        documentType: "voice_note",
        contentText: message,
        extractedData: parsed as unknown as Prisma.InputJsonValue,
        status: "processed",
      },
    });

    return NextResponse.json({
      parsed,
      transaction: result.transaction,
      signal: result.signal,
      reviewItems: result.reviewItems,
      message: parsed.message,
    });
  } catch (error) {
    console.error("Finance assistant error:", error);
    return NextResponse.json({ error: "Failed to parse finance message" }, { status: 500 });
  }
}
