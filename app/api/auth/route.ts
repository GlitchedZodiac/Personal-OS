import { NextRequest, NextResponse } from "next/server";
import {
  authSecretProblems,
  clearAuthCookie,
  getAuthCookie,
  setAuthCookie,
  setKnownDeviceCookie,
  verifyAuthToken,
} from "@/lib/auth";
import { pinConfigured } from "@/lib/pin-auth";
import { attemptPin, lockedResponseInit } from "@/lib/pin-attempt";

// The web login. The PIN is checked against `auth_credentials` (lib/pin-auth),
// the same row device pairing uses — one PIN, one place (SEC-004). In
// production the route refuses, loudly, while a signing secret is missing
// (SEC-001/002): a 503 whose body names the variable, and a log line to match.
// The build-time preflight (scripts/security-preflight.mjs) should have
// stopped such a deploy first; this is the second line.

function serverNotConfigured(): NextResponse | null {
  const problems = authSecretProblems();
  if (problems.length === 0) return null;
  const line = problems.map((p) => `${p.variable} is ${p.reason}`).join("; ");
  console.error(
    `[auth] refusing to sign in: ${line}. Set it in Vercel → Environment Variables (openssl rand -hex 32, 32+ characters) and redeploy.`
  );
  return NextResponse.json(
    {
      error: `Server is not configured: ${line}. Set it in Vercel and redeploy.`,
      missing: problems.map((p) => p.variable),
    },
    { status: 503 }
  );
}

const PIN_NOT_CONFIGURED = "APP_PIN is not configured. Set one before unlocking the app.";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { pin?: unknown };
    const pin = typeof body.pin === "string" ? body.pin : "";

    if (!(await pinConfigured())) {
      return NextResponse.json({ error: PIN_NOT_CONFIGURED }, { status: 503 });
    }
    const notConfigured = serverNotConfigured();
    if (notConfigured) return notConfigured;

    const attempt = await attemptPin(request, "auth-login", pin);
    if (attempt.status === "locked") {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        lockedResponseInit(attempt.retryAfterSeconds)
      );
    }
    if (attempt.status === "ok") {
      const response = NextResponse.json({ success: true });
      setAuthCookie(response);
      setKnownDeviceCookie(response);
      return response;
    }
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  } catch (error) {
    console.error("Auth error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await pinConfigured())) {
    return NextResponse.json(
      { authenticated: false, configured: false, error: PIN_NOT_CONFIGURED },
      { status: 503 }
    );
  }
  const notConfigured = serverNotConfigured();
  if (notConfigured) return notConfigured;

  if (verifyAuthToken(getAuthCookie(request))) {
    return NextResponse.json({ authenticated: true, configured: true });
  }

  return NextResponse.json({ authenticated: false, configured: true }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearAuthCookie(response);
  return response;
}
