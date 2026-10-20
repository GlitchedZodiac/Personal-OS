// One review (2026-10-17, lane B). GET reads it as written. PATCH records a
// move he CONFIRMED — after the existing endpoint (planner, settings,
// reminders, body) has written it — so the review keeps the trail of what it
// led to. It never writes the move itself, and a Test review takes none.

import { NextRequest, NextResponse } from "next/server";
import { detailReview } from "@/lib/coach/run";
import type { ConfirmedAction, ReviewJson } from "@/lib/coach/types";
import { prisma } from "@/lib/prisma";

const MAX_RECORD_CHARS = 20_000;

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
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "action.index required" }, { status: 400 });
  }
  const record = { payload: action.payload ?? null, result: action.result ?? null };
  if (JSON.stringify(record).length > MAX_RECORD_CHARS) {
    return NextResponse.json({ error: "action record too large" }, { status: 413 });
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const row = await tx.coachReview.findUnique({ where: { id } });
      if (!row) return { status: 404, body: { error: "Review not found" } };
      if (row.kind === "test") return { status: 409, body: { error: "A Test review takes no actions." } };
      if (row.status !== "ready") return { status: 409, body: { error: "This review has no moves to confirm." } };
      const move = (row.reviewJson as ReviewJson | null)?.moves?.[index];
      if (!move || move.action.kind === "none") return { status: 400, body: { error: "No writable move at that index." } };
      if (action.kind !== move.action.kind) {
        return { status: 400, body: { error: `Move ${index + 1} is ${move.action.kind}, not ${String(action.kind)}.` } };
      }
      const actions = (Array.isArray(row.actionsJson) ? row.actionsJson : []) as unknown as ConfirmedAction[];
      if (actions.some((a) => a.index === index)) return { status: 200, body: { actions, duplicate: true } };
      const next: ConfirmedAction[] = [
        ...actions,
        { index, kind: move.action.kind, payload: record.payload, result: record.result, confirmedAt: new Date().toISOString() },
      ];
      await tx.coachReview.update({ where: { id }, data: { actionsJson: next as unknown as object } });
      return { status: 200, body: { actions: next } };
    });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Coach action record error:", error);
    return NextResponse.json({ error: "Failed to record the action" }, { status: 500 });
  }
}
