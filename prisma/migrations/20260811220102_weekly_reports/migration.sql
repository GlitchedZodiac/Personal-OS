-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_weekStart_key" ON "weekly_reports"("weekStart");
