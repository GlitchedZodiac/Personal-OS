import { NextRequest, NextResponse } from "next/server";
import { authSecretProblems, setAuthCookie, setKnownDeviceCookie } from "@/lib/auth";
import { ensurePinCredential, pinConfigured } from "@/lib/pin-auth";
import { attemptPin, lockedResponseInit } from "@/lib/pin-attempt";

// Change the PIN. Cookie-gated by proxy.ts (this path is no longer under an
// allowlisted prefix — SEC-009) AND the current PIN is required. The new PIN
// is written to `auth_credentials`, the single source for the web login and
// device pairing, so the change is durable and complete (SEC-004). The old
// handler rewrote `.env.local` — a no-op on Vercel's read-only filesystem —
// and one instance's process.env; both are gone.

export async function POST(request: NextRequest) {
  try {
    if (!(await pinConfigured())) {
      return NextResponse.json(
        { error: "APP_PIN is not configured. Set APP_PIN before updating it." },
        { status: 503 }
      );
    }
    const problems = authSecretProblems();
    if (problems.length > 0) {
      return NextResponse.json(
        { error: `Server is not configured: ${problems.map((p) => `${p.variable} is ${p.reason}`).join("; ")}` },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { currentPin?: unknown; newPin?: unknown };
    const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
    const newPin = typeof body.newPin === "string" ? body.newPin : "";

    if (!/^\d{4,8}$/.test(newPin)) {
      return NextResponse.json({ error: "New PIN must be 4 to 8 digits" }, { status: 400 });
    }

    const attempt = await attemptPin(request, "auth-update-pin", currentPin);
    if (attempt.status === "locked") {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        lockedResponseInit(attempt.retryAfterSeconds)
      );
    }
    if (attempt.status === "wrong") {
      return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });
    }

    await ensurePinCredential(newPin);
    const response = NextResponse.json({ success: true });
    setAuthCookie(response);
    setKnownDeviceCookie(response);
    return response;
  } catch (error) {
    console.error("Update PIN error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Failed to update PIN" }, { status: 500 });
  }
}
