// MCP v2 tools (2026-11-12) — the connector learns to change Pitaya without
// a code release: settings and targets (Phase D), corrections with undo
// (Phase A), the exercise vocabulary (Phase C) and fields Claude can add
// (Phase B). Spec: docs/mcp-v2-spec.md.
//
// Kept apart from lib/mcp/tools.ts (1,500 lines of v1) and merged into its
// table there. Same contract: handlers never throw for user-level problems —
// they return { error } — and every write says exactly what changed.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applySettingsPatch, WRITABLE_SETTINGS_KEYS } from "@/lib/settings-patch";
import { recordChanges, registerUndoHandler, undoChanges, type ChangeInput } from "@/lib/record-changes";
import { PATCH_ENTITIES, patchRecord, writableSummary } from "@/lib/patch-record";

type Json = Record<string, unknown>;

export interface V2ToolDef {
  name: string;
  description: string;
  inputSchema: Json;
}

export interface V2Tool {
  def: V2ToolDef;
  handler: (args: Json) => Promise<unknown>;
}

export interface V2Annotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const CLOSED = { openWorldHint: false } as const;
const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, ...CLOSED } as const;
const OVERWRITES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, ...CLOSED } as const;

export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const MAX_REASON = 300;

/** A required, bounded reason — the human-readable why on every change. */
export function reasonOf(args: Json): { reason: string } | { error: string } {
  const reason = str(args.reason);
  if (!reason) return { error: "reason is required — say in a few words why this is changing" };
  if (reason.length > MAX_REASON) return { error: `reason is longer than ${MAX_REASON} characters` };
  return { reason };
}

// ── Phase D: settings and targets ────────────────────────────────────────

const macroSchema = {
  type: "object",
  properties: {
    kcal: { type: "number" },
    proteinG: { type: "number" },
    fatG: { type: "number" },
    carbsG: { type: "number" },
  },
};

