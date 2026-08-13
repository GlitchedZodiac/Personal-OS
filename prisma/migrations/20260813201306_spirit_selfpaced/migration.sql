-- AlterTable
ALTER TABLE "spirit_terms" ADD COLUMN     "generatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "spirit_study_completions" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_study_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spirit_study_completions_dayId_key" ON "spirit_study_completions"("dayId");

-- CreateIndex
CREATE INDEX "spirit_study_completions_completedAt_idx" ON "spirit_study_completions"("completedAt");
