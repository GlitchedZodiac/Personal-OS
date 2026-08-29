// RFC 8414 authorization-server metadata — how claude.ai's connector flow
// finds our endpoints after the protected-resource document names this
// origin as the authorization server. Not under /api, so outside the proxy
// gate (public by design; it's discovery, not data).

import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: ["pitaya"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    // CIMD ("Use Anthropic's hosted client metadata"): client_id may be an
    // https URL to a client metadata document — we fetch and honor it.
    client_id_metadata_document_supported: true,
  });
}
