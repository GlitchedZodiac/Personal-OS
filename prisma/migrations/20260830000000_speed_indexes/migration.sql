-- Speed round (2026-08-29): indexes for filters the hot endpoints actually
-- run. The two JSONB expression indexes serve the metricsData path
-- predicates in train/sync/coda/progression that were full-table scans.
CREATE INDEX "personal_records_kind_achievedAt_idx" ON "personal_records"("kind", "achievedAt");
CREATE INDEX "personal_records_workoutLogId_idx" ON "personal_records"("workoutLogId");
CREATE INDEX "sequences_isArchived_updatedAt_idx" ON "sequences"("isArchived", "updatedAt");
CREATE INDEX "workout_logs_metrics_sequence_idx" ON "workout_logs" ((("metricsData"->>'sequenceId')));
CREATE INDEX "workout_logs_metrics_load_idx" ON "workout_logs" (((("metricsData"->>'loadScore')::double precision))) WHERE ("metricsData"->>'loadScore') IS NOT NULL;
