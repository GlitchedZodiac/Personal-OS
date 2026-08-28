-- Dynamic training week (2026-08-28): day-level plans the AI writes from his
-- words and a cron nudges him about. Purely additive.

CREATE TABLE "planned_workouts" (
    "id" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "sequenceId" TEXT,
    "trailId" TEXT,
    "targetWeightKg" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "source" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_workouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "planned_workouts_localDate_idx" ON "planned_workouts"("localDate");
