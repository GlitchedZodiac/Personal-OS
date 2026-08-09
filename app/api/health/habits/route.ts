import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 40;

// Habit ticks, keyed by (name, localDate). The design's Today screen shows
// Creatine · Mobility · 10k steps · Journal; names are free-form so the set
// can evolve without schema changes.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const localDate = searchParams.get("date") ?? "";
    if (!LOCAL_DATE_RE.test(localDate)) {
      return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
    }
    const checks = await prisma.habitCheck.findMany({ where: { localDate } });
    return NextResponse.json({ checked: checks.map((c) => c.name) });
  } catch (error) {
    console.error("Habits fetch error:", error);
    return NextResponse.json({ error: "Failed to load habits" }, { status: 500 });
  }
}

// POST { name, localDate } — toggles the tick.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name =
      typeof body.name === "string" ? body.name.trim().toLowerCase() : "";
    const localDate = typeof body.localDate === "string" ? body.localDate : "";
    if (!name || name.length > MAX_NAME || !LOCAL_DATE_RE.test(localDate)) {
      return NextResponse.json({ error: "name and localDate required" }, { status: 400 });
    }

    const existing = await prisma.habitCheck.findUnique({
      where: { name_localDate: { name, localDate } },
    });

    if (existing) {
      await prisma.habitCheck.delete({ where: { id: existing.id } });
      return NextResponse.json({ name, localDate, checked: false });
    }
    await prisma.habitCheck.create({ data: { name, localDate } });
    return NextResponse.json({ name, localDate, checked: true });
  } catch (error) {
    console.error("Habit toggle error:", error);
    return NextResponse.json({ error: "Failed to toggle habit" }, { status: 500 });
  }
}
