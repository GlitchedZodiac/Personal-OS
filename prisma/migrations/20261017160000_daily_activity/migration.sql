-- Apple Health daily activity from his iPhone Shortcut. Additive only — dev
-- and prod share one database. One row per local day; the Shortcut re-sends
-- the last 7 days nightly and each re-send overwrites its day (unique date).
CREATE TABLE "daily_activity" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "steps" INTEGER,
    "active_energy_kcal" DOUBLE PRECISION,
    "resting_energy_kcal" DOUBLE PRECISION,
    "walking_running_distance_km" DOUBLE PRECISION,
    "source" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_activity_date_key" ON "daily_activity"("date");
