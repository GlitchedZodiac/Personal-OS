-- (externalSource, externalId) becomes DB-unique. The watch mints one UUID per
-- workout as its idempotency key, but the sync route enforced it with a
-- non-atomic find-then-create and the queue could be drained by overlapping
-- tasks — two racers both saw "not found" and both inserted (the same race
-- class that wrote 857 duplicate weigh-ins on 2026-08-26).
--
-- Steps 1-2 remove any duplicates present at deploy time. The 2026-08-28
-- audit found zero, but this runs unattended inside `prisma migrate deploy`
-- and the racy clients stay live until the watch update ships, so the
-- migration must clean up after them itself. Keep the OLDEST row per group —
-- double-POSTed duplicates carry identical payloads.

-- 1) Repoint personal_records at the surviving row first. workoutLogId is a
--    plain column (no FK), so the risk is dangling references, not failed
--    deletes.
UPDATE "personal_records" pr
SET "workoutLogId" = d.keep_id
FROM (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY "externalSource", "externalId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS keep_id
  FROM "workout_logs"
  WHERE "externalId" IS NOT NULL
) d
WHERE pr."workoutLogId" = d.id
  AND d.id <> d.keep_id;

-- 2) Drop the losers.
DELETE FROM "workout_logs" w
USING (
  SELECT id,
         first_value(id) OVER (
           PARTITION BY "externalSource", "externalId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS keep_id
  FROM "workout_logs"
  WHERE "externalId" IS NOT NULL
) d
WHERE w.id = d.id
  AND d.id <> d.keep_id;

-- 3) Swap the plain index for the unique one. Postgres uniques are NULLS
--    DISTINCT by default, so manual/web/import rows (externalId NULL) stay
--    unconstrained.
DROP INDEX "workout_logs_externalSource_externalId_idx";

CREATE UNIQUE INDEX "workout_logs_externalSource_externalId_key"
  ON "workout_logs"("externalSource", "externalId");
