-- AlterTable
ALTER TABLE "spirit_days" ADD COLUMN     "aim" TEXT;

-- AlterTable
ALTER TABLE "spirit_terms" ADD COLUMN     "objectives" JSONB;

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_homework_checks" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_homework_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "spirit_homework_checks_dayId_key" ON "spirit_homework_checks"("dayId");

-- CreateIndex
CREATE INDEX "spirit_homework_checks_doneAt_idx" ON "spirit_homework_checks"("doneAt");
