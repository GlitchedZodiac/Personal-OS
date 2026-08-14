"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Spirit home — round-2 port: gear → settings, this-week's-verse card
// → Memory, posture chip on the University card, real Notebook/Memory/
// Church destinations. Library remains the one designed-stub (its
// screen ships with the source-library block).

interface TodayData {
  term: {
    orderIndex: number;
    title: string;
    kick: string;
    weeks: number;
  } | null;
  day: {
    id: string;
    weekIndex: number;
    dayIndex: number;
    title: string;
    readingLabel: string;
    estMinutes: number;
  } | null;
  readingDone: boolean;
  progress: {
    done: number;
    total: number;
    target: number;
    generated: boolean;
    completedToday: number;
    doublePortions: number;
    termDone: boolean;
  } | null;
  stats: {
    notes: number;
    openQuestions: number;
    links: number;
    booksRead: number;
    memDue: number;
    streak: number;
  };
  weeklyVerse: { refLabel: string; occasion: string; refStart: number } | null;
  prefs: { posture: string; termPaused: boolean };
  series: {
    id: string;
    title: string;
    currentWeek: number;
    expectedWeeks: number | null;
    week: { title?: string } | null;
  } | null;
}

interface TranscriptData {
  books: { abbrev: string; readThroughs: number; thisTerm: boolean }[];
  booksRead: number;
}

const POSTURE_LABELS: Record<string, string> = {
  westminster: "Westminster",
  "1689": "1689",
  compare: "Compare",
};
const POSTURE_ORDER = ["westminster", "1689", "compare"];


