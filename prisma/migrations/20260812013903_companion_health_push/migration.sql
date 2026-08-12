-- AlterTable
ALTER TABLE "daily_health_snapshots" ADD COLUMN     "hrvMs" DOUBLE PRECISION,
ADD COLUMN     "sleepDeepMinutes" INTEGER,
ADD COLUMN     "sleepMinutes" INTEGER,
ADD COLUMN     "sleepRemMinutes" INTEGER;

-- CreateTable
CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "bundleId" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");
