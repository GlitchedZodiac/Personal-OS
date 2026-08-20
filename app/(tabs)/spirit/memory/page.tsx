"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackTo } from "@/lib/nav-stack";

// Memory — private reinforcement, by occasion, never scored. Cards
// enter from the Reader (⋯ → Memorize); the verse text is retrieved
// from the ESV cache at reveal time, spacing doubles on "got it".

interface MemCard {
  id: string;
  refStart: number;
  refEnd: number;
  refLabel: string;
  occasion: string;
  prompt: string;
  why?: string | null;
  due: boolean;
  timesGot: number;
}

interface MemData {
  cards: MemCard[];
  dueCount: number;
  occasions: { lab: string; n: number }[];
  week: { marks: number; questions: number };
}

export default function SpiritMemoryPage() {
  const router = useRouter();
  const goBack = useBackTo("/spirit");
  const [data, setData] = useState<MemData | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [verseText, setVerseText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/spirit/memory")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setIdx(0);
        setRevealed(false);
        setVerseText(null);
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const queue = data?.cards.filter((c) => c.due) ?? [];
  const card = queue[idx] ?? null;

  const reveal = async () => {
    if (!card) return;
    setRevealed(true);
    setVerseText("…");
    try {
      const res = await fetch(`/api/spirit/passage?q=${encodeURIComponent(card.refLabel)}`);
      const body = res.ok ? await res.json() : null;
      const verses = (body?.verses ?? []) as { text: string; lines?: string[] }[];
      setVerseText(
        verses.length
          ? verses.map((v) => (v.lines ? v.lines.join(" ") : v.text)).join(" ")
          : "Couldn't fetch the verse.",
      );
    } catch {
      setVerseText("Couldn't fetch the verse.");
    }
  };

  const review = async (result: "got" | "again") => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await fetch("/api/spirit/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, result }),
      });
      if (idx + 1 < queue.length) {
        setIdx(idx + 1);
        setRevealed(false);
        setVerseText(null);
      } else {
        load();
      }
    } finally {
      setBusy(false);
    }
  };

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
            PRIVATE REINFORCEMENT · BY OCCASION
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Memory
          </div>
        </div>
        {data && (
          <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
            {data.dueCount} due
          </span>
        )}
      </div>

      {/* review card */}
      <div className="mt-4 rounded-[20px] bg-[#232227] p-5">
        {card ? (
          <>
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
              REVIEW · {card.occasion.toUpperCase()}
            </p>
            <p
              className="mt-2.5 text-lg font-semibold leading-[1.45] text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {card.prompt}
            </p>
            {!revealed && (
              <>
                <button
                  onClick={reveal}
                  className="tap-scale mt-4 w-full rounded-[11px] bg-[#A63D63] py-3 text-[13px] font-semibold text-white hover:bg-[#8C2F51]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Reveal the verse
                </button>
                <p className="mt-2.5 text-center text-[10px] text-[#837F8B]">
                  say it aloud first — rehearsal for real conversations, not flashcards
                </p>
              </>
            )}
            {revealed && (
              <>
                <div className="mt-3.5 rounded-[13px] bg-[#2A272E] px-4 py-3.5">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[#DC74A0]">
                    {card.refLabel.toUpperCase()} · ESV
                  </p>
                  <p
                    className="mt-1.5 text-[15px] italic leading-[1.7] text-[#E9E6EC]"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    “{verseText}”
                  </p>
                  {card.why && (
                    <p className="mt-2 text-[11px] leading-[1.55] text-[#C4C0C9]">{card.why}</p>
                  )}
                </div>
                <div className="mt-3 flex gap-2.5">
                  <button
                    onClick={() => review("got")}
                    disabled={busy}
                    className="tap-scale flex-1 rounded-[10px] bg-[#3E7A54] py-[11px] text-[12.5px] font-semibold text-white disabled:opacity-60"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Got it — space it out
                  </button>
                  <button
                    onClick={() => review("again")}
                    disabled={busy}
                    className="tap-scale flex-1 rounded-[10px] border border-[#4A4550] py-[11px] text-[12.5px] font-semibold text-[#F2F1F2] disabled:opacity-60"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Show again this week
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#DCA8BE]">
              {data && data.cards.length > 0 ? "ALL CAUGHT UP" : "THE DECK"}
            </p>
            <p
              className="mt-2.5 text-lg font-semibold leading-[1.45] text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {data && data.cards.length > 0
                ? "Nothing due — the verses are resting where you filed them."
                : "The deck is empty."}
            </p>
            <p className="mt-2 text-[12px] leading-[1.6] text-[#C4C0C9]">
              {data && data.cards.length > 0
                ? "They return on their own schedule; nothing is owed."
                : "Keep a verse from the Reader — select it, then ⋯ → Memorize — and it files here by occasion."}
            </p>
            {(!data || data.cards.length === 0) && (
              <button
                onClick={() => router.push("/spirit/read")}
                className="mt-4 rounded-[11px] bg-[#A63D63] px-5 py-2.5 text-[12.5px] font-semibold text-white hover:bg-[#8C2F51]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Open the Reader
              </button>
            )}
          </>
        )}
      </div>

      {/* occasions */}
      <div className="mt-4">
        <p className="px-0.5 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
          BY OCCASION — NOT BY REFERENCE
        </p>
        {data && data.occasions.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {data.occasions.map((o) => (
              <div key={o.lab} className="rounded-[13px] bg-white px-3.5 py-3 shadow-[0_2px_8px_rgba(35,34,39,0.05)]">
                <p className="text-[13px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  {o.lab}
                </p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {o.n} verse{o.n === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11.5px] leading-[1.6] text-muted-foreground">
            Occasions appear as you file verses — Assurance, Anxiety, Grief, Witness…
            the shelf you reach for mid-conversation.
          </p>
        )}
      </div>

      {/* weekly review */}
      <div className="mt-3.5 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
            WEEKLY REVIEW · SUNDAY · 2 MIN
          </p>
          <span className="text-[10px] text-muted-foreground">no verdicts</span>
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.65] text-[#454349]">
          {data
            ? `This week: ${data.week.marks} mark${data.week.marks === 1 ? "" : "s"} made · ${data.week.questions} new question${data.week.questions === 1 ? "" : "s"} opened.`
            : "…"}{" "}
          Next Sunday it asks you to use a verse, not recite it.
        </p>
      </div>

      {/* end of term */}
      <div className="mt-2.5 flex items-center justify-between rounded-[14px] bg-white px-4 py-3 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <div>
          <p className="text-[13px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            End of term · the summary
          </p>
          <p className="mt-0.5 text-[11px] text-[#66646C]">
            What was covered, marked most, still open — files into the Transcript
          </p>
        </div>
        <span className="text-sm text-[#C9C7CD]">›</span>
      </div>
    </div>
  );
}
