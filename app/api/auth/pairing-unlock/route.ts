import { NextResponse } from "next/server";
import { clearDoor, doorLock } from "@/lib/rate-limit";

// Device-pairing lock (audit 2026-10, review of D2): native apps carry no
// known-device marker, so a flood of wrong PINs at the pairing door keeps it
// shut for as long as the flood lasts. A signed-in browser (this route is
// cookie-gated by proxy.ts) can see that and clear it. Clearing hands a
// flooding attacker at most one more window of guesses — negligible with a
// 6–8 digit PIN.
const SCOPE = "mobile-pair";

export async function GET() {
  return NextResponse.json(await doorLock(SCOPE));
}

export async function POST() {
  await clearDoor(SCOPE);
  console.warn("[auth] device pairing unlocked from a signed-in browser");
  return NextResponse.json({ locked: false });
}
