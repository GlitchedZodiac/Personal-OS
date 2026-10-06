import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebuildPersonalRecords } from "@/lib/prs";
import { invalidateMovementHistories } from "@/lib/strength-history-db";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import { normalizeExerciseName } from "@/lib/exercises";
import { JUMP_ROPE_TYPE, readIntervals } from "@/lib/jump-rope";
import { stampExercisesEdited } from "@/lib/workout-resync";
import type { Prisma } from "@prisma/client";
import {
  applyEntryEdit,
  applyWeightAssignments,
  findEntryIndex,
  type WeightAssignment,
} from "@/lib/workout-edit";

export const maxDuration = 60;

// PATCH - Correct ONE exercise entry of a saved workout ("the windmills I
// just did were 8 kg, not 20"), bulk-set weights, or — the freestyle flow —
// ATTACH a whole movement list to a session recorded without structure (a
// follow-along video, an improvised EMOM). Deliberately narrow: touches only
// the exercises JSON — never startedAt/type/duration. PRs are rebuilt from
// history afterwards so corrected/attached numbers register honestly.
//
// Additions 2026-10-05, all still inside the same two columns:
//   - rows carry `load` (a worn vest) and `perSide` through an attach, so a
//     voice-logged vest survives being edited;
//   - any movement edit stamps metricsData.exercisesEditedAt, which is what
//     stops a late re-send from the watch overwriting it;
//   - `renormalize` re-reads row names against the vocabulary after a new
//     movement has been added (the "add as a new exercise" prompt);
//   - `reviewed` marks the voice log as checked, `ackLate` clears entries
//     that arrived after an edit once they have been dealt with;
//   - `jumps` records his own jump count on a jump rope session.