export default function SpiritPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayData | null>(null);
  const [cov, setCov] = useState<TranscriptData | null>(null);
  const [verseSnip, setVerseSnip] = useState<string | null>(null);
  const [t2, setT2] = useState<{ position: number; total: number; done: boolean; next: { label: string } | null } | null>(null);
  const [posture, setPosture] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TodayData | null) => {
        setData(d);
        if (d?.prefs) setPosture(d.prefs.posture);
        if (d?.weeklyVerse) {
          fetch(`/api/spirit/passage?q=${encodeURIComponent(d.weeklyVerse.refLabel)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => {
              const v = p?.verses?.[0];
              if (v) {
                const text: string = v.lines ? v.lines.join(" ") : v.text;
                const words = text.split(/\s+/);
                setVerseSnip(words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : ""));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    fetch("/api/spirit/transcript")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCov)
      .catch(() => {});
    fetch("/api/spirit/track2")
      .then((r) => (r.ok ? r.json() : null))
      .then(setT2)
      .catch(() => {});
  }, []);

  const cyclePosture = () => {
    if (!posture) return;
    const next = POSTURE_ORDER[(POSTURE_ORDER.indexOf(posture) + 1) % POSTURE_ORDER.length];
    setPosture(next);
    fetch("/api/spirit/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posture: next }),
    }).catch(() => {});
  };

  const dateLabel = new Date()
    .toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
    .toUpperCase()
    .replace(",", " ·");

  const ramp = (rt: number, thisTerm: boolean) =>
    thisTerm ? "#232227" : rt === 0 ? "#EDEBEE" : rt === 1 ? "#E6BFCF" : rt === 2 ? "#C97D9C" : "#A63D63";

  const paused = data?.prefs.termPaused ?? false;

  return (
    <div className="stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            {dateLabel}
          </p>
          <h1
            className="mt-0.5 text-[30px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Spirit
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {data && data.stats.streak > 0 && (
            <span className="flex items-center gap-[5px] rounded-full bg-accent px-3 py-[5px] text-xs font-semibold text-[#8C2F51]">
              <svg width="9" height="9" viewBox="0 0 10 10">
                <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
              </svg>
              {data.stats.streak}-day streak
            </span>
          )}
          <button
            onClick={() => router.push("/spirit/settings")}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
            aria-label="Spirit settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#66646C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* this week's verse → Memory */}
      <button
        onClick={() => router.push("/spirit/memory")}
        className="tap-scale mt-4 flex w-full items-center gap-[11px] rounded-[14px] bg-accent px-3.5 py-3 text-left hover:bg-[#F0D3E0]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="flex-none">
          <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px] font-bold tracking-[0.14em] text-[#8C2F51]">
            {data?.weeklyVerse
              ? `THIS WEEK'S VERSE · ${data.weeklyVerse.occasion.toUpperCase()}`
              : "THE MEMORY DECK"}
          </span>
          <span className="mt-[3px] block truncate text-[12.5px] italic text-foreground">
            {data?.weeklyVerse
              ? `${verseSnip ? `“${verseSnip}”` : ""} — ${data.weeklyVerse.refLabel}`
              : "Keep a verse from the Reader — it files here by occasion."}
          </span>
        </span>
        <span className="flex-none text-[15px] text-[#8C2F51]">›</span>
      </button>

      {/* the University card — a position, never a date */}
      {data?.term && data.day && (
        <div className="mt-3 rounded-[20px] bg-[#232227] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
              THE UNIVERSITY · TERM {data.term.orderIndex} · WK {data.day.weekIndex} · STUDY{" "}
              {(data.progress?.done ?? 0) + 1}
            </p>
            {posture && (
              <button
                onClick={cyclePosture}
                className="tap-scale flex items-center gap-[5px] rounded-full bg-[#3A3239] px-2.5 py-1 text-[10px] font-semibold text-[#DCA8BE] hover:bg-[#4A3540]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {POSTURE_LABELS[posture]} ⇄
              </button>
            )}
          </div>
          <h2
            className="mt-[9px] text-[21px] font-bold leading-[1.3] tracking-[-0.01em] text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {data.day.title}
          </h2>
          <p className="mt-[5px] text-xs leading-[1.6] text-[#C9C7CD]">
            {paused
              ? "Paused — the term waits for you. Resume any time in Settings; nothing is owed."
              : data.progress && data.progress.completedToday > 0
                ? `One study kept today already — this one waits if you're eager, and waits just as happily if you're not.`
                : `Teaching & reading · ${data.day.readingLabel.split("·")[0].trim()} · ≈ ${data.day.estMinutes} min · written before you woke.`}
          </p>
          {data.progress && data.progress.total > 0 && (
            <div className="mt-3 flex items-center gap-2.5">
              <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-[#3A3239]">
                <div
                  className="h-full rounded-full bg-[#A63D63] transition-all duration-700"
                  style={{ width: `${Math.round((data.progress.done / Math.max(1, data.progress.target)) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums text-[#C4C0C9]">
                {data.progress.done} of {data.progress.target} · self-paced
              </span>
            </div>
          )}
          <div className="mt-3.5 flex gap-2.5">
            <button
              onClick={() => router.push("/spirit/study")}
              className="tap-scale flex-[1.6] rounded-[10px] bg-[#A63D63] py-[11px] text-[13px] font-semibold text-white hover:bg-[#8C2F51]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {data.progress && data.progress.completedToday > 0
                ? "One more — eager day"
                : data.progress && data.progress.done > 0
                  ? "Continue the term"
                  : "Begin the term"}
            </button>
            <button
              onClick={() => router.push("/spirit/term")}
              className="tap-scale flex-1 rounded-[10px] border border-[#4A4550] py-[11px] text-[12.5px] font-semibold text-[#F2F1F2] hover:bg-[#3A3239]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Syllabus
            </button>
          </div>
        </div>
      )}

      {/* term complete — the lectern changes hands */}
      {data?.term && !data.day && data.progress?.termDone && (
        <div className="mt-3 rounded-[20px] bg-[#232227] p-5">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
            THE UNIVERSITY · TERM {data.term.orderIndex} · COMPLETE
          </p>
          <h2 className="mt-[9px] text-[21px] font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {data.term.title} — finished.
          </h2>
          <p className="mt-[5px] text-xs leading-[1.6] text-[#C9C7CD]">
            Every study kept. The summary files into the Transcript; the next
            term takes the lectern when its studies are written.
          </p>
          <button
            onClick={() => router.push("/spirit/term")}
            className="tap-scale mt-3.5 rounded-[10px] bg-[#A63D63] px-5 py-[11px] text-[13px] font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Open the next term
          </button>
        </div>
      )}

      {/* quick grid — each destination exactly once */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => router.push("/spirit/bible")}
          className="tap-scale rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H19a1 1 0 0 1 1 1V17" />
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20v4.5H6.5A2.5 2.5 0 0 1 4 19.5Z" />
          </svg>
          <p className="mt-2 text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Open the Bible
          </p>
          <p className="mt-0.5 text-[11px] text-[#66646C]">all 66 books · your marks on them</p>
        </button>
        <button
          onClick={() => router.push("/spirit/notebook")}
          className="tap-scale rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <p className="mt-2 text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Notebook
          </p>
          <p className="mt-0.5 text-[11px] text-[#66646C]">
            {data ? `${data.stats.openQuestions} open · ${data.stats.notes} notes` : "…"}
          </p>
        </button>
        <button
          onClick={() => router.push("/spirit/library")}
          className="tap-scale rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h5v16H4zM10 4h5v16h-5zM17.5 4.5 21 19l-4 1-2.8-14Z" />
          </svg>
          <p className="mt-2 text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Library
          </p>
          <p className="mt-0.5 text-[11px] text-[#66646C]">every quote cited · Henry · the confessions</p>
        </button>
        <button
          onClick={() => router.push("/spirit/memory")}
          className="tap-scale rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a3.5 3.5 0 0 0-3.4 4.4A3.5 3.5 0 0 0 7 14a3.5 3.5 0 0 0 5 4.9A3.5 3.5 0 0 0 17 14a3.5 3.5 0 0 0-1.6-6.6A3.5 3.5 0 0 0 12 3Z" />
          </svg>
          <p className="mt-2 text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Memory
          </p>
          <p className="mt-0.5 text-[11px] text-[#66646C]">
            {data
              ? data.stats.memDue > 0
                ? `${data.stats.memDue} due · 2 minutes`
                : "by occasion · nothing due"
              : "…"}
          </p>
        </button>
      </div>

      {/* Sunday follow-along → Church series */}
      <button
        onClick={() => router.push("/spirit/church")}
        className="tap-scale mt-3 block w-full rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
      >
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            SUNDAY · SERMON FOLLOW-ALONG
          </p>
          <span className="rounded-full bg-accent px-[9px] py-[2.5px] text-[9.5px] font-semibold text-[#8C2F51]">
            {data?.series
              ? `series · wk ${data.series.currentWeek}${data.series.expectedWeeks ? ` of ≈${data.series.expectedWeeks}` : ""}`
              : "start it any way"}
          </span>
        </div>
        <p
          className="mt-[7px] text-base font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {data?.series
            ? data.series.week?.title ?? data.series.title
            : "Tell it what your church started"}
        </p>
        <p className="mt-1 text-xs leading-[1.55] text-[#66646C]">
          {data?.series
            ? "The passage, its context, and three questions to bring back — you arrive next Sunday primed. Runs beside the term, never instead of it."
            : "Speak it, photograph the slides, or paste a transcript — the week deepens what was preached. Runs beside the term, never instead of it."}
        </p>
      </button>

      {/* Track 2 — live */}
      <button
        onClick={() => router.push("/spirit/track2")}
        className="tap-scale mt-3 block w-full overflow-hidden rounded-[14px] bg-white text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
      >
        <div className="flex items-center justify-between px-4 py-[13px]">
          <span className="text-xs text-[#454349]">
            <span className="text-[10.5px] font-bold tracking-[0.1em] text-muted-foreground">
              TRACK 2
            </span>{" "}
            · {t2 ? (t2.done ? "every chapter, quietly" : `next: ${t2.next?.label}`) : "the whole Bible, quietly"}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t2 ? `${t2.position} of ${t2.total} ›` : "›"}
          </span>
        </div>
        {t2 && t2.position > 0 && (
          <div className="px-4 pb-3">
            <div className="h-[5px] overflow-hidden rounded-full bg-[#F2F1F2]">
              <div
                className="h-full rounded-full bg-[#C97D9C] transition-all duration-700"
                style={{ width: `${Math.max(0.5, (t2.position / t2.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </button>

      {/* Transcript mini-map */}
      {cov && (
        <button
          onClick={() => router.push("/spirit/transcript")}
          className="tap-scale mt-3 block w-full rounded-[16px] bg-white p-4 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)] hover:bg-[#FAF9FA]"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
              THE TRANSCRIPT · LIFETIME
            </p>
            <span className="text-[11px] font-semibold text-[#8C2F51]">
              {cov.booksRead} of 66 books
            </span>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(22,1fr)] gap-[3px]">
            {cov.books.map((b) => (
              <span
                key={b.abbrev}
                className="h-[11px] rounded-[2.5px]"
                style={{ background: ramp(b.readThroughs, b.thisTerm) }}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[10.5px] text-muted-foreground">
            darker = read more often · black = this term · open the map →
          </p>
        </button>
      )}

    </div>
  );
}
