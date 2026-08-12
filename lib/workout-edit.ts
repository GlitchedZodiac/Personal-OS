import { normalizeExerciseName, foldExerciseName } from "@/lib/exercises";

// Surgical single-entry edit of a workout's exercises array — the chat's
// "the windmills I just did were 8 kg, not 20" correction. Pure so it's
// testable; the route owns persistence and the PR rebuild.

export interface EntryMatch {
  name?: unknown;
  index?: unknown;
}

export interface EntrySet {
  name?: unknown;
  sets?: unknown;
  reps?: unknown;
  seconds?: unknown;
  weightKg?: unknown;
}

interface ExerciseRow {
  name?: unknown;
  [key: string]: unknown;
}

function toPositive(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number.parseFloat(value) : (value as number);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Index of the entry `match` points at, or -1. Index wins when valid; name
 * matching is catalog-normalized so "windmills" finds "Kettlebell Windmill". */
export function findEntryIndex(exercises: unknown, match: EntryMatch): number {
  if (!Array.isArray(exercises)) return -1;

  const idx = typeof match.index === "number" ? Math.trunc(match.index) : NaN;
  if (Number.isInteger(idx) && idx >= 0 && idx < exercises.length) return idx;

  const rawName = typeof match.name === "string" ? match.name.trim() : "";
  if (!rawName) return -1;
  const targetDef = normalizeExerciseName(rawName);
  const targetFold = foldExerciseName(rawName);

  for (let i = 0; i < exercises.length; i++) {
    const row = exercises[i] as ExerciseRow;
    if (!row || typeof row !== "object" || typeof row.name !== "string") continue;
    const rowDef = normalizeExerciseName(row.name);
    if (targetDef && rowDef && targetDef.id === rowDef.id) return i;
    if (!targetDef && foldExerciseName(row.name) === targetFold) return i;
  }
  return -1;
}

export interface WeightAssignment {
  /** Substring/normalized match against entry names; "" or "*" = every entry. */
  match: string;
  weightKg: number;
}

/**
 * Bulk weight correction — "everything at 20 kg except the windmills at 8"
 * (2026-08-11: 21 single-entry cards stalled the loop; one card must carry
 * the whole correction). Assignments apply in order, later = more specific:
 * [{match:"*",weightKg:20},{match:"windmill",weightKg:8}]. Matching is
 * catalog-normalized then substring-folded so "windmills" hits
 * "Kettlebell Windmill (each side)" and "Round 3 — ..." prefixes.
 */
export function applyWeightAssignments(
  exercises: unknown,
  assignments: WeightAssignment[]
):
  | { ok: true; exercises: object[]; touched: number }
  | { ok: false; error: string } {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { ok: false, error: "This workout has no entries" };
  }
  const valid = assignments
    .map((a) => ({
      match: typeof a.match === "string" ? a.match.trim() : "",
      weightKg: toPositive(a.weightKg),
    }))
    .filter((a): a is { match: string; weightKg: number } => a.weightKg !== undefined);
  if (valid.length === 0) return { ok: false, error: "No valid weights given" };

  const next = exercises.map((row) => ({ ...(row as ExerciseRow) }));
  const touchedIdx = new Set<number>();

  for (const a of valid) {
    const all = a.match === "" || a.match === "*";
    const def = all ? null : normalizeExerciseName(a.match);
    const fold = all ? "" : foldExerciseName(a.match);
    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (!row || typeof row.name !== "string") continue;
      let hit = all;
      if (!hit && def) {
        const rowDef = normalizeExerciseName(row.name);
        hit = Boolean(rowDef && rowDef.id === def.id);
      }
      if (!hit && fold) {
        hit = foldExerciseName(row.name).includes(fold);
      }
      if (hit) {
        row.weightKg = a.weightKg;
        touchedIdx.add(i);
      }
    }
  }

  if (touchedIdx.size === 0) {
    return { ok: false, error: "No entries matched" };
  }
  return { ok: true, exercises: next as object[], touched: touchedIdx.size };
}

export function applyEntryEdit(
  exercises: unknown,
  index: number,
  set: EntrySet
):
  | { ok: true; exercises: object[]; changed: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(exercises) || index < 0 || index >= exercises.length) {
    return { ok: false, error: "Entry not found in this workout" };
  }

  const next = exercises.map((row) => ({ ...(row as ExerciseRow) }));
  const row = next[index];
  const changed: string[] = [];

  if (typeof set.name === "string" && set.name.trim()) {
    row.name = set.name.trim();
    changed.push("name");
  }
  for (const field of ["sets", "reps", "seconds", "weightKg"] as const) {
    if (set[field] === undefined || set[field] === null) continue;
    const value = toPositive(set[field]);
    if (value === undefined) {
      return { ok: false, error: `Invalid ${field}` };
    }
    row[field] = value;
    changed.push(field);
  }

  if (changed.length === 0) {
    return { ok: false, error: "Nothing to change" };
  }
  return { ok: true, exercises: next as object[], changed };
}
