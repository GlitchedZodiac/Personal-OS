// One review (2026-10-17, lane B). GET reads it as written. PATCH marks a
// confirmed move TAKEN BACK — after the card undid it through the endpoint
// that owns the row (the settings write; the body route's DELETE). Moves are
// confirmed only at …/moves/[n]/confirm (lib/coach/confirm.ts), on the server.

import { NextRequest, NextResponse } from "next/server";
import { detailReview } from "@/lib/coach/run";
import type { ConfirmedAction } from "@/lib/coach/types";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await prisma.coachReview.findUnique({ where: { id } }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  return NextResponse.json({ review: detailReview(row) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { action?: Record<string, unknown> };
  const action = body.action ?? {};
  const index = Number(action.index);
  if (!Number.isInteger(index) || index < 0 || action.undo !== true) {
    return NextResponse.json({ error: "Only { action: { index, undo: true } } — moves are confirmed at …/moves/[n]/confirm." }, { status: 400 });
  }
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const row = await tx.coachReview.findUnique({ where: { id } });
      if (!row) return { status: 404, body: { error: "Review not found" } };
      const actions = (Array.isArray(row.actionsJson) ? row.actionsJson : []) as unknown as ConfirmedAction[];
      const target = actions.find((a) => a.index === index && !a.undoneAt);
      if (!target) return { status: 409, body: { error: "Nothing confirmed to undo for that move." } };
      const next = actions.map((a) => (a === target ? { ...a, undoneAt: new Date().toISOString() } : a));
      await tx.coachReview.update({ where: { id }, data: { actionsJson: next as unknown as object } });
      return { status: 200, body: { actions: next } };
    });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Coach undo record error:", error);
    return NextResponse.json({ error: "Failed to record the undo" }, { status: 500 });
  }
}
