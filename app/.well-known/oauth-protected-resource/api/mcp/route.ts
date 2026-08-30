// RFC 9728, path-suffixed form: the WWW-Authenticate header on /api/mcp's
// 401 points here.

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
