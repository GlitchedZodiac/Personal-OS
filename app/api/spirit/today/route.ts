import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refParts } from "@/lib/bible-refs";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/timezone";

// GET — the Spirit home + the current study in one call. SELF-PACED:
// the "current" study is a POSITION (first study he hasn't completed,
// in syllabus order), never a calendar date. Finish one, the next
// unlocks; an eager day does two; nothing is ever owed.

export async function GET() {
  try {
    const term = await prisma.term.findFirst({ where: { status: "active" } });
    if (!term) {
      return NextResponse.json({ term: null, day: null });
    }

    // Position resolution: first day without a completion, in order.
    const [allDays, completions] = await Promise.all([
      prisma.devotionalDay.findMany({
        where: { termId: term.id },
        orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }],
      }),
      prisma.studyCompletion.findMany({
        select: { dayId: true, completedAt: true },
      }),
    ]);
    const doneIds = new Set(completions.map((c) => c.dayId));
    const day = allDays.find((d) => !doneIds.has(d.id)) ?? null;

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
        take: 365,
      }),
    ]);

    const bookSet = new Set(readBooks.map((r) => refParts(r.refStart).book));

    // Streak: consecutive LOCAL days (his midnight, America/Bogota)
    // with a completed study or a reading. Descriptive only — the UI
    // hides it at zero; a gap simply restarts the count, no shame copy.
    const dayKeys = new Set<string>();
    for (const c of completions) {
      dayKeys.add(getDateStringInTimeZone(c.completedAt, DEFAULT_TIME_ZONE));
    }
    for (const r of readDays) {
      dayKeys.add(getDateStringInTimeZone(r.readAt, DEFAULT_TIME_ZONE));
    }
    let streak = 0;
    const cursor = new Date();
    if (!dayKeys.has(getDateStringInTimeZone(cursor, DEFAULT_TIME_ZONE))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (dayKeys.has(getDateStringInTimeZone(cursor, DEFAULT_TIME_ZONE))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const todayKey = getDateStringInTimeZone(new Date(), DEFAULT_TIME_ZONE);
    const completedToday = completions.filter(
      (c) => getDateStringInTimeZone(c.completedAt, DEFAULT_TIME_ZONE) === todayKey,
    ).length;

    // Days where he did 2+ studies — the double portions, counted
    // quietly, celebrated never demanded.
    const perDay = new Map<string, number>();
    for (const c of completions) {
      const k = getDateStringInTimeZone(c.completedAt, DEFAULT_TIME_ZONE);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const doublePortions = [...perDay.values()].filter((n) => n >= 2).length;

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
      progress: {
        done: doneIds.size,
        total: allDays.length,
        target: term.weeks * 6,
        generated: Boolean(term.generatedAt),
        completedToday,
        doublePortions,
        termDone: allDays.length > 0 && !day,
      },
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
