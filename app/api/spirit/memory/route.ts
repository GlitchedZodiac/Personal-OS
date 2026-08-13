import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatRef } from "@/lib/bible-refs";

// The memory deck — private reinforcement, filed by occasion, never
// scored. Cards enter only from the Reader (his choice); review spacing
// doubles on "got it" and returns within the week on "again".

export async function GET() {
  try {
    const now = new Date();
    const cards = await prisma.memoryVerse.findMany({
      orderBy: [{ nextDueAt: "asc" }],
    });
    const due = cards.filter((c) => c.nextDueAt <= now);

    const occasions = new Map<string, number>();
    for (const c of cards) {
      occasions.set(c.occasion, (occasions.get(c.occasion) ?? 0) + 1);
    }

    // Weekly-review stats: descriptive only, computed, no verdicts.
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const [marksWeek, questionsWeek] = await Promise.all([
      prisma.highlight.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.spiritNote.count({
        where: { kind: "question", createdAt: { gte: weekAgo } },
      }),
    ]);

    return NextResponse.json({
      cards: cards.map((c) => ({
        id: c.id,
        refStart: c.refStart,
        refEnd: c.refEnd,
        refLabel: c.refLabel,
        occasion: c.occasion,
        prompt: c.prompt,
        why: c.why,
        due: c.nextDueAt <= now,
        timesGot: c.timesGot,
      })),
      dueCount: due.length,
      occasions: [...occasions.entries()].map(([lab, n]) => ({ lab, n })),
      week: { marks: marksWeek, questions: questionsWeek },
    });
  } catch (error) {
    console.error("Spirit memory error:", error);
    return NextResponse.json({ error: "Failed to load memory deck" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refStart = Number(body.refStart);
    const refEnd = Number(body.refEnd ?? body.refStart);
    const occasion = String(body.occasion ?? "").trim();
    if (!refStart || !occasion) {
      return NextResponse.json({ error: "refStart and occasion required" }, { status: 400 });
    }
    const refLabel = formatRef(refStart, refEnd);
    const card = await prisma.memoryVerse.create({
      data: {
        refStart,
        refEnd,
        refLabel,
        occasion,
        prompt:
          String(body.prompt ?? "").trim() ||
          `When ${occasion.toLowerCase()} is the moment — what do you reach for?`,
        why: body.why ? String(body.why) : null,
      },
    });
    return NextResponse.json({ card });
  } catch (error) {
    console.error("Spirit memory add error:", error);
    return NextResponse.json({ error: "Failed to add card" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const result = body.result === "got" ? "got" : "again";
    const card = await prisma.memoryVerse.findUnique({ where: { id } });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const intervalDays =
      result === "got" ? Math.min(card.intervalDays * 2, 90) : 3;
    const updated = await prisma.memoryVerse.update({
      where: { id },
      data: {
        intervalDays,
        nextDueAt: new Date(Date.now() + intervalDays * 86_400_000),
        lastSeenAt: new Date(),
        timesGot: result === "got" ? card.timesGot + 1 : card.timesGot,
      },
    });
    return NextResponse.json({ card: updated });
  } catch (error) {
    console.error("Spirit memory review error:", error);
    return NextResponse.json({ error: "Failed to record review" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.memoryVerse.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Spirit memory delete error:", error);
    return NextResponse.json({ error: "Failed to delete card" }, { status: 500 });
  }
}
