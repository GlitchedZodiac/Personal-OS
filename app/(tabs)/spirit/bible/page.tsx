"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackTo } from "@/lib/nav-stack";
import { SheetPortal } from "@/components/sheet-portal";

// The Bible — free reading, pick up anywhere. The whole shelf: 66
// books with HIS layer's density on them (marks per book, marked
// chapters dotted), a continue card for the last free-reading spot.
// (No design slice exists for this navigator yet — built inside the
// system, flagged for design round 3.)

interface BibleBook {
  book: number;
  name: string;
  chapters: number;
  marks: number;
  markedChapters: number[];
}

export default function SpiritBiblePage() {
  const router = useRouter();
  const goBack = useBackTo("/spirit");
  const [books, setBooks] = useState<BibleBook[] | null>(null);
  const [open, setOpen] = useState<BibleBook | null>(null);
  const [lastRead, setLastRead] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/spirit/bible")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBooks(d?.books ?? null))
      .catch(() => {});
    try {
      setLastRead(localStorage.getItem("spirit-last-free-read"));
    } catch {
      // no memory of a spot — the shelf still works
    }
  }, []);

  const openChapter = (book: BibleBook, chapter: number) => {
    router.push(
      `/spirit/read?q=${encodeURIComponent(`${book.name} ${chapter}`)}&free=1`,
    );
  };

  const ot = books?.slice(0, 39) ?? [];
  const nt = books?.slice(39) ?? [];

  const shelf = (label: string, list: BibleBook[]) => (
    <div className="mt-4">
      <p className="px-0.5 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 grid gap-px overflow-hidden rounded-[16px] border border-[#E4E2E6] bg-[#E4E2E6]">
        {list.map((b) => (
          <button
            key={b.book}
            onClick={() => setOpen(b)}
            className="tap-scale flex items-center gap-3 bg-white px-4 py-[11px] text-left hover:bg-[#FAF9FA]"
          >
            <span
              className="flex-1 text-[13.5px] font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {b.name}
            </span>
            {b.marks > 0 && (
              <span className="rounded-full bg-accent px-2 py-[2px] text-[10px] font-semibold text-[#8C2F51]">
                {b.marks} mark{b.marks === 1 ? "" : "s"}
              </span>
            )}
            <span className="text-[10.5px] tabular-nums text-muted-foreground">
              {b.chapters} ch
            </span>
            <span className="text-sm text-[#C9C7CD]">›</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="push-in stagger-children min-h-screen bg-[#F2F1F2] px-[22px] pb-52 pt-12 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#E4E2E6] bg-white hover:bg-[#FAF9FA]"
          aria-label="Back to Spirit"
        >
          <span className="-mt-0.5 text-lg leading-none text-[#232227]">‹</span>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
            FREE READING · PICK UP ANYWHERE
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            The Bible
          </div>
        </div>
      </div>

      {lastRead && (
        <button
          onClick={() =>
            router.push(`/spirit/read?q=${encodeURIComponent(lastRead)}&free=1`)
          }
          className="tap-scale mt-4 flex w-full items-center justify-between rounded-[16px] bg-[#232227] px-4 py-3.5 text-left"
        >
          <span>
            <span className="block text-[10px] font-bold tracking-[0.14em] text-[#DCA8BE]">
              CONTINUE WHERE YOU LEFT
            </span>
            <span
              className="mt-0.5 block text-[15px] font-semibold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {lastRead}
            </span>
          </span>
          <span className="text-lg text-[#DCA8BE]">›</span>
        </button>
      )}

      {!books && (
        <p className="mt-10 text-center text-[12.5px] text-muted-foreground">
          Pulling the shelf…
        </p>
      )}
      {books && shelf("OLD TESTAMENT · 39", ot)}
      {books && shelf("NEW TESTAMENT · 27", nt)}

      <p className="mt-4 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
        Your marks travel with the text — a book with highlights shows them
        <br />
        the moment you open it. Nothing here counts against anything.
      </p>

      {/* chapter picker */}
      {open && (
        <SheetPortal>
          <div className="fixed inset-0 z-[85] bg-[rgba(27,21,24,0.45)]" onClick={() => setOpen(null)} />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[86] max-h-[70vh] overflow-y-auto rounded-t-[28px] bg-white px-6 pb-10 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-[#E4E2E6]" />
            <div className="flex items-baseline justify-between">
              <p className="text-[19px] font-bold text-[#232227]" style={{ fontFamily: "var(--font-display)" }}>
                {open.name}
              </p>
              <span className="text-[11px] text-muted-foreground">
                {open.marks > 0 ? `${open.marks} marks · dotted chapters carry them` : `${open.chapters} chapters`}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {Array.from({ length: open.chapters }, (_, i) => i + 1).map((c) => {
                const marked = open.markedChapters.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => openChapter(open, c)}
                    className="tap-scale relative flex h-11 items-center justify-center rounded-[10px] border border-[#E4E2E6] bg-[#FAF9FA] text-[13px] font-semibold text-[#232227] hover:bg-accent"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {c}
                    {marked && (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#A63D63]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SheetPortal>
      )}
    </div>
  );
}
