-- The Coach: make "one live review per week" a whole database fact
-- (2026-10-20, lane B — review round 2, MUST FIX 4). ADDITIVE ONLY.
--
-- The unique on "liveWeekStart" stops two live rows that name the same week,
-- but on its own it still accepts a row with kind 'live' and a NULL
-- liveWeekStart (any number of them), or a liveWeekStart naming a different
-- week than the row's own. These CHECKs close both, and pin "kind" to its
-- three values. Prisma's schema diff does not model CHECK constraints, so
-- this adds no drift.

ALTER TABLE "coach_reviews"
  ADD CONSTRAINT "coach_reviews_kind_check"
  CHECK ("kind" IN ('live', 'superseded', 'test'));

ALTER TABLE "coach_reviews"
  ADD CONSTRAINT "coach_reviews_live_week_check"
  CHECK (
    (("kind" = 'live') = ("liveWeekStart" IS NOT NULL))
    AND ("liveWeekStart" IS NULL OR "liveWeekStart" = "weekStart")
  );
