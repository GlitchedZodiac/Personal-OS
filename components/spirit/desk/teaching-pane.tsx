"use client";

// The guided study, at desk scale (04) — the 2026-08-20 state machine
// reused verbatim: read it cold → the teaching → behind the text → what it
// means → the question → the homework; Next always advances, the rail is
// tappable and labelled, the last step's button IS "Mark this study
// complete ✓". The desk adds: the Notebook beside the whole lesson,
// step 1's passage preview + "Open in the Bible pane →", step 5 opening
// the answer box on the study page, step 6's "Open the worksheet →".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDesk } from "./desk-state";
import { PaneHeader, Chip, DISPLAY, SERIF } from "./ui";
import { BackArrowIcon, CompassIcon } from "./desk-icons";
import type { RefSegment } from "@/lib/spirit-refs";

interface HomeworkData { kind: string; label: string; minutes: number; text: string }
interface DayData {
  id: string; weekIndex: number; dayIndex: number; title: string; aim?: string | null; body: string; pullRef?: string | null; pullText?: string | null;
  contextBlock: string; doctrine: string; practice: string; question: string; oneMoreTitle?: string | null; oneMoreBody?: string | null;
  readingRef: string; readingLabel: string; estMinutes: number; citations?: { label: string; sourceKey: string }[] | null; homework?: HomeworkData | null; writtenPrompt?: string | null;
}
interface Assignment { label: string; scope: string; segments: RefSegment[] }
interface CompletionResult { done: number; total: number; streak: number; completedToday: number; termDone: boolean; next: { id: string; weekIndex: number; dayIndex: number; title: string; estMinutes: number } | null }

type StepId = "read" | "teaching" | "context" | "meaning" | "question" | "homework";
const STEP_TITLES: Record<StepId, string> = { read: "Read the passage", teaching: "The teaching", context: "Behind the text", meaning: "What it means", question: "The question", homework: "The homework" };
const STEP_LABELS: Record<StepId, string> = { read: "READ", teaching: "TEACHING", context: "BEHIND", meaning: "MEANING", question: "QUESTION", homework: "HOMEWORK" };
const STEP_KICKERS: Record<StepId, string> = { read: "STEP ONE · READ IT COLD", teaching: "THE TEACHING · WRITTEN BEFORE YOU WOKE", context: "THE WORLD BEHIND THE TEXT", meaning: "THE DOCTRINE · THE PRACTICE", question: "CARRY THIS ONE", homework: "BEFORE YOU CLOSE IT" };

