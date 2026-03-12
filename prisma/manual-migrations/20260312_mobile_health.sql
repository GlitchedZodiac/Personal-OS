ALTER TABLE "workout_logs"
  ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "distanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stepCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "avgHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxHeartRateBpm" INTEGER,
  ADD COLUMN IF NOT EXISTS "elevationGainM" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "routeData" JSONB,
  ADD COLUMN IF NOT EXISTS "metricsData" JSONB,
  ADD COLUMN IF NOT EXISTS "deviceType" TEXT,
  ADD COLUMN IF NOT EXISTS "externalSource" TEXT,
  ADD COLUMN IF NOT EXISTS "externalId" TEXT,
  ADD COLUMN IF NOT EXISTS "syncStatus" TEXT NOT NULL DEFAULT 'synced';

CREATE INDEX IF NOT EXISTS "workout_logs_externalSource_externalId_idx"
  ON "workout_logs"("externalSource", "externalId");

CREATE INDEX IF NOT EXISTS "workout_logs_syncStatus_idx"
  ON "workout_logs"("syncStatus");

CREATE TABLE IF NOT EXISTS "auth_credentials" (
  "id" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "device_sessions" (
  "id" TEXT NOT NULL,
  "deviceLabel" TEXT NOT NULL,
  "platform" TEXT,
  "deviceType" TEXT,
  "tokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_sessions_tokenHash_key"
  ON "device_sessions"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "device_sessions_refreshTokenHash_key"
  ON "device_sessions"("refreshTokenHash");

CREATE INDEX IF NOT EXISTS "device_sessions_expiresAt_idx"
  ON "device_sessions"("expiresAt");

CREATE INDEX IF NOT EXISTS "device_sessions_refreshExpiresAt_idx"
  ON "device_sessions"("refreshExpiresAt");

CREATE INDEX IF NOT EXISTS "device_sessions_revokedAt_idx"
  ON "device_sessions"("revokedAt");

CREATE TABLE IF NOT EXISTS "daily_health_snapshots" (
  "id" TEXT NOT NULL,
  "localDate" TEXT NOT NULL,
  "timeZone" TEXT NOT NULL,
  "steps" INTEGER NOT NULL DEFAULT 0,
  "restingHeartRateBpm" INTEGER,
  "activeEnergyKcal" DOUBLE PRECISION,
  "walkingRunningDistanceMeters" DOUBLE PRECISION,
  "source" TEXT NOT NULL DEFAULT 'apple_health',
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_health_snapshots_localDate_timeZone_source_key"
  ON "daily_health_snapshots"("localDate", "timeZone", "source");

CREATE INDEX IF NOT EXISTS "daily_health_snapshots_localDate_timeZone_idx"
  ON "daily_health_snapshots"("localDate", "timeZone");
