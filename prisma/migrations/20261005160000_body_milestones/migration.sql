-- Milestones he logs himself, for the Body screen's timeline. Additive only —
-- dev and prod share one database. The automatic milestones are derived from
-- the readings and are not stored.
CREATE TABLE "body_milestones" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "weightKg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_milestones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "body_milestones_day_idx" ON "body_milestones"("day");
