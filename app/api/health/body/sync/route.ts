// Scale-cloud sync from the app: GET says when the RENPHO pull last ran and
// how it went (the Body screen's "last synced"); POST runs one now.
// Cookie-gated by proxy.ts like every other /api/health route.

import { NextResponse } from "next/server";
import { renphoSyncStatus, runRenphoSync } from "@/lib/renpho-sync";

export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await renphoSyncStatus());
  } catch (error) {
    console.error("Scale sync status error:", error);
    return NextResponse.json({ error: "Failed to read sync status" }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json(await runRenphoSync("manual"));
  } catch (error) {
    console.error("Scale sync error:", error);
    return NextResponse.json({ error: "Failed to run the scale sync" }, { status: 500 });
  }
}
