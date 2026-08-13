import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPassage } from "@/lib/esv";

// GET ?q=Judges+4&pin=1&dayId= — the Reader's one call: cached ESV verse
// model merged with HIS layer (highlights, notes, links, threads) and
// the day's suggested highlights (suggestions vanish once a highlight
// exists on that verse — accepting creates the highlight).

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    if (!q) return NextResponse.json({ error: "q required" }, { status: 400 });
    const pin = searchParams.get("pin") === "1";
    const dayId = searchParams.get("dayId");

    const model = await getPassage(q, { pin });
    if (model.verses.length === 0) {
      return NextResponse.json({ error: "Passage not found" }, { status: 404 });
    }
    const lo = model.verses[0].refInt;
    const hi = model.verses[model.verses.length - 1].refInt;

    const [highlights, notes, links, threads, day] = await Promise.all([
      prisma.highlight.findMany({
        where: { refStart: { lte: hi }, refEnd: { gte: lo } },
      }),
      prisma.spiritNote.findMany({
        where: { refStart: { lte: hi }, refEnd: { gte: lo } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.verseLink.findMany({
        where: { fromStart: { lte: hi }, fromEnd: { gte: lo } },
      }),
      prisma.studyThread.findMany({
        where: { refStart: { lte: hi }, refEnd: { gte: lo } },
        orderBy: { updatedAt: "desc" },
      }),
      dayId
        ? prisma.devotionalDay.findUnique({ where: { id: dayId } })
        : Promise.resolve(null),
    ]);

    const highlighted = new Set(
      highlights.flatMap((h) => {
        const refs: number[] = [];
        for (let r = h.refStart; r <= h.refEnd && refs.length < 200; r++) refs.push(r);
        return refs;
      })
    );
    const suggested = (Array.isArray(day?.suggested) ? day.suggested : []).filter(
      (s) => {
        const ref = (s as { refInt?: number }).refInt;
        return typeof ref === "number" && ref >= lo && ref <= hi && !highlighted.has(ref);
      }
    );

    return NextResponse.json({
      ...model,
      layer: { highlights, notes, links, threads },
      suggested,
    });
  } catch (error) {
    console.error("Spirit passage error:", error);
    const message = (error as Error)?.message ?? "";
    return NextResponse.json(
      { error: message.includes("ESV") ? message : "Failed to load passage" },
      { status: 502 }
    );
  }
}
