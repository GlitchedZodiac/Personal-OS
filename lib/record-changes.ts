// Field-level change history and undo (2026-11-12, MCP v2 Phase A).
//
// Every correction made through the Claude connector is written here with
// its before and after value and the reason, one batch per tool call, so
// "what did Claude change last week" has an answer and "undo that" works.
//
// Undo is conservative: a field is restored only while it still holds the
// value the change wrote. If something changed it since (an app edit, a
// later correction), that field is skipped and named — never clobbered.
//
// Each entity registers how to read and write its fields (lib/patch-record
// for rows, lib/mcp/tools-v2 for settings, the exercise and field modules
// for theirs), so this file stays one generic engine.

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Json = Record<string, unknown>;

export interface ChangeInput {
  entity: string;
  recordId: string;
  field: string;
  before: unknown;
  after: unknown;
}

export type ChangeVia = "mcp" | "app" | "undo";

const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Write one batch. Returns its id, or null when there was nothing to write. */
export async function recordChanges(
  changes: ChangeInput[],
  opts: { reason?: string | null; via: ChangeVia; batchId?: string }
): Promise<string | null> {
  if (changes.length === 0) return null;
  const batchId = opts.batchId ?? randomUUID();
  await prisma.recordChange.createMany({
    data: changes.map((c) => ({
      batchId,
      entity: c.entity,
      recordId: c.recordId,
      field: c.field,
      before: toJson(c.before),
      after: toJson(c.after),
      reason: opts.reason ?? null,
      via: opts.via,
    })),
  });
  return batchId;
}

/** Order-insensitive deep equality for JSON-shaped values. */
export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function stable(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Json;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

// ── Undo ───────────────────────────────────────────────────────────────────

export interface UndoHandler {
  /** Current values of `fields` on the record, or null when it no longer exists. */
  read(recordId: string, fields: string[]): Promise<Json | null>;
  /** Write `values` (field → value) back, plus any follow-up (PR rebuild…). */
  write(recordId: string, values: Json): Promise<void>;
}

const handlers = new Map<string, UndoHandler>();

export function registerUndoHandler(entity: string, handler: UndoHandler) {
  handlers.set(entity, handler);
}

export interface UndoResult {
  batchId: string | null;
  restored: { entity: string; recordId: string; field: string; to: unknown }[];
  skipped: { entity: string; recordId: string; field: string; why: string }[];
  dryRun: boolean;
}

/**
 * Every module that owns an entity registers its handler when it loads. Undo
 * can run in a process where some of them never loaded (a test, a cold
 * lambda that only served undo_change), so load them all first.
 */
async function loadHandlers() {
  await Promise.all([
    import("@/lib/patch-record"),
    import("@/lib/exercise-library"),
    import("@/lib/settings-patch"),
    import("@/lib/field-definitions"),
  ]);
}

export async function undoChanges(input: {
  batchId?: string;
  changeId?: string;
  dryRun?: boolean;
}): Promise<UndoResult | { error: string }> {
  if (!input.batchId && !input.changeId) return { error: "Give a batchId (one whole tool call) or a changeId (one field)" };
  await loadHandlers();
  const rows = await prisma.recordChange.findMany({
    where: input.changeId ? { id: input.changeId } : { batchId: input.batchId },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return { error: "No such change — query_data record_changes lists recent ones" };

  const restored: UndoResult["restored"] = [];
  const skipped: UndoResult["skipped"] = [];
  const toRestore: { row: (typeof rows)[number] }[] = [];

  // Group by record so each record is read once.
  const byRecord = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.undoneAt) {
      skipped.push({ entity: row.entity, recordId: row.recordId, field: row.field, why: "already undone" });
      continue;
    }
    const key = `${row.entity}\u0000${row.recordId}`;
    const list = byRecord.get(key);
    if (list) list.push(row);
    else byRecord.set(key, [row]);
  }

  const writes: { entity: string; recordId: string; values: Json; rows: typeof rows }[] = [];
  for (const list of byRecord.values()) {
    const { entity, recordId } = list[0];
    const handler = handlers.get(entity);
    if (!handler) {
      for (const r of list) skipped.push({ entity, recordId, field: r.field, why: `can't undo ${entity} changes` });
      continue;
    }
    const current = await handler.read(recordId, list.map((r) => r.field));
    if (!current) {
      for (const r of list) skipped.push({ entity, recordId, field: r.field, why: "the record no longer exists" });
      continue;
    }
    const values: Json = {};
    const kept: typeof rows = [];
    for (const r of list) {
      if (!sameValue(current[r.field], r.after)) {
        skipped.push({ entity, recordId, field: r.field, why: "changed again since — left as it is now" });
        continue;
      }
      values[r.field] = r.before;
      kept.push(r);
      toRestore.push({ row: r });
      restored.push({ entity, recordId, field: r.field, to: r.before });
    }
    if (kept.length) writes.push({ entity, recordId, values, rows: kept });
  }

  if (input.dryRun || writes.length === 0) {
    return { batchId: null, restored, skipped, dryRun: Boolean(input.dryRun) };
  }

  for (const w of writes) await handlers.get(w.entity)!.write(w.recordId, w.values);
  const undoBatch = await recordChanges(
    toRestore.map(({ row }) => ({
      entity: row.entity,
      recordId: row.recordId,
      field: row.field,
      before: row.after,
      after: row.before,
    })),
    { reason: `Undo of ${input.batchId ? `batch ${input.batchId}` : `change ${input.changeId}`}`, via: "undo" }
  );
  await prisma.recordChange.updateMany({
    where: { id: { in: toRestore.map(({ row }) => row.id) } },
    data: { undoneAt: new Date() },
  });
  return { batchId: undoBatch, restored, skipped, dryRun: false };
}
