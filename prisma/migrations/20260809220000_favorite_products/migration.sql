-- AlterTable
ALTER TABLE "favorite_foods" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'meal',
ADD COLUMN     "servingLabel" TEXT,
ADD COLUMN     "photoData" TEXT;
