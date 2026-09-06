-- Recording summaries (his morning ask): additive only — dev and prod share one database.
ALTER TABLE "spirit_recordings" ADD COLUMN "summary" TEXT;
ALTER TABLE "spirit_recordings" ADD COLUMN "summaryAt" TIMESTAMP(3);