const updateSettings: V2Tool = {
  def: {
    name: "update_settings",
    description:
      "Change his settings: calorie/macro TARGETS (a rest-day target, an optional training-day target, and the rule that picks between them), the energy-estimate parameters behind the daily deficit, his standing rules for every Claude session (aiInstructions.health), body/health/workout goals, HR zones, units, language. Send only the keys that change; objects merge. Targets are in grams: targets.rest = { kcal, proteinG, fatG, carbsG }. The old calorieTarget/percent keys follow from targets.rest automatically. Returns before/after per key and warnings (e.g. macros that don't add up to the kcal). Writable keys: " +
      WRITABLE_SETTINGS_KEYS.join(", ") +
      ".",
    inputSchema: {
      type: "object",
      properties: {
        patch: {
          type: "object",
          description: 'Keys to change, e.g. { "targets": { "rest": {...}, "training": {...}, "trainingDayRule": { "minWorkoutKcal": 300 } } } or { "aiInstructions.health": "Always log jump rope EMOMs as intervals." }',
          properties: {
            targets: {
              type: "object",
              properties: {
                rest: macroSchema,
                training: { ...macroSchema, description: "null = training days use the rest target" },
                trainingDayRule: {
                  type: "object",
                  properties: { minWorkoutKcal: { type: "number", description: "A day is a training day once its logged workouts burn at least this (0–3000)" } },
                },
                tdee: {
                  type: "object",
                  description: "Daily energy estimate: bmr + tef + steps outside workouts × kcalPerStep + workout kcal",
                  properties: {
                    bmr: {
                      type: "object",
                      properties: {
                        source: { type: "string", enum: ["latest_scale", "fixed"] },
                        kcal: { type: "number" },
                      },
                    },
                    tefPct: { type: "number", description: "Digestion, % of kcal eaten (default 10)" },
                    kcalPerStep: { type: "number", description: "Default 0.04" },
                  },
                },
              },
            },
            "aiInstructions.health": {
              type: "string",
              description: "His standing rules, read by every future Claude session through the connector (≤ 2,000 chars). Send the FULL text — it replaces the old one.",
            },
            bodyGoals: { type: "object" },
            healthGoals: { type: "object" },
            workoutGoals: { type: "object" },
            hrZoneTops: { type: "array", items: { type: "number" } },
            units: { type: "string", enum: ["metric", "imperial"] },
            aiLanguage: { type: "string", enum: ["english", "spanish", "portuguese", "french"] },
          },
        },
        reason: { type: "string", description: "Why, in a few words (≤ 300 chars)" },
      },
      required: ["patch", "reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
    const current = (row?.data ?? {}) as Json;
    const applied = applySettingsPatch(current, args.patch, "mcp");
    if ("error" in applied) return applied;
    if (applied.changes.length === 0) {
      return { changes: [], note: "Nothing changed — those values were already set." };
    }
    await prisma.userSettings.upsert({
      where: { id: "default" },
      create: { id: "default", data: applied.next as Prisma.InputJsonValue },
      update: { data: applied.next as Prisma.InputJsonValue },
    });
    const batchId = await recordChangesSafe(
      applied.changes.map((c) => ({
        entity: "settings",
        recordId: "default",
        field: c.key,
        before: c.before,
        after: c.after,
      })),
      why.reason
    );
    return {
      changes: applied.changes,
      ...(batchId ? { batchId } : {}),
      ...(applied.warnings.length ? { warnings: applied.warnings } : {}),
      ...(applied.next.targets ? { targets: applied.next.targets } : {}),
    };
  },
};

/** History is best-effort: it must never block the change it describes. */
async function recordChangesSafe(changes: ChangeInput[], reason: string): Promise<string | null> {
  try {
    return await recordChanges(changes, { reason, via: "mcp" });
  } catch (error) {
    console.error("record_changes write failed:", error);
    return null;
  }
}

// Settings changes undo key by key ("aiInstructions.health" reaches one level in).
registerUndoHandler("settings", {
  async read(_recordId, fields) {
    const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
    if (!row) return null;
    const data = (row.data ?? {}) as Json;
    return Object.fromEntries(fields.map((f) => [f, readDotted(data, f)]));
  },
  async write(_recordId, values) {
    const row = await prisma.userSettings.findUnique({ where: { id: "default" }, select: { data: true } });
    const data: Json = { ...((row?.data ?? {}) as Json) };
    for (const [field, value] of Object.entries(values)) {
      const [head, sub] = field.split(".");
      if (sub) {
        const inner = { ...((data[head] as Json) ?? {}) };
        if (value == null) delete inner[sub];
        else inner[sub] = value;
        data[head] = inner;
      } else if (value == null) delete data[head];
      else data[head] = value;
    }
    await prisma.userSettings.upsert({
      where: { id: "default" },
      create: { id: "default", data: data as Prisma.InputJsonValue },
      update: { data: data as Prisma.InputJsonValue },
    });
  },
});

function readDotted(data: Json, field: string): unknown {
  const [head, sub] = field.split(".");
  const v = data[head];
  if (!sub) return v ?? null;
  return v && typeof v === "object" ? ((v as Json)[sub] ?? null) : null;
}

// ── Phase A: one correction door, and undo ─────────────────────────────────

const patchTool: V2Tool = {
  def: {
    name: "patch_record",
    description:
      "Correct fields on a logged workout, food entry, body measurement or saved recipe — anything the watch, a voice log or an earlier chat got wrong. Give the entity, its id (query_data recent_workouts / recent_food / body_measurements / list_recipes), `set` with only the fields that change, and a reason. The old values are kept and the change can be undone with undo_change. A corrected workout field is never overwritten by a later re-send from the watch. Jump rope: send `rope` ({ workSeconds, restSeconds, rounds } for intervals, or { jumpSeconds }) to fix the protocol; the movement row follows. Movements themselves still go through edit_workout. dryRun: true shows the before/after without saving. Writable — " +
      writableSummary(),
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: PATCH_ENTITIES },
        id: { type: "string" },
        set: {
          type: "object",
          description:
            'Field → new value, e.g. { "distanceMeters": 3600, "stepCount": 4200 } or { "workoutType": "strength", "description": "Lebe Stark 35-min" }. null clears a field that may be empty.',
        },
        rope: {
          type: "object",
          description: "Workouts with workoutType jump_rope only",
          properties: {
            workSeconds: { type: "number" },
            restSeconds: { type: "number" },
            rounds: { type: "number" },
            jumpSeconds: { type: "number" },
            jumps: { type: "number", description: "His own total count, if he gave one" },
          },
        },
        reason: { type: "string", description: "Why, in a few words (≤ 300 chars)" },
        dryRun: { type: "boolean" },
      },
      required: ["entity", "id", "reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return patchRecord({
      entity: args.entity,
      id: args.id,
      set: args.set,
      rope: args.rope,
      reason: why.reason,
      dryRun: args.dryRun === true,
    });
  },
};

const undoTool: V2Tool = {
  def: {
    name: "undo_change",
    description:
      "Undo a change made through the connector — a whole tool call (batchId, returned by patch_record, update_settings, edit_workout, edit_food, rename_recipe and the exercise and field tools) or one field (changeId from query_data record_changes). A field is restored only if it still holds the value the change wrote; anything changed again since is left alone and listed. dryRun: true shows what would be restored.",
    inputSchema: {
      type: "object",
      properties: {
        batchId: { type: "string" },
        changeId: { type: "string" },
        dryRun: { type: "boolean" },
      },
    },
  },
  handler: async (args) =>
    undoChanges({
      batchId: str(args.batchId) || undefined,
      changeId: str(args.changeId) || undefined,
      dryRun: args.dryRun === true,
    }),
};

export const V2_TOOLS: V2Tool[] = [updateSettings, patchTool, undoTool];

export const V2_ANNOTATIONS: Record<string, V2Annotations> = {
  update_settings: { title: "Change settings and targets", ...OVERWRITES },
  patch_record: { title: "Correct a logged entry", ...OVERWRITES },
  // Restores old values — overwrites what is there now, so it is gated as such.
  undo_change: { title: "Undo a change", ...OVERWRITES },
};

// Kept for the phases that add rows rather than overwrite them.
export const V2_ADDS = ADDS;
