-- CreateTable
CREATE TABLE "spirit_terms" (
    "id" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kick" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "hardNote" TEXT,
    "secondNote" TEXT,
    "weeks" INTEGER NOT NULL,
    "syllabus" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_days" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pullRef" TEXT,
    "pullText" TEXT,
    "contextBlock" TEXT NOT NULL,
    "doctrine" TEXT NOT NULL,
    "practice" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "oneMoreTitle" TEXT,
    "oneMoreBody" TEXT,
    "readingRef" TEXT NOT NULL,
    "readingLabel" TEXT NOT NULL,
    "estMinutes" INTEGER NOT NULL DEFAULT 12,
    "citations" JSONB,
    "suggested" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_reading_log" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "medium" TEXT NOT NULL DEFAULT 'app',
    "track" TEXT NOT NULL DEFAULT 'term',
    "dayId" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_reading_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_highlights" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_highlights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_notes" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "spoken" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_verse_links" (
    "id" TEXT NOT NULL,
    "fromStart" INTEGER NOT NULL,
    "fromEnd" INTEGER NOT NULL,
    "toStart" INTEGER NOT NULL,
    "toEnd" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "why" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_verse_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_study_threads" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER NOT NULL,
    "messages" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_study_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_sources" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_sources_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "esv_passages" (
    "queryKey" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "verseCount" INTEGER NOT NULL,
    "audioUrl" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esv_passages_pkey" PRIMARY KEY ("queryKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "spirit_days_termId_weekIndex_dayIndex_key" ON "spirit_days"("termId", "weekIndex", "dayIndex");

-- CreateIndex
CREATE INDEX "spirit_reading_log_refStart_idx" ON "spirit_reading_log"("refStart");

-- CreateIndex
CREATE INDEX "spirit_highlights_refStart_idx" ON "spirit_highlights"("refStart");

-- CreateIndex
CREATE INDEX "spirit_notes_refStart_idx" ON "spirit_notes"("refStart");

-- CreateIndex
CREATE INDEX "spirit_verse_links_fromStart_idx" ON "spirit_verse_links"("fromStart");

-- CreateIndex
CREATE INDEX "spirit_study_threads_refStart_idx" ON "spirit_study_threads"("refStart");

-- AddForeignKey
ALTER TABLE "spirit_days" ADD CONSTRAINT "spirit_days_termId_fkey" FOREIGN KEY ("termId") REFERENCES "spirit_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
