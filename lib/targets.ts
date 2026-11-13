// Calorie and macro targets as rules (2026-11-12, MCP v2 Phase D; gaps #2, #6).
//
// Before: one `calorieTarget` plus three macro percentages in the settings
// blob, with no way to change them from the Claude connector — the goal the
// daily summary measured against went stale the day he changed plans.
//
// Now: `settings.targets` holds a rest-day target, an optional training-day
// target and the rule that picks between them, plus the parameters of the
// daily energy estimate (lib/day-ledger.ts). Grams, not percentages — that is
// how he states them. The legacy keys stay, MIRRORED from `targets.rest` on
// every write (here and in PUT /api/settings), so every screen that reads
// `calorieTarget`/`*Pct` keeps showing the right rest-day goal unchanged.

import { kcalFromMacros, macroMismatchWarning } from "@/lib/macro-check";

export interface MacroTarget {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface TdeeConfig {
  /** Where the resting burn comes from: the latest scale estimate, or a fixed number. */
  bmr: { source: "latest_scale" | "fixed"; kcal?: number };
  /** Energy spent digesting food, as % of kcal eaten. */
  tefPct: number;
  /** kcal per step taken outside logged workouts. */
  kcalPerStep: number;
}

export interface Targets {
  rest: MacroTarget;
  /** null = training days use the rest target. */
  training: MacroTarget | null;
  /** A day is "training" once that day's logged workouts burn at least this. */
  trainingDayRule: { minWorkoutKcal: number };
  tdee: TdeeConfig;
  updatedAt: string;
  updatedVia: "mcp" | "app";
}

export const DEFAULT_TDEE: TdeeConfig = {
  bmr: { source: "latest_scale" },
  tefPct: 10,
  kcalPerStep: 0.04,
};

export const DEFAULT_TRAINING_RULE = { minWorkoutKcal: 300 };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The rest target implied by the legacy keys (kcal + percentages). */
export function restFromLegacy(settings: Json): MacroTarget {
  const kcal = finite(settings.calorieTarget) ? settings.calorieTarget : 2000;
  const pct = (key: string, fallback: number) =>
    finite(settings[key]) ? (settings[key] as number) : fallback;
  return {
    kcal,
    proteinG: Math.round((kcal * pct("proteinPct", 30)) / 100 / 4),
    carbsG: Math.round((kcal * pct("carbsPct", 40)) / 100 / 4),
    fatG: Math.round((kcal * pct("fatPct", 30)) / 100 / 9),
  };
}

/** The legacy keys every existing screen reads, derived from a rest target. */
export function legacyFromRest(rest: MacroTarget): {
  calorieTarget: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
} {
  const pct = (kcalOfMacro: number) => Math.round((kcalOfMacro / rest.kcal) * 100);
  return {
    calorieTarget: rest.kcal,
    proteinPct: pct(rest.proteinG * 4),
    carbsPct: pct(rest.carbsG * 4),
    fatPct: pct(rest.fatG * 9),
  };
}

/** Stored targets, or the ones the legacy keys imply when none were ever set. */
export function readTargets(settings: Json): Targets {
  const stored = isObj(settings.targets) ? (settings.targets as Partial<Targets>) : null;
  const rest = stored?.rest && isMacro(stored.rest) ? stored.rest : restFromLegacy(settings);
  return {
    rest,
    training: stored?.training && isMacro(stored.training) ? stored.training : null,
    trainingDayRule:
      stored?.trainingDayRule && finite(stored.trainingDayRule.minWorkoutKcal)
        ? { minWorkoutKcal: stored.trainingDayRule.minWorkoutKcal }
        : DEFAULT_TRAINING_RULE,
    tdee: {
      ...DEFAULT_TDEE,
      ...(isObj(stored?.tdee) ? stored!.tdee : {}),
      bmr: isObj(stored?.tdee?.bmr) ? (stored!.tdee!.bmr as TdeeConfig["bmr"]) : DEFAULT_TDEE.bmr,
    },
    updatedAt: typeof stored?.updatedAt === "string" ? stored.updatedAt : "",
    updatedVia: stored?.updatedVia === "app" ? "app" : "mcp",
  };
}

function isMacro(v: unknown): v is MacroTarget {
  return isObj(v) && finite(v.kcal) && finite(v.proteinG) && finite(v.fatG) && finite(v.carbsG);
}

export type DayType = "rest" | "training";

/** Which target applies to a day, given the kcal its logged workouts burned. */
export function resolveDayTarget(
  targets: Targets,
  workoutKcal: number
): { dayType: DayType; target: MacroTarget } {
  const training =
    targets.training != null && workoutKcal >= targets.trainingDayRule.minWorkoutKcal;
  return training
    ? { dayType: "training", target: targets.training! }
    : { dayType: "rest", target: targets.rest };
}

// ── Validation of a targets patch ──────────────────────────────────────────

const RANGES = {
  kcal: [800, 6000],
  grams: [0, 500],
  minWorkoutKcal: [0, 3000],
  tefPct: [0, 25],
  kcalPerStep: [0, 0.2],
  bmrKcal: [800, 4000],
} as const;

function inRange(v: unknown, [min, max]: readonly [number, number]): v is number {
  return finite(v) && v >= min && v <= max;
}

function mergeMacro(
  label: string,
  base: MacroTarget | null,
  patch: unknown
): { value: MacroTarget } | { error: string } {
  if (!isObj(patch)) return { error: `${label} must be an object with kcal, proteinG, fatG, carbsG` };
  const next = { ...(base ?? {}), ...patch } as Json;
  for (const key of ["kcal", "proteinG", "fatG", "carbsG"] as const) {
    if (next[key] === undefined) return { error: `${label}.${key} is missing` };
    const range = key === "kcal" ? RANGES.kcal : RANGES.grams;
    if (!inRange(next[key], range)) {
      return { error: `${label}.${key} must be a number from ${range[0]} to ${range[1]}` };
    }
  }
  return {
    value: {
      kcal: Math.round(next.kcal as number),
      proteinG: Math.round(next.proteinG as number),
      fatG: Math.round(next.fatG as number),
      carbsG: Math.round(next.carbsG as number),
    },
  };
}

/**
 * Apply a partial `targets` patch onto the current targets. Returns the full
 * next targets and any warnings, or an error naming the field.
 */
export function applyTargetsPatch(
  current: Targets,
  patch: unknown,
  via: "mcp" | "app",
  now = new Date()
): { targets: Targets; warnings: string[] } | { error: string } {
  if (!isObj(patch)) return { error: "targets must be an object" };
  const allowed = new Set(["rest", "training", "trainingDayRule", "tdee"]);
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) return { error: `targets.${key} is not a target setting (rest, training, trainingDayRule, tdee)` };
  }
  const next: Targets = { ...current, tdee: { ...current.tdee, bmr: { ...current.tdee.bmr } } };

  if ("rest" in patch) {
    const r = mergeMacro("targets.rest", current.rest, patch.rest);
    if ("error" in r) return r;
    next.rest = r.value;
  }
  if ("training" in patch) {
    if (patch.training === null) next.training = null;
    else {
      const t = mergeMacro("targets.training", current.training, patch.training);
      if ("error" in t) return t;
      next.training = t.value;
    }
  }
  if ("trainingDayRule" in patch) {
    const rule = patch.trainingDayRule;
    if (!isObj(rule) || !inRange(rule.minWorkoutKcal, RANGES.minWorkoutKcal)) {
      return { error: "targets.trainingDayRule.minWorkoutKcal must be a number from 0 to 3000" };
    }
    next.trainingDayRule = { minWorkoutKcal: Math.round(rule.minWorkoutKcal) };
  }
  if ("tdee" in patch) {
    const t = patch.tdee;
    if (!isObj(t)) return { error: "targets.tdee must be an object" };
    if ("tefPct" in t) {
      if (!inRange(t.tefPct, RANGES.tefPct)) return { error: "targets.tdee.tefPct must be 0–25" };
      next.tdee.tefPct = t.tefPct;
    }
    if ("kcalPerStep" in t) {
      if (!inRange(t.kcalPerStep, RANGES.kcalPerStep)) return { error: "targets.tdee.kcalPerStep must be 0–0.2" };
      next.tdee.kcalPerStep = t.kcalPerStep;
    }
    if ("bmr" in t) {
      const b = t.bmr;
      if (!isObj(b) || (b.source !== "latest_scale" && b.source !== "fixed")) {
        return { error: 'targets.tdee.bmr.source must be "latest_scale" or "fixed"' };
      }
      if (b.source === "fixed" && !inRange(b.kcal, RANGES.bmrKcal)) {
        return { error: "targets.tdee.bmr.kcal must be 800–4000 when the source is fixed" };
      }
      next.tdee.bmr = b.source === "fixed" ? { source: "fixed", kcal: Math.round(b.kcal as number) } : { source: "latest_scale" };
    }
  }

  next.updatedAt = now.toISOString();
  next.updatedVia = via;

  const warnings: string[] = [];
  for (const [label, m] of [["rest", next.rest], ["training", next.training]] as const) {
    if (!m) continue;
    const w = macroMismatchWarning({ calories: m.kcal, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG }, 0.05);
    if (w) {
      warnings.push(
        `The ${label}-day macros add up to ${Math.round(kcalFromMacros(m))} kcal, not ${m.kcal}. Saved as given — say if one of them should change.`
      );
    }
  }
  return { targets: next, warnings };
}
