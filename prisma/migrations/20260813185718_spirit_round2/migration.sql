-- CreateTable
CREATE TABLE "spirit_memory_verses" (
    "id" TEXT NOT NULL,
    "refStart" INTEGER NOT NULL,
    "refEnd" INTEGER NOT NULL,
    "refLabel" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "why" TEXT,
    "intervalDays" INTEGER NOT NULL DEFAULT 3,
    "nextDueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "timesGot" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spirit_memory_verses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_church_series" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expectedWeeks" INTEGER,
    "lengthNote" TEXT,
    "passages" JSONB NOT NULL,
    "themes" TEXT,
    "weeks" JSONB NOT NULL DEFAULT '[]',
    "currentWeek" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_church_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spirit_prefs" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "posture" TEXT NOT NULL DEFAULT 'westminster',
    "termPaused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spirit_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spirit_memory_verses_nextDueAt_idx" ON "spirit_memory_verses"("nextDueAt");
