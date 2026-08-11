"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EXERCISE_CATALOG, type ExerciseDef } from "@/lib/exercises";
import { SEQUENCE_KINDS, type SequenceStep } from "@/lib/sequences";

// Routine builder — companion page to the design's Routines sheet
// ("+ Build new routine"). Routines built here serve both surfaces: this
// page's live sessions and the watch via /api/mobile/sequences.

interface Routine {
  id: string;
  name: string;
  kind: string;
  restSecondsDefault: number | null;
  durationMinutes: number | null;
  rounds: number | null;
  steps: SequenceStep[];
}

interface DraftStep {
  exerciseName: string;
  sets: string;
  reps: string;
  seconds: string;
  weightKg: string;
}

const KIND_LABELS: Record<string, string> = {
  straight: "Straight sets",
  emom: "EMOM",
  tabata: "Tabata",
  circuit: "Circuit",
};

const EMPTY_STEP: DraftStep = {
  exerciseName: "",
  sets: "5",
  reps: "10",
  seconds: "",
  weightKg: "",
};

export default function RoutinesPage() {
  const router = useRouter();
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("straight");
  const [duration, setDuration] = useState("");
  const [rounds, setRounds] = useState("");
  const [rest, setRest] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([{ ...EMPTY_STEP }]);
  const [saving, setSaving] = useState(false);
  // Full vocabulary for the picker — catalog plus AI-minted movements.
  const [exerciseList, setExerciseList] = useState<Pick<ExerciseDef, "id" | "name">[]>(
    EXERCISE_CATALOG
  );

  const load = useCallback(() => {
    fetch("/api/health/sequences")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRoutines(Array.isArray(rows) ? rows : []))
      .catch(() => setRoutines([]));
    fetch("/api/health/exercises")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (Array.isArray(body?.exercises) && body.exercises.length > 0) {
          setExerciseList(body.exercises);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const openEditor = (routine: Routine | "new") => {
    setEditing(routine);
    if (routine === "new") {
      setName("");
      setKind("straight");
      setDuration("");
      setRounds("");
      setRest("");
      setSteps([{ ...EMPTY_STEP }]);
    } else {
      setName(routine.name);
      setKind(routine.kind);
      setDuration(routine.durationMinutes ? String(routine.durationMinutes) : "");
      setRounds(routine.rounds ? String(routine.rounds) : "");
      setRest(routine.restSecondsDefault ? String(routine.restSecondsDefault) : "");
      setSteps(
        routine.steps.map((s) => ({
          exerciseName: s.exerciseName,
          sets: s.sets ? String(s.sets) : "",
          reps: s.reps ? String(s.reps) : "",
          seconds: s.seconds ? String(s.seconds) : "",
          weightKg: s.weightKg ? String(s.weightKg) : "",
        }))
      );
    }
  };

  const setStep = (i: number, patch: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        id: editing !== "new" && editing ? editing.id : undefined,
        name,
        kind,
        durationMinutes: duration || undefined,
        rounds: rounds || undefined,
        restSecondsDefault: rest || undefined,
        steps: steps
          .filter((s) => s.exerciseName.trim())
          .map((s) => ({
            exerciseName: s.exerciseName,
            sets: s.sets || undefined,
            reps: s.reps || undefined,
            seconds: s.seconds || undefined,
            weightKg: s.weightKg || undefined,
          })),
      };
      const res = await fetch("/api/health/sequences", {
        method: payload.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Couldn't save routine");
        return;
      }
      toast.success(`${name} saved — it's on the watch list too`);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const archive = async (routine: Routine) => {
    const res = await fetch("/api/health/sequences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: routine.id, archive: true }),
    });
    if (res.ok) {
      toast.success(`${routine.name} archived`);
      load();
    } else {
      toast.error("Couldn't archive");
    }
  };

  return (
    <div className="px-4 pb-32 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      <button
        onClick={() => router.push("/health/workouts")}
        className="text-xs font-semibold text-secondary-foreground"
      >
        ← Train
      </button>
      <p className="micro-label mt-3">Built for the wrist</p>
      <h1
        className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Routines
      </h1>

      {!editing && (
        <>
          <div className="mt-4 grid gap-px overflow-hidden rounded-[14px] border border-border bg-border">
            {(routines ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between bg-card px-3.5 py-[13px]"
              >
                <button className="text-left" onClick={() => openEditor(r)}>
                  <p className="text-[13.5px] font-semibold text-foreground">
                    {r.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {KIND_LABELS[r.kind] ?? r.kind} ·{" "}
                    {r.steps
                      .slice(0, 4)
                      .map((s) => s.exerciseName.toLowerCase())
                      .join(" · ")}
                  </p>
                </button>
                <button
                  onClick={() => archive(r)}
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Archive
                </button>
              </div>
            ))}
            <button
              onClick={() => openEditor("new")}
              className="border-t-[1.5px] border-dashed border-border bg-card px-3.5 py-[13px] text-center"
            >
              <span className="text-[13px] font-semibold text-[#8C2F51]">
                + Build new routine
              </span>
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Routines sync to your Apple Watch as native workouts — start them
            from the wrist, sets mirror back here.
          </p>
        </>
      )}

      {editing && (
        <div className="mt-4 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine name — KB Block A"
            className="w-full rounded-[12px] border border-border bg-card px-4 py-3 text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          />

          <div className="flex gap-1.5">
            {SEQUENCE_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={
                  kind === k
                    ? "rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-secondary-foreground"
                }
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          {/* EMOMs run on the clock ("20-minute EMOM"); circuits are
              round-counted and rest between rounds. */}
          <div className="flex gap-2.5">
            <label className="block flex-1">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                TOTAL MINUTES {kind === "emom" ? "(EMOM length)" : "(optional)"}
              </span>
              <input
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder={kind === "emom" ? "20" : "—"}
                className="mt-0.5 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-center text-sm tabular-nums outline-none"
              />
            </label>
            <label className="block flex-1">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                ROUNDS {kind === "circuit" ? "(circuit)" : "(optional)"}
              </span>
              <input
                inputMode="numeric"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                placeholder={kind === "circuit" ? "3" : "—"}
                className="mt-0.5 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-center text-sm tabular-nums outline-none"
              />
            </label>
            <label className="block flex-1">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                {kind === "circuit" ? "ROUND REST (SEC)" : "REST BETWEEN (SEC)"}
              </span>
              <input
                inputMode="numeric"
                value={rest}
                onChange={(e) => setRest(e.target.value)}
                placeholder={kind === "circuit" ? "60" : "—"}
                className="mt-0.5 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-center text-sm tabular-nums outline-none"
              />
            </label>
          </div>

          <div className="space-y-2.5">
            {steps.map((step, i) => (
              <div
                key={i}
                className="rounded-[16px] border border-border bg-card p-3.5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                    MOVEMENT {i + 1}
                  </p>
                  {steps.length > 1 && (
                    <button
                      onClick={() =>
                        setSteps((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="text-[11px] text-muted-foreground"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  list="exercise-catalog"
                  value={step.exerciseName}
                  onChange={(e) => setStep(i, { exerciseName: e.target.value })}
                  placeholder="Two-hand swing"
                  className="mt-2 w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm font-medium outline-none"
                />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {(
                    [
                      ["sets", "Sets"],
                      ["reps", "Reps"],
                      ["seconds", "Secs"],
                      ["weightKg", "Kg"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="block">
                      <span className="text-[9.5px] font-semibold tracking-wide text-muted-foreground">
                        {label.toUpperCase()}
                      </span>
                      <input
                        inputMode="decimal"
                        value={step[field]}
                        onChange={(e) => setStep(i, { [field]: e.target.value })}
                        className="mt-0.5 w-full rounded-[8px] border border-border bg-background px-2 py-1.5 text-center text-sm tabular-nums outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <datalist id="exercise-catalog">
            {exerciseList.map((e) => (
              <option key={e.id} value={e.name} />
            ))}
          </datalist>

          <button
            onClick={() => setSteps((prev) => [...prev, { ...EMPTY_STEP }])}
            className="w-full rounded-[14px] border-[1.5px] border-dashed border-border py-3 text-[13px] font-semibold text-[#8C2F51]"
          >
            + Add movement
          </button>

          <div className="flex gap-2.5">
            <button
              onClick={() => setEditing(null)}
              className="flex-1 rounded-[12px] border border-[#D9D7DC] bg-card py-3 text-[13.5px] font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {saving ? "Saving…" : "Save routine"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
