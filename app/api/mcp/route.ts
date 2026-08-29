// The MCP endpoint (2026-08-29): Michael's own Claude account connects here
// as a custom connector and gets the full tool surface — reads over the
// data registry, writes through the same validated paths the app uses.
//
// Transport: stateless Streamable HTTP. Every client message is a POST with
// one JSON-RPC object; every response is application/json. We offer no
// server-initiated stream, so GET answers 405 (allowed by the spec).
//
// Auth: bearer device-session token (minted in Settings → Claude connector,
// deviceType "mcp"; any valid device session is accepted — one household,
// one trust domain). Self-authenticating: /api/mcp is on the proxy
// allowlist, same contract as /api/mobile/*.

import { NextRequest, NextResponse } from "next/server";
import { requireMobileSession } from "@/lib/mobile-session";
import { handleMcpMessage } from "@/lib/mcp/server";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await requireMobileSession(request);
  if (!session) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "Unauthorized — bearer token required" },
      },
      { status: 401 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400 }
    );
  }

  const { status, body } = await handleMcpMessage(raw);
  if (body == null) return new NextResponse(null, { status });
  return NextResponse.json(body, { status });
}

// No server→client stream is offered; the spec permits 405 here.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  // Stateless server — there is no session to end.
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
