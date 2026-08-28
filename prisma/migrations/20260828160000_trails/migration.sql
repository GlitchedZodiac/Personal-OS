-- Named-trails spine (deferred item 2026-08-20, shipped 2026-08-28): a Trail
-- names ground he covers repeatedly; workouts link to it so a session can be
-- compared with the last run of the SAME trail. Purely additive.

CREATE TABLE "trails" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "distanceMeters" DOUBLE PRECISION,
    "elevationGainM" DOUBLE PRECISION,
    "summaryPolyline" TEXT,
    "startLat" DOUBLE PRECISION,
    "startLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trails_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workout_logs" ADD COLUMN "trailId" TEXT;

CREATE INDEX "workout_logs_trailId_idx" ON "workout_logs"("trailId");

ALTER TABLE "workout_logs"
  ADD CONSTRAINT "workout_logs_trailId_fkey"
  FOREIGN KEY ("trailId") REFERENCES "trails"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
