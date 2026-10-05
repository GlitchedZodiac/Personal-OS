-- Notifications (2026-10-05): a log of everything sent, and a heartbeat
-- table for the pipelines whose silence should raise an alert.
--
-- ADDITIVE ONLY — two new tables, nothing existing is touched. The deploy
-- that predates this migration never reads either one.


-- CreateTable
CREATE TABLE "notification_log" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "tag" TEXT,
    "status" TEXT NOT NULL,
    "detail" JSONB,
    "dedupeKey" TEXT,
    "deliverAfter" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_status" (
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "heartbeat" BOOLEAN NOT NULL DEFAULT false,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failingSince" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_status_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_dedupeKey_key" ON "notification_log"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_log_createdAt_idx" ON "notification_log"("createdAt");

-- CreateIndex
CREATE INDEX "notification_log_status_deliverAfter_idx" ON "notification_log"("status", "deliverAfter");

