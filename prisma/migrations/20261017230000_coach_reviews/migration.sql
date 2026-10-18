-- The Coach's weekly reviews (2026-10-17, lane B — docs/coach-plan.md §2.4).
-- ADDITIVE ONLY: one new table, nothing else touched. Dev and prod share a
-- database, and the code deployed before this neither reads nor writes it.
--
-- One LIVE review per week is enforced here, not in code: "liveWeekStart" is
-- set only on the live row and is unique; superseded and test rows carry
-- NULL, so any number of those can share a week. A review is never rewritten
-- — a re-run supersedes the old row in the same transaction that inserts the
-- new one.

-- CreateTable
CREATE TABLE "coach_reviews" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "weekEnd" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'live',
    "liveWeekStart" TEXT,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "modelTier" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "factsJson" JSONB NOT NULL,
    "reviewJson" JSONB,
    "markdown" TEXT,
    "checksJson" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "actionsJson" JSONB NOT NULL DEFAULT '[]',
    "conversationId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_reviews_liveWeekStart_key" ON "coach_reviews"("liveWeekStart");

-- CreateIndex
CREATE UNIQUE INDEX "coach_reviews_conversationId_key" ON "coach_reviews"("conversationId");

-- CreateIndex
CREATE INDEX "coach_reviews_weekStart_kind_idx" ON "coach_reviews"("weekStart", "kind");

-- CreateIndex
CREATE INDEX "coach_reviews_generatedAt_idx" ON "coach_reviews"("generatedAt");

-- AddForeignKey
ALTER TABLE "coach_reviews" ADD CONSTRAINT "coach_reviews_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
