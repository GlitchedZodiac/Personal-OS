import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPassage } from "@/lib/esv";
import { CHAPTER_END, parseReadingRef, readingSpan } from "@/lib/spirit-refs";
import { refParts } from "@/lib/bible-refs";

// POST — log a reading (app or PAPER; paper counts or the transcript
// lies). DELETE ?dayId= — unmark the day.
//
// A term reading may post `{dayId}` alone: the server resolves the
// honest range from the day's own readingRef. Before 2026-08-20 the
// client sent a range it had guessed by splitting the ref string, and
// "1 Corinthians 7:1–7" was logged as a single verse — the lifetime
// Transcript then counted the book on the strength of verse 1.

async function resolveDayRange(dayId: string) {
  const day = await prisma.devotionalDay.findUnique({ where: { id: dayId } });
  if (!day) return null;
  const segments = parseReadingRef(day.readingRef);
  const span = readingSpan(segments);
  if (!span) return null;

  // Verse-precise on both ends? Nothing to look up.
  const endParts = refParts(span.refEnd);
  if (endParts.verse !== CHAPTER_END) {
    return { ...span, label: day.readingLabel };
  }

  // "Psalm 23" — ask the (usually cached) passage for its last verse so
  // the log records a real range instead of a 999 sentinel.
  const last = segments[segments.length - 1];
  try {
    const passage = await getPassage(`${last.bookName} ${last.endChapter}`);
    const lastVerse = passage.verses[passage.verses.length - 1];
    if (lastVerse) {
      return { refStart: span.refStart, refEnd: lastVerse.refInt, label: day.readingLabel };
    }
  } catch {
    // ESV unreachable — the sentinel still spans the chapter correctly
    // for coverage maths; it just isn't a real verse number.
  }
  return { ...span, label: day.readingLabel };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      refStart?: number;
      refEnd?: number;
      label?: string;
      medium?: string;
      track?: string;
      dayId?: string;
    };
    const dayId = typeof body.dayId === "string" ? body.dayId : null;

    let refStart = Number(body.refStart);
    let refEnd = Number(body.refEnd ?? body.refStart);
    let label = typeof body.label === "string" ? body.label : "";

    // The term path: trust the day, never the client's arithmetic.
    if (dayId) {
      const resolved = await resolveDayRange(dayId);
      if (resolved) {
        refStart = resolved.refStart;
        refEnd = resolved.refEnd;
        label = label || resolved.label;
      }
    }

    if (!Number.isInteger(refStart)) {
      return NextResponse.json({ error: "refStart required" }, { status: 400 });
    }
    if (!Number.isInteger(refEnd) || refEnd < refStart) refEnd = refStart;

    // One log per day — re-marking replaces rather than stacking.
    if (dayId) await prisma.readingLog.deleteMany({ where: { dayId } });

    const row = await prisma.readingLog.create({
      data: {
        refStart,
        refEnd,
        label,
        medium: body.medium === "paper" ? "paper" : "app",
        track: body.track === "track2" ? "track2" : body.track === "free" ? "free" : "term",
        dayId,
      },
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error("Spirit read error:", error);
    return NextResponse.json({ error: "Failed to log reading" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dayId = searchParams.get("dayId");
  if (!dayId) return NextResponse.json({ error: "dayId required" }, { status: 400 });
  await prisma.readingLog.deleteMany({ where: { dayId } });
  return NextResponse.json({ deleted: true });
}
