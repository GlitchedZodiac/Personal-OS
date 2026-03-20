import { NextRequest, NextResponse } from "next/server";
import { withRequestPrisma } from "@/lib/prisma-request";

const STATEMENT_GROUPS: Record<string, string[]> = {
  transactions: [
  `ALTER TABLE "financial_accounts" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS "financial_accounts_isPrimary_idx" ON "financial_accounts" ("isPrimary")`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "settlementStatus" TEXT NOT NULL DEFAULT 'settled'`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "sourceAmount" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "sourceCurrency" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "fxRate" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "fxDate" TIMESTAMP(3)`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "pocketId" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "needsCategorization" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "instrumentType" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "instrumentLast4" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "cashImpactType" TEXT NOT NULL DEFAULT 'non_cash'`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "amountConfidence" DOUBLE PRECISION`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "amountExtractionLabel" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "requiresCurrencyReview" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "groupKey" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "orderRef" TEXT`,
  `ALTER TABLE "financial_transactions" ADD COLUMN IF NOT EXISTS "chargeRef" TEXT`,
  `CREATE INDEX IF NOT EXISTS "financial_transactions_pocketId_idx" ON "financial_transactions" ("pocketId")`,
  `CREATE INDEX IF NOT EXISTS "financial_transactions_needsCategorization_transactedAt_idx" ON "financial_transactions" ("needsCategorization", "transactedAt" DESC)`,
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
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "isPriority" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "prioritySourceRole" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "priorityInstitution" TEXT`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3)`,
  `ALTER TABLE "finance_sources" ADD COLUMN IF NOT EXISTS "lastLearningEventAt" TIMESTAMP(3)`,
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
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "instrumentType" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "instrumentLast4" TEXT`,
  `ALTER TABLE "finance_signals" ADD COLUMN IF NOT EXISTS "cashImpactType" TEXT NOT NULL DEFAULT 'non_cash'`,
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

  learning: [
  `CREATE TABLE IF NOT EXISTS "finance_learning_events" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "ruleId" TEXT,
    "signalId" TEXT,
    "transactionId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_learning_events_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "finance_learning_events_sourceId_createdAt_idx" ON "finance_learning_events" ("sourceId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "finance_learning_events_ruleId_createdAt_idx" ON "finance_learning_events" ("ruleId", "createdAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "finance_learning_events_signalId_createdAt_idx" ON "finance_learning_events" ("signalId", "createdAt" DESC)`,
  `ALTER TABLE "finance_learning_events" DROP CONSTRAINT IF EXISTS "finance_learning_events_sourceId_fkey"`,
  `ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "finance_learning_events" DROP CONSTRAINT IF EXISTS "finance_learning_events_ruleId_fkey"`,
  `ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "finance_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "finance_learning_events" DROP CONSTRAINT IF EXISTS "finance_learning_events_signalId_fkey"`,
  `ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "finance_signals"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "finance_learning_events" DROP CONSTRAINT IF EXISTS "finance_learning_events_transactionId_fkey"`,
  `ALTER TABLE "finance_learning_events" ADD CONSTRAINT "finance_learning_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  ],

  priority_sources: [
  `CREATE TABLE IF NOT EXISTS "finance_priority_sources" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceRole" TEXT NOT NULL,
    "institution" TEXT,
    "provider" TEXT,
    "senderEmailPattern" TEXT,
    "senderDomainPattern" TEXT,
    "subjectPattern" TEXT,
    "defaultDisposition" TEXT NOT NULL DEFAULT 'capture_only',
    "parserPriority" INTEGER NOT NULL DEFAULT 100,
    "isPinned" BOOLEAN NOT NULL DEFAULT TRUE,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "passwordSecretKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_priority_sources_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "finance_priority_sources_active_parserPriority_idx" ON "finance_priority_sources" ("active", "parserPriority")`,
  `CREATE INDEX IF NOT EXISTS "finance_priority_sources_sourceRole_idx" ON "finance_priority_sources" ("sourceRole")`,
  ],

  planning: [
  `ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "defaultPocketId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "scheduled_obligations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "frequency" TEXT NOT NULL,
    "dueDay" INTEGER,
    "nextOccurrenceAt" TIMESTAMP(3),
    "defaultAccountId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_obligations_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "scheduled_obligations_active_nextOccurrenceAt_idx" ON "scheduled_obligations" ("active", "nextOccurrenceAt")`,
  `ALTER TABLE "scheduled_obligations" DROP CONSTRAINT IF EXISTS "scheduled_obligations_defaultAccountId_fkey"`,
  `ALTER TABLE "scheduled_obligations" ADD CONSTRAINT "scheduled_obligations_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `CREATE TABLE IF NOT EXISTS "scheduled_obligation_occurrences" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'due',
    "paidAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "notes" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scheduled_obligation_occurrences_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_obligation_occurrences_obligationId_dueDate_key" ON "scheduled_obligation_occurrences" ("obligationId", "dueDate")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_obligation_occurrences_transactionId_key" ON "scheduled_obligation_occurrences" ("transactionId")`,
  `CREATE INDEX IF NOT EXISTS "scheduled_obligation_occurrences_dueDate_status_idx" ON "scheduled_obligation_occurrences" ("dueDate", "status")`,
  `ALTER TABLE "scheduled_obligation_occurrences" DROP CONSTRAINT IF EXISTS "scheduled_obligation_occurrences_obligationId_fkey"`,
  `ALTER TABLE "scheduled_obligation_occurrences" ADD CONSTRAINT "scheduled_obligation_occurrences_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "scheduled_obligations"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "scheduled_obligation_occurrences" DROP CONSTRAINT IF EXISTS "scheduled_obligation_occurrences_transactionId_fkey"`,
  `ALTER TABLE "scheduled_obligation_occurrences" ADD CONSTRAINT "scheduled_obligation_occurrences_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `CREATE TABLE IF NOT EXISTS "fund_pockets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isCanonical" BOOLEAN NOT NULL DEFAULT FALSE,
    "currentBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetAmount" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fund_pockets_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "fund_pockets" ADD COLUMN IF NOT EXISTS "slug" TEXT`,
  `ALTER TABLE "fund_pockets" ADD COLUMN IF NOT EXISTS "isCanonical" BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "fund_pockets_slug_key" ON "fund_pockets" ("slug")`,
  `CREATE INDEX IF NOT EXISTS "fund_pockets_active_sortOrder_idx" ON "fund_pockets" ("active", "sortOrder")`,
  `CREATE TABLE IF NOT EXISTS "paycheck_allocation_rules" (
    "id" TEXT NOT NULL,
    "pocketId" TEXT NOT NULL,
    "name" TEXT,
    "percentOfIncome" DOUBLE PRECISION NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT TRUE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paycheck_allocation_rules_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "paycheck_allocation_rules_active_priority_idx" ON "paycheck_allocation_rules" ("active", "priority")`,
  `ALTER TABLE "paycheck_allocation_rules" DROP CONSTRAINT IF EXISTS "paycheck_allocation_rules_pocketId_fkey"`,
  `ALTER TABLE "paycheck_allocation_rules" ADD CONSTRAINT "paycheck_allocation_rules_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `CREATE TABLE IF NOT EXISTS "paycheck_allocation_runs" (
    "id" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "runType" TEXT NOT NULL DEFAULT 'paycheck',
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "suggestedAllocations" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "promptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paycheck_allocation_runs_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "paycheck_allocation_runs" ADD COLUMN IF NOT EXISTS "runType" TEXT NOT NULL DEFAULT 'paycheck'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "paycheck_allocation_runs_sourceTransactionId_key" ON "paycheck_allocation_runs" ("sourceTransactionId")`,
  `CREATE INDEX IF NOT EXISTS "paycheck_allocation_runs_status_promptedAt_idx" ON "paycheck_allocation_runs" ("status", "promptedAt")`,
  `CREATE INDEX IF NOT EXISTS "paycheck_allocation_runs_runType_status_idx" ON "paycheck_allocation_runs" ("runType", "status")`,
  `ALTER TABLE "paycheck_allocation_runs" DROP CONSTRAINT IF EXISTS "paycheck_allocation_runs_sourceTransactionId_fkey"`,
  `ALTER TABLE "paycheck_allocation_runs" ADD CONSTRAINT "paycheck_allocation_runs_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `CREATE TABLE IF NOT EXISTS "pocket_entries" (
    "id" TEXT NOT NULL,
    "pocketId" TEXT NOT NULL,
    "allocationRunId" TEXT,
    "sourceTransactionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "entryType" TEXT NOT NULL DEFAULT 'allocation',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pocket_entries_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "pocket_entries_pocketId_occurredAt_idx" ON "pocket_entries" ("pocketId", "occurredAt")`,
  `ALTER TABLE "pocket_entries" DROP CONSTRAINT IF EXISTS "pocket_entries_pocketId_fkey"`,
  `ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "pocket_entries" DROP CONSTRAINT IF EXISTS "pocket_entries_allocationRunId_fkey"`,
  `ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_allocationRunId_fkey" FOREIGN KEY ("allocationRunId") REFERENCES "paycheck_allocation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "pocket_entries" DROP CONSTRAINT IF EXISTS "pocket_entries_sourceTransactionId_fkey"`,
  `ALTER TABLE "pocket_entries" ADD CONSTRAINT "pocket_entries_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `ALTER TABLE "budget_categories" DROP CONSTRAINT IF EXISTS "budget_categories_defaultPocketId_fkey"`,
  `ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_defaultPocketId_fkey" FOREIGN KEY ("defaultPocketId") REFERENCES "fund_pockets"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
  `CREATE INDEX IF NOT EXISTS "budget_categories_defaultPocketId_idx" ON "budget_categories" ("defaultPocketId")`,
  `ALTER TABLE "financial_transactions" DROP CONSTRAINT IF EXISTS "financial_transactions_pocketId_fkey"`,
  `ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_pocketId_fkey" FOREIGN KEY ("pocketId") REFERENCES "fund_pockets"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
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

    return await withRequestPrisma(async (prisma) => {
      await prisma.$executeRawUnsafe(`SET statement_timeout TO 0`);

      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }

      return NextResponse.json({ success: true, group, applied: statements.length });
    });
  } catch (error) {
    console.error("Finance schema sync error:", error);
    return NextResponse.json({ error: "Failed to sync finance schema" }, { status: 500 });
  }
}
