-- Zero-effort daily metrics the watch already measures.
ALTER TABLE "daily_health_snapshots" ADD COLUMN "respiratoryRateBrpm" DOUBLE PRECISION;
ALTER TABLE "daily_health_snapshots" ADD COLUMN "wristTempC" DOUBLE PRECISION;
ALTER TABLE "daily_health_snapshots" ADD COLUMN "vo2Max" DOUBLE PRECISION;
ALTER TABLE "daily_health_snapshots" ADD COLUMN "spo2Pct" DOUBLE PRECISION;
