// Minimal stateless MCP server core (2026-08-29): the JSON-RPC half of the
// Streamable HTTP transport, hand-rolled on purpose. A tools-only stateless
// server needs five methods — initialize, notifications/initialized, ping,
// tools/list, tools/call — and every response is a plain JSON body; no
// session ids, no SSE stream, no Redis. claude.ai custom connectors speak
// exactly this. Hand-rolling keeps it a pure function (trivially unit-tested)
// and keeps @modelcontextprotocol/sdk's node-http assumptions out of the
// App Router. If the server ever needs sampling/resources/subscriptions,
// swap in the SDK then.

import { callMcpTool, MCP_TOOL_DEFS } from "@/lib/mcp/tools";

/// Protocol revisions this server knows. We echo the client's requested
/// version when we support it, else offer our newest.
const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_VERSION = SUPPORTED_VERSIONS[0];

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpHttpResponse {
  status: number;
  body: unknown | null; // null → empty response (notifications)
}

const rpcError = (
  id: string | number | null,
  code: number,
  message: string
): McpHttpResponse => ({
  status: 200, // JSON-RPC errors ride 200; HTTP codes are transport-level
  body: { jsonrpc: "2.0", id, error: { code, message } },
});

const rpcResult = (id: string | number | null, result: unknown): McpHttpResponse => ({
  status: 200,
  body: { jsonrpc: "2.0", id, result },
});

export const SERVER_INFO = {
  name: "pitaya",
  title: "Pitaya — Personal OS",
  version: "1.0.0",
};

const INSTRUCTIONS =
  "Michael's personal health OS: workouts (kettlebell + trails), food and " +
  "macros, body measurements, routines, training plans, spirit and journal. " +
  "query_data reads every dataset; prefer log_recipe/save_recipe over raw " +
  "log_food for repeat meals so macros stay consistent. When you need data " +
  "or a capability Pitaya doesn't have, file it with report_gap.";

export async function handleMcpMessage(raw: unknown): Promise<McpHttpResponse> {
  // The 2025-06-18 revision dropped JSON-RPC batching — reject arrays.
  if (Array.isArray(raw)) {
    return rpcError(null, -32600, "Batching is not supported");
  }
  if (raw == null || typeof raw !== "object") {
    return rpcError(null, -32700, "Parse error: expected a JSON-RPC message");
  }
  const msg = raw as JsonRpcRequest;
  const method = String(msg.method ?? "");
  const hasId = msg.id !== undefined && msg.id !== null;
  const id = hasId ? (msg.id as string | number) : null;

  // Notifications (no id) are accepted and produce no body.
  if (!hasId) {
    return { status: 202, body: null };
  }

  switch (method) {
    case "initialize": {
      const requested = String(
        (msg.params as { protocolVersion?: unknown })?.protocolVersion ?? ""
      );
      const protocolVersion = SUPPORTED_VERSIONS.includes(requested)
        ? requested
        : LATEST_VERSION;
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: MCP_TOOL_DEFS });

    case "tools/call": {
      const params = (msg.params ?? {}) as {
        name?: unknown;
        arguments?: unknown;
      };
      const name = String(params.name ?? "");
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      let result: unknown;
      try {
        result = await callMcpTool(name, args);
      } catch (error) {
        // A thrown handler is a bug, but the client still deserves a
        // structured tool error rather than a dead connection.
        console.error(`MCP tool ${name} threw:`, error);
        result = { error: "Internal error running the tool" };
      }
      const isError =
        result != null &&
        typeof result === "object" &&
        typeof (result as Json).error === "string";
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result ?? null) }],
        isError: Boolean(isError),
      });
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

type Json = Record<string, unknown>;
