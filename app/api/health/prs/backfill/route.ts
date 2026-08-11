import { NextResponse } from "next/server";
import { rebuildPersonalRecords } from "@/lib/prs";

export const maxDuration = 60;

// POST - Rebuild personal records from full workout history, oldest first.
// Idempotent: safe to rerun whenever the exercise catalog learns new
// movements or aliases. Cookie-gated by the API middleware like everything
// else. The same rebuild also runs inline after post-hoc workout edits
// (/api/health/workouts/entry).
export async function POST() {
  try {
    return NextResponse.json(await rebuildPersonalRecords());
  } catch (error) {
    console.error("PR backfill error:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
