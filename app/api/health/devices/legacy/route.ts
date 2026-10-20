import { NextResponse } from "next/server";
import { revokeStaleLegacySessions } from "@/lib/mobile-session";

// POST — "Revoke unused old sessions" (audit 2026-10, review of the 3a fix):
// old-key sessions unseen for 30 days are revoked, so the old-key count can
// reach zero without waiting a year for an unused connector's refresh token.
// Cookie-gated by proxy.ts like every /api/health route.
export async function POST() {
  try {
    return NextResponse.json({ revoked: await revokeStaleLegacySessions(30) });
  } catch (error) {
    console.error("Stale session revoke error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not revoke old sessions" }, { status: 500 });
  }
}
