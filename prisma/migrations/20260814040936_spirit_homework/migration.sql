-- AlterTable
ALTER TABLE "spirit_days" ADD COLUMN     "homework" JSONB;

-- AlterTable
ALTER TABLE "spirit_terms" ADD COLUMN     "homeworkArc" TEXT,
ADD COLUMN     "summary" JSONB;

-- CreateTable
CREATE TABLE "spirit_curriculum_config" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "version" INTEGER NOT NULL,
    "homeworkKinds" JSONB NOT NULL,
    "generatorRules" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_curriculum_config_pkey" PRIMARY KEY ("id")
);
