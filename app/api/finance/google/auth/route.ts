import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";
import {
  FINANCE_GOOGLE_OAUTH_STATE_COOKIE,
  FINANCE_GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
  getGoogleFinanceAuthUrl,
  getGoogleFinanceSetupStatus,
} from "@/lib/finance/google";

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = getGoogleFinanceSetupStatus();
  if (!setup.configured) {
    return NextResponse.json(
      { error: setup.setupMessage || "Google OAuth is not configured" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const state = crypto.randomBytes(24).toString("hex");
  const response = NextResponse.redirect(getGoogleFinanceAuthUrl(origin, state));
  response.cookies.set(FINANCE_GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: FINANCE_GOOGLE_OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
