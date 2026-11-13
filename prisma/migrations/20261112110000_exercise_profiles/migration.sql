-- MCP v2 Phase C (2026-11-12): movements carry a load type and an explanation
-- (how it's done, pattern, muscles, source); routines carry a description and
-- source link. Additive only: four nullable columns.
-- AlterTable
ALTER TABLE "sequences" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "user_exercises" ADD COLUMN     "load" TEXT,
ADD COLUMN     "profile" JSONB;

