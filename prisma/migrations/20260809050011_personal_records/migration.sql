-- CreateTable
CREATE TABLE "personal_records" (
    "id" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "workoutLogId" TEXT,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_records_exercise_kind_key" ON "personal_records"("exercise", "kind");
