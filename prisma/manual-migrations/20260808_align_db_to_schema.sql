-- DropIndex
DROP INDEX "budget_categories_defaultPocketId_idx";

-- DropIndex
DROP INDEX "finance_documents_classification_receivedAt_idx";

-- DropIndex
DROP INDEX "finance_learning_events_ruleId_createdAt_idx";

-- DropIndex
DROP INDEX "finance_learning_events_signalId_createdAt_idx";

-- DropIndex
DROP INDEX "finance_learning_events_sourceId_createdAt_idx";

-- DropIndex
DROP INDEX "finance_signals_dueDate_idx";

-- DropIndex
DROP INDEX "finance_signals_kind_status_dueDate_idx";

-- DropIndex
DROP INDEX "finance_signals_promotionState_kind_createdAt_idx";

-- DropIndex
DROP INDEX "finance_signals_sourceId_createdAt_idx";

-- DropIndex
DROP INDEX "finance_signals_transactedAt_idx";

-- DropIndex
DROP INDEX "finance_sources_documentCount_lastSeenAt_idx";

-- DropIndex
DROP INDEX "financial_accounts_isPrimary_idx";

-- DropIndex
DROP INDEX "financial_transactions_activity_window_idx";

-- DropIndex
DROP INDEX "financial_transactions_needsCategorization_transactedAt_idx";

-- DropIndex
DROP INDEX "paycheck_allocation_runs_runType_status_idx";

-- AlterTable
ALTER TABLE "exchange_rate_snapshots" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "finance_priority_sources" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fund_pockets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paycheck_allocation_rules" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "paycheck_allocation_runs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scheduled_obligation_occurrences" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scheduled_obligations" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "finance_learning_events_sourceId_createdAt_idx" ON "finance_learning_events"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_learning_events_ruleId_createdAt_idx" ON "finance_learning_events"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "finance_learning_events_signalId_createdAt_idx" ON "finance_learning_events"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_transactions_needsCategorization_transactedAt_idx" ON "financial_transactions"("needsCategorization", "transactedAt");

-- AddForeignKey
ALTER TABLE "workout_plan_completions" ADD CONSTRAINT "workout_plan_completions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "finance_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "budget_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_mailConnectionId_fkey" FOREIGN KEY ("mailConnectionId") REFERENCES "google_mailbox_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_documents" ADD CONSTRAINT "finance_documents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_sources" ADD CONSTRAINT "finance_sources_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_rules" ADD CONSTRAINT "finance_rules_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "finance_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_signals" ADD CONSTRAINT "finance_signals_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "finance_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "finance_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_review_items" ADD CONSTRAINT "finance_review_items_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "finance_signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upcoming_payments" ADD CONSTRAINT "upcoming_payments_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "finance_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upcoming_payments" ADD CONSTRAINT "upcoming_payments_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_change_logs" ADD CONSTRAINT "transaction_change_logs_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ai_insight_cache_cacheKey_idx" RENAME TO "ai_insight_cache_cacheKey_key";

-- RenameIndex
ALTER INDEX "budget_items_budgetId_categoryId_idx" RENAME TO "budget_items_budgetId_categoryId_key";

-- RenameIndex
ALTER INDEX "budgets_month_year_idx" RENAME TO "budgets_month_year_key";

-- RenameIndex
ALTER INDEX "daily_health_snapshots_localDate_timeZone_source_idx" RENAME TO "daily_health_snapshots_localDate_timeZone_source_key";

-- RenameIndex
ALTER INDEX "device_sessions_refreshTokenHash_idx" RENAME TO "device_sessions_refreshTokenHash_key";

-- RenameIndex
ALTER INDEX "device_sessions_tokenHash_idx" RENAME TO "device_sessions_tokenHash_key";

-- RenameIndex
ALTER INDEX "exchange_rate_snapshots_baseCurrency_quoteCurrency_rateDate_pro" RENAME TO "exchange_rate_snapshots_baseCurrency_quoteCurrency_rateDate_key";

-- RenameIndex
ALTER INDEX "finance_documents_source_externalId_idx" RENAME TO "finance_documents_source_externalId_key";

-- RenameIndex
ALTER INDEX "finance_signals_fingerprint_idx" RENAME TO "finance_signals_fingerprint_key";

-- RenameIndex
ALTER INDEX "finance_sources_sourceKey_idx" RENAME TO "finance_sources_sourceKey_key";

-- RenameIndex
ALTER INDEX "finance_vault_secrets_secretKey_idx" RENAME TO "finance_vault_secrets_secretKey_key";

-- RenameIndex
ALTER INDEX "merchants_normalizedName_idx" RENAME TO "merchants_normalizedName_key";

-- RenameIndex
ALTER INDEX "workout_plan_completions_planId_scheduledDate_dayIndex_idx" RENAME TO "workout_plan_completions_planId_scheduledDate_dayIndex_key";

