// The wrist's per-entry workout log — one row per voice clip or tap — and the
// fold that turns it into the workout's `exercises` list. Pure module: the
// watch sends the log with the workout at End, the server stores it verbatim
// in metricsData and composes from it, so a late or corrected entry only ever
// needs a recompose.
//
// The log is the record of what happened in time order; `exercises` is the
// summary. Only CONSECUTIVE identical entries collapse into sets — swings,
// push-ups, swings stays three rows, because the order is the workout.

import { foldExerciseName } from "@/lib/exercises";

export interface SetLogEntry {
  id: string;
  /** Elapsed seconds from workout start when the entry was recorded. */
  t: number;
  /** ISO timestamp. */
  at?: string;
  source: "voice" | "tap";
  status: "ok" | "review" | "queued" | "failed" | "undone";
  name: string;
  exercise?: string;
  reps?: number;
  sets?: number;
  weightKg?: number;
  seconds?: number;
  perSide?: boolean;
  load?: { type: "vest"; kg: number; assumed?: boolean };
  transcript?: string;
  confidence?: number;
  reason?: string;
  /** Seconds since the previous counted entry — rest PLUS this set's work, so it is named for what it is. */
  gapSeconds?: number;
}

export interface ComposedExercise {
  name: string;
  exercise?: string;
  sets: number;
  reps?: number;
  seconds?: number;
  weightKg?: number;
  perSide?: boolean;
  load?: { type: "vest"; kg: number; assumed?: boolean };
}

const elapsed = (entry: SetLogEntry) => (Number.isFinite(entry.t) ? entry.t : 0);

/** Entries that count toward the workout: status ok or review. */
export function countedEntries(log: SetLogEntry[]): SetLogEntry[] {
  return log.filter((entry) => entry.status === "ok" || entry.status === "review");
}

/** Sort by t, drop undone/failed/queued, and stamp gapSeconds (absent on the first). Returns new objects. */
export function withGaps(log: SetLogEntry[]): SetLogEntry[] {
  // Array.sort is stable, so entries sharing a second keep their sent order.
  const counted = countedEntries(log).sort((a, b) => elapsed(a) - elapsed(b));
  let previous: number | null = null;
  return counted.map((entry) => {
    const stamped: SetLogEntry = { ...entry };
    // Any gap the sender stamped is stale once the list is filtered and re-sorted.
    delete stamped.gapSeconds;
    if (previous != null) stamped.gapSeconds = Math.max(0, Math.round(elapsed(entry) - previous));
    previous = elapsed(entry);
    return stamped;
  });
}

/** Movement identity: the catalog/custom id when the entry has one, else the folded name. */
function movementKey(entry: SetLogEntry): string {
  return entry.exercise ? `id:${entry.exercise}` : `name:${foldExerciseName(entry.name)}`;
}

/** Everything that has to agree for two entries to be sets of the same row. */
function mergeKey(entry: SetLogEntry): string {
  return [
    movementKey(entry),
    entry.reps ?? "",
    entry.seconds ?? "",
    entry.weightKg ?? "",
    entry.perSide ? "side" : "",
    entry.load ? entry.load.kg : "", // `assumed` is not part of the identity
  ].join("|");
}

const setCount = (entry: SetLogEntry) =>
  typeof entry.sets === "number" && Number.isFinite(entry.sets) && entry.sets >= 1 ? Math.round(entry.sets) : 1;

/**
 * CONSECUTIVE entries with the same movement key, reps, seconds, weightKg, perSide and vest kg merge into one row
 * (sets add; an entry's own `sets` counts as that many). Non-consecutive repeats stay separate rows, in time order.
 */
export function composeExercises(log: SetLogEntry[]): ComposedExercise[] {
  const rows: ComposedExercise[] = [];
  let lastKey: string | null = null;
  for (const entry of withGaps(log)) {
    const key = mergeKey(entry);
    const last = rows[rows.length - 1];
    if (last != null && key === lastKey) {
      last.sets += setCount(entry);
      // A vest weight he actually said outranks the assumed default for the row.
      if (last.load?.assumed && entry.load && !entry.load.assumed) delete last.load.assumed;
      continue;
    }
    // Built key by key so absent values never appear as `reps: undefined`.
    const row: ComposedExercise = { name: entry.name, sets: setCount(entry) };
    if (entry.exercise) row.exercise = entry.exercise;
    if (entry.reps != null) row.reps = entry.reps;
    if (entry.seconds != null) row.seconds = entry.seconds;
    if (entry.weightKg != null) row.weightKg = entry.weightKg;
    if (entry.perSide) row.perSide = true;
    if (entry.load) {
      row.load = { type: "vest", kg: entry.load.kg };
      if (entry.load.assumed) row.load.assumed = true;
    }
    rows.push(row);
    lastKey = key;
  }
  return rows;
}

/** True when the value looks like a set log (array of objects with id + name). Tolerant of unknown extra keys. */
export function isSetLog(value: unknown): value is SetLogEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item != null &&
        typeof item === "object" &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { name?: unknown }).name === "string"
    )
  );
}
