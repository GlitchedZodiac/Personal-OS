"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The Term — syllabus, "why this term," the hard-sayings commitment,
// second reading, and the year at a glance. Visible, not editable.

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
  upcoming: { orderIndex: number; title: string }[];
  completed: { orderIndex: number; title: string }[];
}

export default function SpiritTermPage() {
  const router = useRouter();
  const [data, setData] = useState<TermData | null>(null);

  useEffect(() => {
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
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
  const currentWeek = data.day?.weekIndex ?? 1;

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
          wk {currentWeek} of {t.weeks}
        </span>
      </div>

      <div className="mt-4 rounded-[18px] bg-white p-[18px] shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          WHY THIS TERM, WHY NOW
        </p>
        <p className="mt-2 text-[13.5px] leading-[1.75] text-[#454349]">{t.rationale}</p>
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
          <span className="text-[10px] text-muted-foreground">visible · not editable</span>
        </div>
        {t.syllabus.map((row) => {
          const done = row.week < currentWeek;
          const now = row.week === currentWeek;
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
                <span className="text-[10px]" style={{ color: now ? "#8C2F51" : "#C9C7CD" }}>
                  {now ? "now" : `wk ${row.week}`}
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
          When a term is announced its 42 studies generate once, as a visible batch — never a
          nightly shimmer.
        </p>
      </div>
    </div>
  );
}
