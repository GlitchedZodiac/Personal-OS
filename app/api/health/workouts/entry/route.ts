import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebuildPersonalRecords } from "@/lib/prs";
import { invalidateMovementHistories } from "@/lib/strength-history-db";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import { normalizeExerciseName } from "@/lib/exercises";
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
      }[];
      packKg?: unknown;
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

    const hasExerciseEdit =
      (Array.isArray(body.exercises) && body.exercises.length > 0) ||
      (Array.isArray(body.assignments) && body.assignments.length > 0) ||
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
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);
      if (attached.length === 0) {
        return NextResponse.json({ error: "No usable movements" }, { status: 400 });
      }
      edit = { ok: true, exercises: attached, changed: [`attached×${attached.length}`] };
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

    const updated = await prisma.workoutLog.update({
      where: { id },
      data: { exercises: edit.exercises, ...(packPatch ?? {}) },
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
