// The training week planner API (2026-08-28). GET a week, POST either one
// manual plan or the chat's confirmed week ({days:[...]}), PATCH status/edits,
// DELETE a plan. Cookie-gated by proxy.ts.

import { NextRequest, NextResponse } from "next/server";
import { getTrainingWeek, planWeek, type PlannedDayInput } from "@/lib/planner";
import { prisma } from "@/lib/prisma";
import { getUserTimeZone } from "@/lib/server-timezone";

export async function GET(request: NextRequest) {
  try {
    const timeZone = await getUserTimeZone(null);
    const weekStart = request.nextUrl.searchParams.get("weekStart") ?? undefined;
    const week = await getTrainingWeek(timeZone, weekStart);
    return NextResponse.json(week);
  } catch (error) {
    console.error("Planner week error:", error);
    return NextResponse.json({ error: "Failed to load week" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const timeZone = await getUserTimeZone(null);

    // Bulk shape — the chat's plan_training proposal confirms into this.
    if (Array.isArray(body.days)) {
      const result = await planWeek({
        days: body.days as PlannedDayInput[],
        replaceWeek: body.replaceWeek === true,
        timeZone,
      });
      return NextResponse.json(result);
    }

    const localDate = typeof body.localDate === "string" ? body.localDate : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !title) {
      return NextResponse.json(
        { error: "localDate (YYYY-MM-DD) and title are required" },
        { status: 400 }
      );
    }
    const plan = await prisma.plannedWorkout.create({
      data: {
        localDate,
        title,
        notes: typeof body.notes === "string" ? body.notes : null,
        sequenceId: typeof body.sequenceId === "string" ? body.sequenceId : null,
        trailId: typeof body.trailId === "string" ? body.trailId : null,
        targetWeightKg:
          typeof body.targetWeightKg === "number" ? body.targetWeightKg : null,
        source: "manual",
      },
    });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Planner create error:", error);
    return NextResponse.json({ error: "Failed to save plan" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (["planned", "done", "skipped"].includes(body.status)) data.status = body.status;
    if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
    if (typeof body.notes === "string") data.notes = body.notes;
    if (typeof body.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate)) {
      data.localDate = body.localDate;
    }
    const plan = await prisma.plannedWorkout.update({ where: { id }, data });
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Planner update error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await prisma.plannedWorkout.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Planner delete error:", error);
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
