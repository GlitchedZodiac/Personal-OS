// patch_record — one correction door for workouts, food, measurements and
// saved recipes (2026-11-12, MCP v2 Phase A; gaps #3, #7, #8, routines).
//
// Before: edit_workout could change only the movement list and pack weight,
// so a treadmill walk the watch undercounted, a session logged as
// "freestyle", or a jump-rope EMOM stored as one continuous set could not be
// fixed from a conversation at all.
//
// The rules, per entity, live in WRITE_SPECS below — each writable field with
// its type and range. Everything else (streams, routes, ids, provenance,
// finance) is not writable by construction. Every patch:
//   - needs a reason, and can be a dry run that writes nothing;
//   - records each field's before/after in record_changes (undo-able);
//   - on a workout, stamps the corrected fields so a later re-send from the
//     watch leaves them alone (lib/workout-resync correctedFields);
//   - rebuilds PRs when anything that feeds them changed.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDistanceType } from "@/lib/activities";
import { INT_FIELDS, MEASURED_FIELDS } from "@/lib/body-measurements";
import { JUMP_ROPE_TYPE, jumpRopeExerciseRow, readIntervals } from "@/lib/jump-rope";
import { rebuildPersonalRecords } from "@/lib/prs";
import { recordChanges, registerUndoHandler, sameValue } from "@/lib/record-changes";
import { stampCorrected, stampExercisesEdited } from "@/lib/workout-resync";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

export type PatchEntity = "workout" | "food" | "measurement" | "recipe";
export const PATCH_ENTITIES: PatchEntity[] = ["workout", "food", "measurement", "recipe"];

export interface FieldRule {
  type: "number" | "int" | "text" | "slug" | "enum" | "datetime";
  min?: number;
  max?: number;
  maxLen?: number;
  values?: readonly string[];
  nullable?: boolean;
  /** Stamped in correctedFields so a watch re-send keeps the fix. */
  watchOwned?: boolean;
  /** One line for the tool description. */
  note?: string;
}

const n = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({ type: "number", min, max, nullable: true, ...extra });
const i = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({ type: "int", min, max, nullable: true, ...extra });

/** Range for one measured column, from its unit. */
function measuredRule(field: string): FieldRule {
  const int = INT_FIELDS.has(field);
  const base = ((): [number, number] => {
    if (field === "weightKg") return [30, 300];
    if (field === "bmi") return [10, 80];
    if (field === "visceralFat") return [0, 60];
    if (field === "bmrKcal") return [500, 5000];
    if (field === "metabolicAge") return [10, 120];
    if (field === "heartRateBpm") return [30, 230];
    if (field === "smi") return [0, 30];
    if (field === "whrEstimate") return [0.3, 2];
    if (field.endsWith("Pct")) return [0, 100];
    if (field.endsWith("Cm")) return [5, 300];
    if (field.endsWith("Kg")) return [0, 300];
    return [0, 10000];
  })();
  return { type: int ? "int" : "number", min: base[0], max: base[1], nullable: true };
}

export const WRITE_SPECS: Record<PatchEntity, { model: string; fields: Record<string, FieldRule> }> = {
  workout: {
    model: "workoutLog",
    fields: {
      description: { type: "text", maxLen: 2000, nullable: true, watchOwned: true, note: "title/notes, e.g. \"Lebe Stark 35-min\"" },
      workoutType: { type: "slug", maxLen: 30, watchOwned: true, note: "strength | freestyle | walk | treadmill_walk | run | hike | jump_rope | …" },
      startedAt: { type: "datetime", watchOwned: true },
      durationMinutes: i(0, 600, { nullable: false, watchOwned: true }),
      distanceMeters: n(0, 200_000, { watchOwned: true, note: "distance types only (walk, run, hike, treadmill…)" }),
      stepCount: i(0, 100_000, { watchOwned: true }),
      caloriesBurned: n(0, 5000, { watchOwned: true }),
      avgHeartRateBpm: i(30, 230, { watchOwned: true }),
      maxHeartRateBpm: i(30, 230, { watchOwned: true }),
      elevationGainM: n(0, 10_000, { watchOwned: true }),
      packKg: n(0, 60),
      routineId: { type: "text", maxLen: 64, nullable: true, watchOwned: true, note: "a saved routine's id (query_data routines) — names the session after it" },
    },
  },
  food: {
    model: "foodLog",
    fields: {
      loggedAt: { type: "datetime" },
      mealType: { type: "enum", values: ["breakfast", "lunch", "dinner", "snack"] },
      foodDescription: { type: "text", maxLen: 500 },
      calories: n(0, 5000, { nullable: false }),
      proteinG: n(0, 500, { nullable: false }),
      carbsG: n(0, 500, { nullable: false }),
      fatG: n(0, 500, { nullable: false }),
      notes: { type: "text", maxLen: 1000, nullable: true },
    },
  },
  measurement: {
    model: "bodyMeasurement",
    fields: {
      measuredAt: { type: "datetime" },
      notes: { type: "text", maxLen: 2000, nullable: true },
      ...Object.fromEntries(MEASURED_FIELDS.map((f) => [f, measuredRule(f)])),
    },
  },
  recipe: {
    model: "favoriteFoods",
    fields: {
      foodDescription: { type: "text", maxLen: 200, note: "the recipe's name" },
      mealType: { type: "enum", values: ["breakfast", "lunch", "dinner", "snack"] },
      calories: n(0, 5000, { nullable: false }),
      proteinG: n(0, 500, { nullable: false }),
      carbsG: n(0, 500, { nullable: false }),
      fatG: n(0, 500, { nullable: false }),
      kind: { type: "enum", values: ["meal", "product"] },
      servingLabel: { type: "text", maxLen: 120, nullable: true },
    },
  },
};

