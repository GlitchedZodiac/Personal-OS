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
    await recordChangesSafe(
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
      ...(applied.warnings.length ? { warnings: applied.warnings } : {}),
      ...(applied.next.targets ? { targets: applied.next.targets } : {}),
    };
  },
};

// Filled in by Phase A (record_changes). Until then a no-op, so Phase D's
// receipts and mcp_audit_events are the record.
async function recordChangesSafe(
  _changes: { entity: string; recordId: string; field: string; before: unknown; after: unknown }[],
  _reason: string
): Promise<string | null> {
  return null;
}

export const V2_TOOLS: V2Tool[] = [updateSettings];

export const V2_ANNOTATIONS: Record<string, V2Annotations> = {
  update_settings: { title: "Change settings and targets", ...OVERWRITES },
};

// Kept for the phases that add rows rather than overwrite them.
export const V2_ADDS = ADDS;
