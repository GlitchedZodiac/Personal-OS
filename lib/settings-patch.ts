// update_settings — the connector's one door into the settings blob
// (2026-11-12, MCP v2 Phase D; gap #2).
//
// The blob is a single JSON row the app saves whole. This applies a PATCH of
// named keys, validates each, mirrors the legacy macro keys from
// `targets.rest`, and reports before/after per key. Writable keys are a
// strict subset of what the connector may READ (MCP_SETTINGS_KEYS); finance,
// notifications and the time zone are never writable here.

import {
  applyTargetsPatch,
  legacyFromRest,
  readTargets,
} from "@/lib/targets";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const WRITABLE_SETTINGS_KEYS = [
  "targets",
  "aiInstructions.health",
  "bodyGoals",
  "healthGoals",
  "workoutGoals",
  "hrZoneTops",
  "units",
  "aiLanguage",
] as const;

const LEGACY_MACRO_KEYS = ["calorieTarget", "proteinPct", "carbsPct", "fatPct"];
export const MAX_STANDING_RULES = 2000;

export interface SettingsChange {
  key: string;
  before: unknown;
  after: unknown;
}

export type SettingsPatchResult =
  | { next: Json; changes: SettingsChange[]; warnings: string[] }
  | { error: string };

const deepEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeChecked(
  key: string,
  current: unknown,
  patch: unknown,
  rules: Record<string, (v: unknown) => string | null>
): { value: Json } | { error: string } {
  if (!isObj(patch)) return { error: `${key} must be an object` };
  const next: Json = { ...(isObj(current) ? current : {}) };
  for (const [k, v] of Object.entries(patch)) {
    const rule = rules[k];
    if (!rule) return { error: `${key}.${k} is not a setting (${Object.keys(rules).join(", ")})` };
    const problem = rule(v);
    if (problem) return { error: `${key}.${k} ${problem}` };
    next[k] = v;
  }
  return { value: next };
}

const numOrNull = (min: number, max: number) => (v: unknown) =>
  v === null || (finite(v) && v >= min && v <= max) ? null : `must be a number from ${min} to ${max}, or null`;
const num = (min: number, max: number) => (v: unknown) =>
  finite(v) && v >= min && v <= max ? null : `must be a number from ${min} to ${max}`;
const oneOf = (values: string[]) => (v: unknown) =>
  typeof v === "string" && values.includes(v) ? null : `must be one of ${values.join(", ")}`;
const strings = (max: number) => (v: unknown) =>
  Array.isArray(v) && v.length <= max && v.every((s) => typeof s === "string" && s.length <= 60)
    ? null
    : `must be a list of up to ${max} short words`;
const text = (max: number) => (v: unknown) =>
  typeof v === "string" && v.length <= max ? null : `must be text up to ${max} characters`;

export function applySettingsPatch(
  current: Json,
  patch: unknown,
  via: "mcp" | "app" = "mcp",
  now = new Date()
): SettingsPatchResult {
  if (!isObj(patch) || Object.keys(patch).length === 0) {
    return { error: `patch must name at least one setting: ${WRITABLE_SETTINGS_KEYS.join(", ")}` };
  }
  const next: Json = { ...current };
  const changes: SettingsChange[] = [];
  const warnings: string[] = [];
  const record = (key: string, before: unknown, after: unknown) => {
    if (!deepEqual(before, after)) changes.push({ key, before: before ?? null, after: after ?? null });
  };

  for (const [key, value] of Object.entries(patch)) {
    if (LEGACY_MACRO_KEYS.includes(key)) {
      return {
        error: `${key} follows from targets.rest — set targets.rest { kcal, proteinG, fatG, carbsG } instead`,
      };
    }
    switch (key) {
      case "targets": {
        const before = readTargets(current);
        const applied = applyTargetsPatch(before, value, via, now);
        if ("error" in applied) return applied;
        warnings.push(...applied.warnings);
        const hadStored = isObj(current.targets);
        record("targets", hadStored ? current.targets : null, applied.targets);
        next.targets = applied.targets;
        const legacy = legacyFromRest(applied.targets.rest);
        for (const [k, v] of Object.entries(legacy)) {
          record(k, current[k], v);
          next[k] = v;
        }
        break;
      }
      case "aiInstructions.health": {
        const problem = text(MAX_STANDING_RULES)(value);
        if (problem) return { error: `aiInstructions.health ${problem}` };
        const ai = isObj(current.aiInstructions) ? current.aiInstructions : {};
        record(key, ai.health, value);
        next.aiInstructions = { ...ai, health: (value as string).trim() };
        break;
      }
      case "bodyGoals": {
        const r = mergeChecked(key, current.bodyGoals, value, {
          goalWeightKg: numOrNull(30, 250),
          goalWaistCm: numOrNull(40, 200),
        });
        if ("error" in r) return r;
        record(key, current.bodyGoals, r.value);
        next.bodyGoals = r.value;
        break;
      }
      case "healthGoals": {
        const r = mergeChecked(key, current.healthGoals, value, {
          weightKg: num(30, 250),
          bodyFatPct: num(3, 60),
          byDate: (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : "must be a YYYY-MM-DD date"),
        });
        if ("error" in r) return r;
        record(key, current.healthGoals, r.value);
        next.healthGoals = r.value;
        break;
      }
      case "workoutGoals": {
        const r = mergeChecked(key, current.workoutGoals, value, {
          goal: oneOf(["build_muscle", "lose_weight", "general_fitness", "endurance"]),
          fitnessLevel: oneOf(["beginner", "intermediate", "advanced"]),
          daysPerWeek: num(0, 7),
          sessionMinutes: num(5, 300),
          equipment: strings(20),
          focusAreas: strings(20),
          injuries: text(1000),
        });
        if ("error" in r) return r;
        record(key, current.workoutGoals, r.value);
        next.workoutGoals = r.value;
        break;
      }
      case "hrZoneTops": {
        const ok =
          Array.isArray(value) &&
          value.length === 4 &&
          value.every((v, i) => Number.isInteger(v) && v >= 60 && v <= 230 && (i === 0 || v > value[i - 1]));
        if (!ok) return { error: "hrZoneTops must be four increasing whole bpm values between 60 and 230 (tops of Z1–Z4)" };
        record(key, current.hrZoneTops, value);
        next.hrZoneTops = value;
        break;
      }
      case "units": {
        const problem = oneOf(["metric", "imperial"])(value);
        if (problem) return { error: `units ${problem}` };
        record(key, current.units, value);
        next.units = value;
        break;
      }
      case "aiLanguage": {
        const problem = oneOf(["english", "spanish", "portuguese", "french"])(value);
        if (problem) return { error: `aiLanguage ${problem}` };
        record(key, current.aiLanguage, value);
        next.aiLanguage = value;
        break;
      }
      default:
        return {
          error: `"${key}" can't be changed from the connector. Writable: ${WRITABLE_SETTINGS_KEYS.join(", ")}`,
        };
    }
  }
  return { next, changes, warnings };
}

/**
 * The guard PUT /api/settings applies to a whole-blob save from the app:
 * `targets` is owned by the server (the app has no targets editor), and the
 * legacy macro keys are re-derived from it, so a stale client copy can never
 * move the daily goal back.
 */
export function mirrorLegacyFromTargets(body: Json): Json {
  if (!isObj(body.targets)) return body;
  const targets = readTargets(body);
  return { ...body, ...legacyFromRest(targets.rest) };
}
