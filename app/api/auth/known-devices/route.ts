import { NextResponse } from "next/server";
import { setKnownDeviceCookie } from "@/lib/auth";
import { bumpMarkerGeneration } from "@/lib/security-settings";

// POST — "Forget all known devices" (audit 2026-10, review of D2b). Every
// known-device marker carries a generation; bumping it voids them all at
// once (after a lost laptop, say) without rotating AUTH_COOKIE_SECRET. The
// browser asking gets a fresh marker. Cookie-gated by proxy.ts (this path is
// not an allowlist entry — only /api/auth itself is).
export async function POST() {
  try {
    const generation = await bumpMarkerGeneration();
    const response = NextResponse.json({ forgotten: true, generation });
    setKnownDeviceCookie(response, generation);
    return response;
  } catch (error) {
    console.error("Known-device reset error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not forget known devices" }, { status: 500 });
  }
}
