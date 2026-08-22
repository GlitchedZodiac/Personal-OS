-- AlterTable
ALTER TABLE "spirit_days" ADD COLUMN     "writtenPrompt" TEXT;

-- AlterTable
ALTER TABLE "spirit_prefs" ADD COLUMN     "desk" JSONB;

-- CreateTable
CREATE TABLE "spirit_notebooks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "termId" TEXT,
    "accent" TEXT NOT NULL DEFAULT '#5E7FA6',
    "inkLang" TEXT NOT NULL DEFAULT 'en',
    "audioLang" TEXT NOT NULL DEFAULT 'es',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_ink_pages" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT,
    "dayId" TEXT,
    "seriesId" TEXT,
    "weekIndex" INTEGER,
    "refStart" INTEGER,
    "refEnd" INTEGER,
    "chapterKey" INTEGER,
    "layerKey" TEXT,
    "background" TEXT NOT NULL DEFAULT 'dots',
    "strokes" JSONB NOT NULL DEFAULT '[]',
    "objects" JSONB NOT NULL DEFAULT '[]',
    "layout" JSONB,
    "textLayer" TEXT,
    "refs" JSONB NOT NULL DEFAULT '[]',
    "transcribedAt" TIMESTAMP(3),
    "thumbnail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "submittedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "editedAfterSubmit" BOOLEAN NOT NULL DEFAULT false,
    "recordingId" TEXT,
    "strokeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_ink_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_recordings" (
    "id" TEXT NOT NULL,
    "pageId" TEXT,
    "seriesId" TEXT,
    "weekIndex" INTEGER,
    "title" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'sermon',
    "preacher" TEXT,
    "passageRef" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "lang" TEXT NOT NULL DEFAULT 'es',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "retention" TEXT NOT NULL DEFAULT 'forever',
    "mimeType" TEXT NOT NULL DEFAULT 'audio/mp4',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_recording_segments" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "transcribedAt" TIMESTAMP(3),

    CONSTRAINT "spirit_recording_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spirit_ink_pages_kind_dayId_idx" ON "spirit_ink_pages"("kind", "dayId");

-- CreateIndex
CREATE INDEX "spirit_ink_pages_chapterKey_layerKey_idx" ON "spirit_ink_pages"("chapterKey", "layerKey");

-- CreateIndex
CREATE INDEX "spirit_ink_pages_notebookId_updatedAt_idx" ON "spirit_ink_pages"("notebookId", "updatedAt");

-- CreateIndex
CREATE INDEX "spirit_ink_pages_seriesId_weekIndex_idx" ON "spirit_ink_pages"("seriesId", "weekIndex");

-- CreateIndex
CREATE INDEX "spirit_recordings_seriesId_weekIndex_idx" ON "spirit_recordings"("seriesId", "weekIndex");

-- CreateIndex
CREATE INDEX "spirit_recordings_startedAt_idx" ON "spirit_recordings"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "spirit_recording_segments_recordingId_index_key" ON "spirit_recording_segments"("recordingId", "index");

-- AddForeignKey
ALTER TABLE "spirit_ink_pages" ADD CONSTRAINT "spirit_ink_pages_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "spirit_notebooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spirit_recording_segments" ADD CONSTRAINT "spirit_recording_segments_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "spirit_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
