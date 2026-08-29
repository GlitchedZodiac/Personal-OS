// RFC 9728 protected-resource metadata (origin-level). The path-suffixed
// variant lives at /.well-known/oauth-protected-resource/api/mcp — clients
// try either; both point at the same story.

import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["pitaya"],
    bearer_methods_supported: ["header"],
  });
}
