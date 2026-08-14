import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TIME_ZONE, getDateStringInTimeZone } from "@/lib/timezone";

// POST {dayId} — he finished a study. The term advances by completion,
// never by calendar: finish one, the next unlocks; an eager day does
// two. Streak = consecutive local days with any study or reading —
// celebrated when present, invisible at zero, never owed.

export async function POST(request: NextRequest) {
  try {
    const { dayId } = (await request.json()) as { dayId: string };
    const day = await prisma.devotionalDay.findUnique({ where: { id: dayId } });
    if (!day) return NextResponse.json({ error: "Unknown study" }, { status: 404 });

    await prisma.studyCompletion.upsert({
      where: { dayId },
      create: { dayId },
      update: {},
    });

    const [term, days, completions, readings] = await Promise.all([
      prisma.term.findUnique({ where: { id: day.termId } }),
      prisma.devotionalDay.findMany({
        where: { termId: day.termId },
        orderBy: [{ weekIndex: "asc" }, { dayIndex: "asc" }],
        select: { id: true, weekIndex: true, dayIndex: true, title: true, estMinutes: true },
      }),
      prisma.studyCompletion.findMany({ select: { dayId: true, completedAt: true } }),
      prisma.readingLog.findMany({ select: { readAt: true } }),
    ]);

    const doneIds = new Set(completions.map((c) => c.dayId));
    const next = days.find((d) => !doneIds.has(d.id)) ?? null;

    // Streak over local calendar days (America/Bogota — his midnight).
    const dayKeys = new Set<string>();
    for (const c of completions) dayKeys.add(getDateStringInTimeZone(c.completedAt, DEFAULT_TIME_ZONE));
    for (const r of readings) dayKeys.add(getDateStringInTimeZone(r.readAt, DEFAULT_TIME_ZONE));
    let streak = 0;
    const cursor = new Date();
    while (dayKeys.has(getDateStringInTimeZone(cursor, DEFAULT_TIME_ZONE))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const todayKey = getDateStringInTimeZone(new Date(), DEFAULT_TIME_ZONE);
    const completedToday = completions.filter(
      (c) => getDateStringInTimeZone(c.completedAt, DEFAULT_TIME_ZONE) === todayKey,
    ).length;

    const termDone = !next;
    if (termDone && term && term.status === "active") {
      // The term-end summary — what was covered, marked most, still
      // open. Files onto the term; feeds the twice-a-year curriculum
      // revisit. Descriptive, never a verdict.
      const [byCategory, openQs] = await Promise.all([
        prisma.highlight.groupBy({
          by: ["category"],
          _count: { category: true },
          orderBy: { _count: { category: "desc" } },
          take: 1,
        }),
        prisma.spiritNote.findMany({
          where: { kind: "question", resolvedAt: null },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { body: true, refStart: true },
        }),
      ]);
      const { formatRef } = await import("@/lib/bible-refs");
      await prisma.term.update({
        where: { id: term.id },
        data: {
          status: "completed",
          summary: {
            studies: days.length,
            topCategory: byCategory[0]?.category ?? null,
            openQuestions: openQs.map((q) => ({
              q: q.body,
              at: formatRef(q.refStart),
            })),
            completedAt: new Date().toISOString(),
          },
        },
      });
      const following = await prisma.term.findFirst({
        where: { status: "upcoming" },
        orderBy: { orderIndex: "asc" },
      });
      if (following) {
        await prisma.term.update({
          where: { id: following.id },
          data: { status: "active", startedAt: new Date() },
        });
      }
    }

    return NextResponse.json({
      done: doneIds.size,
      total: days.length,
      streak,
      completedToday,
      termDone,
      next: next
        ? {
            id: next.id,
            weekIndex: next.weekIndex,
            dayIndex: next.dayIndex,
            title: next.title,
            estMinutes: next.estMinutes,
          }
        : null,
    });
  } catch (error) {
    console.error("Spirit complete error:", error);
    return NextResponse.json({ error: "Failed to record the study" }, { status: 500 });
  }
}

// DELETE ?dayId= — undo (mis-taps happen; nothing is ever owed, so
// nothing is ever locked).
export async function DELETE(request: NextRequest) {
  try {
    const dayId = request.nextUrl.searchParams.get("dayId");
    if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
    await prisma.studyCompletion.deleteMany({ where: { dayId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Spirit uncomplete error:", error);
    return NextResponse.json({ error: "Failed to undo" }, { status: 500 });
  }
}
