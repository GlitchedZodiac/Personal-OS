-- MCP v2 Phase A (2026-11-12): field-level change history for corrections
-- made through the Claude connector, so each can be shown and undone.
-- Additive only: a new table; nothing existing changes.
-- CreateTable
CREATE TABLE "record_changes" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "via" TEXT NOT NULL,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "record_changes_entity_recordId_idx" ON "record_changes"("entity", "recordId");

-- CreateIndex
CREATE INDEX "record_changes_batchId_idx" ON "record_changes"("batchId");

-- CreateIndex
CREATE INDEX "record_changes_createdAt_idx" ON "record_changes"("createdAt");

