import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { analyzeFinanceReceipt } from "@/lib/finance/ai";
import { ingestFinanceCandidate } from "@/lib/finance/ingestion";

export async function POST(request: NextRequest) {
  try {
    const { image, accountId, aiLanguage = "english" } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }

    const parsed = await analyzeFinanceReceipt(image, aiLanguage);
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
      subtotalAmount: parsed.subtotalAmount,
      deductible: parsed.deductible,
      notes: parsed.notes,
      source: "receipt_photo",
      confidence: parsed.confidence,
      document: {
        source: "receipt_photo",
        externalId: `receipt:${Date.now()}`,
        documentType: "image",
        contentText: parsed.notes || parsed.description,
        extractedData: JSON.parse(JSON.stringify(parsed)) as Prisma.InputJsonValue,
        status: "processed",
      },
    });

    return NextResponse.json({
      parsed,
      transaction: result.transaction,
      reviewItems: result.reviewItems,
      message: parsed.message,
    });
  } catch (error) {
    console.error("Finance receipt analysis error:", error);
    return NextResponse.json({ error: "Failed to analyze receipt" }, { status: 500 });
  }
}
