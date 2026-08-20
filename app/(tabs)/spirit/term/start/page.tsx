"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackTo } from "@/lib/nav-stack";
import { unitDays } from "@/lib/bible-refs";

// The orientation — what a term IS before you start it.
//
// WHY (2026-08-20, his feedback): "it was really unclear whether I was
// supposed to analyse a verse or analyse a section or think about things
// a certain way… what the goal of that lesson was, or what that term is
// going to be like and what I should expect." A term used to begin by
// dropping him into study 1. Now it begins by saying what it is, what he
// walks away with, and how it works — then hands him study 1.
//
// Shown automatically before the first study of a term; always
// revisitable from the Term screen.

interface TermData {
  term: {
    orderIndex: number;
    title: string;
    kick: string;
    rationale: string;
    hardNote?: string | null;
    secondNote?: string | null;
    homeworkArc?: string | null;
    objectives?: string[] | null;
    weeks: number;
    syllabus: { week: number; label: string; ref: string; days?: number; hard?: boolean }[];
  } | null;
  day: { weekIndex: number; estMinutes: number } | null;
  progress: { done: number; total: number; target: number } | null;
}

export default function SpiritTermStartPage() {
  const router = useRouter();
  const goBack = useBackTo("/spirit");
  const [data, setData] = useState<TermData | null>(null);
  const [writingAims, setWritingAims] = useState(false);

  useEffect(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TermData | null) => {
        setData(d);
        // A term written before objectives existed gets them on first
        // view — one small call, once per term, then never again.
        if (d?.term && !(Array.isArray(d.term.objectives) && d.term.objectives.length)) {
          setWritingAims(true);
          fetch("/api/spirit/orientation", { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
              if (res?.objectives?.length) {
                setData((prev) =>
                  prev?.term ? { ...prev, term: { ...prev.term, objectives: res.objectives } } : prev,
                );
              }
            })
            .catch(() => {})
            .finally(() => setWritingAims(false));
        }
      })
      .catch(() => {});
  }, []);

  if (!data?.term) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[12.5px] text-muted-foreground">
        Loading the term…
      </div>
    );
  }

  const t = data.term;
  const done = data.progress?.done ?? 0;
  const target = data.progress?.target ?? t.weeks * 6;
  const started = done > 0;
  const objectives = Array.isArray(t.objectives) ? t.objectives : [];
  const units = Array.isArray(t.syllabus) ? t.syllabus : [];
  const est = data.day?.estMinutes ?? 13;

  return (
    <>
      <div className="push-in stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-72 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            TERM {t.orderIndex} · {t.kick.split("·")[0].trim().toUpperCase()}
          </div>
          <div
            className="text-[15px] font-semibold text-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The term ahead
          </div>
        </div>
      </div>

      <h1
        className="mt-4 text-[32px] font-bold leading-[1.12] tracking-[-0.02em] text-foreground"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {t.title}
      </h1>
      {t.kick.includes("·") && (
        <p className="mt-1.5 text-[13.5px] italic leading-[1.55] text-[#66646C]">
          {t.kick.split("·").slice(1).join("·").trim()}
        </p>
      )}

      {/* why this term */}
      <div className="mt-4 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          WHY THIS TERM, WHY NOW
        </p>
        <p className="mt-2 text-[13.5px] leading-[1.75] text-[#454349]">{t.rationale}</p>
      </div>

      {/* what he walks away with */}
      {objectives.length === 0 && writingAims && (
        <div className="mt-3 rounded-[20px] bg-[#232227] p-5">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
            WHAT YOU WALK AWAY WITH
          </p>
          <p className="mt-2.5 text-[13px] leading-[1.6] text-[#C9C7CD]">
            Reading the syllabus and writing them down — a moment…
          </p>
        </div>
      )}
      {objectives.length > 0 && (
        <div className="mt-3 rounded-[20px] bg-[#232227] p-5">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
            WHAT YOU WALK AWAY WITH
          </p>
          <ul className="mt-3 space-y-2.5">
            {objectives.map((o, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[7px] flex-none">
                  <svg width="8" height="8" viewBox="0 0 10 10">
                    <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
                  </svg>
                </span>
                <span className="text-[13.5px] leading-[1.6] text-[#F2F1F2]">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* how it works — the part he had to infer */}
      <div className="mt-3 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          HOW A STUDY GOES
        </p>
        <div className="mt-3 space-y-2.5">
          {[
            ["1", "Read the passage", "Cold, before anything explains it."],
            ["2", "The teaching", "Written ahead of time, not generated at you."],
            ["3", "Behind the text", "The history, custom, and setting."],
            ["4", "What it means", "The doctrine, then the practice."],
            ["5", "The question", "Carried, not answered. Save it and it keeps."],
            ["6", "The homework", "One thing, under 20 minutes, into your day."],
          ].map(([n, label, note]) => (
            <div key={n} className="flex gap-3">
              <span
                className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-accent text-[10.5px] font-bold text-[#8C2F51]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {n}
              </span>
              <span className="flex-1">
                <span className="text-[13px] font-semibold text-foreground">{label}</span>
                <span className="block text-[12px] leading-[1.5] text-[#66646C]">{note}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3.5 border-t border-[#EDEBEE] pt-3 text-[12px] leading-[1.65] text-[#66646C]">
          <span className="font-semibold text-foreground">{target} studies</span>, about{" "}
          {est} minutes each. Self-paced: finishing one unlocks the next, two on an
          eager day is a double portion, and nothing is ever owed or overdue.
        </p>
      </div>

      {/* the running assignment */}
      {t.homeworkArc && (
        <div className="mt-3 rounded-[16px] bg-accent px-4 py-[13px]">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#8C2F51]">
            THE TERM&apos;S RUNNING ASSIGNMENT
          </p>
          <p className="mt-[5px] text-[12.5px] leading-[1.6] text-[#454349]">{t.homeworkArc}</p>
        </div>
      )}

      {t.hardNote && (
        <div className="mt-3 rounded-[16px] bg-[#232227] px-[18px] py-4">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
            THE HARD-SAYINGS COMMITMENT
          </p>
          <p className="mt-[7px] text-[13px] leading-[1.7] text-[#F2F1F2]">{t.hardNote}</p>
        </div>
      )}

      {t.secondNote && (
        <div className="mt-3 rounded-[16px] bg-white px-4 py-[13px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#8C2F51]">SECOND READING</p>
          <p className="mt-[5px] text-[12.5px] leading-[1.6] text-[#454349]">{t.secondNote}</p>
        </div>
      )}

      {/* what's in it */}
      {units.length > 0 && (
        <div className="mt-3 rounded-[20px] bg-white py-1.5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
            <span className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
              WHAT&apos;S IN IT
            </span>
            <span className="text-[10px] text-muted-foreground">
              {units.length} units · order set, pace yours
            </span>
          </div>
          {units.map((row) => (
            <div key={row.week} className="flex items-baseline gap-2.5 px-4 py-[9px]">
              <span className="w-4 flex-none text-[10.5px] font-bold text-[#C9C7CD]">
                {row.week}
              </span>
              <span className="flex-1">
                <span className="block text-[12.5px] font-medium text-[#454349]">{row.label}</span>
                <span className="mt-[1px] block text-[11px] text-[#8C2F51]">{row.ref}</span>
              </span>
              {row.hard ? (
                <span className="flex-none rounded-full border border-[#B4533F55] px-[7px] py-[2px] text-[8.5px] font-bold tracking-[0.08em] text-[#B4533F]">
                  HARD TEXT
                </span>
              ) : (
                <span className="flex-none text-[10px] tabular-nums text-[#C9C7CD]">
                  {unitDays(row)}d
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 px-1 text-center text-[11px] leading-[1.6] text-muted-foreground">
        You can come back to this page any time from the Syllabus.
      </p>

      </div>

      {/* the one button */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+12rem)] left-0 right-0 z-40 border-t border-[#E4E2E6] bg-[#F2F1F2]/95 px-[22px] pb-3 pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg gap-2.5 lg:max-w-2xl">
          <button
            onClick={() => router.push("/spirit/study?step=1")}
            className="tap-scale flex-1 rounded-[12px] bg-[#A63D63] py-[14px] text-[14px] font-semibold text-white hover:bg-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {started ? `Continue — study ${done + 1} →` : "Begin study 1 →"}
          </button>
        </div>
      </div>
    </>
  );
}
