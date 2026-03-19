import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATEMENT_GROUPS: Record<string, string[]> = {
  transactions: [
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
  `CREATE INDEX IF NOT EXISTS "financial_transactions_activity_window_idx" ON "financial_transactions" ("type", "status", "reviewState", "settlementStatus", "transactedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "financial_transactions_recent_active_idx" ON "financial_transactions" ("transactedAt" DESC) WHERE "excludedFromBudget" = FALSE AND "status" = 'posted' AND "reviewState" = 'resolved'`,
  ],

  documents: [
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "messageSubtype" TEXT NOT NULL DEFAULT 'unknown'`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "groupKey" TEXT`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "orderRef" TEXT`,
  `ALTER TABLE "finance_documents" ADD COLUMN IF NOT EXISTS "chargeRef" TEXT`,
  `CREATE INDEX IF NOT EXISTS "finance_documents_messageSubtype_idx" ON "finance_documents" ("messageSubtype")`,
  `CREATE INDEX IF NOT EXISTS "finance_documents_groupKey_idx" ON "finance_documents" ("groupKey")`,
  `CREATE INDEX IF NOT EXISTS "finance_documents_classification_receivedAt_idx" ON "finance_documents" ("classification", "receivedAt" DESC)`,
  ],

  sources: [
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "countryHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "currencyHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "localeHint" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "provisionalCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "settledCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "failedCount" INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS "finance_sources_trustLevel_defaultDisposition_idx" ON "finance_sources" ("trustLevel", "defaultDisposition")`,
  `CREATE INDEX IF NOT EXISTS "finance_sources_documentCount_lastSeenAt_idx" ON "finance_sources" ("documentCount" DESC, "lastSeenAt" DESC)`,
  ],

  signals: [
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
  `CREATE INDEX IF NOT EXISTS "finance_signals_sourceId_promotionState_idx" ON "finance_signals" ("sourceId", "promotionState")`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_sourceId_createdAt_idx" ON "finance_signals" ("sourceId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_promotionState_kind_createdAt_idx" ON "finance_signals" ("promotionState", "kind", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_kind_status_dueDate_idx" ON "finance_signals" ("kind", "status", "dueDate" ASC)`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_transactedAt_idx" ON "finance_signals" ("transactedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "finance_signals_dueDate_idx" ON "finance_signals" ("dueDate" ASC)`,
  ],

  exchange: [
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
  ],
};

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret");
    if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const group = request.nextUrl.searchParams.get("group") || "all";
    const statements =
      group === "all" ? Object.values(STATEMENT_GROUPS).flat() : STATEMENT_GROUPS[group];

    if (!statements?.length) {
      return NextResponse.json({ error: "Unknown schema sync group" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`SET statement_timeout TO 0`);

    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    return NextResponse.json({ success: true, group, applied: statements.length });
  } catch (error) {
    console.error("Finance schema sync error:", error);
    return NextResponse.json({ error: "Failed to sync finance schema" }, { status: 500 });
  }
}
