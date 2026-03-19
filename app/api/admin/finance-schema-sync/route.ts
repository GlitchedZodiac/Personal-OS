import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATEMENTS = [
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "settlementStatus" TEXT NOT NULL DEFAULT 'settled'`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "sourceAmount" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "sourceCurrency" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "fxRate" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "fxDate" TIMESTAMP(3)`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "amountConfidence" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "amountExtractionLabel" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "requiresCurrencyReview" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "groupKey" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "orderRef" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "chargeRef" TEXT`,
  `CREATE INDEX IF NOT EXISTS "financial_transactions_settlementStatus_idx" ON "financial_transactions" ("settlementStatus")`,
  `CREATE INDEX IF NOT EXISTS "financial_transactions_groupKey_idx" ON "financial_transactions" ("groupKey")`,

  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "messageSubtype" TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "groupKey" TEXT`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "orderRef" TEXT`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "chargeRef" TEXT`,
  `CREATE INDEX IF NOT EXISTS "finance_documents_messageSubtype_idx" ON "finance_documents" ("messageSubtype")`,
  `CREATE INDEX IF NOT EXISTS "finance_documents_groupKey_idx" ON "finance_documents" ("groupKey")`,

  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "countryHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "currencyHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "localeHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "provisionalCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "settledCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0`,

  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "matchedRuleId" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "messageSubtype" TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "settlementStatus" TEXT NOT NULL DEFAULT 'provisional'`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "sourceAmount" DOUBLE PRECISION`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "sourceCurrency" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "fxRate" DOUBLE PRECISION`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "fxDate" TIMESTAMP(3)`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "amountConfidence" DOUBLE PRECISION`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "amountExtractionLabel" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "requiresCurrencyReview" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "groupKey" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "orderRef" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "chargeRef" TEXT`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_messageSubtype_settlementStatus_idx" ON "finance_signals" ("messageSubtype", "settlementStatus")`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_groupKey_idx" ON "finance_signals" ("groupKey")`,

  `CREATE TABLE IF NOT EXISTS "exchange_rate_snapshots" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exchange_rate_snapshots_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rate_snapshots_baseCurrency_quoteCurrency_rateDate_provider_key" ON "exchange_rate_snapshots" ("baseCurrency", "quoteCurrency", "rateDate", "provider")`,
  `CREATE INDEX IF NOT EXISTS "exchange_rate_snapshots_rateDate_provider_idx" ON "exchange_rate_snapshots" ("rateDate", "provider")`,
];

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret");
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.$executeRawUnsafe(`SET statement_timeout TO 0`);

    for (const statement of STATEMENTS) {
      await prisma.$executeRawUnsafe(statement);
    }

    return NextResponse.json({ success: true, applied: STATEMENTS.length });
  } catch (error) {
    console.error("Finance schema sync error:", error);
    return NextResponse.json({ error: "Failed to sync finance schema" }, { status: 500 });
  }
}