/** Check and normalise one value against its rule. */
export function checkValue(field: string, rule: FieldRule, value: unknown): { value: unknown } | { error: string } {
  if (value === null || value === "") {
    return rule.nullable ? { value: null } : { error: `${field} can't be cleared` };
  }
  switch (rule.type) {
    case "number":
    case "int": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || !Number.isFinite(num)) return { error: `${field} must be a number` };
      if ((rule.min != null && num < rule.min) || (rule.max != null && num > rule.max)) {
        return { error: `${field} must be between ${rule.min} and ${rule.max}` };
      }
      return { value: rule.type === "int" ? Math.round(num) : Math.round(num * 100) / 100 };
    }
    case "text": {
      if (typeof value !== "string") return { error: `${field} must be text` };
      const t = value.trim();
      if (rule.maxLen && t.length > rule.maxLen) return { error: `${field} is longer than ${rule.maxLen} characters` };
      return { value: t };
    }
    case "slug": {
      if (typeof value !== "string" || !/^[a-z][a-z0-9_]{1,29}$/.test(value.trim())) {
        return { error: `${field} must be a lowercase type like "strength" or "treadmill_walk"` };
      }
      return { value: value.trim() };
    }
    case "enum":
      return typeof value === "string" && rule.values!.includes(value)
        ? { value }
        : { error: `${field} must be one of ${rule.values!.join(", ")}` };
    case "datetime": {
      const d = new Date(String(value));
      if (!Number.isFinite(d.getTime())) return { error: `${field} must be an ISO date-time` };
      if (d.getTime() > Date.now() + 36 * 3600_000) return { error: `${field} is in the future` };
      return { value: d };
    }
  }
}

// ── Workout virtual fields ─────────────────────────────────────────────────

const metricsOf = (row: Json) => (isObj(row.metricsData) ? (row.metricsData as Json) : {});

/** A field's current value on a loaded row, virtual fields included. */
export function currentValue(entity: PatchEntity, row: Json, field: string): unknown {
  if (entity === "workout" && field === "routineId") return metricsOf(row).sequenceId ?? null;
  if (entity === "workout" && field === "rope") return metricsOf(row).intervals ?? null;
  if (entity === "workout" && field === "exercises") return row.exercises ?? null;
  const v = row[field];
  return v instanceof Date ? v.toISOString() : v ?? null;
}

const asStored = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

/** A corrected jump-rope protocol, in the stored interval-record shape. */
export function ropeRecord(
  rope: unknown,
  durationMinutes: number,
  previous: unknown
): { record: Json; row: object } | { error: string } {
  if (!isObj(rope)) return { error: "rope must be { workSeconds, restSeconds, rounds } or { jumpSeconds }" };
  const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const work = pos(rope.workSeconds);
  const rounds = pos(rope.rounds);
  const interval = work != null && rounds != null;
  if (!interval && pos(rope.jumpSeconds) == null) {
    return { error: "rope needs workSeconds + rounds (intervals) or jumpSeconds (continuous)" };
  }
  if (interval && (work! > 3600 || rounds! > 200)) return { error: "rope workSeconds ≤ 3600 and rounds ≤ 200" };
  const jumpSeconds = interval ? Math.round(work! * rounds!) : Math.round(pos(rope.jumpSeconds)!);
  const prev = isObj(previous) ? previous : {};
  const jumps = pos(rope.jumps);
  const record: Json = {
    mode: interval ? "interval" : "continuous",
    ...(interval
      ? { workSeconds: Math.round(work!), restSeconds: Math.max(0, Math.round(Number(rope.restSeconds) || 0)) }
      : {}),
    roundsCompleted: interval ? Math.round(rounds!) : 1,
    jumpSeconds,
    restSecondsTotal: Math.max(0, Math.round(durationMinutes * 60 - jumpSeconds)),
    // Typed in afterwards: the rounds were not timed by the wrist.
    source: "declared",
    correctedAt: new Date().toISOString(),
    ...(jumps != null
      ? { jumps: { source: "manual", total: Math.round(jumps) } }
      : isObj(prev.jumps) && (prev.jumps as Json).source === "manual"
        ? { jumps: prev.jumps }
        : {}),
  };
  const parsed = readIntervals({ intervals: record });
  if (!parsed) return { error: "That rope protocol could not be read back" };
  return { record, row: jumpRopeExerciseRow(parsed) };
}

