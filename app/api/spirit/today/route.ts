import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refParts } from "@/lib/bible-refs";

// GET — the Spirit home + Today's Study in one call: active term, the
// current devotional day (v0: latest seeded day at or before the term
// position; the generation pipeline will make this exact), reading
// state, and the layer counts the home shows.

export async function GET() {
  try {
    const term = await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) {
      return NextResponse.json({ term: null, day: null });
    }

    // v0 day resolution: the most recently generated day of the term.
    const day = await prisma.devotionalDay.findFirst({
      where: { termId: term.id },
      orderBy: [{ weekIndex: "desc" }, { dayIndex: "desc" }],
    });

    const [
      readRow,
      noteCount,
      openQuestions,
      linkCount,
      readBooks,
      upcoming,
      completed,
      memDue,
      weeklyVerse,
      prefs,
      series,
      readDays,
    ] = await Promise.all([
      day
        ? prisma.readingLog.findFirst({ where: { dayId: day.id } })
        : Promise.resolve(null),
      prisma.spiritNote.count(),
      prisma.spiritNote.count({ where: { kind: "question", resolvedAt: null } }),
      prisma.verseLink.count(),
      prisma.readingLog.findMany({ select: { refStart: true }, distinct: ["refStart"] }),
      prisma.term.findMany({
        where: { status: "upcoming" },
        orderBy: { orderIndex: "asc" },
        select: { orderIndex: true, title: true, kick: true },
      }),
      prisma.term.findMany({
        where: { status: "completed" },
        orderBy: { orderIndex: "asc" },
        select: { orderIndex: true, title: true },
      }),
      prisma.memoryVerse.count({ where: { nextDueAt: { lte: new Date() } } }),
      prisma.memoryVerse.findFirst({ orderBy: [{ nextDueAt: "asc" }] }),
      prisma.spiritPref.findUnique({ where: { id: "main" } }),
      prisma.churchSeries.findFirst({ where: { status: "active" } }),
      prisma.readingLog.findMany({
        select: { readAt: true },
        orderBy: { readAt: "desc" },
        take: 120,
      }),
    ]);

    const bookSet = new Set(readBooks.map((r) => refParts(r.refStart).book));

    // Reading streak: consecutive calendar days (server-local) with any
    // reading, counting back from today or yesterday. Purely descriptive
    // — the UI hides it at zero, never shames.
    const dayKeys = new Set(
      readDays.map((r) => r.readAt.toISOString().slice(0, 10)),
    );
    let streak = 0;
    const cursor = new Date();
    if (!dayKeys.has(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return NextResponse.json({
      term: {
        id: term.id,
        orderIndex: term.orderIndex,
        title: term.title,
        kick: term.kick,
        rationale: term.rationale,
        hardNote: term.hardNote,
        secondNote: term.secondNote,
        weeks: term.weeks,
        syllabus: term.syllabus,
      },
      day,
      readingDone: Boolean(readRow),
      stats: {
        notes: noteCount,
        openQuestions,
        links: linkCount,
        booksRead: bookSet.size,
        memDue,
        streak,
      },
      weeklyVerse: weeklyVerse
        ? {
            refLabel: weeklyVerse.refLabel,
            occasion: weeklyVerse.occasion,
            refStart: weeklyVerse.refStart,
          }
        : null,
      prefs: {
        posture: prefs?.posture ?? "westminster",
        termPaused: prefs?.termPaused ?? false,
      },
      series: series
        ? {
            id: series.id,
            title: series.title,
            currentWeek: series.currentWeek,
            expectedWeeks: series.expectedWeeks,
            week: (Array.isArray(series.weeks) ? series.weeks : []).find(
              (w) => (w as { index?: number }).index === series.currentWeek,
            ) ?? null,
          }
        : null,
      upcoming,
      completed,
    });
  } catch (error) {
    console.error("Spirit today error:", error);
    return NextResponse.json({ error: "Failed to load Spirit" }, { status: 500 });
  }
}
