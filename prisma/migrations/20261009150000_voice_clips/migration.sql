-- Wrist voice logging audit trail. Additive only — dev and prod share one
-- database. One row per clip the watch posts; the audio sits in its own
-- table so reading the audit never loads it.
CREATE TABLE "voice_clips" (
    "id" TEXT NOT NULL,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workoutExternalId" TEXT,
    "workoutLogId" TEXT,
    "workoutKind" TEXT,
    "elapsedSeconds" INTEGER,
    "appBuild" TEXT,
    "transcript" TEXT NOT NULL,
    "transcribeModel" TEXT,
    "audioSeconds" DOUBLE PRECISION,
    "audioSizeBytes" INTEGER,
    "parser" TEXT NOT NULL,
    "rulesResult" JSONB,
    "llmRaw" TEXT,
    "entries" JSONB NOT NULL,
    "context" JSONB,
    "ms" JSONB,
    "outcome" TEXT,

    CONSTRAINT "voice_clips_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_clips_createdAt_idx" ON "voice_clips"("createdAt");
CREATE INDEX "voice_clips_entryId_idx" ON "voice_clips"("entryId");
CREATE INDEX "voice_clips_workoutExternalId_idx" ON "voice_clips"("workoutExternalId");
CREATE INDEX "voice_clips_workoutLogId_idx" ON "voice_clips"("workoutLogId");

CREATE TABLE "voice_clip_audio" (
    "clipId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "voice_clip_audio_pkey" PRIMARY KEY ("clipId")
);

ALTER TABLE "voice_clip_audio" ADD CONSTRAINT "voice_clip_audio_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "voice_clips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
