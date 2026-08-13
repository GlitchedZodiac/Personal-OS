"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The Term — syllabus, "why this term," the hard-sayings commitment,
// the year at a glance, and THE VISIBLE BATCH: a term's studies are
// written once, right here, while he watches. Progression is
// completion-based — the ✓s are his, not the calendar's.

interface TermData {
  term: {
    orderIndex: number;
    title: string;
    kick: string;
    rationale: string;
    hardNote?: string | null;
    secondNote?: string | null;
    weeks: number;
    syllabus: { week: number; label: string; ref: string; hard?: boolean }[];
  } | null;
  day: { weekIndex: number } | null;
  progress: { done: number; total: number; target: number } | null;
  upcoming: { orderIndex: number; title: string }[];
  completed: { orderIndex: number; title: string }[];
}

interface GenStatus {
  weeks: { week: number; have: number; done: number; target: number }[];
  total: number;
  completed: number;
  term: { weeks: number; generatedAt: string | null } | null;
}

export default function SpiritTermPage() {
  const router = useRouter();
  const [data, setData] = useState<TermData | null>(null);
  const [gen, setGen] = useState<GenStatus | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeMsg, setWriteMsg] = useState("");
  const [writeCount, setWriteCount] = useState(0);
  const cancelRef = useRef(false);

  const load = useCallback(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
    fetch("/api/spirit/generate")
      .then((r) => (r.ok ? r.json() : null))
      .then(setGen)
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const target = (data?.term?.weeks ?? 7) * 6;
  const missing = gen ? gen.weeks.filter((w) => w.have < w.target) : [];
  const needsWriting = gen !== null && gen.total < target;

  const writeTerm = async () => {
    if (writing || !gen) return;
    setWriting(true);
    cancelRef.current = false;
    let written = gen.total;
    setWriteCount(written);
    try {
      for (const w of missing) {
        if (cancelRef.current) break;
        setWriteMsg(`Writing week ${w.week} — the lectern is busy…`);
        const res = await fetch("/api/spirit/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week: w.week }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setWriteMsg(`Week ${w.week} stumbled — tap Write again to retry it.`);
          break;
        }
        written = body.total ?? written + (body.created ?? 0);
        setWriteCount(written);
      }
      if (written >= target) setWriteMsg("Every study is written. The term is yours.");
    } finally {
      setWriting(false);
      load();
    }
  };

  if (!data?.term) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-[12.5px] text-muted-foreground">
        Loading the term…
      </div>
    );
  }

  const t = data.term;
  const currentWeek = data.day?.weekIndex ?? null;
  const weekInfo = (w: number) => gen?.weeks.find((x) => x.week === w);

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
            TERM {t.orderIndex} · {t.kick}
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t.title}
          </div>
        </div>
        <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
          {data.progress ? `${data.progress.done} of ${target}` : "…"}
        </span>
      </div>

      {/* THE VISIBLE BATCH — write the term's studies, watched, once */}
      {(needsWriting || writing) && (
        <div className="mt-4 rounded-[20px] bg-[#232227] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
              THE TERM'S STUDIES · ONE VISIBLE BATCH
            </p>
            <span className="text-[10.5px] tabular-nums text-[#C4C0C9]">
              {writing ? writeCount : gen?.total ?? 0} of {target}
            </span>
          </div>
          <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-[#3A3239]">
            <div
              className="h-full rounded-full bg-[#A63D63] transition-all duration-700"
              style={{ width: `${Math.round(((writing ? writeCount : gen?.total ?? 0) / target) * 100)}%` }}
            />
          </div>
          {writing ? (
            <p className="mt-3 text-[12px] leading-[1.6] text-[#C9C7CD]">{writeMsg}</p>
          ) : (
            <>
              <p className="mt-3 text-[12px] leading-[1.6] text-[#C9C7CD]">
                {gen?.total
                  ? `${target - (gen?.total ?? 0)} studies remain unwritten. `
                  : "The syllabus is set; the studies aren't written yet. "}
                One tap writes them all — week by week, right here, while you
                watch. A few minutes, a couple of dollars of AI, once per term.
                Never a nightly shimmer.
              </p>
              <button
                onClick={writeTerm}
                className="tap-scale mt-3.5 w-full rounded-[11px] bg-[#A63D63] py-3 text-[13px] font-semibold text-white hover:bg-[#8C2F51]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Write the term's studies
              </button>
            </>
          )}
          {writeMsg && !writing && (
            <p className="fade-up mt-2.5 text-[11px] text-[#DCA8BE]">{writeMsg}</p>
          )}
        </div>
      )}

      <div className="mt-4 rounded-[18px] bg-white p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          WHY THIS TERM, WHY NOW
        </p>
        <p className="mt-2 text-[13.5px] leading-[1.75] text-[#454349]">{t.rationale}</p>
        <p className="mt-2.5 text-[10.5px] text-muted-foreground">
          Self-paced — the order is announced, the pace is yours. One a day is
          the plan; two on an eager day is a double portion.
        </p>
      </div>

      {t.secondNote && (
        <div className="mt-3 rounded-[14px] bg-accent px-4 py-[13px]">
          <p className="text-[10px] font-bold tracking-[0.14em] text-[#8C2F51]">SECOND READING</p>
          <p className="mt-[5px] text-[12.5px] leading-[1.6] text-[#454349]">{t.secondNote}</p>
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

      <div className="mt-3 rounded-[18px] bg-white py-1.5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between px-4 pb-1.5 pt-2.5">
          <span className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
            THE SYLLABUS
          </span>
          <span className="text-[10px] text-muted-foreground">order set · pace yours</span>
        </div>
        {t.syllabus.map((row) => {
          const info = weekInfo(row.week);
          const done = Boolean(info && info.have > 0 && info.done >= info.have);
          const now = currentWeek === row.week && !done;
          const unwritten = !info || info.have === 0;
          return (
            <div
              key={row.week}
              className="flex items-center gap-2.5 px-4 py-[9px]"
              style={{ background: now ? "#F6E3EB" : "transparent" }}
            >
              <span className="w-5 text-[10.5px] font-bold" style={{ color: done ? "#5E9B72" : "#C9C7CD" }}>
                {done ? "✓" : now ? (
                  <svg width="9" height="9" viewBox="0 0 10 10">
                    <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
                  </svg>
                ) : "·"}
              </span>
              <span
                className="flex-1 text-[12.5px]"
                style={{
                  color: done ? "#96949B" : "#454349",
                  fontWeight: now ? 600 : 400,
                }}
              >
                {row.label} · {row.ref}
              </span>
              {row.hard ? (
                <span className="rounded-full border border-[#B4533F55] px-[7px] py-[2px] text-[8.5px] font-bold tracking-[0.08em] text-[#B4533F]">
                  HARD TEXT
                </span>
              ) : (
                <span className="text-[10px] tabular-nums" style={{ color: now ? "#8C2F51" : "#C9C7CD" }}>
                  {unwritten
                    ? "unwritten"
                    : info && info.done > 0 && !done
                      ? `${info.done}/${info.have}`
                      : now
                        ? "now"
                        : `wk ${row.week}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3.5">
        <p className="px-0.5 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          THE YEAR AT A GLANCE
        </p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {(data.completed ?? []).map((c) => (
            <div key={c.orderIndex} className="flex-none rounded-xl bg-white px-3.5 py-2.5 shadow-[0_2px_8px_rgba(35,34,39,0.05)]">
              <p className="text-[9.5px] font-bold text-[#5E9B72]">T{c.orderIndex} ✓</p>
              <p className="mt-0.5 text-xs font-semibold text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {c.title}
              </p>
            </div>
          ))}
          <div className="flex-none rounded-xl bg-[#232227] px-3.5 py-2.5">
            <p className="text-[9.5px] font-bold text-[#DCA8BE]">T{t.orderIndex} · NOW</p>
            <p className="mt-0.5 text-xs font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
              {t.title}
            </p>
          </div>
          {data.upcoming.map((u) => (
            <div key={u.orderIndex} className="flex-none rounded-xl bg-white px-3.5 py-2.5 shadow-[0_2px_8px_rgba(35,34,39,0.05)]">
              <p className="text-[9.5px] font-bold text-muted-foreground">T{u.orderIndex}</p>
              <p className="mt-0.5 text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {u.title}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
          Planned a year ahead · balanced rotation: narrative → epistle → doctrine → gospel →
          prophets
          <br />
          A term ends when you finish it — the next takes the lectern that moment.
        </p>
      </div>
    </div>
  );
}
