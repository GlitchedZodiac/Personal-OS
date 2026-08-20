"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SpiritSourceSheet } from "@/components/spirit-source-sheet";
import { useBackTo } from "@/lib/nav-stack";
import type { RefSegment } from "@/lib/spirit-refs";

// The study, as a journey.
//
// WHY IT CHANGED (2026-08-20, his feedback): this screen used to render
// every part of the lesson at once — teaching, homework, the reading
// assignment, one more thing — in an order that put the reading THIRD,
// below a teaching that assumes you have already read it. He couldn't
// tell what to do first, and the Complete button sat at the bottom of a
// long scroll he never reached: on 2026-08-19 he did the whole lesson
// (three highlights, a saved question, an Ask thread) and the term still
// read "Study 1 of 8, not started".
//
// Now it is one step at a time, in the order he described: read the
// passage → the teaching → the world behind it → what it means → the
// question → the homework, and the last step's button IS "mark
// complete". Nothing is gated — Next always advances — but the app now
// has an opinion about the order instead of leaving it to him.

interface HomeworkData {
  kind: string;
  label: string;
  minutes: number;
  text: string;
}

interface DayData {
  id: string;
  weekIndex: number;
  dayIndex: number;
  title: string;
  aim?: string | null;
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
  homework?: HomeworkData | null;
}

interface Assignment {
  label: string;
  scope: string;
  segments: RefSegment[];
}

interface CompletionResult {
  done: number;
  total: number;
  streak: number;
  completedToday: number;
  termDone: boolean;
  next: {
    id: string;
    weekIndex: number;
    dayIndex: number;
    title: string;
    estMinutes: number;
  } | null;
}

type StepId = "read" | "teaching" | "context" | "meaning" | "question" | "homework";

const STEP_TITLES: Record<StepId, string> = {
  read: "Read the passage",
  teaching: "The teaching",
  context: "Behind the text",
  meaning: "What it means",
  question: "The question",
  homework: "The homework",
};

const STEP_KICKERS: Record<StepId, string> = {
  read: "STEP ONE · READ IT COLD",
  teaching: "THE TEACHING · WRITTEN BEFORE YOU WOKE",
  context: "THE WORLD BEHIND THE TEXT",
  meaning: "THE DOCTRINE · THE PRACTICE",
  question: "CARRY THIS ONE",
  homework: "BEFORE YOU CLOSE IT",
};

