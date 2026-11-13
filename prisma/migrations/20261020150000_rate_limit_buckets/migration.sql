-- Wrong-PIN counters shared by every serverless instance (audit 2026-10,
-- SEC-005, PLAN D2). Additive only. Before this they lived in one instance's
-- memory, so each warm instance had its own fresh budget.
CREATE TABLE "rate_limit_buckets" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_buckets_resetAt_idx" ON "rate_limit_buckets"("resetAt");
