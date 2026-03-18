import { NextRequest, NextResponse } from "next/server";
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
    });

    return NextResponse.json({
      parsed,
      transaction: result.transaction,
      reviewItems: result.reviewItems,
      message: parsed.message,
    });
  } catch (error) {
    console.error("Finance assistant error:", error);
    return NextResponse.json({ error: "Failed to parse finance message" }, { status: 500 });
  }
}
