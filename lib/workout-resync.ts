// What a second POST of the same workout from the watch is allowed to
// change. The wrist re-sends a session on purpose — the 60-second recovery
// number, a jump count typed on the summary, a voice entry whose audio was
// queued while out of range — and each re-send carries the WHOLE item as the
// watch last knew it. Written through unguarded, that silently erased any
// movement list he had fixed on the phone in between (found 2026-10-05; the
// window was a minute for HRR and unbounded for an offline watch).
//
// The rule: the watch owns what only the watch can know (HR, streams,
// calories, the interval record); once the movement list has been edited
// off the wrist, the wrist no longer owns it. Pure — the route does the I/O.

import { normalizeExerciseName } from "@/lib/exercises";

type Json = Record<string, unknown>;

const asObject = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

/** Stamp metricsData when the movement list is edited anywhere but the wrist. */
export function stampExercisesEdited(metricsData: unknown, at: Date = new Date()): Json {
  return { ...(asObject(metricsData) ?? {}), exercisesEditedAt: at.toISOString() };
}

export function exercisesWereEdited(metricsData: unknown): boolean {
  return typeof asObject(metricsData)?.exercisesEditedAt === "string";
}

function logIds(log: unknown): Set<string> {
  const ids = new Set<string>();
  if (Array.isArray(log)) {
    for (const e of log) {
      const id = asObject(e)?.id;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

export interface ResyncMerge {
  exercises: unknown;
  metricsData: unknown;
  description: string | null;
  /** True when the incoming movement list was held back in favour of his edit. */
  keptEditedExercises: boolean;
  /** Set-log ids that arrived after his edit and are NOT in the movement list. */
  lateEntryIds: string[];
}

/**
 * Merge a re-sent watch item into the row that already exists.
 * `incoming.metricsData` is the already-enriched metrics for the new item.
 */
export function mergeResync(
  existing: { exercises: unknown; metricsData: unknown; description: string | null },
  incoming: { exercises: unknown; metricsData: unknown; description: string | null }
): ResyncMerge {
  const before = asObject(existing.metricsData);
  const next: Json = { ...(asObject(incoming.metricsData) ?? {}) };
  const edited = exercisesWereEdited(before);

  let lateEntryIds: string[] = [];
  if (edited && before) {
    next.exercisesEditedAt = before.exercisesEditedAt;
    // Entries that were not on the row when he edited it are new information
    // — keep them in the log, flagged, and let the review screen offer them.
    // (An entry flagged late by an earlier re-send is in the stored log by
    // now, so "still late" has to be carried forward explicitly.)
    const known = logIds(before.setLog);
    const stillLate = new Set(
      Array.isArray(before.lateEntryIds) ? (before.lateEntryIds as string[]) : []
    );
    lateEntryIds = [...logIds(next.setLog)].filter(
      (id) => !known.has(id) || stillLate.has(id)
    );
    if (lateEntryIds.length) next.lateEntryIds = lateEntryIds;
  }

  // A measured recovery cannot be un-measured: a re-send built from an older
  // copy of the item (a voice entry resolving late) must not erase the HRR
  // that landed in between.
  if (before && typeof before.hrrDelta === "number" && typeof next.hrrDelta !== "number") {
    next.hrrDelta = before.hrrDelta;
    if (typeof before.hrrSeconds === "number") next.hrrSeconds = before.hrrSeconds;
  }

  // A jump count he entered on the phone survives a re-send that has none.
  const prevIntervals = asObject(before?.intervals);
  const nextIntervals = asObject(next.intervals);
  if (prevIntervals?.jumps && nextIntervals && !nextIntervals.jumps) {
    next.intervals = { ...nextIntervals, jumps: prevIntervals.jumps };
  }

  return {
    exercises: edited ? existing.exercises : incoming.exercises,
    metricsData: Object.keys(next).length ? next : incoming.metricsData,
    // The wrist never writes prose; a description added on the phone stays.
    description: incoming.description ?? existing.description,
    keptEditedExercises: edited,
    lateEntryIds,
  };
}

/**
 * Add the canonical id to movement rows that resolve and lack one. Names
 * are left exactly as sent — this only makes a voice-logged row findable by
 * id the way an edited or MCP-logged row already is.
 */
export function withCanonicalIds(exercises: unknown): unknown {
  if (!Array.isArray(exercises)) return exercises;
  return exercises.map((row) => {
    const r = asObject(row);
    if (!r || typeof r.name !== "string" || typeof r.exercise === "string") return row;
    const def = normalizeExerciseName(r.name);
    return def ? { ...r, exercise: def.id } : row;
  });
}
