import { prisma } from "@/lib/prisma";

// The connector's paper trail (2026-10, SEC-013; reworked after the review of
// 3b). Every tool call leaves one row: which tool, when, read or write, the
// SHAPE of what it was asked (argument keys, string lengths, ids and counts —
// never the text itself: these rows are readable over the connector and by
// the in-app chat), whether it succeeded, and the id it touched. Kept 180
// days (pruned by the daily cron).

export interface McpCallContext {
  sessionId?: string;
  deviceLabel?: string;
}

export const MCP_AUDIT_KEEP_DAYS = 180;
const MAX_SUMMARY = 600;

/** Argument values that are identifiers or fixed vocabulary, never his words. */
const VERBATIM_KEYS = new Set([
  "id", "workoutId", "trailId", "pageId", "entity", "dataset", "mealType", "kind",
  "workoutType", "replaceWeek", "force", "days", "limit", "from", "to", "weekStart",
]);

function shapeOf(key: string, value: unknown, depth: number): string {
  if (value === null || value === undefined) return `${key}:null`;
  if (VERBATIM_KEYS.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
    return `${key}=${String(value).slice(0, 64)}`;
  }
  if (typeof value === "string") return `${key}:text(${value.length})`;
  if (typeof value === "number") return `${key}:num`;
  if (typeof value === "boolean") return `${key}:bool`;
  if (Array.isArray(value)) return `${key}:list(${value.length})`;
  if (typeof value === "object") {
    if (depth >= 1) return `${key}:obj`;
    const inner = Object.entries(value as Record<string, unknown>).map(([k, v]) => shapeOf(k, v, depth + 1));
    return `${key}:{${inner.join(",")}}`;
  }
  return `${key}:?`;
}

/** The shape of the arguments: keys, lengths, ids, counts — no content. */
export function summarizeArgs(args: unknown): string {
  if (!args || typeof args !== "object" || Array.isArray(args)) return Array.isArray(args) ? `list(${args.length})` : "";
  const text = Object.entries(args as Record<string, unknown>).map(([k, v]) => shapeOf(k, v, 0)).join(" ");
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY)}…` : text;
}

/** The id of the row a result says it touched. */
export function referencedId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (typeof r.id === "string") return r.id;
  for (const key of ["workout", "entry", "measurement", "recipe", "routine", "reminder", "hymn", "milestone", "logged"]) {
    const v = r[key];
    if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  }
  if (typeof r.filed === "string") return r.filed;
  if (typeof r.deleted === "string") return r.deleted; // delete_entry returns the id it deleted
  return null;
}

export async function recordMcpAudit(input: {
  tool: string;
  kind?: "read" | "write";
  args: unknown;
  result: unknown;
  ctx?: McpCallContext;
}): Promise<void> {
  const r = input.result && typeof input.result === "object" ? (input.result as Record<string, unknown>) : null;
  const errorText = r && typeof r.error === "string" ? String(r.error).slice(0, 300) : null;
  const count = r && typeof r.count === "number" ? ` → ${r.count} rows` : "";
  try {
    await prisma.mcpAuditEvent.create({
      data: {
        tool: input.tool,
        ok: errorText === null,
        summary: `${input.kind === "read" ? "read " : ""}${summarizeArgs(input.args)}${count}`.slice(0, MAX_SUMMARY + 40),
        error: errorText,
        refId: input.kind === "read" ? null : referencedId(input.result),
        sessionId: input.ctx?.sessionId ?? null,
        deviceLabel: input.ctx?.deviceLabel ?? null,
      },
    });
  } catch (error) {
    // The trail must never break the tool — but a silent trail is no trail.
    console.warn("[mcp] audit row not written:", error instanceof Error ? error.message : String(error));
  }
}

/** Retention: rows older than MCP_AUDIT_KEEP_DAYS go (daily cron). */
export async function pruneMcpAudit(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MCP_AUDIT_KEEP_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.mcpAuditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return result.count;
}
