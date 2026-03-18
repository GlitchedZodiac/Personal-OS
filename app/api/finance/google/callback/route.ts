import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleFinanceCode,
  FINANCE_GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/finance/google";

function createSettingsRedirect(origin: string, status: "connected" | "error", message?: string) {
  const url = new URL(`${origin}/settings`);
  url.searchParams.set("finance_google", status);
  if (message) {
    url.searchParams.set("message", message.slice(0, 180));
  }

  const response = NextResponse.redirect(url);
  response.cookies.delete(FINANCE_GOOGLE_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const storedState = request.cookies.get(FINANCE_GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (error) {
    return createSettingsRedirect(origin, "error", error);
  }

  if (!state || !storedState || state !== storedState) {
    return createSettingsRedirect(origin, "error", "invalid_state");
  }

  if (!code) {
    return createSettingsRedirect(origin, "error", "no_code");
  }

  try {
    await exchangeGoogleFinanceCode(code, origin);
    return createSettingsRedirect(origin, "connected");
  } catch (err) {
    console.error("Finance Google callback error:", err);
    const message =
      err instanceof Error && err.message ? err.message : "exchange_failed";
    return createSettingsRedirect(origin, "error", message);
  }
}
