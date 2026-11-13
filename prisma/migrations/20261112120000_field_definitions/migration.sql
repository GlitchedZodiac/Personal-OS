-- MCP v2 Phase B (2026-11-12): fields Claude can add without a code release.
-- Additive only: a definitions table, one nullable `extra` JSON column on
-- food, body measurements and workouts, and the starter definitions from the
-- 2026-11-12 gap review (#10 left/right limbs, abdomen, tape method; #11 food
-- confidence). Re-running inserts nothing twice (ON CONFLICT DO NOTHING).

-- AlterTable
ALTER TABLE "body_measurements" ADD COLUMN     "extra" JSONB;

-- AlterTable
ALTER TABLE "food_logs" ADD COLUMN     "extra" JSONB;

-- AlterTable
ALTER TABLE "workout_logs" ADD COLUMN     "extra" JSONB;

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "options" JSONB,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdVia" TEXT NOT NULL DEFAULT 'mcp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_entity_key_key" ON "field_definitions"("entity", "key");

-- Starter definitions
INSERT INTO "field_definitions" ("id", "entity", "key", "label", "type", "unit", "min", "max", "options", "description", "createdVia", "updatedAt") VALUES
  (gen_random_uuid()::text, 'measurement', 'abdomenCm', 'Abdomen', 'number', 'cm', 40, 200, NULL, 'Abdomen circumference at the navel line (not the waist), tape level all round.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'armLeftCm', 'Left arm', 'number', 'cm', 15, 70, NULL, 'Left upper arm at its widest point, relaxed unless tapeMethod says flexed.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'armRightCm', 'Right arm', 'number', 'cm', 15, 70, NULL, 'Right upper arm at its widest point, relaxed unless tapeMethod says flexed.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'thighLeftCm', 'Left thigh', 'number', 'cm', 30, 100, NULL, 'Left thigh at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'thighRightCm', 'Right thigh', 'number', 'cm', 30, 100, NULL, 'Right thigh at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'calfLeftCm', 'Left calf', 'number', 'cm', 20, 70, NULL, 'Left calf at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'calfRightCm', 'Right calf', 'number', 'cm', 20, 70, NULL, 'Right calf at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'forearmLeftCm', 'Left forearm', 'number', 'cm', 15, 60, NULL, 'Left forearm at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'forearmRightCm', 'Right forearm', 'number', 'cm', 15, 60, NULL, 'Right forearm at its widest point.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'tapeMethod', 'Tape method', 'enum', NULL, NULL, NULL, '["hand", "tape-app", "clinic"]', 'How the tape numbers were taken: a hand tape, a body-measurement app, or a clinic.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'measurement', 'tapeLandmarks', 'Tape landmarks', 'text', NULL, NULL, NULL, NULL, 'Where each tape went (e.g. waist at the narrowest point vs at the navel), so two sessions taken at different spots are not read as a change.', 'seed', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'food', 'confidence', 'How the numbers were obtained', 'enum', NULL, NULL, NULL, '["label", "weighed", "estimated", "photo-estimate"]', 'label = a scanned nutrition label; weighed = portions weighed against known values; estimated = a reasonable estimate; photo-estimate = estimated from a photo or a party plate. Lets the weekly check tell a logging-accuracy problem from a real stall.', 'seed', CURRENT_TIMESTAMP)
ON CONFLICT ("entity", "key") DO NOTHING;
