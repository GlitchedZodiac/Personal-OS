// RFC 7591 dynamic client registration — the claude.ai dialog's "No client
// ID — register one automatically" path. Stateless on purpose: the minted
// client_id is an HMAC-signed blob carrying its own redirect_uris, so there
// is no client table to grow or garbage-collect. Redirect destinations are
// still policy-checked at authorize AND token time.

import { NextRequest, NextResponse } from "next/server";
import { mintDcrClientId, redirectUriAllowed } from "@/lib/oauth";

export async function POST(request: NextRequest) {
  let body: {
    redirect_uris?: unknown;
    client_name?: unknown;
    token_endpoint_auth_method?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400 }
    );
  }

  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || uris.length > 10) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "1–10 redirect_uris required" },
      { status: 400 }
    );
  }
  for (const uri of uris) {
    if (!redirectUriAllowed(uri)) {
      return NextResponse.json(
        {
          error: "invalid_redirect_uri",
          error_description: `Not an allowed destination: ${uri}`,
        },
        { status: 400 }
      );
    }
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name.slice(0, 60) : undefined;
  const clientId = mintDcrClientId(uris, clientName);

  return NextResponse.json(
    {
      client_id: clientId,
      redirect_uris: uris,
      client_name: clientName,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 }
  );
}
