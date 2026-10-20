// POST — confirm one of a review's moves (2026-10-20, lane B). The ONLY path
// that writes a Coach move: lib/coach/confirm.ts. Body: { values? } — only a
// measurement's typed values; everything else comes from the stored move.

import { NextRequest, NextResponse } from "next/server";
import { confirmMove } from "@/lib/coach/confirm";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const index = Number(n);
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: "move index required" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { values?: unknown };
  try {
    const outcome = await confirmMove(id, index, { values: body.values });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Coach confirm error:", error);
    return NextResponse.json({ error: "The move could not be written." }, { status: 500 });
  }
}
