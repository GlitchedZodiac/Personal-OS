import { prisma } from "@/lib/prisma";

// The connector's paper trail (2026-10, SEC-013). Every tool that can add,
// change or remove a row leaves one line here: which tool, when, a short
// redacted summary of what it was asked, whether it succeeded, and the row it
// touched when the result says so. Deletes used to leave nothing but a
// missing row. Readable back through query_data `mcp_audit`.

export interface McpCallContext {
  sessionId?: string;
  deviceLabel?: string;
}

const MAX_STRING = 80;
const MAX_SUMMARY = 500;

function truncateStrings(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (depth > 3) return "…";
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => truncateStrings(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([k, v]) => [k, truncateStrings(v, depth + 1)])
    );
  }
  return value;
}

/** A short, bounded rendering of the arguments — never the full text of anything. */
export function summarizeArgs(args: unknown): string {
  let text: string;
  try {
    text = JSON.stringify(truncateStrings(args)) ?? "";
  } catch {
    text = "[unserialisable]";
  }
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY)}…` : text;
}

/** The id of the row a result says it touched, when it says so plainly. */
export function referencedId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  for (const key of ["deleted", "filed"]) {
    if (typeof r[key] === "string") return r[key] as string;
  }
  for (const key of ["workout", "entry", "measurement", "recipe", "routine", "reminder", "hymn", "milestone", "logged"]) {
    const v = r[key];
    if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  }
  return null;
}

export async function recordMcpAudit(input: {
  tool: string;
  args: unknown;
  result: unknown;
  ctx?: McpCallContext;
}): Promise<void> {
  const errorText =
    input.result && typeof input.result === "object" && typeof (input.result as { error?: unknown }).error === "string"
      ? String((input.result as { error: string }).error).slice(0, 500)
      : null;
  try {
    await prisma.mcpAuditEvent.create({
      data: {
        tool: input.tool,
        ok: errorText === null,
        summary: summarizeArgs(input.args),
        error: errorText,
        refId: referencedId(input.result),
        sessionId: input.ctx?.sessionId ?? null,
        deviceLabel: input.ctx?.deviceLabel ?? null,
      },
    });
  } catch (error) {
    // The trail must never break the tool — but a silent trail is no trail.
    console.warn("[mcp] audit row not written:", error instanceof Error ? error.message : String(error));
  }
}
