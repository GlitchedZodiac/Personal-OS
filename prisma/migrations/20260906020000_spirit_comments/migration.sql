-- V3 §1: verse- and word-anchored comment threads. Additive only — the dev and
-- prod deployments share one database.
CREATE TABLE "spirit_comments" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER,
    "wordStart" INTEGER,
    "wordEnd" INTEGER,
    "anchorText" TEXT,
    "markKind" TEXT,
    "markStrokeIds" JSONB,
    "entries" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "spirit_comments_refStart_idx" ON "spirit_comments"("refStart");