// ── The patch ──────────────────────────────────────────────────────────────

export interface PatchInput {
  entity: unknown;
  id: unknown;
  set?: unknown;
  rope?: unknown;
  reason: string;
  dryRun?: boolean;
  via?: "mcp" | "app";
}

export interface PatchResult {
  entity: PatchEntity;
  id: string;
  dryRun: boolean;
  changes: { field: string; before: unknown; after: unknown }[];
  batchId: string | null;
  warnings: string[];
  rebuilt?: string[];
}

function delegate(model: string) {
  return (prisma as unknown as Record<string, {
    findUnique(a: unknown): Promise<Json | null>;
    update(a: unknown): Promise<Json>;
  }>)[model];
}

export async function patchRecord(input: PatchInput): Promise<PatchResult | { error: string }> {
  const entity = input.entity as PatchEntity;
  if (!PATCH_ENTITIES.includes(entity)) return { error: `entity must be one of ${PATCH_ENTITIES.join(", ")}` };
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { error: "id is required" };
  const spec = WRITE_SPECS[entity];
  const set = input.set ?? {};
  if (!isObj(set)) return { error: "set must be an object of field → new value" };
  if (input.rope != null && entity !== "workout") return { error: "rope applies to workouts only" };
  if (Object.keys(set).length === 0 && input.rope == null) return { error: "Nothing to change — give set (and/or rope)" };

  const row = await delegate(spec.model).findUnique({ where: { id } });
  if (!row) return { error: `No ${entity} with id ${id}` };

  const warnings: string[] = [];
  const data: Json = {};
  const changes: PatchResult["changes"] = [];
  const corrected: string[] = [];

  for (const [field, raw] of Object.entries(set)) {
    const rule = spec.fields[field];
    if (!rule) {
      return {
        error: `${field} can't be changed on a ${entity}. Writable: ${Object.keys(spec.fields).join(", ")}${entity === "workout" ? ", plus rope (jump rope) — movements go through edit_workout" : ""}`,
      };
    }
    const checked = checkValue(field, rule, raw);
    if ("error" in checked) return checked;
    const before = currentValue(entity, row, field);
    const after = asStored(checked.value);
    if (sameValue(before, after)) continue;
    changes.push({ field, before, after });
    if (rule.watchOwned) corrected.push(field);
    if (!(entity === "workout" && field === "routineId")) data[field] = checked.value;
  }

  let metrics: Json | null = null;
  if (entity === "workout") {
    metrics = { ...metricsOf(row) };
    const nextType = (data.workoutType as string | undefined) ?? (row.workoutType as string);
    const distance = "distanceMeters" in data ? data.distanceMeters : row.distanceMeters;
    if ("distanceMeters" in data && distance != null && !isDistanceType(nextType)) {
      return { error: `A ${nextType} has no distance — set workoutType to a distance type (walk, run, hike, treadmill_walk…) in the same call` };
    }
    if (isObj(set) && "routineId" in set) {
      const change = changes.find((c) => c.field === "routineId");
      if (change) {
        if (change.after == null) {
          delete metrics.sequenceId;
          delete metrics.sequenceName;
        } else {
          const routine = await prisma.sequence.findUnique({ where: { id: String(change.after) }, select: { id: true, name: true } });
          if (!routine) return { error: `No routine with id ${change.after} — query_data routines lists them` };
          metrics.sequenceId = routine.id;
          metrics.sequenceName = routine.name;
        }
      }
    }
    if (input.rope != null) {
      if (nextType !== JUMP_ROPE_TYPE) return { error: `rope needs workoutType "${JUMP_ROPE_TYPE}" — set it in the same call` };
      const duration = (data.durationMinutes as number | undefined) ?? (row.durationMinutes as number);
      const rope = ropeRecord(input.rope, duration, metrics.intervals);
      if ("error" in rope) return rope;
      const before = metrics.intervals ?? null;
      if (!sameValue(before, rope.record)) {
        changes.push({ field: "rope", before, after: rope.record });
        changes.push({ field: "exercises", before: row.exercises ?? null, after: [rope.row] });
        metrics.intervals = rope.record;
        data.exercises = [rope.row] as Prisma.InputJsonValue;
        corrected.push("rope");
        metrics = stampExercisesEdited(metrics);
      }
    }
    if (changes.some((c) => c.field === "durationMinutes") && input.rope == null && isObj(metrics.intervals)) {
      warnings.push("The duration changed but the rope record did not — send rope too if the protocol was different.");
    }
  }

  if (changes.length === 0) {
    return { entity, id, dryRun: Boolean(input.dryRun), changes: [], batchId: null, warnings: ["Nothing changed — those values were already set."] };
  }
  if (input.dryRun) {
    return { entity, id, dryRun: true, changes, batchId: null, warnings };
  }

  if (entity === "workout") {
    data.metricsData = (corrected.length ? stampCorrected(metrics, corrected) : metrics) as Prisma.InputJsonValue;
  }
  if (entity === "measurement") {
    const sources = isObj(row.fieldSources) ? { ...(row.fieldSources as Json) } : {};
    for (const c of changes) if ((MEASURED_FIELDS as readonly string[]).includes(c.field)) sources[c.field] = "corrected";
    data.fieldSources = sources as Prisma.InputJsonValue;
  }

  await delegate(spec.model).update({ where: { id }, data });
  const batchId = await recordChanges(
    changes.map((c) => ({ entity, recordId: id, field: c.field, before: c.before, after: c.after })),
    { reason: input.reason, via: input.via ?? "mcp" }
  );

  const rebuilt: string[] = [];
  if (entity === "workout" && changes.some((c) => c.field === "exercises")) {
    try {
      await rebuildPersonalRecords();
      rebuilt.push("personal_records");
    } catch {
      warnings.push("Saved, but the PR table could not be rebuilt just now.");
    }
  }
  return { entity, id, dryRun: false, changes, batchId, warnings, ...(rebuilt.length ? { rebuilt } : {}) };
}

