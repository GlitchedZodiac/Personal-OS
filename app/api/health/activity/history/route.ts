import { NextResponse } from "next/server";
import { getActivityHistory } from "@/lib/activity-reports";

// GET — steps and calories over his whole history (2026-10-17): 30 days,
// 26 weeks, 24 months, every year, trends and all-time records, through
// yesterday (Central). Cookie-gated like every /api route.

export async function GET() {
  try {
    return NextResponse.json(await getActivityHistory());
  } catch (error) {
    console.error("Activity history error:", error);
    return NextResponse.json({ error: "Failed to load activity history" }, { status: 500 });
  }
}
