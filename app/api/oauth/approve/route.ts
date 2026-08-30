// The approve step behind /oauth/authorize (2026-08-29). Cookie-gated by
// the proxy (deliberately NOT on the allowlist — only the /token and
// /register siblings are): the PIN holder clicking Approve is the consent.
// Validates the client + redirect policy, mints the single-use PKCE code,
// and hands the page its redirect.

import { NextRequest, NextResponse } from "next/server";
import { mintAuthCode, validateClient } from "@/lib/oauth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
    const codeChallenge =
      typeof body.code_challenge === "string" ? body.code_challenge : "";
    const method =
      typeof body.code_challenge_method === "string" ? body.code_challenge_method : "S256";
    const state = typeof body.state === "string" ? body.state : null;
    const scope = typeof body.scope === "string" ? body.scope : null;

    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "client_id and redirect_uri are required" },
        { status: 400 }
      );
    }
    if (!codeChallenge || method !== "S256") {
      return NextResponse.json(
        { error: "PKCE with S256 is required" },
        { status: 400 }
      );
    }

    const client = await validateClient(clientId, redirectUri);
    if (!client.ok) {
      return NextResponse.json({ error: client.error }, { status: 400 });
    }

    const code = await mintAuthCode({ clientId, redirectUri, codeChallenge, scope });
    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state != null) target.searchParams.set("state", state);

    return NextResponse.json({
      redirectTo: target.toString(),
      clientLabel: client.clientLabel,
    });
  } catch (error) {
    console.error("OAuth approve error:", error);
    return NextResponse.json({ error: "Approval failed" }, { status: 500 });
  }
}
