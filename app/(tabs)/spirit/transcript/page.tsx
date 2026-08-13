"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The Transcript — every book, honestly. Computed purely from the
// reading log; "not yet" is a shelf, not a debt.

interface TranscriptData {
  books: {
    book: number;
    abbrev: string;
    chaptersRead: number;
    readThroughs: number;
    thisTerm: boolean;
  }[];
  booksTouched: number;
  booksRead: number;
  termsCompleted: { title: string; kick: string; startedAt: string | null }[];
}

export default function SpiritTranscriptPage() {
  const router = useRouter();
  const [data, setData] = useState<TranscriptData | null>(null);

  useEffect(() => {
    fetch("/api/spirit/transcript")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  // Ramp by honest read-throughs: not yet / once / twice / 3+, with
  // the active term's books in black.
  const cell = (rt: number, thisTerm: boolean) =>
    thisTerm
      ? { bg: "#232227", fg: "#FFFFFF" }
      : rt === 0
        ? { bg: "#EDEBEE", fg: "#96949B" }
        : rt === 1
          ? { bg: "#E6BFCF", fg: "#96949B" }
          : rt === 2
            ? { bg: "#C97D9C", fg: "#FFFFFF" }
            : { bg: "#A63D63", fg: "#FFFFFF" };

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
            EVERY BOOK · EVERY TERM · LIFETIME
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Transcript
          </div>
        </div>
        {data && (
          <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
            {data.booksRead} of 66
          </span>
        )}
      </div>

      {data && (
        <div className="mt-4 rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
          <div className="grid grid-cols-6 gap-[5px]">
            {data.books.map((b) => {
              const c = cell(b.readThroughs, b.thisTerm);
              return (
                <span
                  key={b.book}
                  className="flex h-[34px] items-center justify-center rounded-[7px]"
                  style={{ background: c.bg }}
                >
                  <span className="text-[9px] font-bold" style={{ color: c.fg }}>
                    {b.abbrev}
                  </span>
                </span>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-3">
            {(
              [
                ["#EDEBEE", "not yet"],
                ["#E6BFCF", "once"],
                ["#C97D9C", "twice"],
                ["#A63D63", "3+"],
                ["#232227", "this term"],
              ] as const
            ).map(([color, label]) => (
              <span key={label} className="inline-flex items-center gap-[5px] text-[10px] text-[#66646C]">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[10.5px] text-muted-foreground">
            “Not yet” is a shelf, not a debt — coverage is celebrated here, never owed.
          </p>
        </div>
      )}

      <div className="mt-3 rounded-[16px] bg-white py-1.5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="px-4 pb-1 pt-2.5 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          TERMS COMPLETED
        </p>
        {data?.termsCompleted.length ? (
          data.termsCompleted.map((t) => (
            <div key={t.title} className="flex items-center justify-between px-4 py-[9px]">
              <span className="text-[12.5px] text-[#454349]">{t.title}</span>
              <span className="text-[10.5px] text-muted-foreground">
                {t.startedAt ? new Date(t.startedAt).getFullYear() : ""} ✓
              </span>
            </div>
          ))
        ) : (
          <p className="px-4 pb-3 pt-1 text-[12px] text-muted-foreground">
            The first term is in progress — its summary files here when it completes.
          </p>
        )}
      </div>

      <p className="mt-3.5 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
        Read on paper? One tap on the day's reading counts it —
        <br />
        the record accepts the physical Bible, or it lies.
      </p>
    </div>
  );
}
