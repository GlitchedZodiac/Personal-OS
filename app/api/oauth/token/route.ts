// The OAuth token endpoint: authorization codes and refresh tokens exchange
// into ordinary DeviceSessions (deviceType "mcp") — the same credential the
// watch carries, listed and revocable in Settings → Devices. Public route
// (proxy allowlist, exact prefix): its security is the single-use PKCE code
// / rotating refresh token, not the cookie.

import { NextRequest, NextResponse } from "next/server";
import { consumeAuthCode, sweepExpiredCodes } from "@/lib/oauth";
import { createDeviceSession, refreshDeviceSession } from "@/lib/mobile-session";

const MCP_TTL_DAYS = 30; // claude.ai refreshes; rotation beats a long token
const MCP_REFRESH_TTL_DAYS = 365;

function err(code: string, description: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function readParams(request: NextRequest): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v ?? "")])
    );
  }
  // The spec's shape: application/x-www-form-urlencoded.
  const text = await request.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(text));
}

export async function POST(request: NextRequest) {
  const p = await readParams(request);
  const grant = p.grant_type ?? "";

  if (grant === "authorization_code") {
    if (!p.code || !p.code_verifier || !p.redirect_uri || !p.client_id) {
      return err(
        "invalid_request",
        "code, code_verifier, redirect_uri and client_id are required"
      );
    }
    const consumed = await consumeAuthCode({
      code: p.code,
      clientId: p.client_id,
      redirectUri: p.redirect_uri,
      codeVerifier: p.code_verifier,
    });
    if (!consumed.ok) {
      return err("invalid_grant", "Code is invalid, expired, used, or mismatched");
    }
    const { session, accessToken, refreshToken } = await createDeviceSession({
      deviceLabel: "Claude connector (OAuth)",
      platform: "mcp",
      deviceType: "mcp",
      accessTtlDays: MCP_TTL_DAYS,
      refreshTtlDays: MCP_REFRESH_TTL_DAYS,
    });
    sweepExpiredCodes();
    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.max(
          0,
          Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
        ),
        refresh_token: refreshToken,
        scope: consumed.scope ?? "pitaya",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (grant === "refresh_token") {
    if (!p.refresh_token) return err("invalid_request", "refresh_token is required");
    const rotated = await refreshDeviceSession(p.refresh_token);
    if (!rotated) return err("invalid_grant", "Refresh token is invalid or expired");
    return NextResponse.json(
      {
        access_token: rotated.accessToken,
        token_type: "Bearer",
        expires_in: Math.max(
          0,
          Math.floor((rotated.session.expiresAt.getTime() - Date.now()) / 1000)
        ),
        refresh_token: rotated.refreshToken,
        scope: "pitaya",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return err("unsupported_grant_type", `Unsupported grant_type "${grant}"`);
}
