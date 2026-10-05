-- Body composition from the RENPHO 8-electrode scale (his 2026-10-04 go).
-- Additive only — dev and prod share one database, and the running prod build
-- must keep working against this schema until the new code deploys.

-- Whole-body values the old scale never produced.
ALTER TABLE "body_measurements" ADD COLUMN "fatMassKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "muscleMassPct" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "skeletalMuscleKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "smi" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "bodyWaterKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "proteinKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "whrEstimate" DOUBLE PRECISION;

-- Segmental lean and fat mass.
ALTER TABLE "body_measurements" ADD COLUMN "muscleLeftArmKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "muscleRightArmKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "muscleTrunkKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "muscleLeftLegKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "muscleRightLegKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "fatLeftArmKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "fatRightArmKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "fatTrunkKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "fatLeftLegKg" DOUBLE PRECISION;
ALTER TABLE "body_measurements" ADD COLUMN "fatRightLegKg" DOUBLE PRECISION;

-- Impedance, the source's reference ranges, per-field provenance, raw record.
ALTER TABLE "body_measurements" ADD COLUMN "impedance" JSONB;
ALTER TABLE "body_measurements" ADD COLUMN "referenceRanges" JSONB;
ALTER TABLE "body_measurements" ADD COLUMN "fieldSources" JSONB;
ALTER TABLE "body_measurements" ADD COLUMN "rawPayload" JSONB;

-- Idempotency key for cloud imports. Postgres uniques are NULLS DISTINCT, so
-- every existing row (externalId NULL) stays unconstrained.
ALTER TABLE "body_measurements" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "body_measurements_externalId_key"
  ON "body_measurements"("externalId");

-- One row per scale-cloud pull.
CREATE TABLE "body_sync_runs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "merged" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "alerted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "body_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "body_sync_runs_provider_startedAt_idx"
  ON "body_sync_runs"("provider", "startedAt");
