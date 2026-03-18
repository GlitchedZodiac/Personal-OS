import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  clearAuthCookie,
  getAuthCookie,
  getConfiguredPin,
  isPinConfigured,
  setAuthCookie,
  verifyAuthToken,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    if (!isPinConfigured()) {
      return NextResponse.json(
        { error: "APP_PIN is not configured. Set one before unlocking the app." },
        { status: 503 }
      );
    }

    const rateLimit = checkRateLimit(request, "auth-login");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        }
      );
    }

    if (pin === getConfiguredPin()) {
      const response = NextResponse.json({ success: true });
      setAuthCookie(response);
      rateLimit.reset();
      return response;
    }

    rateLimit.registerFailure();
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isPinConfigured()) {
    return NextResponse.json(
      {
        authenticated: false,
        configured: false,
        error: "APP_PIN is not configured.",
      },
      { status: 503 }
    );
  }

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
