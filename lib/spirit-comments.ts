// V3 §1 — the comment thread's one shape, validated. Shared by both API routes
// (Next.js route files may export only handlers) and unit-testable on its own.

export interface CommentEntry {
  id: string;
  kind: "ink" | "typed";
  text?: string;
  /** ink entries carry their strokes, drawn 1:1 inside the bubble */
  strokes?: unknown[];
  /** epoch ms */
  at: number;
}

const MAX_ENTRIES_BYTES = 600_000; // ink strokes are small; a runaway payload is a bug

export function entriesOk(entries: unknown): entries is CommentEntry[] {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 60) return false;
  for (const e of entries) {
    if (!e || typeof e !== "object") return false;
    const x = e as Record<string, unknown>;
    if (typeof x.id !== "string" || (x.kind !== "ink" && x.kind !== "typed") || typeof x.at !== "number") return false;
    if (x.kind === "typed" && typeof x.text !== "string") return false;
    if (x.kind === "ink" && !Array.isArray(x.strokes)) return false;
  }
  return JSON.stringify(entries).length <= MAX_ENTRIES_BYTES;
}
