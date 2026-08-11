import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rebuildPersonalRecords } from "@/lib/prs";
import { ensureUserExercisesLoaded } from "@/lib/user-exercises";
import { applyEntryEdit, findEntryIndex } from "@/lib/workout-edit";

export const maxDuration = 60;

// PATCH - Correct ONE exercise entry of a saved workout ("the windmills I
// just did were 8 kg, not 20"). Deliberately narrow: touches only the
// exercises JSON — never startedAt/type/duration (the general workouts PATCH
// rebuilds its whole mutation and would clobber those on a partial body).
// PRs are rebuilt from history afterwards so a corrected weight retracts any
// phantom record the wrong number created.
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: unknown;
      match?: { name?: unknown; index?: unknown };
      set?: object;
    };
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    const workout = await prisma.workoutLog.findUnique({ where: { id } });
    if (!workout) {
      return NextResponse.json({ error: "Workout not found" }, { status: 404 });
    }

    await ensureUserExercisesLoaded();
    const index = findEntryIndex(workout.exercises, body.match ?? {});
    if (index < 0) {
      return NextResponse.json(
        { error: "No matching exercise entry in that workout" },
        { status: 404 }
      );
    }

    const edit = applyEntryEdit(workout.exercises, index, body.set ?? {});
    if (!edit.ok) {
      return NextResponse.json({ error: edit.error }, { status: 400 });
    }

    const updated = await prisma.workoutLog.update({
      where: { id },
      data: { exercises: edit.exercises },
    });

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
      editedIndex: index,
      changed: edit.changed,
      prRebuild,
    });
  } catch (error) {
    console.error("Workout entry edit error:", error);
    return NextResponse.json({ error: "Failed to edit entry" }, { status: 500 });
  }
}