// ── Undo for the four entities ─────────────────────────────────────────────

for (const entity of PATCH_ENTITIES) {
  registerUndoHandler(entity, {
    async read(recordId, fields) {
      const row = await delegate(WRITE_SPECS[entity].model).findUnique({ where: { id: recordId } });
      if (!row) return null;
      return Object.fromEntries(fields.map((f) => [f, currentValue(entity, row, f)]));
    },
    async write(recordId, values) {
      const spec = WRITE_SPECS[entity];
      const row = await delegate(spec.model).findUnique({ where: { id: recordId } });
      if (!row) return;
      const data: Json = {};
      let metrics: Json | null = entity === "workout" ? { ...metricsOf(row) } : null;
      let rebuild = false;
      for (const [field, value] of Object.entries(values)) {
        if (entity === "workout" && field === "routineId") {
          if (value == null) {
            delete metrics!.sequenceId;
            delete metrics!.sequenceName;
          } else {
            const routine = await prisma.sequence.findUnique({ where: { id: String(value) }, select: { id: true, name: true } });
            metrics!.sequenceId = String(value);
            if (routine) metrics!.sequenceName = routine.name;
          }
          continue;
        }
        if (entity === "workout" && field === "rope") {
          if (value == null) delete metrics!.intervals;
          else metrics!.intervals = value;
          continue;
        }
        if (entity === "workout" && field === "exercises") {
          data.exercises = value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
          metrics = stampExercisesEdited(metrics);
          rebuild = true;
          continue;
        }
        const rule = spec.fields[field];
        data[field] = rule?.type === "datetime" && typeof value === "string" ? new Date(value) : value;
      }
      if (metrics) {
        // An undone correction hands the field back to the watch.
        const stamps = isObj(metrics.correctedFields) ? { ...(metrics.correctedFields as Json) } : null;
        if (stamps) {
          for (const field of Object.keys(values)) delete stamps[field];
          metrics.correctedFields = stamps;
        }
        data.metricsData = metrics as Prisma.InputJsonValue;
      }
      await delegate(spec.model).update({ where: { id: recordId }, data });
      if (rebuild) await rebuildPersonalRecords().catch(() => null);
    },
  });
}

/** One line per writable field, for the tool description. */
export function writableSummary(): string {
  return PATCH_ENTITIES.map((e) => {
    const fields = Object.entries(WRITE_SPECS[e].fields)
      .filter(([f]) => e !== "measurement" || !(MEASURED_FIELDS as readonly string[]).includes(f))
      .map(([f, r]) => (r.note ? `${f} (${r.note})` : f));
    const extra = e === "measurement" ? ", and every measured value (weightKg, waistCm, bodyFatPct, …)" : e === "workout" ? ", plus rope" : "";
    return `${e}: ${fields.join(", ")}${extra}`;
  }).join("; ");
}
