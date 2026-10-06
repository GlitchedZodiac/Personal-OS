"use client";

// The phone half of wrist voice logging (2026-10-05): what he said during
// the workout, what Pitaya made of it, and anything it was not sure about.
// The movement list above this card is already built from these entries —
// this is where a wrong one gets caught. NO DESIGN SLICE EXISTS; built in
// the activity screen's own card language and flagged for a design pass.
//
// Three things can need him: an entry the parser flagged, a movement that is
// not in the vocabulary yet (offered as a new exercise — never dropped),
// and an entry whose audio reached the server only after he had already
// edited the list.

import { useState } from "react";
import { toast } from "sonner";
import type { SetLogEntry } from "@/lib/set-log";

const CATEGORIES = ["kettlebell", "bodyweight", "dumbbell", "barbell", "machine", "cardio", "other"];

type Row = {
  name: string;
  exercise: string | null;
  sets: number | null;
  reps: number | null;
  seconds: number | null;
  weightKg: number | null;
  load: { type: "vest"; kg: number; assumed?: boolean } | null;
  perSide: boolean;
};

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function entryLine(e: SetLogEntry) {
  const sets = e.sets && e.sets > 1 ? `${e.sets}×` : "×";
  const dose = e.reps
    ? `${sets}${e.reps}${e.perSide ? "/side" : ""}`
    : e.seconds
      ? e.sets && e.sets > 1
        ? `${e.sets}×${clock(e.seconds)}`
        : clock(e.seconds)
      : "";
  return [
    `${e.name}${dose ? ` ${dose}` : ""}`,
    e.weightKg ? `${e.weightKg} kg` : null,
    e.load ? `vest ${e.load.kg} kg${e.load.assumed ? " (assumed)" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const REASON: Record<string, string> = {
  new_exercise: "not in your exercises yet",
  low_match: "not sure which movement",
  no_quantity: "no reps or time heard",
  ambiguous_weight: "weight unclear",
  unparsed: "couldn't read it",
};

async function patchEntry(body: Record<string, unknown>) {
  const res = await fetch("/api/health/workouts/entry", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(String(b.error ?? "Couldn't save"));
  }
}

function Badge({ text, tone }: { text: string; tone: "check" | "new" | "wait" | "late" }) {
  const c = {
    check: ["#FBF1DC", "#9A6B12"],
    new: ["#F6E3EB", "#8C2F51"],
    wait: ["#F0EEF2", "#66646C"],
    late: ["#EAF3ED", "#3E7A54"],
  }[tone];
  return (
    <span
      className="rounded-full px-2 py-[3px] text-[9px] font-bold tracking-[0.1em]"
      style={{ background: c[0], color: c[1] }}
    >
      {text}
    </span>
  );
}

export function VoiceLogReview({
  id,
  entries,
  pending,
  exercises,
  lateEntryIds,
  reviewed,
  onSaved,
}: {
  id: string;
  entries: SetLogEntry[];
  pending: SetLogEntry[];
  exercises: Row[];
  lateEntryIds: string[];
  reviewed: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [category, setCategory] = useState<Record<string, string>>({});

  const voice = entries.filter((e) => e.source === "voice");
  if (voice.length === 0 && pending.length === 0) return null;

  const late = new Set(lateEntryIds);
  // A movement is "new" while its row in the list still has no id.
  const unknownNames = [
    ...new Set(exercises.filter((r) => r.name && !r.exercise).map((r) => r.name)),
  ];
  // An entry flagged only for being a new movement is counted once, by the
  // "add it" prompt below — not again here.
  const toCheck = reviewed
    ? 0
    : voice.filter(
        (e) =>
          e.status === "review" &&
          !(e.reason === "new_exercise" && unknownNames.includes(e.name))
      ).length;
  const open = toCheck + unknownNames.length + late.size + pending.length;

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await work();
      toast.success(done);
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const addExercise = (name: string) =>
    run(
      `new:${name}`,
      async () => {
        const res = await fetch("/api/health/exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category: category[name] ?? "bodyweight" }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(String(b.error ?? "Couldn't add it"));
        }
        // Give the row its new id — and every PR that now applies.
        await patchEntry({ id, renormalize: true });
      },
      `${name} added to your exercises`
    );

  const addLate = (e: SetLogEntry) =>
    run(
      `late:${e.id}`,
      () =>
        patchEntry({
          id,
          ackLate: [e.id],
          exercises: [
            ...exercises.map((r) => ({
              name: r.name,
              ...(r.sets ? { sets: r.sets } : {}),
              ...(r.reps ? { reps: r.reps } : {}),
              ...(r.seconds ? { seconds: r.seconds } : {}),
              ...(r.weightKg != null ? { weightKg: r.weightKg } : {}),
              ...(r.load ? { load: r.load } : {}),
              ...(r.perSide ? { perSide: true } : {}),
            })),
            {
              name: e.name,
              sets: e.sets ?? 1,
              ...(e.reps ? { reps: e.reps } : {}),
              ...(e.seconds ? { seconds: e.seconds } : {}),
              ...(e.weightKg != null ? { weightKg: e.weightKg } : {}),
              ...(e.load ? { load: e.load } : {}),
              ...(e.perSide ? { perSide: true } : {}),
            },
          ],
        }),
      "Added to the list"
    );

  return (
    <div className="mt-3 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          VOICE LOG · {voice.length} {voice.length === 1 ? "ENTRY" : "ENTRIES"}
        </div>
        <div
          className="text-[11px] font-semibold"
          style={{ color: open > 0 ? "#9A6B12" : "#3E7A54" }}
        >
          {open > 0 ? `${open} to check` : "all good"}
        </div>
      </div>

      <div className="mt-2.5 grid gap-2.5">
        {voice.map((e) => {
          const isLate = late.has(e.id);
          const isNew = !e.exercise && unknownNames.includes(e.name);
          return (
            <div key={e.id} className="flex items-start gap-2.5">
              <div className="w-10 flex-none pt-0.5 text-[11px] text-muted-foreground tabular-nums">
                {clock(e.t)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-foreground">{entryLine(e)}</div>
                {e.transcript && (
                  <div className="mt-0.5 text-[11px] leading-[1.4] text-muted-foreground">
                    &ldquo;{e.transcript}&rdquo;
                  </div>
                )}
                <div className="mt-0.5 text-[10px] text-[#B0AEB4] tabular-nums">
                  {e.gapSeconds == null
                    ? "first entry"
                    : e.gapSeconds > 0
                      ? `${clock(e.gapSeconds)} since the entry before`
                      : "same moment"}
                  {e.status === "review" && !reviewed && e.reason
                    ? ` · ${REASON[e.reason] ?? e.reason}`
                    : ""}
                </div>
                {isLate && (
                  <button
                    onClick={() => addLate(e)}
                    disabled={busy != null}
                    className="mt-1.5 rounded-[10px] bg-[#232227] px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
                  >
                    {busy === `late:${e.id}` ? "Adding…" : "Add to the list"}
                  </button>
                )}
              </div>
              <div className="flex-none pt-0.5">
                {isLate ? (
                  <Badge text="ARRIVED LATE" tone="late" />
                ) : isNew ? (
                  <Badge text="NEW" tone="new" />
                ) : e.status === "review" && !reviewed ? (
                  <Badge text="CHECK" tone="check" />
                ) : null}
              </div>
            </div>
          );
        })}
        {pending.map((e) => (
          <div key={e.id} className="flex items-start gap-2.5">
            <div className="w-10 flex-none pt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {clock(e.t)}
            </div>
            <div className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
              {e.status === "queued"
                ? "Recorded out of range — it will appear once the watch uploads it."
                : "Couldn't be understood. Nothing was added for it."}
            </div>
            <Badge text={e.status === "queued" ? "WAITING" : "NOT HEARD"} tone="wait" />
          </div>
        ))}
      </div>

      {unknownNames.map((name) => (
        <div key={name} className="mt-3 rounded-[12px] bg-[#F7F6F7] px-3 py-2.5">
          <div className="text-[12.5px] font-semibold text-foreground">
            &ldquo;{name}&rdquo; isn&rsquo;t in your exercises yet
          </div>
          <div className="mt-0.5 text-[10.5px] leading-[1.45] text-muted-foreground">
            It is saved on this workout as said. Add it and it will be recognised by name from now
            on, and count toward records.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={category[name] ?? "bodyweight"}
              onChange={(ev) => setCategory((c) => ({ ...c, [name]: ev.target.value }))}
              className="min-w-0 flex-1 rounded-[10px] border border-[#E3E1E5] bg-white px-2 py-2 text-[12.5px] capitalize"
              aria-label={`Category for ${name}`}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              onClick={() => addExercise(name)}
              disabled={busy != null}
              className="rounded-[10px] bg-[#232227] px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy === `new:${name}` ? "Adding…" : "Add exercise"}
            </button>
          </div>
        </div>
      ))}

      {toCheck > 0 && (
        <button
          onClick={() => run("ok", () => patchEntry({ id, reviewed: true }), "Marked as checked")}
          disabled={busy != null}
          className="mt-3 w-full rounded-[12px] border border-[#E3E1E5] bg-white py-2.5 text-[12.5px] font-semibold text-foreground hover:bg-[#FAFAFA] disabled:opacity-60"
        >
          {busy === "ok" ? "Saving…" : "These look right"}
        </button>
      )}
      <p className="mt-2 text-[10px] leading-[1.5] text-muted-foreground">
        To change an entry, use &ldquo;Edit movements &amp; weights&rdquo; above. Once you have edited
        the list, the watch can no longer overwrite it.
      </p>
    </div>
  );
}
