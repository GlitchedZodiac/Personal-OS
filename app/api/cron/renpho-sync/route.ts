// Scheduled RENPHO pull. NOT in vercel.json yet, on purpose: a login with his
// account signs his phone's Renpho Health app out, so nothing schedules this
// until the pull runs under a separate service account (docs/renpho-gap-report.md).
// The route exists so that switching it on is one cron line and one env flag.
//
// /api/cron/* is on the proxy.ts allowlist, so this route verifies CRON_SECRET
// itself — and lib/renpho-sync.ts additionally refuses to run unless
// RENPHO_SYNC_ENABLED=1.

import { NextRequest, NextResponse } from "next/server";
import { runRenphoSync } from "@/lib/renpho-sync";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runRenphoSync("cron"));
}
