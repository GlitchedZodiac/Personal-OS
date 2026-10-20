-- The Coach: pin status and trigger to their values too (2026-10-20, lane B —
-- review round 3, item 8). ADDITIVE ONLY; Prisma's diff does not model CHECKs.

ALTER TABLE "coach_reviews"
  ADD CONSTRAINT "coach_reviews_status_check"
  CHECK ("status" IN ('generating', 'ready', 'failed', 'blocked_budget'));

ALTER TABLE "coach_reviews"
  ADD CONSTRAINT "coach_reviews_trigger_check"
  CHECK ("trigger" IN ('cron', 'manual'));