export function TeachingPane({ onKicker, onStep }: { onKicker?: () => void; onStep?: (step: number, total: number, stepId: StepId) => void }) {
  const router = useRouter();
  const { emit } = useDesk();
  const [term, setTerm] = useState<{ orderIndex: number; title: string; homeworkArc?: string | null } | null>(null);
  const [day, setDay] = useState<DayData | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [, setProgress] = useState<{ done: number; total: number; target: number } | null>(null);
  const [readingDone, setReadingDone] = useState(false);
  const [step, setStep] = useState(1);
  const [qSaved, setQSaved] = useState(false);
  const [paperBusy, setPaperBusy] = useState(false);
  const [celebration, setCelebration] = useState<CompletionResult | null>(null);
  const [completing, setCompleting] = useState(false);
  const [preview, setPreview] = useState<{ verseNum: number; text: string }[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/spirit/today").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.day) {
        setTerm(d.term);
        setDay(d.day);
        setAssignment(d.assignment ?? null);
        setReadingDone(d.readingDone);
        setProgress(d.progress ?? null);
      }
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!day) return;
    const stored = Number(localStorage.getItem(`spirit-step:${day.id}`));
    setStep(stored > 0 ? stored : 1);
    const q = assignment?.segments?.[0]?.chapterQuery;
    if (q) {
      fetch(`/api/spirit/passage?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : null)).then((p) => {
        const seg = assignment?.segments?.[0];
        const vs = ((p?.verses ?? []) as { verseNum: number; text: string; lines?: string[] }[]).filter((v) => !seg || (v.verseNum >= (seg.startVerse ?? 1) && (seg.endVerse === null || v.verseNum <= seg.endVerse)));
        setPreview(vs.slice(0, 6).map((v) => ({ verseNum: v.verseNum, text: v.lines ? v.lines.join(" ") : v.text })));
      }).catch(() => {});
    }
  }, [day, assignment]);

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

  const goToStep = useCallback((next: number) => {
    if (!day) return;
    const clamped = Math.min(Math.max(1, next), total);
    setStep(clamped);
    localStorage.setItem(`spirit-step:${day.id}`, String(clamped));
  }, [day, total]);

  useEffect(() => {
    if (!day || !current) return;
    onStep?.(index, total, current);
    emit({ type: "study-step", step: index });
    if (current === "question" && day.question) {
      emit({ type: "answer-box", question: day.question, dayId: day.id, refStart: assignment?.segments?.[0]?.refStart ?? 1001001 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current, day?.id]);

  const completeStudy = async () => {
    if (!day || completing) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/spirit/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayId: day.id }) });
      if (res.ok) {
        localStorage.removeItem(`spirit-step:${day.id}`);
        setCelebration(await res.json());
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
    load();
  };
  const saveQuestion = async () => {
    if (!day || qSaved) return;
    const refStart = assignment?.segments?.[0]?.refStart ?? 1001001;
    await fetch("/api/spirit/layer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "note", refStart, kind: "question", body: day.question }) });
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
        await fetch("/api/spirit/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dayId: day.id, medium: "paper" }) });
        setReadingDone(true);
      }
    } finally {
      setPaperBusy(false);
    }
  };
  const openInBible = () => {
    const q = assignment?.segments?.[0]?.chapterQuery ?? day?.readingRef;
    if (q) emit({ type: "open-main", q });
  };
  const pullToBible = () => {
    if (day?.pullRef) emit({ type: "open-main", q: day.pullRef.replace(/:\d.*$/, "") });
  };
  const pullToNotes = () => {
    if (!day?.pullRef) return;
    const m = day.pullRef.match(/^(.+?)\s+(\d+):(\d+)/);
    emit({ type: "send-to-notes", refStart: 0, refEnd: 0, label: day.pullRef, text: day.pullText ?? "", source: "teaching" });
    void m;
  };

  if (!day || !term) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FFFFFF" }}>
        <PaneHeader kicker="TEACHING" title="…" onKicker={onKicker} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "#96949B" }}>Preparing today&apos;s study…</div>
      </div>
    );
  }
  const nextLabel = isLast ? "Mark this study complete ✓" : `Next · ${STEP_TITLES[steps[index]]} →`;
  const card: React.CSSProperties = { background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 13, padding: "13px 15px" };
  const btnPrimary: React.CSSProperties = { background: "#A63D63", borderRadius: 10, padding: "10px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#FFFFFF", cursor: "pointer", border: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#FFFFFF", position: "relative" }}>
      <PaneHeader kicker="TEACHING" onKicker={onKicker} title={day.title} right={<Chip tone="tint">≈ {day.estMinutes} min</Chip>} />
      {/* the labelled rail */}
      {!celebration && (
        <div style={{ flex: "none", padding: "10px 14px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
            {steps.map((s, i) => {
              const n = i + 1;
              const done = n < index;
              const cur = n === index;
              return (
                <button key={s} type="button" onClick={() => goToStep(n)} style={{ flex: 1, cursor: "pointer", textAlign: "center", paddingBottom: 7, background: "none", border: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <span style={{ width: 15, height: 15, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 700, background: done ? "#A63D63" : cur ? "#232227" : "#E4E2E6", color: done || cur ? "#FFFFFF" : "#96949B", transition: "background .25s" }}>{done ? "✓" : n}</span>
                    <span style={{ fontSize: 8.5, letterSpacing: "0.06em", fontWeight: 700, color: cur ? "#232227" : done ? "#8C2F51" : "#A9A7AE" }}>{STEP_LABELS[s]}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, marginTop: 6, background: done || cur ? "#A63D63" : "#DFDDE2", transition: "background .25s" }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 16px 8px" }}>
        {celebration ? (
          <div style={{ animation: "fadeUp .35s ease both" }}>
            <div style={{ background: "#232227", borderRadius: 18, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 42, height: 42, flex: "none", borderRadius: "50%", background: "#3E7A54", color: "#FFFFFF", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: "#FFFFFF" }}>Study {celebration.done} of {celebration.total} — kept.</div>
                  <div style={{ fontSize: 11.5, color: "#C9C7CD", marginTop: 2 }}>{celebration.streak > 1 ? `${celebration.streak}-day streak · ` : ""}{celebration.completedToday >= 2 ? `a double portion today (${celebration.completedToday})` : "the next one is unlocked — no calendar owns it"}</div>
                </div>
              </div>
              {day.homework?.text && !celebration.termDone && (
                <div style={{ background: "#2A272E", borderRadius: 12, padding: "12px 14px", marginTop: 14 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#DCA8BE" }}>CARRY THIS INTO THE DAY</div>
                  <div style={{ fontSize: 12.5, color: "#F2F1F2", lineHeight: 1.6, marginTop: 4 }}>{day.homework.text}</div>
                </div>
              )}
              {celebration.termDone ? (
                <div style={{ background: "#2A272E", borderRadius: 12, padding: "12px 14px", marginTop: 14 }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#DCA8BE" }}>THE TERM IS COMPLETE</div>
                  <div style={{ fontSize: 13, color: "#F2F1F2", lineHeight: 1.6, marginTop: 4 }}>Every study of {term.title} is done. Its summary files into the Transcript, and the next term takes the lectern.</div>
                  <button type="button" onClick={() => router.push("/spirit/transcript")} style={{ ...btnPrimary, marginTop: 12, padding: "9px 14px", fontSize: 12 }}>Open the Transcript →</button>
                </div>
              ) : celebration.next ? (
                <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                  <button type="button" onClick={goNext} style={{ flex: 1.7, background: "#A63D63", borderRadius: 11, padding: "10px 13px", cursor: "pointer", border: 0, textAlign: "left" }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, color: "#F0D3E0" }}>EAGER? WK {celebration.next.weekIndex} · DAY {celebration.next.dayIndex} WAITS</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#FFFFFF", marginTop: 2 }}>{celebration.next.title} →</div>
                  </button>
                  <button type="button" onClick={() => router.push("/home")} style={{ flex: 1, border: "1px solid #4A4550", borderRadius: 11, fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#F2F1F2", cursor: "pointer", background: "transparent" }}>Done for today</button>
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: 10, color: "#A9A7AE", marginTop: 10, textAlign: "center" }}>the notebook page files itself — the answer (if any) becomes an open Question on {assignment?.segments?.[0]?.label ?? day.readingLabel}</div>
          </div>
        ) : (
          <div key={current} style={{ animation: "fadeUp .3s ease both" }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.15em", fontWeight: 700, color: current === "context" ? "#4E7C8A" : "#96949B" }}>{STEP_KICKERS[current]}</div>

            {current === "read" && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 7, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 700, color: "#232227", letterSpacing: "-0.01em" }}>{assignment?.label ?? day.readingLabel.split("·")[0].trim()}</span>
                  <span style={{ fontSize: 11, color: "#66646C" }}>{assignment?.scope ? `${assignment.scope} · ` : ""}{day.readingLabel.includes("·") ? day.readingLabel.split("·").slice(1).join("·").trim() : "today's assignment"}</span>
                </div>
                <div style={{ fontSize: 12, color: "#454349", lineHeight: 1.6, marginTop: 6 }}>Read it before the teaching — the writer had a question in mind, and this term is about hearing it before anyone explains it to you.</div>
                {assignment && assignment.segments.length > 1 && (
                  <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                    {assignment.segments.map((s, i) => (
                      <span key={s.label} style={{ fontSize: 10, fontWeight: 600, color: i === 0 ? "#8C2F51" : "#96949B", background: "#FAF9FA", border: "1px solid #E4E2E6", borderRadius: 99, padding: "3px 10px" }}>part {i + 1} · {s.label}</span>
                    ))}
                  </div>
                )}
                {preview && preview.length > 0 && (
                  <div style={{ ...card, marginTop: 10, maxHeight: 236, overflow: "hidden", WebkitMaskImage: "linear-gradient(#000 78%, transparent)", maskImage: "linear-gradient(#000 78%, transparent)" }}>
                    <div style={{ fontFamily: SERIF, fontSize: 14.5, color: "#232227", lineHeight: 1.7 }}>
                      {preview.map((v) => (
                        <span key={v.verseNum}><span style={{ fontFamily: DISPLAY, fontSize: 9.5, fontWeight: 700, color: "#A63D63", verticalAlign: "super", margin: "0 5px 0 9px" }}>{v.verseNum}</span>{v.text}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={openInBible} style={{ ...btnPrimary, flex: 1.4 }}>{readingDone ? "Open it again in the Bible pane →" : "Open in the Bible pane →"}</button>
                  <button type="button" onClick={readPaper} disabled={paperBusy} style={{ flex: 1.1, border: `1px solid ${readingDone ? "#BFDCC9" : "#E4E2E6"}`, background: readingDone ? "#EAF3ED" : "#FFFFFF", color: readingDone ? "#3E7A54" : "#232227", borderRadius: 10, padding: "10px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background .25s" }}>{readingDone ? "✓ Counted" : "Read on paper"}</button>
                </div>
                <div style={{ fontSize: 10, color: "#A9A7AE", marginTop: 7 }}>{readingDone ? "Counted in the lifetime map — tap again to undo." : "Reading the paper RSB instead? One tap and the map stays honest."}</div>
              </>
            )}

            {current === "teaching" && (
              <>
                <div style={{ fontFamily: DISPLAY, fontSize: 21, fontWeight: 700, color: "#232227", letterSpacing: "-0.01em", lineHeight: 1.25, marginTop: 7 }}>{day.title}</div>
                <div style={{ fontSize: 13, color: "#454349", lineHeight: 1.7, marginTop: 8, whiteSpace: "pre-wrap" }}>{day.body}</div>
                {day.pullRef && day.pullText && (
                  <button type="button" onClick={pullToBible} style={{ width: "100%", textAlign: "left", background: "#F6E3EB", borderRadius: 12, padding: "12px 14px", marginTop: 11, cursor: "pointer", border: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#8C2F51" }}>{day.pullRef.toUpperCase()}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#8C2F51", background: "#FFFFFF", borderRadius: 99, padding: "2px 8px" }}>ESV</span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 14, color: "#232227", lineHeight: 1.65, marginTop: 6 }}>“{day.pullText}”</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", marginTop: 6 }}>open in the Bible pane →</div>
                  </button>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
                  <span style={{ fontSize: 10, color: "#A9A7AE" }}>drag the pull-verse to the notebook → a reference card</span>
                  {day.pullRef && <button type="button" onClick={pullToNotes} style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer" }}>→ send it now</button>}
                </div>
              </>
            )}

            {current === "context" && (
              <>
                <div style={{ background: "#4E7C8A14", borderLeft: "3px solid #4E7C8A", borderRadius: "0 13px 13px 0", padding: "14px 16px", marginTop: 8 }}>
                  <div style={{ fontSize: 13.5, color: "#454349", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{day.contextBlock}</div>
                  <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 10 }}>History, custom, and setting — the room the writer was standing in.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 11, padding: "9px 12px" }}>
                  <CompassIcon />
                  <span style={{ fontSize: 11, color: "#66646C" }}>A map or timeline here becomes a <span style={{ fontWeight: 600 }}>sketch prompt</span> on the notebook page — research homework feeds it.</span>
                </div>
              </>
            )}

            {current === "meaning" && (
              <>
                {day.doctrine?.trim() && (
                  <div style={{ ...card, marginTop: 8 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>THE DOCTRINE</div>
                    <div style={{ fontSize: 13, color: "#454349", lineHeight: 1.7, marginTop: 5, whiteSpace: "pre-wrap" }}>{day.doctrine}</div>
                    {Array.isArray(day.citations) && day.citations.length > 0 && (
                      <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
                        {day.citations.map((c) => (
                          <button key={c.sourceKey} type="button" onClick={() => emit({ type: "open-source", key: c.sourceKey, label: c.label })} style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, color: "#8C2F51", background: "#FFFFFF", border: "1px solid #E4E2E6", borderRadius: 99, padding: "3.5px 11px", cursor: "pointer" }}>{c.label} ›</button>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 9.5, color: "#A9A7AE", marginTop: 8 }}>Every quotation retrieved from a stored source — never recalled, never invented.</div>
                  </div>
                )}
                {day.practice?.trim() && (
                  <div style={{ ...card, marginTop: 9 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>THE PRACTICE</div>
                    <div style={{ fontSize: 13, color: "#454349", lineHeight: 1.7, marginTop: 5, whiteSpace: "pre-wrap" }}>{day.practice}</div>
                  </div>
                )}
              </>
            )}

            {current === "question" && (
              <>
                <div style={{ background: "#232227", borderRadius: 16, padding: "17px 18px", marginTop: 8 }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.45 }}>{day.question}</div>
                  <div style={{ fontSize: 11.5, color: "#C9C7CD", lineHeight: 1.6, marginTop: 9 }}>No answer is required today. The desk has already opened an answer box on your study page — ink, typed or spoken — and saving files it as an open Question that resurfaces at this passage.</div>
                  <button type="button" onClick={saveQuestion} style={{ width: "100%", marginTop: 12, borderRadius: 10, padding: "11px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: 0, transition: "background .25s", background: qSaved ? "#2A3E31" : "#A63D63", color: qSaved ? "#8FCFA6" : "#FFFFFF" }}>{qSaved ? "✓ In your notebook" : "Save to open questions"}</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10 }}>
                  <BackArrowIcon />
                  <span style={{ fontSize: 10.5, color: "#96949B" }}>the answer box is live in the notebook — write there and this step watches</span>
                </div>
              </>
            )}

            {current === "homework" && (
              <>
                {day.homework?.text ? (
                  <div style={{ background: "#232227", borderRadius: 16, padding: "15px 17px", marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#DCA8BE" }}>THE HOMEWORK · {(day.homework.label ?? day.homework.kind).toUpperCase()}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "#C4C0C9", background: "#3A3239", borderRadius: 99, padding: "2.5px 9px" }}>≤ {day.homework.minutes} min</span>
                    </div>
                    <div style={{ fontSize: 14, color: "#F2F1F2", lineHeight: 1.65, marginTop: 8 }}>{day.homework.text} <span style={{ color: "#C4C0C9" }}>It opens as a worksheet{day.writtenPrompt ? " — with a written line to leave" : ""}.</span></div>
                    {term.homeworkArc && (
                      <div style={{ fontSize: 10, color: "#837F8B", lineHeight: 1.6, marginTop: 10, borderTop: "1px solid #3A3239", paddingTop: 9 }}><span style={{ fontWeight: 700, letterSpacing: "0.08em", color: "#DCA8BE" }}>THE ARC · </span>{term.homeworkArc}</div>
                    )}
                    <div style={{ fontSize: 10, color: "#837F8B", marginTop: 7 }}>it waits on your Spirit home until you tick it · the next study opens by naming it</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
                      <button type="button" onClick={() => emit({ type: "worksheet-open", dayId: day.id })} style={{ ...btnPrimary, flex: 1.4, fontSize: 12 }}>Open the worksheet →</button>
                      <button type="button" onClick={() => router.push("/home")} style={{ flex: 1, border: "1px solid #4A4550", borderRadius: 10, padding: "10px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#F2F1F2", cursor: "pointer", background: "transparent" }}>Tonight</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ ...card, marginTop: 8, fontSize: 13, color: "#454349" }}>No homework on this one — carry the question instead.</div>
                )}
                {day.oneMoreTitle && (
                  <div style={{ background: "#FFFFFF", border: "1px solid #EDEBEE", borderRadius: 13, padding: "12px 14px", marginTop: 9 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>ONE MORE THING</div>
                    <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: "#232227", marginTop: 5 }}>{day.oneMoreTitle}</div>
                    <div style={{ fontSize: 12, color: "#454349", lineHeight: 1.65, marginTop: 3 }}>{day.oneMoreBody}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {!celebration && (
        <div style={{ flex: "none", borderTop: "1px solid #EDEBEE", background: "rgba(250,249,250,0.9)", padding: "10px 14px", display: "flex", gap: 9, alignItems: "center" }}>
          {index > 1 && (
            <button type="button" onClick={() => goToStep(index - 1)} style={{ width: 44, border: "1px solid #DFDDE2", background: "#FFFFFF", borderRadius: 11, padding: "11px 0", textAlign: "center", fontSize: 14, color: "#454349", cursor: "pointer", lineHeight: 1 }}>‹</button>
          )}
          <button type="button" disabled={completing} onClick={() => (isLast ? completeStudy() : goToStep(index + 1))} style={{ flex: 1, borderRadius: 11, padding: "12px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#FFFFFF", cursor: "pointer", transition: "background .25s", background: isLast ? "#232227" : "#A63D63", border: 0, opacity: completing ? 0.6 : 1 }}>
            {completing ? "…" : nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