/** A worn vest, 1–40 kg; anything else is dropped rather than stored wrong. */
function readLoad(v: unknown): { type: "vest"; kg: number; assumed?: true } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const l = v as { type?: unknown; kg?: unknown; assumed?: unknown };
  if (l.type !== "vest" || typeof l.kg !== "number" || !Number.isFinite(l.kg)) return undefined;
  if (l.kg < 1 || l.kg > 40) return undefined;
  return { type: "vest", kg: Math.round(l.kg * 10) / 10, ...(l.assumed === true ? { assumed: true } : {}) };
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      match?: { name?: unknown; index?: unknown };
      set?: object;
      assignments?: WeightAssignment[];
      exercises?: {
        name?: unknown;
        sets?: unknown;
        reps?: unknown;
        seconds?: unknown;
        weightKg?: unknown;
        load?: unknown;
        perSide?: unknown;
      }[];
      packKg?: unknown;
      renormalize?: unknown;
      reviewed?: unknown;
      ackLate?: unknown;
      jumps?: { total?: unknown; perRound?: unknown } | null;
    };
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const workout = await prisma.workoutLog.findUnique({ where: { id } });
    if (!workout) {
      return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    }

    // Carried load (2026-08-29): pack weight for hikes. null clears; 0–60 kg
    // sane band. Editable alone or alongside a movement edit.
    let packPatch: { packKg: number | null } | undefined;
    if ("packKg" in body) {
      if (body.packKg === null) packPatch = { packKg: null };
      else if (
        typeof body.packKg === "number" &&
        Number.isFinite(body.packKg) &&
        body.packKg >= 0 &&
        body.packKg <= 60
      ) {
        packPatch = { packKg: body.packKg };
      } else {
        return NextResponse.json({ error: "packKg must be 0–60 or null" }, { status: 400 });
      }
    }

    // His own jump count (jump rope only). A count is the one thing the
    // sensors cannot be trusted with yet, so it is typed, never inferred.
    if ("jumps" in body) {
      const intervals = readIntervals(workout.metricsData);
      if (workout.workoutType !== JUMP_ROPE_TYPE || !intervals) {
        return NextResponse.json({ error: "Not a jump rope session" }, { status: 400 });
      }
      const metrics = (workout.metricsData ?? {}) as Record<string, unknown>;
      const stored = { ...(metrics.intervals as Record<string, unknown>) };
      if (body.jumps === null) {
        delete stored.jumps;
      } else {
        const total =
          typeof body.jumps?.total === "number" && Number.isFinite(body.jumps.total)
            ? Math.round(body.jumps.total)
            : null;
        const perRound = Array.isArray(body.jumps?.perRound)
          ? body.jumps.perRound
              .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
              .map((n) => Math.round(n))
          : [];
        const sum = perRound.reduce((a, b) => a + b, 0);
        const value = total ?? (perRound.length ? sum : null);
        if (value == null || value < 1 || value > 50_000) {
          return NextResponse.json({ error: "Jumps must be 1–50000" }, { status: 400 });
        }
        stored.jumps = {
          source: "manual",
          total: value,
          ...(perRound.length ? { perRound } : {}),
        };
      }
      const updated = await prisma.workoutLog.update({
        where: { id },
        data: { metricsData: { ...metrics, intervals: stored } as Prisma.InputJsonValue },
      });
      let prRebuild: Awaited<ReturnType<typeof rebuildPersonalRecords>> | null = null;
      try {
        prRebuild = await rebuildPersonalRecords();
      } catch (error) {
        console.warn("PR rebuild after jump count failed:", (error as Error)?.message);
      }
      return NextResponse.json({ workout: updated, changed: ["jumps"], prRebuild });
    }

    // "Looks right" on the voice log — nothing about the movements changes.
    if (body.reviewed === true && !Array.isArray(body.exercises) && body.renormalize !== true) {
      const metrics = (workout.metricsData ?? {}) as Record<string, unknown>;
      const updated = await prisma.workoutLog.update({
        where: { id },
        data: {
          metricsData: {
            ...metrics,
            setLogReviewedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return NextResponse.json({ workout: updated, changed: ["reviewed"], prRebuild: null });
    }

    const hasExerciseEdit =
      (Array.isArray(body.exercises) && body.exercises.length > 0) ||
      (Array.isArray(body.assignments) && body.assignments.length > 0) ||
      body.renormalize === true ||
      body.match != null;
    if (!hasExerciseEdit && packPatch) {
      const updated = await prisma.workoutLog.update({ where: { id }, data: packPatch });
      return NextResponse.json({ workout: updated, changed: ["packKg"], prRebuild: null });
    }

    await ensureUserExercisesLoaded();

    let edit:
      | { ok: true; exercises: object[]; changed: string[] }
      | { ok: false; error: string };
    let editedIndex = -1;
    if (Array.isArray(body.exercises) && body.exercises.length > 0) {
      // Attach mode — the described structure replaces the (empty or
      // rough) movement list, names normalized against the catalog.
      const num = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
      // Weight alone may be 0 — bodyweight movements ("0 kg" is a value,
      // not an omission; dropping it was the 2026-08-29 zero-drop bug).
      const numOrZero = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
      const attached = body.exercises
        .map((e) => {
          const raw = String(e.name ?? "").trim();
          if (!raw) return null;
          const def = normalizeExerciseName(raw);
          return {
            name: def?.name ?? raw,
            ...(def ? { exercise: def.id } : {}),
            ...(num(e.sets) !== undefined ? { sets: num(e.sets) } : {}),
            ...(num(e.reps) !== undefined ? { reps: num(e.reps) } : {}),
            ...(num(e.seconds) !== undefined ? { seconds: num(e.seconds) } : {}),
            ...(numOrZero(e.weightKg) !== undefined ? { weightKg: numOrZero(e.weightKg) } : {}),
            ...(readLoad(e.load) ? { load: readLoad(e.load) } : {}),
            ...(e.perSide === true ? { perSide: true } : {}),
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
      if (attached.length === 0) {
        return NextResponse.json({ error: "No usable movements" }, { status: 400 });
      }
      edit = { ok: true, exercises: attached, changed: [`attached×${attached.length}`] };
    } else if (body.renormalize === true) {
      // A movement was just added to the vocabulary: give every row that
      // now resolves its canonical name and id. Rows that already carry an
      // id are left alone.
      const rows = Array.isArray(workout.exercises)
        ? (workout.exercises as Record<string, unknown>[])
        : [];
      let touched = 0;
      const renamed = rows.map((row) => {
        if (!row || typeof row !== "object" || typeof row.name !== "string") return row;
        if (typeof row.exercise === "string") return row;
        const def = normalizeExerciseName(row.name);
        if (!def) return row;
        touched++;
        return { ...row, name: def.name, exercise: def.id };
      });
      edit = { ok: true, exercises: renamed as object[], changed: [`renormalized×${touched}`] };
    } else if (Array.isArray(body.assignments) && body.assignments.length > 0) {
      const bulk = applyWeightAssignments(workout.exercises, body.assignments);
      edit = bulk.ok
        ? { ok: true, exercises: bulk.exercises, changed: [`weightKg×${bulk.touched}`] }
        : bulk;
    } else {
      editedIndex = findEntryIndex(workout.exercises, body.match ?? {});
      if (editedIndex < 0) {
        return NextResponse.json(
          { error: "No matching exercise entry in that workout" },
          { status: 404 }
        );
      }
      edit = applyEntryEdit(workout.exercises, editedIndex, body.set ?? {});
    }
    if (!edit.ok) {
      return NextResponse.json({ error: edit.error }, { status: 400 });
    }

    // The stamp is what tells the sync route this list is no longer the
    // watch's to overwrite (lib/workout-resync.ts).
    const stamped = stampExercisesEdited(workout.metricsData) as Record<string, unknown>;
    if (body.reviewed === true) stamped.setLogReviewedAt = new Date().toISOString();
    if (Array.isArray(body.ackLate) && Array.isArray(stamped.lateEntryIds)) {
      const acked = new Set(body.ackLate.filter((x): x is string => typeof x === "string"));
      const left = (stamped.lateEntryIds as unknown[]).filter(
        (x) => typeof x === "string" && !acked.has(x)
      );
      if (left.length) stamped.lateEntryIds = left;
      else delete stamped.lateEntryIds;
    }
    const updated = await prisma.workoutLog.update({
      where: { id },
      data: {
        exercises: edit.exercises as Prisma.InputJsonValue,
        metricsData: stamped as Prisma.InputJsonValue,
        ...(packPatch ?? {}),
      },
    });
    invalidateMovementHistories();

    // Rebuild rather than re-detect: detection only ever raises records, but
    // a correction can need to LOWER one.
    let prRebuild: Awaited<ReturnType<typeof rebuildPersonalRecords>> | null = null;
    try {
      prRebuild = await rebuildPersonalRecords();
    } catch (error) {
      console.warn("PR rebuild after entry edit failed:", (error as Error)?.message);
    }

    return NextResponse.json({
      workout: updated,
      editedIndex,
      changed: edit.changed,
      prRebuild,
    });
  } catch (error) {
    console.error("Workout entry edit error:", error);
    return NextResponse.json({ error: "Failed to edit entry" }, { status: 500 });
  }
}
