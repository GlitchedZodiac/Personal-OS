// Strength history (2026-08-29): the per-movement view of everything in
// WorkoutLog.exercises — the strength twin of route-analytics. Pure module:
// rows in, {per-movement history, last-time context, tonnage by movement}
// out. Feeds the activity detail's upgraded movement rows and the Train
// page's PR wall + BY MOVEMENT chart.
//
// Names are matched by fold (accent/case-insensitive) so "Swing" and
// "swings" aggregate — the same leniency lib/prs.ts uses via the catalog.

import { foldExerciseName, normalizeExerciseName } from "@/lib/exercises";
import type { RawExercise } from "@/lib/prs";

export interface MovementSession {
  workoutId: string;
  startedAt: string; // ISO
  topWeightKg: number | null;
  volumeKg: number;
  /// "5×10" style — the heaviest entry's shape that session.
  shape: string | null;
}

export interface MovementHistory {
  /// Canonical id when the catalog knows it, else the folded name.
  key: string;
  name: string;
  sessions: MovementSession[]; // newest first
  bestWeightKg: number | null;
  totalVolumeKg: number;
}

export interface StrengthRowIn {
  id: string;
  startedAt: Date | string;
  exercises: unknown;
}

/// Stable per-movement key: catalog id when the name resolves, else fold.
export function movementKey(name: string): { key: string; display: string } {
  const def = normalizeExerciseName(name);
  if (def) return { key: def.id, display: def.name };
  return { key: foldExerciseName(name), display: name.trim() };
}

function entryVolume(e: RawExercise): number {
  const weight = Number(e.weightKg ?? e.weight);
  const reps = Number(e.reps);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  const sets = Number(e.sets);
  return weight * reps * (Number.isFinite(sets) && sets > 0 ? sets : 1);
}

/// Build the whole per-movement map from workout rows (any order).
export function buildMovementHistories(rows: StrengthRowIn[]): Map<string, MovementHistory> {
  const map = new Map<string, MovementHistory>();
  for (const row of rows) {
    if (!Array.isArray(row.exercises)) continue;
    const startedAt =
      typeof row.startedAt === "string" ? row.startedAt : row.startedAt.toISOString();
    // One session entry per movement per workout — merge duplicate entries
    // (the watch groups by weight, so "Swing 24" + "Swing 28" both appear).
    const perMovement = new Map<
      string,
      { name: string; top: number | null; volume: number; shape: string | null }
    >();
    for (const raw of row.exercises as RawExercise[]) {
      const name = typeof raw?.name === "string" ? raw.name.trim() : "";
      if (!name) continue;
      const { key, display } = movementKey(name);
      const weight = Number(raw.weightKg ?? raw.weight);
      const top = Number.isFinite(weight) && weight > 0 ? weight : null;
      const volume = entryVolume(raw);
      const sets = Number(raw.sets);
      const reps = Number(raw.reps);
      const shape =
        Number.isFinite(sets) && sets > 0 && Number.isFinite(reps) && reps > 0
          ? `${sets}×${reps}`
          : Number.isFinite(reps) && reps > 0
            ? `${reps} reps`
            : null;
      const existing = perMovement.get(key);
      if (!existing) {
        perMovement.set(key, { name: display, top, volume, shape });
      } else {
        existing.volume += volume;
        if (top != null && (existing.top == null || top > existing.top)) {
          existing.top = top;
          existing.shape = shape ?? existing.shape;
        }
      }
    }
    for (const [key, m] of perMovement) {
      let hist = map.get(key);
      if (!hist) {
        hist = { key, name: m.name, sessions: [], bestWeightKg: null, totalVolumeKg: 0 };
        map.set(key, hist);
      }
      hist.sessions.push({
        workoutId: row.id,
        startedAt,
        topWeightKg: m.top,
        volumeKg: Math.round(m.volume),
        shape: m.shape,
      });
      hist.totalVolumeKg += m.volume;
      if (m.top != null && (hist.bestWeightKg == null || m.top > hist.bestWeightKg)) {
        hist.bestWeightKg = m.top;
      }
    }
  }
  for (const hist of map.values()) {
    hist.sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    hist.totalVolumeKg = Math.round(hist.totalVolumeKg);
  }
  return map;
}

export interface MovementContext {
  name: string;
  bestWeightKg: number | null;
  /// The previous session of this movement BEFORE the given date.
  lastTime: { startedAt: string; topWeightKg: number | null; shape: string | null } | null;
  timesTrained: number;
}

/// Per-movement context for one workout's rows: "best 32 · last time 24".
export function movementContext(
  histories: Map<string, MovementHistory>,
  name: string,
  beforeIso: string
): MovementContext | null {
  const { key, display } = movementKey(name);
  const hist = histories.get(key);
  if (!hist) return null;
  const prev = hist.sessions.find((s) => s.startedAt < beforeIso);
  return {
    name: display,
    bestWeightKg: hist.bestWeightKg,
    lastTime: prev
      ? { startedAt: prev.startedAt, topWeightKg: prev.topWeightKg, shape: prev.shape }
      : null,
    timesTrained: hist.sessions.length,
  };
}

export interface MovementTonnageWeek {
  weekStart: string; // ISO date (Monday)
  volumeKg: number;
}

/// Top movements by tonnage over the trailing N weeks (Mon-start weeks).
export function tonnageByMovement(
  histories: Map<string, MovementHistory>,
  weeks = 8,
  top = 6,
  now: Date = new Date()
): { key: string; name: string; totalKg: number; weeksActive: number }[] {
  const cutoff = new Date(now.getTime() - weeks * 7 * 24 * 3600 * 1000).toISOString();
  const rows = [...histories.values()]
    .map((h) => {
      const recent = h.sessions.filter((s) => s.startedAt >= cutoff);
      const totalKg = Math.round(recent.reduce((s, x) => s + x.volumeKg, 0));
      const weeksActive = new Set(
        recent.map((s) => {
          const d = new Date(s.startedAt);
          const day = (d.getDay() + 6) % 7;
          d.setDate(d.getDate() - day);
          return d.toISOString().slice(0, 10);
        })
      ).size;
      return { key: h.key, name: h.name, totalKg, weeksActive };
    })
    .filter((r) => r.totalKg > 0)
    .sort((a, b) => b.totalKg - a.totalKg);
  return rows.slice(0, top);
}

/// Time-under-load for seconds-based entries — the honest number where
/// tonnage would be 0 (sessionVolumeKg deliberately ignores seconds).
export function timeUnderLoadSeconds(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0;
  let total = 0;
  for (const raw of exercises as RawExercise[]) {
    const seconds = Number((raw as { seconds?: unknown }).seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const sets = Number(raw.sets);
    total += seconds * (Number.isFinite(sets) && sets > 0 ? sets : 1);
  }
  return Math.round(total);
}
