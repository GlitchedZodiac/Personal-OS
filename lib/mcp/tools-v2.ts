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
import { recordChanges, undoChanges, type ChangeInput } from "@/lib/record-changes";
import { PATCH_ENTITIES, patchRecord, writableSummary } from "@/lib/patch-record";
import { mergeExercises, renormalizeHistory, upsertExercise } from "@/lib/exercise-library";
import { EQUIPMENT, MUSCLES, PATTERNS } from "@/lib/exercise-profile";
import { defineField, FIELD_ENTITIES, FIELD_TYPES, retireField } from "@/lib/field-definitions";

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

// ── Phase C: the exercise library ──────────────────────────────────────────

const profileSchema = {
  type: "object",
  description:
    "What the movement IS, so the library has context and not just a name. Write it from what you know; search the web or use the video he named when unsure; ask him if you can't identify it. Fields: description (how it's done, 10–600 chars), pattern (" +
    PATTERNS.join(" | ") +
    "), primaryMuscles / secondaryMuscles (" +
    MUSCLES.join(", ") +
    "), equipment (" +
    EQUIPMENT.join(", ") +
    "), unilateral (true/false), variantOf (an exercise id — a thrust jerk is a variant of the jerk; groups them without merging history), cues (≤ 5 short coaching cues), sourceUrl (https), sourceNote.",
  properties: {
    description: { type: "string" },
    pattern: { type: "string", enum: [...PATTERNS] },
    primaryMuscles: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    secondaryMuscles: { type: "array", items: { type: "string", enum: [...MUSCLES] } },
    equipment: { type: "array", items: { type: "string", enum: [...EQUIPMENT] } },
    unilateral: { type: "boolean" },
    variantOf: { type: "string" },
    cues: { type: "array", items: { type: "string" } },
    sourceUrl: { type: "string" },
    sourceNote: { type: "string" },
  },
};

const upsertExerciseTool: V2Tool = {
  def: {
    name: "upsert_exercise",
    description:
      "Add, explain or correct a movement in his exercise library. Use it (1) whenever a log returns a movement with needsProfile — explain what it is in `profile`, in the same turn; (2) to mark a move as bodyweight (load: \"bodyweight\" — bells used as push-up handles then never count as weight or set PRs; a vest still does); (3) to add aliases so a spoken name resolves (aliases.add); (4) to rename a custom movement (its old name keeps resolving). Built-in movements keep their name and category but take aliases, load and a profile. Give id for an existing movement (query_data exercises), or name to create one. Recorded and undo-able; PRs rebuild when load or aliases change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Existing movement id" },
        name: { type: "string", description: "New movement's name, or a new name for a custom one (with id)" },
        category: { type: "string", enum: ["kettlebell", "barbell", "dumbbell", "bodyweight", "machine", "cardio", "other"], description: "The equipment it uses (custom movements only)" },
        load: { type: "string", enum: ["external", "bodyweight"], description: "What counts as load for PRs and tonnage" },
        aliases: {
          type: "object",
          properties: { add: { type: "array", items: { type: "string" } }, remove: { type: "array", items: { type: "string" } } },
        },
        profile: profileSchema,
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return upsertExercise({ ...args, reason: why.reason });
  },
};

const mergeExercisesTool: V2Tool = {
  def: {
    name: "merge_exercises",
    description:
      "Fold a duplicate movement into another: every logged set and routine step that points at `from` moves to `into`, from's name and aliases become aliases of into, and from is removed. Built-in movements can't be merged away. Run with dryRun: true first and show him what moves. Undo-able as one batch.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Custom movement id to fold away" },
        into: { type: "string", description: "Movement id that remains" },
        dryRun: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["from", "into", "reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return mergeExercises({ from: args.from, into: args.into, dryRun: args.dryRun === true, reason: why.reason });
  },
};

const renormalizeTool: V2Tool = {
  def: {
    name: "renormalize_history",
    description:
      "Re-match logged movement names against today's library and rules (after adding aliases or movements). Dry run by default: lists every set whose movement would change and names that now match nothing. Movement lists he fixed by hand are left alone. Send dryRun: false to apply (undo-able; PRs rebuild).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD" },
        to: { type: "string", description: "YYYY-MM-DD" },
        dryRun: { type: "boolean", description: "Default true" },
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return renormalizeHistory({ from: args.from, to: args.to, dryRun: args.dryRun !== false, reason: why.reason });
  },
};

// ── Phase B: fields Claude can add ─────────────────────────────────────────

const defineFieldTool: V2Tool = {
  def: {
    name: "define_field",
    description:
      "Start recording something new on food entries, body measurements or workouts — no release needed. Give the entity, a camelCase key (abdomenCm, armLeftCm, sleepQuality…), a label, the type (number | integer | text | enum | boolean), unit and range for numbers, options for an enum, and a description of what it means and how it's measured (that text is what every future Claude session reads). From then on the value goes in `extra` on log_food items / log_measurement / log_workout, or patch_record { set: { \"extra.<key>\": … } }, and comes back on every read. A key can't shadow a built-in column. Defining a retired key brings it back.",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: [...FIELD_ENTITIES] },
        key: { type: "string" },
        label: { type: "string" },
        type: { type: "string", enum: [...FIELD_TYPES] },
        unit: { type: "string" },
        min: { type: "number" },
        max: { type: "number" },
        options: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        reason: { type: "string" },
      },
      required: ["entity", "key", "label", "type", "description", "reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return defineField(args, why.reason);
  },
};

const retireFieldTool: V2Tool = {
  def: {
    name: "retire_field",
    description:
      "Stop offering a custom field. Every value already stored is kept (and still readable); the field just leaves the tool descriptions. define_field with the same key brings it back. Undo-able.",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: [...FIELD_ENTITIES] },
        key: { type: "string" },
        reason: { type: "string" },
      },
      required: ["entity", "key", "reason"],
    },
  },
  handler: async (args) => {
    const why = reasonOf(args);
    if ("error" in why) return why;
    return retireField(args, why.reason);
  },
};

export const V2_TOOLS: V2Tool[] = [
  updateSettings,
  patchTool,
  undoTool,
  upsertExerciseTool,
  mergeExercisesTool,
  renormalizeTool,
  defineFieldTool,
  retireFieldTool,
];

export const V2_ANNOTATIONS: Record<string, V2Annotations> = {
  update_settings: { title: "Change settings and targets", ...OVERWRITES },
  patch_record: { title: "Correct a logged entry", ...OVERWRITES },
  // Restores old values — overwrites what is there now, so it is gated as such.
  undo_change: { title: "Undo a change", ...OVERWRITES },
  upsert_exercise: { title: "Add or explain a movement", ...OVERWRITES },
  merge_exercises: { title: "Merge duplicate movements", ...OVERWRITES },
  renormalize_history: { title: "Re-match logged movement names", ...OVERWRITES },
  // Adds a definition row; redefining a retired key reactivates it.
  define_field: { title: "Define a custom field", ...ADDS },
  retire_field: { title: "Retire a custom field", ...OVERWRITES },
};

// Kept for the phases that add rows rather than overwrite them.
export const V2_ADDS = ADDS;
