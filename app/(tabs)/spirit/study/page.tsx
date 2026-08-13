"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SpiritSourceSheet } from "@/components/spirit-source-sheet";

// Today's Study — port of the design's daily lecture screen: teaching,
// the world behind the text, the doctrine (with tappable citations),
// the practice, the closing question, the assignment, one more thing.

interface DayData {
  id: string;
  weekIndex: number;
  dayIndex: number;
  title: string;
  body: string;
  pullRef?: string | null;
  pullText?: string | null;
  contextBlock: string;
  doctrine: string;
  practice: string;
  question: string;
  oneMoreTitle?: string | null;
  oneMoreBody?: string | null;
  readingRef: string;
  readingLabel: string;
  estMinutes: number;
  citations?: { label: string; sourceKey: string }[] | null;
}

export default function SpiritStudyPage() {
  const router = useRouter();
  const [term, setTerm] = useState<{ orderIndex: number; title: string } | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [readingDone, setReadingDone] = useState(false);
  const [qSaved, setQSaved] = useState(false);
  const [paperBusy, setPaperBusy] = useState(false);
  const [sourceKey, setSourceKey] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.day) {
          setTerm(d.term);
          setDay(d.day);
          setReadingDone(d.readingDone);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const saveQuestion = async () => {
    if (!day || qSaved) return;
    // The closing question lands in his notebook as an open Question,
    // anchored to the reading's first chapter.
    const first = day.readingRef.split(/[-–,]/)[0].trim();
    const res = await fetch(`/api/spirit/passage?q=${encodeURIComponent(first)}`);
    const p = res.ok ? await res.json() : null;
    const refStart = p?.verses?.[0]?.refInt ?? 1001001;
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        refStart,
        kind: "question",
        body: day.question,
      }),
    });
    setQSaved(true);
  };

  const readPaper = async () => {
    if (!day || paperBusy) return;
    setPaperBusy(true);
    try {
      if (readingDone) {
        await fetch(`/api/spirit/read?dayId=${day.id}`, { method: "DELETE" });
        setReadingDone(false);
      } else {
        const first = day.readingRef.split(/[-–,]/)[0].trim();
        const res = await fetch(`/api/spirit/passage?q=${encodeURIComponent(first)}`);
        const p = res.ok ? await res.json() : null;
        const refStart = p?.verses?.[0]?.refInt ?? 1001001;
        const refEnd = p?.verses?.[p.verses.length - 1]?.refInt ?? refStart;
        await fetch("/api/spirit/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refStart,
            refEnd,
            label: day.readingLabel,
            medium: "paper",
            dayId: day.id,
          }),
        });
        setReadingDone(true);
      }
    } finally {
      setPaperBusy(false);
    }
  };

  if (!day || !term) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[12.5px] text-muted-foreground">
        Preparing today's study…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/spirit")}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            TERM {term.orderIndex} · {term.title.toUpperCase()} · WK {day.weekIndex} · DAY{" "}
            {day.dayIndex}
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Today's study
          </div>
        </div>
        <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
          ≈ {day.estMinutes} min
        </span>
      </div>

      {/* the teaching */}
      <div className="mt-4 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          TODAY'S TEACHING · WRITTEN BEFORE YOU WOKE
        </p>
        <h2
          className="mt-2.5 text-[22px] font-bold leading-[1.25] tracking-[-0.01em] text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {day.title}
        </h2>
        <p className="mt-2.5 text-[13.5px] leading-[1.7] text-[#454349]">{day.body}</p>

        {day.pullRef && day.pullText && (
          <button
            onClick={() => router.push(`/spirit/read?q=${encodeURIComponent(day.pullRef!.split(":")[0])}`)}
            className="mt-3 block w-full rounded-xl bg-accent p-3.5 text-left hover:bg-[#F0D3E0]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.14em] text-[#8C2F51]">
                {day.pullRef.toUpperCase()}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[9.5px] font-semibold text-[#8C2F51]">
                ESV
              </span>
            </div>
            <p className="mt-2 text-[13.5px] italic leading-[1.7] text-foreground">
              {day.pullText}
            </p>
            <p className="mt-2 text-[10.5px] font-semibold text-[#8C2F51]">
              open the reader →
            </p>
          </button>
        )}

        {/* the world behind the text — his lens, slate + edge bar */}
        <div
          className="mt-3.5 rounded-r-xl border-l-[3px] py-3 pl-3.5 pr-3"
          style={{ background: "#4E7C8A14", borderColor: "#4E7C8A" }}
        >
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#4E7C8A]">
            THE WORLD BEHIND THE TEXT
          </p>
          <p className="mt-[5px] text-[13px] leading-[1.65] text-[#454349]">
            {day.contextBlock}
          </p>
        </div>

        <div className="mt-3">
          <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
            THE DOCTRINE
          </p>
          <p className="mt-[5px] text-[13px] leading-[1.65] text-[#454349]">{day.doctrine}</p>
          {Array.isArray(day.citations) && day.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {day.citations.map((c) => (
                <button
                  key={c.sourceKey}
                  onClick={() => setSourceKey(c.sourceKey)}
                  className="inline-flex items-center rounded-full border border-[#E4E2E6] bg-[#FAF9FA] px-[11px] py-1 text-[10.5px] font-semibold text-[#8C2F51] hover:bg-accent"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {c.label} ›
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3">
          <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
            THE PRACTICE
          </p>
          <p className="mt-[5px] text-[13px] leading-[1.65] text-[#454349]">{day.practice}</p>
        </div>

        {/* closing question */}
        <div className="mt-3.5 rounded-xl border-[1.5px] border-dashed border-[#E9CFDC] px-3.5 py-3">
          <p className="text-[13.5px] font-semibold leading-[1.5] text-foreground">
            {day.question}
          </p>
          <button
            onClick={saveQuestion}
            className="mt-2.5 rounded-[9px] px-4 py-[9px] text-xs font-semibold transition-colors"
            style={{
              fontFamily: "var(--font-display)",
              background: qSaved ? "#EAF3ED" : "#A63D63",
              color: qSaved ? "#3E7A54" : "#FFFFFF",
            }}
          >
            {qSaved ? "✓ In your notebook — resurfaces at this passage" : "Save to open questions"}
          </button>
        </div>

        <p className="mt-3 text-[10px] leading-[1.5] text-muted-foreground">
          Every quotation retrieved from a stored source — never recalled, never invented.
          Generated once, kept forever.
        </p>
      </div>

      {/* the assignment */}
      <div className="mt-3 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            TODAY'S READING · THE ASSIGNMENT
          </p>
          <span className="flex items-center gap-[7px]">
            <span className="text-[11px] text-muted-foreground">≈ {day.estMinutes} min</span>
            <button
              onClick={() => router.push("/spirit/read?audio=1")}
              className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent text-[9px] text-[#8C2F51] hover:bg-[#F0D3E0]"
              aria-label="Listen to the reading"
            >
              ▶
            </button>
          </span>
        </div>
        <p
          className="mt-[7px] text-[17px] font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {day.readingLabel}
        </p>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-[#F2F1F2]">
            <div
              className="h-full rounded-full bg-[#A63D63] transition-all duration-700"
              style={{
                width: `${Math.min(100, Math.round((((day.weekIndex - 1) * 6 + day.dayIndex) / 42) * 100))}%`,
              }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-[#66646C]">
            week {day.weekIndex} · day {day.dayIndex}
          </span>
        </div>
        <div className="mt-3 flex gap-2.5">
          <button
            onClick={() => router.push("/spirit/read")}
            className="flex-[1.5] rounded-[10px] bg-[#A63D63] py-[11px] text-[13px] font-semibold text-white hover:bg-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Open reader
          </button>
          <button
            onClick={readPaper}
            disabled={paperBusy}
            className="flex-[1.4] rounded-[10px] border py-[11px] text-[12.5px] font-semibold transition-colors disabled:opacity-60"
            style={{
              fontFamily: "var(--font-display)",
              borderColor: readingDone ? "#BFDCC9" : "#E4E2E6",
              background: readingDone ? "#EAF3ED" : "#FFFFFF",
              color: readingDone ? "#3E7A54" : "#232227",
            }}
          >
            {readingDone ? "✓ Counted — on paper" : "Read on paper"}
          </button>
        </div>
        <p className="mt-2 text-[10.5px] text-muted-foreground">
          Read the paper RSB instead? One tap — the map stays honest.
        </p>
      </div>

      {/* one more thing */}
      {day.oneMoreTitle && (
        <div className="mt-3 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            ONE MORE THING
          </p>
          <p
            className="mt-[7px] text-[15px] font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {day.oneMoreTitle}
          </p>
          <p className="mt-[5px] text-[12.5px] leading-[1.65] text-[#454349]">{day.oneMoreBody}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            your serendipity — the curriculum stays sequenced · closes the day
          </p>
        </div>
      )}

      <SpiritSourceSheet sourceKey={sourceKey} onClose={() => setSourceKey(null)} />
    </div>
  );
}
