import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Milestones he logs himself — the automatic ones are derived, never stored.
// POST { day, title, note?, weightKg? } · DELETE ?id=

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || typeof body.day !== "string" || !DAY.test(body.day)) {
      return NextResponse.json({ error: "A title and a day (YYYY-MM-DD) are required" }, { status: 400 });
    }
    const weightKg = Number(body.weightKg);
    const milestone = await prisma.bodyMilestone.create({
      data: {
        day: body.day,
        title: title.slice(0, 120),
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null,
        weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : null,
      },
    });
    return NextResponse.json({ milestone });
  } catch (error) {
    console.error("Milestone create error:", error);
    return NextResponse.json({ error: "Failed to save the milestone" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    await prisma.bodyMilestone.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Milestone delete error:", error);
    return NextResponse.json({ error: "Failed to delete the milestone" }, { status: 500 });
  }
}
