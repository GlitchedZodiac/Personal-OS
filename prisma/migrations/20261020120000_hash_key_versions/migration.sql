-- Hash generations (audit 2026-10, review of the 3a fix). Additive only.
-- Every existing row was hashed under the pre-audit key, which is derived
-- from whatever APP_PIN (or NEXTAUTH_SECRET) was set at the time — so it is
-- version 1 until it is re-keyed. Settings → Devices counts what is still on
-- 1, and docs/security/README.md says not to touch APP_PIN until that is 0.
ALTER TABLE "auth_credentials" ADD COLUMN "keyVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "auth_credentials" ADD COLUMN "resetConsumedFor" TEXT;
-- A stored PIN already in the scrypt format was written by the new code.
UPDATE "auth_credentials" SET "keyVersion" = 2 WHERE "pinHash" LIKE 'scrypt$%';

ALTER TABLE "device_sessions" ADD COLUMN "keyVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "device_sessions" ADD COLUMN "refreshKeyVersion" INTEGER NOT NULL DEFAULT 1;
