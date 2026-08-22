"use client";

import { useEffect, useMemo, useState } from "react";
import { useBackTo } from "@/lib/nav-stack";
import { HIGHLIGHT_CATEGORIES, categoryColor } from "@/lib/spirit-ui";

// The Passage Notebook — his whole layer, grouped by passage. A view
// over notes, highlights and Ask threads; search is client-side, and
// open questions keep resurfacing until the passage answers them.

interface NbItem {
  id: string;
  type: "note" | "highlight" | "ask";
  kind: string;
  category?: string;
  refLabel: string;
  body: string;
  open?: boolean;
  createdAt: string;
}

interface NbData {
  total: number;
  noteCount: number;
  groups: { passage: string; items: NbItem[] }[];
  openQuestions: { id: string; q: string; refLabel: string; createdAt: string }[];
}

const KIND_CHIPS = ["All", "Observation", "Question", "Connection", "Conviction", "Doctrine"];

export default function SpiritNotebookPage() {
  const goBack = useBackTo("/spirit");
  const [data, setData] = useState<NbData | null>(null);
  const [view, setView] = useState<"all" | "oq">("all");
  const [kind, setKind] = useState("All");
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inkPages, setInkPages] = useState<{ id: string; title: string; kind: string; thumbnail: string | null; updatedAt: string; recordingId: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/spirit/notebook")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
    // the iPad's handwritten pages — rendered read-only on the phone (8e)
    fetch("/api/spirit/ink?take=12")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInkPages(((d?.pages ?? []) as { kind: string }[]).filter((p) => p.kind !== "overlay") as typeof inkPages))
      .catch(() => {});
  }, []);

  const groups = useMemo(() => {
    if (!data) return [];
    const s = search.trim().toLowerCase();
    return data.groups
      .map((g) => ({
        passage: g.passage,
        items: g.items.filter((it) => {
          if (kind !== "All" && it.kind.toLowerCase() !== kind.toLowerCase()) return false;
          if (cat && it.category !== cat) return false;
          if (s && !`${it.body} ${it.refLabel} ${g.passage}`.toLowerCase().includes(s)) return false;
          return true;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [data, kind, cat, search]);

  const kindPill = (it: NbItem) =>
    it.type === "highlight"
      ? it.kind === "accepted"
        ? "ACCEPTED"
        : "HIGHLIGHT"
      : it.type === "ask"
        ? "ASK"
        : it.kind.toUpperCase();

  const [now] = useState(() => Date.now());
  const ago = (iso: string) => {
    const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    const w = Math.floor(days / 7);
    return w === 1 ? "1 week ago" : `${w} weeks ago`;
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
            YOUR LAYER · ANCHORED TO PASSAGES
          </div>
          <div
            className="text-[26px] font-bold tracking-[-0.02em] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Notebook
          </div>
        </div>
        {data && (
          <span className="flex-none rounded-full bg-accent px-[11px] py-[5px] text-[11px] font-semibold text-[#8C2F51]">
            {data.noteCount} notes
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-[9px] rounded-xl border border-[#E4E2E6] bg-white px-3.5 py-[11px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#96949B" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.8-3.8" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Scripture, notes, highlights, questions…"
          className="flex-1 bg-transparent text-[12.5px] text-[#232227] outline-none placeholder:text-[#96949B]"
        />
      </div>

      {inkPages.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.16em] text-[#96949B]">FROM THE IPAD · READ-ONLY</span>
            <span className="text-[9.5px] text-[#A9A7AE]">the pen lives on the iPad</span>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {inkPages.map((p) => (
              <a key={p.id} href={`/spirit/notebook/page/${p.id}`} className="tap-scale flex-none overflow-hidden rounded-[11px] border border-[#E4E2E6] bg-white" style={{ width: 118 }}>
                <div className="relative h-[74px] bg-[#FFFDF9]" style={{ backgroundImage: "radial-gradient(#EBE6E1 1px, transparent 1.2px)", backgroundSize: "12px 12px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.thumbnail && <img src={p.thumbnail} alt="" className="h-full w-full object-cover object-top" />}
                  {p.recordingId && <span className="absolute right-1.5 top-1.5 h-[6px] w-[6px] rounded-full bg-[#A63D63]" />}
                </div>
                <div className="px-2 py-1.5">
                  <div className="truncate text-[10px] font-semibold text-[#232227]" style={{ fontFamily: "var(--font-display)" }}>{p.title || p.kind}</div>
                  <div className="text-[8.5px] text-[#A9A7AE]">{new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        {(
          [
            ["all", "All"],
            ["oq", `Open questions${data ? ` · ${data.openQuestions.length}` : ""}`],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="rounded-full border border-[#E4E2E6] px-3.5 py-[7px] text-[11.5px] font-semibold transition-colors"
            style={{
              fontFamily: "var(--font-display)",
              background: view === v ? "#232227" : "#FFFFFF",
              color: view === v ? "#FFFFFF" : "#66646C",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "all" && (
        <>
          <div className="mt-2.5 flex flex-wrap gap-[5px]">
            {KIND_CHIPS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className="rounded-full border border-[#E4E2E6] px-[11px] py-[5px] text-[10.5px] font-semibold transition-colors"
                style={{
                  fontFamily: "var(--font-display)",
                  background: kind === k ? "#A63D63" : "#FFFFFF",
                  color: kind === k ? "#FFFFFF" : "#66646C",
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-[7px]">
            {HIGHLIGHT_CATEGORIES.map((c) => (
              <button
                key={c.name}
                onClick={() => setCat(cat === c.name ? null : c.name)}
                className="h-[18px] w-[18px] rounded-md transition-transform hover:scale-110"
                style={{
                  background: c.color,
                  boxShadow: cat === c.name ? `0 0 0 2px #232227` : "none",
                }}
                aria-label={`Filter ${c.name}`}
              />
            ))}
            <span className="ml-1 text-[10.5px] text-muted-foreground">
              {cat ?? "any color"}
            </span>
          </div>

          {groups.map((g) => (
            <div key={g.passage} className="mt-4">
              <p className="px-0.5 text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
                {g.passage}
              </p>
              <div className="mt-2 grid gap-px overflow-hidden rounded-[14px] border border-[#E4E2E6] bg-[#E4E2E6]">
                {g.items.map((it) => (
                  <div key={`${it.type}-${it.id}`} className="bg-white px-3.5 py-3">
                    <div className="flex items-center gap-[7px]">
                      <span
                        className="rounded-full bg-accent px-[9px] py-[2.5px] text-[9.5px] font-bold tracking-[0.08em] text-[#8C2F51]"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {kindPill(it)}
                      </span>
                      {it.category && (
                        <span
                          className="h-[9px] w-[9px] rounded-[3px]"
                          style={{ background: categoryColor(it.category) }}
                        />
                      )}
                      <span className="flex-1 text-[11px] font-semibold text-[#454349]">
                        {it.refLabel}
                      </span>
                      {it.open && (
                        <span className="rounded-full border border-[#B4533F55] px-[7px] py-[2px] text-[8.5px] font-bold tracking-[0.06em] text-[#B4533F]">
                          OPEN
                        </span>
                      )}
                    </div>
                    {it.type !== "highlight" && (
                      <p className="mt-1.5 text-[12.5px] italic leading-[1.6] text-[#454349]">
                        {it.body}
                      </p>
                    )}
                    {it.open && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        resurfaces when you return to this passage
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {data && groups.length === 0 && (
            <p className="mt-10 text-center text-[12.5px] leading-[1.7] text-muted-foreground">
              {data.total === 0
                ? "The notebook fills from the Reader — tap a verse, mark it, say what you see."
                : "Nothing matches that filter."}
            </p>
          )}

          <p className="mt-4 text-center text-[10.5px] leading-[1.6] text-muted-foreground">
            Voice first — spoken notes transcribe and propose their kind.
            <br />
            Ask exchanges live here too, on the verse where you asked.
          </p>
        </>
      )}

      {view === "oq" && data && (
        <>
          <p className="mt-3.5 text-[11.5px] leading-[1.6] text-[#66646C]">
            Questions you wrote and never resolved. They resurface when you return to the
            passage — growth made visible, nothing scored.
          </p>
          <div className="mt-3 grid gap-2.5">
            {data.openQuestions.map((q1) => (
              <div key={q1.id} className="rounded-[14px] bg-white px-4 py-3.5 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
                <p className="text-[13.5px] font-semibold leading-[1.5] text-foreground">{q1.q}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10.5px] text-muted-foreground">
                    {q1.refLabel} · {ago(q1.createdAt)}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8C2F51]">
                    resurfaces at this passage
                  </span>
                </div>
              </div>
            ))}
            {data.openQuestions.length === 0 && (
              <p className="mt-8 text-center text-[12.5px] text-muted-foreground">
                No open questions — the closing question each day can land here.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