export default function SpiritStudyPage() {
  const router = useRouter();
  const backOut = useBackTo("/spirit");
  const [term, setTerm] = useState<{
    orderIndex: number;
    title: string;
    homeworkArc?: string | null;
  } | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; target: number } | null>(
    null,
  );
  const [readingDone, setReadingDone] = useState(false);
  const [step, setStep] = useState(1);
  const [qSaved, setQSaved] = useState(false);
  const [paperBusy, setPaperBusy] = useState(false);
  const [sourceKey, setSourceKey] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CompletionResult | null>(null);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.day) {
          setTerm(d.term);
          setDay(d.day);
          setAssignment(d.assignment ?? null);
          setReadingDone(d.readingDone);
          setProgress(d.progress ?? null);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  // The step lives in the URL so the phone's back gesture walks the
  // lesson backwards, and in localStorage so closing the app mid-lesson
  // resumes where he stopped rather than at the top.
  useEffect(() => {
    if (!day) return;
    const fromUrl = Number(new URLSearchParams(window.location.search).get("step"));
    const stored = Number(localStorage.getItem(`spirit-step:${day.id}`));
    const next = Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : stored > 0 ? stored : 1;
    setStep(next);
  }, [day]);

  const steps = useMemo<StepId[]>(() => {
    if (!day) return [];
    const list: StepId[] = ["read", "teaching"];
    if (day.contextBlock?.trim()) list.push("context");
    if (day.doctrine?.trim() || day.practice?.trim()) list.push("meaning");
    if (day.question?.trim()) list.push("question");
    list.push("homework");
    return list;
  }, [day]);

  const total = steps.length;
  const index = Math.min(Math.max(1, step), Math.max(1, total));
  const current = steps[index - 1];
  const isLast = index >= total;

  const goToStep = useCallback(
    (next: number, mode: "push" | "replace" = "push") => {
      if (!day) return;
      const clamped = Math.min(Math.max(1, next), total);
      setStep(clamped);
      localStorage.setItem(`spirit-step:${day.id}`, String(clamped));
      const url = `/spirit/study?step=${clamped}`;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [day, total, router],
  );

  const back = () => {
    if (index > 1) goToStep(index - 1);
    else backOut();
  };

  const completeStudy = async () => {
    if (!day || completing) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/spirit/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: day.id }),
      });
      if (res.ok) {
        localStorage.removeItem(`spirit-step:${day.id}`);
        setCelebration(await res.json());
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setCompleting(false);
    }
  };

  const goNext = () => {
    setCelebration(null);
    setQSaved(false);
    setDay(null);
    setStep(1);
    router.replace("/spirit/study?step=1", { scroll: false });
    window.scrollTo({ top: 0 });
    load();
  };

  const saveQuestion = async () => {
    if (!day || qSaved) return;
    // The closing question lands in his notebook as an open Question,
    // anchored to the first verse of the assignment.
    const refStart = assignment?.segments?.[0]?.refStart ?? 1001001;
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", refStart, kind: "question", body: day.question }),
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
        // The server resolves the range from the day's own ref — the
        // client no longer does ref arithmetic.
        await fetch("/api/spirit/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayId: day.id, medium: "paper" }),
        });
        setReadingDone(true);
      }
    } finally {
      setPaperBusy(false);
    }
  };

  const openReader = () => {
    if (!day) return;
    const params = new URLSearchParams({
      day: day.id,
      from: `/spirit/study?step=${index}`,
    });
    router.push(`/spirit/read?${params.toString()}`);
  };

  if (!day || !term) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[12.5px] text-muted-foreground">
        Preparing today&apos;s study…
      </div>
    );
  }

  const nextLabel = isLast
    ? "Mark this study complete ✓"
    : `Next · ${STEP_TITLES[steps[index]]} →`;

  return (
    <>
      <div className="push-in min-h-screen bg-[#F2F1F2] px-[22px] pb-72 pt-12 lg:px-8">
      {/* header — position, aim, and a ‹ that walks the lesson back */}
      <div className="flex items-center gap-3">
        <button
          onClick={back}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label={index > 1 ? "Previous step" : "Back"}
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            TERM {term.orderIndex} · WK {day.weekIndex}
            {progress ? ` · STUDY ${progress.done + 1} OF ${progress.target}` : ""}
          </div>
          <div
            className="line-clamp-2 text-[21px] font-bold leading-[1.2] tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {day.title}
          </div>
        </div>
        <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
          ≈ {day.estMinutes} min
        </span>
      </div>

      {day.aim && !celebration && (
        <p className="mt-2.5 rounded-[12px] border-l-[3px] border-[#A63D63] bg-white px-3.5 py-2.5 text-[12.5px] leading-[1.6] text-[#454349]">
          <span className="font-bold tracking-[0.1em] text-[#8C2F51]">THE AIM · </span>
          {day.aim}
        </p>
      )}

      {/* the rail — where you are in the lesson, always */}
      {!celebration && (
        <div className="mt-3.5 flex items-center gap-2">
          <div className="flex flex-1 gap-[3px]">
            {steps.map((s, i) => (
              <button
                key={s}
                onClick={() => goToStep(i + 1)}
                aria-label={STEP_TITLES[s]}
                className="h-[5px] flex-1 overflow-hidden rounded-full transition-colors"
                style={{ background: i + 1 <= index ? "#A63D63" : "#DFDDE2" }}
              />
            ))}
          </div>
          <span className="flex-none text-[10.5px] font-semibold tabular-nums text-muted-foreground">
            {index} of {total}
          </span>
        </div>
      )}

      {!celebration && (
        <div className="fade-up mt-3.5" key={current}>
          <p className="text-[10.5px] font-bold tracking-[0.16em] text-muted-foreground">
            {STEP_KICKERS[current]}
          </p>

          {/* ── STEP: read the passage ─────────────────────────────── */}
          {current === "read" && (
            <div className="mt-2 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
              <h2
                className="text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {assignment?.label ?? day.readingLabel.split("·")[0].trim()}
              </h2>
              <p className="mt-1.5 text-[12.5px] text-[#66646C]">
                {assignment?.scope ? `${assignment.scope} · ` : ""}
                {day.readingLabel.includes("·")
                  ? day.readingLabel.split("·").slice(1).join("·").trim()
                  : "today's assignment"}
              </p>
              <p className="mt-3 text-[13px] leading-[1.65] text-[#454349]">
                Read it before the teaching — the writer had a question in mind
                and this term is about hearing it before anyone explains it to
                you. The reader opens on the chapter with these verses marked.
              </p>

              {assignment && assignment.segments.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {assignment.segments.map((s, i) => (
                    <span
                      key={s.label}
                      className="rounded-full border border-[#E4E2E6] bg-[#FAF9FA] px-[11px] py-1 text-[10.5px] font-semibold text-[#8C2F51]"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      part {i + 1} · {s.label}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2.5">
                <button
                  onClick={openReader}
                  className="tap-scale flex-[1.5] rounded-[10px] bg-[#A63D63] py-[11px] text-[13px] font-semibold text-white hover:bg-[#8C2F51]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {readingDone ? "Open it again" : "Open the reader →"}
                </button>
                <button
                  onClick={readPaper}
                  disabled={paperBusy}
                  className="flex-[1.2] rounded-[10px] border py-[11px] text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                  style={{
                    fontFamily: "var(--font-display)",
                    borderColor: readingDone ? "#BFDCC9" : "#E4E2E6",
                    background: readingDone ? "#EAF3ED" : "#FFFFFF",
                    color: readingDone ? "#3E7A54" : "#232227",
                  }}
                >
                  {readingDone ? "✓ Counted" : "Read on paper"}
                </button>
              </div>
              <p className="mt-2.5 text-[10.5px] leading-[1.5] text-muted-foreground">
                {readingDone
                  ? "Counted in the lifetime map — tap again to undo."
                  : "Reading the paper RSB instead? One tap and the map stays honest."}
              </p>
            </div>
          )}

          {/* ── STEP: the teaching ─────────────────────────────────── */}
          {current === "teaching" && (
            <div className="mt-2 rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
              <h2
                className="text-[22px] font-bold leading-[1.25] tracking-[-0.01em] text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {day.title}
              </h2>
              <p className="mt-2.5 text-[13.5px] leading-[1.7] text-[#454349]">{day.body}</p>

              {day.pullRef && day.pullText && (
                <button
                  onClick={openReader}
                  className="mt-3.5 block w-full rounded-xl bg-accent p-3.5 text-left hover:bg-[#F0D3E0]"
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
            </div>
          )}

          {/* ── STEP: the world behind the text ────────────────────── */}
          {current === "context" && (
            <div
              className="mt-2 rounded-[20px] border-l-[3px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]"
              style={{ borderColor: "#4E7C8A" }}
            >
              <p className="text-[13.5px] leading-[1.75] text-[#454349]">{day.contextBlock}</p>
              <p className="mt-3 text-[10.5px] leading-[1.5] text-muted-foreground">
                History, custom, and setting — the room the writer was standing in.
              </p>
            </div>
          )}

          {/* ── STEP: doctrine + practice ──────────────────────────── */}
          {current === "meaning" && (
            <div className="mt-2 space-y-3">
              {day.doctrine?.trim() && (
                <div className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
                    THE DOCTRINE
                  </p>
                  <p className="mt-[7px] text-[13.5px] leading-[1.7] text-[#454349]">
                    {day.doctrine}
                  </p>
                  {Array.isArray(day.citations) && day.citations.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
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
                  <p className="mt-3 text-[10px] leading-[1.5] text-muted-foreground">
                    Every quotation retrieved from a stored source — never recalled,
                    never invented.
                  </p>
                </div>
              )}
              {day.practice?.trim() && (
                <div className="rounded-[20px] bg-white p-5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
                  <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
                    THE PRACTICE
                  </p>
                  <p className="mt-[7px] text-[13.5px] leading-[1.7] text-[#454349]">
                    {day.practice}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: the closing question ─────────────────────────── */}
          {current === "question" && (
            <div className="mt-2 rounded-[20px] bg-[#232227] p-5">
              <p className="text-[19px] font-semibold leading-[1.45] text-white" style={{ fontFamily: "var(--font-display)" }}>
                {day.question}
              </p>
              <p className="mt-3 text-[12px] leading-[1.6] text-[#C9C7CD]">
                No answer is required today. Saving it files it in your notebook
                as an open question — it resurfaces the next time you are at this
                passage.
              </p>
              <button
                onClick={saveQuestion}
                className="tap-scale mt-3.5 w-full rounded-[10px] py-[11px] text-[13px] font-semibold transition-colors"
                style={{
                  fontFamily: "var(--font-display)",
                  background: qSaved ? "#2A3E31" : "#A63D63",
                  color: qSaved ? "#8FCFA6" : "#FFFFFF",
                }}
              >
                {qSaved ? "✓ In your notebook" : "Save to open questions"}
              </button>
            </div>
          )}

          {/* ── STEP: the homework ─────────────────────────────────── */}
          {current === "homework" && (
            <div className="mt-2 space-y-3">
              {day.homework?.text ? (
                <div className="rounded-[20px] bg-[#232227] p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
                      {(day.homework.label ?? day.homework.kind).toUpperCase()}
                    </p>
                    <span className="rounded-full bg-[#3A3239] px-[9px] py-[2.5px] text-[9.5px] font-semibold tabular-nums text-[#C4C0C9]">
                      ≤ {day.homework.minutes} min
                    </span>
                  </div>
                  <p className="mt-2.5 text-[15px] leading-[1.6] text-[#F2F1F2]">
                    {day.homework.text}
                  </p>
                  {term.homeworkArc && (
                    <p className="mt-3 border-t border-[#3A3239] pt-3 text-[10.5px] leading-[1.6] text-[#837F8B]">
                      <span className="font-bold tracking-[0.08em] text-[#DCA8BE]">THE ARC · </span>
                      {term.homeworkArc}
                    </p>
                  )}
                  <p className="mt-2.5 text-[10px] text-[#837F8B]">
                    it waits on your Spirit home until you tick it · the next study
                    opens by naming it
                  </p>
                </div>
              ) : (
                <div className="rounded-[20px] bg-white p-5 text-[13px] text-[#454349] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
                  No homework on this one — carry the question instead.
                </div>
              )}

              {day.oneMoreTitle && (
                <div className="rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
                  <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
                    ONE MORE THING
                  </p>
                  <p
                    className="mt-[7px] text-[15px] font-semibold text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {day.oneMoreTitle}
                  </p>
                  <p className="mt-[5px] text-[12.5px] leading-[1.65] text-[#454349]">
                    {day.oneMoreBody}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* completion — the lesson closes itself */}
      {celebration && (
        <div className="fade-up mt-4 rounded-[20px] bg-[#232227] p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#3E7A54] text-lg text-white">
              ✓
            </span>
            <div>
              <p
                className="text-[15px] font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Study {celebration.done} of {celebration.total} — kept.
              </p>
              <p className="mt-0.5 text-[11.5px] text-[#C9C7CD]">
                {celebration.streak > 1 ? `${celebration.streak}-day streak · ` : ""}
                {celebration.completedToday >= 2
                  ? `a double portion today (${celebration.completedToday})`
                  : "the next one is unlocked — no calendar owns it"}
              </p>
            </div>
          </div>
          {day.homework?.text && !celebration.termDone && (
            <div className="mt-4 rounded-[13px] bg-[#2A272E] px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#DCA8BE]">
                CARRY THIS INTO THE DAY
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.6] text-[#F2F1F2]">
                {day.homework.text}
              </p>
            </div>
          )}
          {celebration.termDone ? (
            <div className="mt-4 rounded-[13px] bg-[#2A272E] px-4 py-3.5">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#DCA8BE]">
                THE TERM IS COMPLETE
              </p>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#F2F1F2]">
                Every study of {term.title} is done. Its summary files into the
                Transcript, and the next term takes the lectern.
              </p>
              <button
                onClick={() => router.push("/spirit/transcript")}
                className="tap-scale mt-3 rounded-[10px] bg-[#A63D63] px-4 py-2.5 text-xs font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Open the Transcript →
              </button>
            </div>
          ) : celebration.next ? (
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={goNext}
                className="tap-scale flex-[1.7] rounded-[11px] bg-[#A63D63] px-3 py-3 text-left text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="block text-[10px] font-bold tracking-[0.1em] text-[#F0D3E0]">
                  EAGER? WK {celebration.next.weekIndex} · DAY {celebration.next.dayIndex} WAITS
                </span>
                <span className="mt-0.5 block text-[13px] font-semibold leading-snug">
                  {celebration.next.title} →
                </span>
              </button>
              <button
                onClick={() => router.push("/spirit")}
                className="tap-scale flex-1 rounded-[11px] border border-[#4A4550] py-3 text-[12.5px] font-semibold text-[#F2F1F2]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Done for today
              </button>
            </div>
          ) : null}
        </div>
      )}

      </div>

      {/* the one button — it always names what comes next */}
      {!celebration && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+12rem)] left-0 right-0 z-40 border-t border-[#E4E2E6] bg-[#F2F1F2]/95 px-[22px] pb-3 pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center gap-2.5 lg:max-w-2xl">
            {index > 1 && (
              <button
                onClick={back}
                className="tap-scale flex-none rounded-[12px] border border-[#DFDDE2] bg-white px-4 py-[13px] text-[13px] font-semibold text-[#454349]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ‹
              </button>
            )}
            <button
              onClick={() => (isLast ? completeStudy() : goToStep(index + 1))}
              disabled={completing}
              className="tap-scale flex-1 rounded-[12px] py-[14px] text-[14px] font-semibold text-white transition-colors disabled:opacity-60"
              style={{
                fontFamily: "var(--font-display)",
                background: isLast ? "#232227" : "#A63D63",
              }}
            >
              {completing ? "…" : nextLabel}
            </button>
          </div>
        </div>
      )}

      <SpiritSourceSheet sourceKey={sourceKey} onClose={() => setSourceKey(null)} />
    </>
  );
}
