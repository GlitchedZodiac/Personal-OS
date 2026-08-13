"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Spirit settings — small screen, big trust. Translation, posture,
// ownership (the export), pause-the-term, and the honest state of
// term generation (no fake progress bars, ever).

const POSTURES = [
  { id: "westminster", lab: "Westminster" },
  { id: "1689", lab: "1689" },
  { id: "compare", lab: "Compare" },
];

export default function SpiritSettingsPage() {
  const router = useRouter();
  const [posture, setPosture] = useState("westminster");
  const [paused, setPaused] = useState(false);
  const [expState, setExpState] = useState<0 | 1 | 2>(0);
  const [nextTerm, setNextTerm] = useState<{ orderIndex: number; title: string } | null>(null);

  useEffect(() => {
    fetch("/api/spirit/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setPosture(d.posture);
          setPaused(d.termPaused);
        }
      })
      .catch(() => {});
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNextTerm(d?.upcoming?.[0] ?? null))
      .catch(() => {});
  }, []);

  const save = async (patch: { posture?: string; termPaused?: boolean }) => {
    const res = await fetch("/api/spirit/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) toast.error("Couldn't save.");
  };

  const doExport = async () => {
    if (expState === 1) return;
    setExpState(1);
    try {
      const res = await fetch("/api/spirit/export");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `spirit-export-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      setExpState(2);
      setTimeout(() => setExpState(0), 4000);
    } catch {
      toast.error("Export failed.");
      setExpState(0);
    }
  };

  return (
    <div className="push-in stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/spirit")}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            SMALL SCREEN, BIG TRUST
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Settings
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">TRANSLATION</p>
        <div className="mt-2 flex gap-1.5">
          <span
            className="rounded-full bg-[#A63D63] px-3.5 py-1.5 text-[11.5px] font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ESV — primary
          </span>
          <button
            onClick={() => toast("NBLA arrives when the license clears — the linked pane is already built.")}
            className="rounded-full border border-[#E4E2E6] bg-[#FAF9FA] px-3.5 py-1.5 text-[11.5px] font-semibold text-[#66646C]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            NBLA — linked pane
          </button>
        </div>
      </div>

      <div className="mt-2.5 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          POSTURE — HOW DOCTRINE IS TAUGHT
        </p>
        <div className="mt-2 flex gap-1.5">
          {POSTURES.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPosture(p.id);
                save({ posture: p.id });
              }}
              className="rounded-full border border-[#E4E2E6] px-3 py-1.5 text-[11.5px] font-semibold transition-colors"
              style={{
                fontFamily: "var(--font-display)",
                background: posture === p.id ? "#232227" : "#FFFFFF",
                color: posture === p.id ? "#FFFFFF" : "#66646C",
              }}
            >
              {p.lab}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-[1.6] text-muted-foreground">
          “Compare” renders Westminster and the 1689 each at full strength, with the real
          division named — never a mush of both.
        </p>
      </div>

      <div className="mt-2.5 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">OWNERSHIP</p>
        <button
          onClick={doExport}
          className="tap-scale mt-2.5 w-full rounded-[11px] py-3 text-[12.5px] font-semibold transition-colors"
          style={{
            fontFamily: "var(--font-display)",
            background: expState === 2 ? "#EAF3ED" : "#A63D63",
            color: expState === 2 ? "#3E7A54" : "#FFFFFF",
          }}
        >
          {expState === 0
            ? "Export everything — one markdown file"
            : expState === 1
              ? "Preparing the file…"
              : "✓ Exported — check your downloads"}
        </button>
        <p className="mt-2 text-[10.5px] text-muted-foreground">
          Notebook, highlights, questions, links, Ask threads, memory deck, reading log —
          one file, always works. Your words are yours.
        </p>
      </div>

      <div className="mt-2.5 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
            CURRICULUM · PAUSE THE TERM
          </p>
          <button
            onClick={() => {
              const next = !paused;
              setPaused(next);
              save({ termPaused: next });
            }}
            className="relative h-[26px] w-11 rounded-full transition-colors"
            style={{ background: paused ? "#A63D63" : "#E4E2E6" }}
            aria-label="Pause the term"
          >
            <span
              className="absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all"
              style={{ left: paused ? "20px" : "2px" }}
            />
          </button>
        </div>
        <p className="mt-2 text-[11.5px] leading-[1.6] text-[#66646C]">
          {paused
            ? "Paused — the term waits for you. Nothing accrues, nothing is owed; the syllabus stretches, it never shames."
            : "Life happens. Pausing freezes the day counter — the studies wait, and no day is ever marked missed."}
        </p>
      </div>

      <div className="mt-2.5 rounded-[16px] bg-[#232227] p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
            TERM GENERATION · ONE VISIBLE BATCH
          </p>
        </div>
        <p className="mt-2 text-[15px] font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          {nextTerm ? `Next: Term ${nextTerm.orderIndex} — ${nextTerm.title}` : "Next term"}
        </p>
        <p className="mt-2 text-[10.5px] leading-[1.6] text-[#837F8B]">
          When a term is announced its studies generate once, as a visible batch you can
          watch — never a nightly shimmer, never a typing indicator. The generation
          pipeline arrives with the next block; until then the current term's studies are
          seeded ahead.
        </p>
      </div>
    </div>
  );
}
