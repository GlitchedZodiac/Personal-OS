"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SheetPortal } from "@/components/sheet-portal";
import {
  getOrCreateMicrophoneStream,
  deactivateMicrophoneStream,
} from "@/lib/microphone";
import { BOOKS, BOOK_ABBREV, CHAPTERS, formatRef, refParts } from "@/lib/bible-refs";
import {
  HIGHLIGHT_CATEGORIES,
  NOTE_KINDS,
  LINK_REASONS,
  categoryColor,
} from "@/lib/spirit-ui";
import { useReaderPrefs, READER_SIZES, type ReaderTheme } from "@/lib/spirit-theme";
import { assignedInChapter, type RefSegment } from "@/lib/spirit-refs";
import { useBackTo } from "@/lib/nav-stack";
import { BibleNav } from "./bible-nav";
import { haptic } from "@/lib/haptics";

// 2026-08-22: the Reader became a COMPONENT so the iPad desk can host it
// as a pane (main or reference Bible) — embedded mode hides the page
// chrome, docks its sheets inside the pane, exposes verse elements
// (data-verse) for pen gestures, supports multi-verse selection, and
// hands navigation to the desk (open in the reference Bible). The phone
// page is a thin wrapper: app/(tabs)/spirit/read/page.tsx.
//
// The Reader — round-2 port (docs/design/pitaya-app.dc.html): themed
// surfaces (light/dark/night), Literata serif, chapter chips, two-stage
// crossref tooltips, the audio mini-player, the ESV⇄NBLA pane (Spanish
// side honestly awaiting its license), and the selection bar with
// Highlight · Note · Link · Word · Ask plus memorize/copy under ⋯.

interface Verse {
  refInt: number;
  verseNum: number;
  text: string;
  lines?: string[];
  heading?: string;
  psalmTitle?: string;
  crossrefs: { letter: string; ref: string }[];
  footnotes: { marker: string; text: string }[];
}

interface Layer {
  highlights: { id: string; refStart: number; refEnd: number; category: string }[];
  notes: { id: string; refStart: number; kind: string; body: string }[];
  links: { id: string; fromStart: number; toStart: number; toEnd: number; reason: string; why?: string | null }[];
  threads: { id: string; refStart: number; refEnd: number; messages: { role: string; content: string; citations?: { label: string; key: string }[] }[] }[];
}

interface PassageData {
  canonical: string;
  audioUrl: string | null;
  verses: Verse[];
  layer: Layer;
  suggested: { refInt: number; category: string }[];
}

interface Assignment {
  label: string;
  scope: string;
  segments: RefSegment[];
}

type BarMode = "act" | "hl" | "note" | "link" | "word" | "ask" | "more" | "mem" | "done";

export interface SpiritReaderProps {
  /** desk pane mode: no page chrome, sheets dock in the pane, selection is externally driven */
  embedded?: boolean;
  /** controlled query ("Judges 4"); changes re-load */
  query?: string | null;
  /** free reading (no term coupling) */
  free?: boolean;
  /** the day whose assignment this is (bracket) */
  dayId?: string | null;
  /** open a crossref elsewhere (the reference Bible) instead of navigating */
  onOpenRef?: (q: string, label: string) => void;
  onQueryChange?: (q: string) => void;
  onPassageLoaded?: (data: PassageData) => void;
  onSelectionChange?: (sel: number | null, selEnd: number | null) => void;
  /** the desk draws its own action bar (A/B); the Reader keeps the sub-flows */
  externalActionBar?: boolean;
  /** the chapter is pinned by overlay ink — type controls lock */
  typeLocked?: boolean;
  /** extra inset (the overlay's writing margin) — side + px */
  marginInset?: { side: "left" | "right"; px: number } | null;
  /** render a child layer over the text column (the overlay canvas) */
  overlay?: ReactNode;
  /** the pane's reference role shows "follows links" */
  role?: "main" | "reference";
  /** report every loaded chapter's key (book*1000+chapter) */
  onChapterChange?: (chapterKey: number, q: string) => void;
  /** chapters of the current book that carry overlay ink — the pen dot on the chips (5c) */
  inkChapters?: Set<number> | null;
}

export interface SpiritReaderHandle {
  setQuery: (q: string) => void;
  reload: () => void;
  select: (refInt: number, endInt?: number | null) => void;
  clearSelection: () => void;
  setBar: (mode: BarMode) => void;
  acceptSuggestion: (refInt: number, category: string) => Promise<void>;
  dismissSuggestion: (refInt: number) => void;
  suggestionAt: (refInt: number) => { refInt: number; category: string } | null;
  applyHighlight: (category: string, refStart?: number, refEnd?: number) => Promise<void>;
  highlightsAt: (refStart: number, refEnd?: number) => { id: string; refStart: number; refEnd: number; category: string }[];
  removeHighlights: (ids: string[]) => Promise<void>;
  getSelection: () => { sel: number | null; selEnd: number | null };
  getVerse: (refInt: number) => Verse | null;
  getData: () => PassageData | null;
  copySelection: () => void;
}

const OCCASIONS = ["Assurance", "Anxiety", "Temptation", "Grief", "Gratitude", "Witness"];

function logosUrl(ref: number) {
  const p = refParts(ref);
  const book = (BOOKS[p.book - 1] ?? "").replace(/\s+/g, "");
  return `https://ref.ly/${book}${p.chapter}.${p.verse || 1}`;
}

/** in the desk the sheets dock inside the pane, so the portal is a no-op wrapper */
function Passthrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Memoised because the desk re-renders this pane on every stroke commit, every 1.1s save flush
 * and every hover move, and re-rendering a 30-verse chapter for a change it does not display is
 * pure waste. memo only bails out if EVERY prop is referentially stable — bible-pane.tsx
 * useMemo/useCallbacks all six of the props that used to be rebuilt inline. forwardRef is
 * memo-safe: the ref is not a prop and the imperative handle is unaffected.
 */
const SpiritReaderInner = forwardRef<SpiritReaderHandle, SpiritReaderProps>(function SpiritReader(props, ref) {
  const embedded = Boolean(props.embedded);
  const router = useRouter();
  const goBack = useBackTo("/spirit");
  const { prefs, update, tokens: T, fontSize, fontFamily } = useReaderPrefs();
  const [q, setQ] = useState<string | null>(null);
  const [freeMode, setFreeMode] = useState(false);
  const [dayMeta, setDayMeta] = useState<{
    id: string;
    kicker: string;
    readingRef: string;
    readingLabel: string;
    readingDone: boolean;
  } | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [segIndex, setSegIndex] = useState(0);
  const [data, setData] = useState<PassageData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [selEnd, setSelEnd] = useState<number | null>(null);
  /**
   * Tapping a verse: first tap selects it, a tap on a DIFFERENT verse extends the range to
   * cover both, and a tap back on the anchor clears. His 2026-08-30 report — "when I select a
   * verse and it's selected I need to be able to select more than one verse for reference or
   * for highlighting. I can't select more than one" — the only multi-verse paths were a finger
   * drag along the gutter and a circling gesture, neither of them obvious.
   */
  const tapVerse = useCallback((refInt: number) => {
    setAskAnswer(null);
    setBar("act");
    if (sel === null) { setSel(refInt); setSelEnd(null); return; }
    const end = selEnd ?? sel;
    if (refInt === sel && selEnd === null) { setSel(null); setSelEnd(null); return; } // tap it again → clear
    if (refInt < sel) { setSel(refInt); setSelEnd(end); return; }                     // extend upward
    if (refInt > end) { setSelEnd(refInt); return; }                                  // extend downward
    setSel(refInt); setSelEnd(null);                                                  // tap inside → collapse
  }, [sel, selEnd]);
  const [bar, setBar] = useState<BarMode>("act");
  const [doneMsg, setDoneMsg] = useState("");
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendCounts, setLegendCounts] = useState<Record<string, { count: number; refs: string[] }> | null>(null);
  const [legendRow, setLegendRow] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [biOn, setBiOn] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [noteKind, setNoteKind] = useState<string>("Question");
  const [noteText, setNoteText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [linkTarget, setLinkTarget] = useState("");
  const [linkReason, setLinkReason] = useState<string>("Parallels");
  const [askText, setAskText] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askAnswer, setAskAnswer] = useState<{
    answer: string;
    citations: { label: string; key: string }[];
    grounded: boolean;
  } | null>(null);
  const [marking, setMarking] = useState(false);
  const [memOccasion, setMemOccasion] = useState("Assurance");
  const [memWhy, setMemWhy] = useState("");
  // two-stage crossref tooltip (footnotes are single-stage): verse+marker+stage
  const [tip, setTip] = useState<{ refInt: number; letter: string; stage: 1 | 2; text?: string; kind: "cf" | "fn" } | null>(null);
  // audio mini-player
  const [navOpen, setNavOpen] = useState(false);
  const [audOn, setAudOn] = useState(false);
  const [audPlaying, setAudPlaying] = useState(false);
  const [audSpeed, setAudSpeed] = useState(1); // index into SPEEDS
  const [audT, setAudT] = useState(0);
  const [audDur, setAudDur] = useState(0);
  const [audLoading, setAudLoading] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audPending = useRef(false);
  /** a verse chosen in the navigator, selected once its chapter arrives */
  const pendingVerse = useRef<number | null>(null);
  /** select and reveal a verse in the passage that is already rendered */
  const revealVerse = useCallback((want: number) => {
    setSel(want);
    setSelEnd(null);
    setBar("act");
    requestAnimationFrame(() => document.getElementById(`v-${want}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, []);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const qp = props.query ?? (embedded ? null : p.get("q"));
    const wantAudio = !embedded && p.get("audio") === "1";
    if (wantAudio) setAudOn(true);
    if ((!embedded && p.get("free") === "1") || props.free) {
      // Free reading — the whole shelf, no term coupling, no mark-read.
      setFreeMode(true);
      setQ(qp ?? localStorage.getItem("spirit-last-free-read") ?? "John 1");
      return;
    }
    fetch("/api/spirit/today")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.day) {
          setDayMeta({
            id: d.day.id,
            kicker: `TERM ${d.term.orderIndex} · ${d.term.title.toUpperCase()} · WEEK ${d.day.weekIndex}`,
            readingRef: d.day.readingRef,
            readingLabel: d.day.readingLabel,
            readingDone: d.readingDone,
          });
          // The assignment is parsed server-side. Open the CHAPTER that
          // holds it — never the bare verse the old string-split produced,
          // which opened "1 Corinthians 7:1" alone and left him hunting
          // through chapters 8 and 9 for the end of his reading.
          const parsed: Assignment | null = d.assignment ?? null;
          setAssignment(parsed);
          setQ(qp ?? parsed?.segments?.[0]?.chapterQuery ?? "John 1");
        } else {
          setQ(qp ?? "John 1");
        }
      })
      .catch(() => setQ(qp ?? "John 1"));
    // mount-only by design: the initial query resolves once; later changes arrive via the handle / props effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled by the desk: a new query re-loads the pane.
  const lastPropQ = useRef<string | null | undefined>(props.query);
  useEffect(() => {
    if (props.query !== lastPropQ.current) {
      lastPropQ.current = props.query;
      if (props.query) {
        setQ(props.query);
        setSel(null);
        setSelEnd(null);
      }
    }
  }, [props.query]);

  // Free reading remembers its spot — "pick up anywhere" includes
  // where you left.
  useEffect(() => {
    if (freeMode && data?.canonical) {
      try {
        localStorage.setItem("spirit-last-free-read", data.canonical);
      } catch {
        // no memory, still readable
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.canonical]);

  const load = useCallback(async () => {
    if (!q) return;
    const params = new URLSearchParams({ q, pin: "1" });
    if (dayMeta?.id) params.set("dayId", dayMeta.id);
    const res = await fetch(`/api/spirit/passage?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErr(body.error ?? "Couldn't load the passage");
      return;
    }
    setErr(null);
    const body = (await res.json()) as PassageData;
    setData(body);
    if (pendingVerse.current) {
      const want = pendingVerse.current;
      pendingVerse.current = null;
      if (body.verses?.some((v) => v.refInt === want)) revealVerse(want);
    }
    props.onPassageLoaded?.(body);
    const first = body.verses?.[0]?.refInt;
    if (first) {
      const parts = refParts(first);
      props.onChapterChange?.(parts.book * 1000 + parts.chapter, q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, dayMeta?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ——— audio wiring ———
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = SPEEDS[audSpeed];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audSpeed, audOn, data?.audioUrl]);

  const fmtTime = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  /** start playback from a real user gesture — the element is always mounted, so this lands */
  const startAudio = () => {
    setAudOn(true);
    const el = audioRef.current;
    if (!el || audPending.current) return;
    audPending.current = true;
    setAudLoading(true);
    el.playbackRate = SPEEDS[audSpeed];
    void el
      .play()
      .catch((err: DOMException) => {
        if (err?.name !== "AbortError") toast.error("Audio couldn't start.");
      })
      .finally(() => {
        audPending.current = false;
      });
  };
  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    if (audPending.current) return; // a second tap while it loads must not cancel the first
    if (el.paused) startAudio();
    else el.pause();
  };
  const stopAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setAudT(0);
  };
  const seekAudio = (sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    const t = Math.max(0, Math.min(audDur || el.duration || 0, sec));
    el.currentTime = t;
    setAudT(t);
  };

  // Current book/chapter + chapter chips (prev · current · next).
  const firstRef = data?.verses[0]?.refInt ?? 0;
  const cur = firstRef ? refParts(firstRef) : null;
  const maxCh = cur ? CHAPTERS[cur.book - 1] ?? 1 : 1;
  const chapterChips = cur
    ? [cur.chapter - 1, cur.chapter, cur.chapter + 1].filter(
        (c) => c >= 1 && c <= maxCh,
      )
    : [];

  // ——— the assignment bracket ———
  // The Reader shows the whole chapter (context matters) but says
  // plainly where today's reading starts and stops. Before this, nothing
  // on screen marked the boundary at all.
  const activeSeg: RefSegment | null =
    assignment && assignment.segments.length
      ? assignment.segments[Math.min(segIndex, assignment.segments.length - 1)]
      : null;
  const assignedHere =
    activeSeg && cur && activeSeg.book === cur.book
      ? assignedInChapter(activeSeg, cur.chapter)
      : null;
  const isAssigned = (verseNum: number) =>
    !!assignedHere &&
    verseNum >= assignedHere.from &&
    (assignedHere.to === null || verseNum <= assignedHere.to);

  const selVerse = data?.verses.find((v) => v.refInt === sel) ?? null;
  const accepted = new Map<number, string>();
  for (const h of data?.layer.highlights ?? []) {
    for (const v of data?.verses ?? []) {
      if (v.refInt >= h.refStart && v.refInt <= h.refEnd) {
        accepted.set(v.refInt, h.category);
      }
    }
  }
  const suggestedFor = (refInt: number) =>
    data?.suggested.find((s) => s.refInt === refInt && !dismissed.has(refInt)) ?? null;
  const pendingCount =
    data?.suggested.filter((s) => !dismissed.has(s.refInt)).length ?? 0;

  useEffect(() => {
    props.onSelectionChange?.(sel, selEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, selEnd]);

  const finish = (msg: string) => {
    setBar("done");
    setDoneMsg(msg);
    load();
  };

  const acceptSuggestion = async (refInt: number, category: string) => {
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "highlight", refStart: refInt, category, origin: "accepted" }),
    });
    load();
  };

  /**
   * The one door every surface goes through — the phone sheet, the desk chips, the
   * highlighter stroke, the verse-number tap, accepting a suggestion.
   *   same category already there → TAKE IT OFF
   *   a different category there  → REPLACE it (no more stacked, arbitrary colours)
   *   nothing there               → mark it
   */
  const applyHighlight = async (category: string, refStart?: number, refEnd?: number) => {
    const start = refStart ?? sel;
    if (!start) return;
    const end = refEnd ?? (refStart ? refStart : (selEnd ?? start));
    // only highlights CONTAINED in what he selected — tapping one verse inside a long band
    // must never wipe that band off the verses he did not touch
    const touching = (data?.layer.highlights ?? []).filter((h) => h.refStart <= end && h.refEnd >= start);
    const overlapping = touching.filter((h) => h.refStart >= start && h.refEnd <= end);
    const same = overlapping.filter((h) => h.category === category);
    if (same.length) {
      await Promise.all(same.map((h) => fetch(`/api/spirit/layer?type=highlight&id=${h.id}`, { method: "DELETE" })));
      // name the span that actually went, not the verse he tapped — one tap can clear a band
      const lo = Math.min(...same.map((h) => h.refStart));
      const hi = Math.max(...same.map((h) => h.refEnd));
      finish(`Unmarked ${category} — ${formatRef(lo, hi)}`);
      return;
    }
    if (overlapping.length) {
      await Promise.all(overlapping.map((h) => fetch(`/api/spirit/layer?type=highlight&id=${h.id}`, { method: "DELETE" })));
    }
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "highlight", refStart: start, refEnd: end, category }),
    });
    finish(`${overlapping.length ? "Re-marked" : "Marked"} ${category} — ${formatRef(start, end)}`);
  };
  /** every highlight touching a span (the desk asks before offering "unmark") */
  const highlightsAt = (a: number, b?: number) =>
    (data?.layer.highlights ?? []).filter((h) => h.refStart <= (b ?? a) && h.refEnd >= a);
  const removeHighlights = async (ids: string[]) => {
    if (!ids.length) return;
    await Promise.all(ids.map((id) => fetch(`/api/spirit/layer?type=highlight&id=${id}`, { method: "DELETE" })));
    finish(`Unmarked — ${ids.length} highlight${ids.length === 1 ? "" : "s"} removed`);
  };

  const saveNote = async () => {
    if (!sel || !noteText.trim()) return;
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        refStart: sel,
        kind: noteKind.toLowerCase(),
        body: noteText.trim(),
        spoken: false,
      }),
    });
    setNoteText("");
    finish(
      `Saved — a ${noteKind} on ${formatRef(sel)}${noteKind === "Question" ? " · added to Open Questions" : ""}`
    );
  };

  const startDictation = async () => {
    try {
      const stream = await getOrCreateMicrophoneStream();
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        deactivateMicrophoneStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 100) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, `note.${mime.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch("/api/ai/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.text?.trim()) {
            setNoteText((prev) => (prev ? `${prev} ${body.text.trim()}` : body.text.trim()));
          } else {
            toast.error("Couldn't hear that.");
          }
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start(250);
      setRecording(true);
    } catch {
      toast.error("Could not access microphone.");
    }
  };

  const saveLink = async () => {
    if (!sel) return;
    const m = linkTarget.trim().match(/^(.+?)\s+(\d+):(\d+)$/);
    if (!m) {
      toast.error("Target like “Judges 2:14”");
      return;
    }
    const bookIdx = BOOKS.findIndex(
      (b) => b.toLowerCase() === m[1].trim().toLowerCase()
    );
    if (bookIdx < 0) {
      toast.error(`Unknown book “${m[1]}”`);
      return;
    }
    const to = (bookIdx + 1) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
    await fetch("/api/spirit/layer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "link",
        fromStart: sel,
        toStart: to,
        reason: linkReason.toLowerCase(),
      }),
    });
    setLinkTarget("");
    finish(`Linked ⇄ ${formatRef(to)} · ${linkReason} — yours, kept forever`);
  };

  const ask = async () => {
    if (!sel || !askText.trim() || askBusy) return;
    setAskBusy(true);
    setAskAnswer(null);
    try {
      const res = await fetch("/api/spirit/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refStart: sel, question: askText.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Ask failed");
      setAskAnswer({
        answer: body.answer,
        citations: body.citations ?? [],
        grounded: Boolean(body.grounded),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ask failed");
    } finally {
      setAskBusy(false);
    }
  };

  const saveMemory = async () => {
    if (!sel) return;
    await fetch("/api/spirit/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refStart: sel,
        occasion: memOccasion,
        why: memWhy.trim() || undefined,
      }),
    });
    setMemWhy("");
    finish(`In the deck — ${formatRef(sel)} · ${memOccasion} · first review in 3 days`);
  };

  const copyVerse = async () => {
    if (!selVerse || !sel) return;
    const text = selVerse.lines ? selVerse.lines.join("\n") : selVerse.text;
    try {
      await navigator.clipboard.writeText(`“${text}” — ${formatRef(sel)} (ESV)`);
      finish(`Copied ${formatRef(sel)} with attribution`);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const markRead = async () => {
    if (!dayMeta || !data || marking) return;
    setMarking(true);
    try {
      if (dayMeta.readingDone) {
        await fetch(`/api/spirit/read?dayId=${dayMeta.id}`, { method: "DELETE" });
      } else {
        // The day owns the range: posting {dayId} logs the assignment
        // that was actually set, not whichever chapter is on screen.
        await fetch("/api/spirit/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: dayMeta.readingLabel,
            medium: "app",
            dayId: dayMeta.id,
          }),
        });
      }
      setDayMeta({ ...dayMeta, readingDone: !dayMeta.readingDone });
    } finally {
      setMarking(false);
    }
  };

  const openLegend = async () => {
    setLegendOpen(true);
    try {
      const res = await fetch("/api/spirit/layer");
      if (res.ok) setLegendCounts((await res.json()).counts);
    } catch {
      // counts stay hidden
    }
  };

  const tapCrossref = async (v: Verse, letter: string, ref: string) => {
    if (tip && tip.refInt === v.refInt && tip.letter === letter) {
      if (tip.stage === 1) {
        // stage 2: fetch the target verse text (first ref of the note)
        const first = ref.replace(/^(See|Cited|Compare)\s+/i, "").split(/[;,]/)[0].trim();
        setTip({ ...tip, stage: 2, text: "…" });
        try {
          const res = await fetch(`/api/spirit/passage?q=${encodeURIComponent(first)}`);
          const body = res.ok ? await res.json() : null;
          const t = body?.verses?.[0];
          setTip((cur2) =>
            cur2 && cur2.refInt === v.refInt && cur2.letter === letter
              ? { ...cur2, stage: 2, text: t ? (t.lines ? t.lines.join(" ") : t.text) : "Couldn't fetch the verse." }
              : cur2,
          );
        } catch {
          setTip((cur2) =>
            cur2 && cur2.refInt === v.refInt ? { ...cur2, text: "Couldn't fetch the verse." } : cur2,
          );
        }
      } else {
        const first = ref.replace(/^(See|Cited|Compare)\s+/i, "").split(/[;,]/)[0].trim();
        if (props.onOpenRef) {
          props.onOpenRef(first.replace(/:\d+.*$/, ""), first);
          setTip(null);
        } else {
          router.push(`/spirit/read?q=${encodeURIComponent(first.replace(/:\d+.*$/, ""))}`);
          setTip(null);
          setQ(first.replace(/:\d+.*$/, ""));
        }
      }
    } else {
      setTip({ refInt: v.refInt, letter, stage: 1, kind: "cf" });
    }
  };

  const tapFootnote = (v: Verse, marker: string, text: string) => {
    if (tip && tip.refInt === v.refInt && tip.letter === `fn${marker}`) {
      setTip(null);
    } else {
      setTip({ refInt: v.refInt, letter: `fn${marker}`, stage: 2, text, kind: "fn" });
    }
  };

  const clearSel = () => {
    setSel(null);
    setSelEnd(null);
    setBar("act");
    setAskAnswer(null);
  };

  // Sheets dock inside the pane when embedded (no portal, no fixed bottom).
  // NOT defined inline: a component expression in render is a new component TYPE every render,
  // so React unmounts and remounts the whole subtree beneath it each time — losing DOM state and
  // restarting transitions on every keystroke, hover and stroke commit. Both variants are
  // module-level constants, so the type is stable and only the choice between them changes.
  const Portal = embedded ? Passthrough : SheetPortal;
  const sheetPos = embedded
    ? "absolute inset-x-2 bottom-2 z-[31] max-h-[72%] overflow-y-auto rounded-[18px]"
    : "fixed inset-x-0 bottom-0 z-[81] rounded-t-[24px]";

  useImperativeHandle(ref, () => ({
    setQuery: (next: string) => setQ(next),
    reload: () => {
      void load();
    },
    select: (refInt: number, endInt?: number | null) => {
      setSel(refInt);
      setSelEnd(endInt && endInt !== refInt ? endInt : null);
      setBar("act");
      setAskAnswer(null);
    },
    clearSelection: clearSel,
    setBar: (m: BarMode) => setBar(m),
    acceptSuggestion: (refInt: number, category: string) => acceptSuggestion(refInt, category),
    dismissSuggestion: (refInt: number) => setDismissed((prev) => new Set([...prev, refInt])),
    suggestionAt: (refInt: number) => suggestedFor(refInt),
    applyHighlight: (category: string, refStart?: number, refEnd?: number) => applyHighlight(category, refStart, refEnd),
    highlightsAt: (a: number, b?: number) => highlightsAt(a, b),
    removeHighlights: (ids: string[]) => removeHighlights(ids),
    getSelection: () => ({ sel, selEnd }),
    getVerse: (refInt: number) => data?.verses.find((v) => v.refInt === refInt) ?? null,
    getData: () => data,
    copySelection: () => {
      void copyVerse();
    },
  }));

  const isDark = prefs.theme !== "light";
  const chipAccentBg = isDark ? "#3A2B33" : "#F6E3EB";
  const chipAccentFg = isDark ? "#DCA8BE" : "#8C2F51";

  return (
    <div
      className={embedded ? "relative min-h-full px-3 pb-28 pt-2 transition-colors duration-300" : "push-in min-h-screen px-[22px] pb-56 pt-12 transition-colors duration-300 lg:px-8"}
      style={{
        background: T.bg,
        ...(props.marginInset && props.marginInset.px > 0 ? { [props.marginInset.side === "left" ? "paddingLeft" : "paddingRight"]: props.marginInset.px + 12 } : {}),
        // the floating transport hovers over the page — the last verse must still scroll clear of it
        ...(audOn && data?.audioUrl ? { paddingBottom: embedded ? 108 : 236 } : {}),
      }}
    >
      {!embedded && (
        <>
      <div className="flex items-center gap-3">
        <button
          onClick={goBack}
          className="tap-scale flex h-9 w-9 flex-none items-center justify-center rounded-full border"
          style={{ background: T.card, borderColor: T.rule }}
          aria-label="Back"
        >
          <span className="-mt-0.5 text-lg leading-none" style={{ color: T.ink }}>‹</span>
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[11px] font-semibold tracking-[0.18em]"
            style={{ color: T.faint }}
          >
            {freeMode ? "FREE READING · PICK UP ANYWHERE" : dayMeta?.kicker ?? "SPIRIT · READER"}
          </div>
          <div
            className="truncate text-[26px] font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)", color: T.ink }}
          >
            {data?.canonical ?? q ?? "…"}
          </div>
        </div>
        <button
          onClick={openLegend}
          className="flex flex-none items-center gap-1.5 rounded-full px-[13px] py-[7px] text-[11.5px] font-semibold"
          style={{ fontFamily: "var(--font-display)", background: chipAccentBg, color: chipAccentFg }}
        >
          <span className="flex gap-[2.5px]">
            {HIGHLIGHT_CATEGORIES.slice(0, 3).map((c) => (
              <span
                key={c.name}
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: c.color }}
              />
            ))}
          </span>
          Legend
        </button>
      </div>

        </>
      )}

      {/* what you were sent here to read — stated, not implied */}
      {assignment && !freeMode && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-[12px] px-3.5 py-[9px]"
          style={{ background: chipAccentBg }}
        >
          <span className="min-w-0">
            <span
              className="block text-[9px] font-bold tracking-[0.13em]"
              style={{ color: chipAccentFg }}
            >
              TODAY&apos;S ASSIGNMENT
            </span>
            <span
              className="mt-[1px] block truncate text-[13px] font-semibold"
              style={{ fontFamily: "var(--font-display)", color: T.ink }}
            >
              {assignment.label}
            </span>
          </span>
          <span
            className="flex-none text-[10.5px] font-semibold tabular-nums"
            style={{ color: chipAccentFg }}
          >
            {assignment.scope}
          </span>
        </div>
      )}

      {/* the whole canon, three taps away — this is how you leave the chapter you are in */}
      <div className="relative mt-3.5">
        <button
          onClick={() => { setNavOpen((v) => !v); haptic("selection"); }}
          className="tap-scale flex w-full items-center gap-2 rounded-[12px] border px-3.5 py-[10px] text-left"
          style={{ borderColor: navOpen ? "#A63D63" : T.rule, background: T.card }}
          aria-label="Choose a book, chapter or verse"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5V5.5Z" />
            <path d="M19 18v2.5H5.5" />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)", color: T.ink }}>
            {data?.canonical ?? q ?? "Choose a passage"}
          </span>
          <span className="flex-none text-[10px]" style={{ color: T.faint }}>{navOpen ? "close" : "book · chapter · verse"}</span>
          <span className="flex-none text-[9px]" style={{ color: T.faint }}>⌄</span>
        </button>
        {navOpen && (
          <div
            className="absolute inset-x-0 z-[45] mt-1.5 rounded-[16px] border p-3"
            style={{ background: T.card, borderColor: T.rule, boxShadow: "0 18px 48px rgba(20,15,18,0.26)" }}
          >
            <BibleNav
              currentBook={cur?.book ?? null}
              currentChapter={cur?.chapter ?? null}
              tokens={{ card: T.card, ink: T.ink, sub: T.sub, faint: T.faint, rule: T.rule, chip: T.chip }}
              variant="popover"
              onClose={() => setNavOpen(false)}
              onPick={(query, verse) => {
                // If he picks a verse in the chapter he is already reading, setQ is a no-op:
                // React bails on the identical string, load() never re-runs, and a pending
                // request would sit armed until some unrelated chapter loaded and stole it.
                const sameChapter = !!q && query.trim().toLowerCase() === q.trim().toLowerCase();
                if (sameChapter) {
                  pendingVerse.current = null;
                  if (verse) revealVerse(verse);
                  return;
                }
                setQ(query);
                if (verse) pendingVerse.current = verse;
              }}
            />
          </div>
        )}
      </div>

      {/* chapter chips · ESV⇄NBLA · Aa · ▶ */}
      <div className="mt-3.5 flex items-center gap-1.5">
        {chapterChips.map((c) => {
          const on = c === cur?.chapter;
          return (
            <button
              key={c}
              onClick={() => {
                if (!on && cur) setQ(`${BOOKS[cur.book - 1]} ${c}`);
              }}
              className="relative rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                fontFamily: "var(--font-display)",
                borderColor: on ? "#A63D63" : T.rule,
                background: on ? "#A63D63" : T.card,
                color: on ? "#FFFFFF" : T.sub,
              }}
            >
              {cur ? `${BOOK_ABBREV[cur.book - 1]} ${c}` : c}
              {props.inkChapters?.has(c) && (
                <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: on ? "#FFFFFF" : "#A63D63" }} />
              )}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => setBiOn((b) => !b)}
          className="rounded-full border px-2.5 py-1.5 text-[10.5px] font-bold transition-colors"
          style={{
            fontFamily: "var(--font-display)",
            borderColor: biOn ? "#A63D63" : T.rule,
            background: biOn ? "#A63D63" : T.card,
            color: biOn ? "#FFFFFF" : T.sub,
          }}
        >
          ESV ⇄ NBLA
        </button>
        <button
          onClick={() => !props.typeLocked && setTypeOpen(true)}
          className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[12px] font-semibold"
          style={{ fontFamily: "var(--font-serif)", borderColor: T.rule, background: T.card, color: props.typeLocked ? "#D9D7DC" : T.ink }}
          aria-label={props.typeLocked ? "Type set when first inked — unpin to reflow" : "Type & theme"}
          title={props.typeLocked ? "type set when first inked — unpin to reflow" : undefined}
        >
          Aa
          {props.typeLocked && (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#A9A7AE" strokeWidth="2.6" style={{ position: "absolute", right: -2, top: -2 }}>
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          )}
        </button>
        <button
          onClick={startAudio}
          className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#A63D63] text-white hover:bg-[#8C2F51]"
          aria-label="Listen to this chapter"
          title="Listen — ESV audio"
        >
          {/* the same play glyph the sermon replay uses, not a text triangle */}
          <svg width="9" height="10" viewBox="0 0 9 10" fill="#FFFFFF"><path d="M0 0l9 5-9 5Z" /></svg>
        </button>
      </div>

      {/* suggested banner */}
      {data && !freeMode && (
        <div
          className="mt-3 flex items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-[#DCA8BE] px-[13px] py-[9px]"
          style={{ background: T.card }}
        >
          <span className="box-border h-[15px] w-[15px] flex-none rounded-[5px] border-[1.5px] border-dashed border-[#A63D63]" />
          <span className="flex-1 text-[11.5px] leading-[1.45]" style={{ color: T.sub }}>
            {pendingCount > 0
              ? `${pendingCount} suggested marks on this chapter — dashed until you accept them`
              : "All of today's suggestions reviewed"}
          </span>
        </div>
      )}

      {err && (
        <p className="mt-8 text-center text-[12.5px]" style={{ color: T.faint }}>{err}</p>
      )}

      {/* bilingual card — English pane live, Spanish pane awaiting license */}
      {data && biOn && (
        <>
          <div
            className="mt-3 overflow-hidden rounded-[18px]"
            style={{ background: T.card, boxShadow: T.shadow }}
          >
            <div
              className="flex items-center justify-between border-b px-3.5 py-[9px]"
              style={{ borderColor: T.rule }}
            >
              <span className="text-[9.5px] font-bold tracking-[0.14em]" style={{ color: T.faint }}>
                ENGLISH · ESV
              </span>
              <span className="text-[9.5px]" style={{ color: T.faint }}>locked to verse</span>
            </div>
            <div className="h-[225px] overflow-y-auto px-3 py-2">
              {data.verses.map((v) => {
                const cat = accepted.get(v.refInt);
                // range-aware, like the prose branch — a two-verse selection must LOOK selected
                const on = sel !== null && v.refInt >= sel && v.refInt <= (selEnd ?? sel);
                return (
                  <div
                    key={v.refInt}
                    onClick={() => tapVerse(v.refInt)}
                    className="cursor-pointer rounded-lg px-2 py-1.5"
                    style={{
                      background: on ? chipAccentBg : cat ? `${categoryColor(cat)}${T.tintAlpha}` : "transparent",
                      borderLeft: cat ? `3px solid ${categoryColor(cat)}` : "3px solid transparent",
                    }}
                  >
                    <div className="text-[13.5px] leading-[1.65]" style={{ fontFamily, color: T.ink }}>
                      <span className="mr-[5px] align-super text-[9px] font-bold text-[#A63D63]">{v.verseNum}</span>
                      {v.lines ? v.lines.join(" ") : v.text}
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className="flex items-center justify-between border-b border-t px-3.5 py-[9px]"
              style={{ borderColor: T.rule, background: T.chip }}
            >
              <span className="text-[9.5px] font-bold tracking-[0.14em]" style={{ color: T.faint }}>
                ESPAÑOL · NBLA
              </span>
              <span className="text-[9.5px]" style={{ color: T.faint }}>se desplazan juntos</span>
            </div>
            <div className="flex h-[120px] items-center justify-center px-6 text-center">
              <span className="text-[11.5px] italic leading-[1.6]" style={{ color: T.faint }}>
                El panel ya está construido — la NBLA llega cuando se aclare la licencia.
              </span>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px]" style={{ color: T.faint }}>
            One selection, both panes — marks live on the verse, not the translation.
          </p>
        </>
      )}

      {/* verses */}
      {data && !biOn && (
        <div
          data-text-column="1"
          className="relative mt-3 rounded-[18px] px-3.5 py-4"
          style={{ background: T.card, boxShadow: T.shadow }}
        >
          {props.overlay}
          {data.verses.map((v) => {
            const cat = accepted.get(v.refInt);
            const sug = suggestedFor(v.refInt);
            const on = sel !== null && v.refInt >= sel && v.refInt <= (selEnd ?? sel);
            const dimmed = sel !== null && !on;
            const assigned = isAssigned(v.verseNum);
            const outside = Boolean(assignedHere) && !assigned;
            const notes = data.layer.notes.filter((n) => n.refStart === v.refInt);
            const tipHere = tip?.refInt === v.refInt ? tip : null;
            return (
              <div key={v.refInt}>
                {assignedHere && v.verseNum === assignedHere.from && (
                  <div
                    className="mb-1.5 flex items-center gap-2 rounded-[9px] px-2.5 py-[7px]"
                    style={{ background: chipAccentBg }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" className="flex-none">
                      <rect x="5" y="0" width="7" height="7" transform="rotate(45 5 1.5)" fill="#A63D63" />
                    </svg>
                    <span
                      className="text-[9.5px] font-bold tracking-[0.13em]"
                      style={{ color: chipAccentFg }}
                    >
                      TODAY&apos;S ASSIGNMENT STARTS HERE · {activeSeg?.label}
                    </span>
                  </div>
                )}
                {v.heading && (
                  <p
                    className="border-b px-2.5 pb-2.5 pt-3 text-[12px] italic leading-[1.6]"
                    style={{ fontFamily: "var(--font-serif)", color: T.faint, borderColor: T.rule }}
                  >
                    {v.heading}
                  </p>
                )}
                {v.psalmTitle && (
                  <p className="px-2.5 pb-1 pt-1.5 text-[12px] italic" style={{ fontFamily: "var(--font-serif)", color: T.faint }}>
                    {v.psalmTitle}
                  </p>
                )}
                <div
                  data-verse={v.refInt}
                  data-verse-num={v.verseNum}
                  id={`v-${v.refInt}`}
                  data-assigned={assigned ? "1" : undefined}
                  onClick={() => tapVerse(v.refInt)}
                  className="cursor-pointer rounded-[9px] px-[11px] py-[7px] transition-all"
                  style={{
                    background: on ? chipAccentBg : cat ? `${categoryColor(cat)}${T.tintAlpha}` : "transparent",
                    boxShadow: on ? "inset 0 0 0 1.5px #A63D63" : "none",
                    borderLeft: cat
                      ? `3px solid ${categoryColor(cat)}`
                      : sug
                        ? `3px dashed ${categoryColor(sug.category)}AA`
                        : assigned
                          ? "3px solid #A63D6355"
                          : "3px solid transparent",
                    opacity: dimmed ? 0.45 : outside ? 0.5 : 1,
                  }}
                >
                  {v.lines ? (
                    <div className="flex gap-[7px]">
                      <span
                        data-verse-number={v.refInt}
                        className="mt-[3px] flex-none text-[10px] font-bold"
                        style={{ fontFamily: "var(--font-display)", color: "#A63D63" }}
                      >
                        {v.verseNum}
                      </span>
                      <div className="flex-1">
                        {v.lines.map((line, i) => (
                          <div
                            key={i}
                            className="-indent-[1.5em] pl-[1.5em] leading-[1.7]"
                            style={{ fontFamily, fontSize: `${fontSize}px`, color: T.ink }}
                          >
                            {line}
                            {i === v.lines!.length - 1 && (
                              <>
                                {v.crossrefs.slice(0, 3).map((c) => (
                                  <sup
                                    key={c.letter}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      tapCrossref(v, c.letter, c.ref);
                                    }}
                                    className="ml-[3px] cursor-pointer text-[10px] font-bold"
                                    style={{
                                      fontFamily: "var(--font-display)",
                                      color: "#8C2F51",
                                      textDecoration:
                                        tipHere?.letter === c.letter ? "underline" : "none",
                                    }}
                                  >
                                    {c.letter}
                                  </sup>
                                ))}
                                {v.footnotes.slice(0, 3).map((f) => (
                                  <sup
                                    key={`fn${f.marker}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      tapFootnote(v, f.marker, f.text);
                                    }}
                                    className="ml-[3px] cursor-pointer text-[9.5px] font-bold"
                                    style={{
                                      fontFamily: "var(--font-display)",
                                      color: T.faint,
                                      textDecoration:
                                        tipHere?.letter === `fn${f.marker}` ? "underline" : "none",
                                    }}
                                  >
                                    [{f.marker}]
                                  </sup>
                                ))}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="leading-[1.75]"
                      style={{
                        fontFamily,
                        fontSize: `${fontSize}px`,
                        color: T.ink,
                        textAlign: prefs.justify ? "justify" : "left",
                        hyphens: prefs.justify ? "auto" : "manual",
                      }}
                    >
                      <span
                        data-verse-number={v.refInt}
                        className="mr-1.5 align-super text-[10px] font-bold"
                        style={{ fontFamily: "var(--font-display)", color: "#A63D63" }}
                      >
                        {v.verseNum}
                      </span>
                      {v.text}
                      {v.crossrefs.slice(0, 3).map((c) => (
                        <sup
                          key={c.letter}
                          onClick={(e) => {
                            e.stopPropagation();
                            tapCrossref(v, c.letter, c.ref);
                          }}
                          className="ml-[3px] cursor-pointer text-[10px] font-bold"
                          style={{
                            color: "#8C2F51",
                            textDecoration:
                              tipHere?.letter === c.letter ? "underline" : "none",
                          }}
                        >
                          {c.letter}
                        </sup>
                      ))}
                      {v.footnotes.slice(0, 3).map((f) => (
                        <sup
                          key={`fn${f.marker}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            tapFootnote(v, f.marker, f.text);
                          }}
                          className="ml-[3px] cursor-pointer text-[9.5px] font-bold"
                          style={{
                            color: T.faint,
                            textDecoration:
                              tipHere?.letter === `fn${f.marker}` ? "underline" : "none",
                          }}
                        >
                          [{f.marker}]
                        </sup>
                      ))}
                    </div>
                  )}
                  {/* two-stage crossref tooltip */}
                  {tipHere && tipHere.kind === "fn" && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setTip(null);
                      }}
                      className="mt-[7px] max-w-[340px] cursor-pointer rounded-[11px] border px-3 py-[9px]"
                      style={{ background: T.chip, borderColor: T.rule }}
                    >
                      <div className="text-[8.5px] font-bold tracking-[0.1em]" style={{ color: T.faint }}>
                        ESV FOOTNOTE
                      </div>
                      <div
                        className="mt-[3px] text-[12.5px] italic leading-[1.65]"
                        style={{ fontFamily: "var(--font-serif)", color: T.sub }}
                      >
                        {tipHere.text}
                      </div>
                    </div>
                  )}
                  {tipHere && tipHere.kind === "cf" && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        const c = v.crossrefs.find((x) => x.letter === tipHere.letter);
                        if (c) tapCrossref(v, c.letter, c.ref);
                      }}
                      className="mt-[7px] max-w-[340px] cursor-pointer rounded-[11px] border px-3 py-[9px]"
                      style={{ background: T.chip, borderColor: T.rule }}
                    >
                      <div className="text-[8.5px] font-bold tracking-[0.1em] text-[#8C2F51]">
                        CROSS-REFERENCE
                      </div>
                      <div className="mt-[3px] text-[12px] font-semibold" style={{ color: T.ink }}>
                        {v.crossrefs.find((x) => x.letter === tipHere.letter)?.ref}
                      </div>
                      {tipHere.stage === 1 ? (
                        <div className="mt-[3px] text-[10px]" style={{ color: T.faint }}>
                          tap again for the verse
                        </div>
                      ) : (
                        <>
                          <div
                            className="mt-[5px] text-[12.5px] italic leading-[1.65]"
                            style={{ fontFamily: "var(--font-serif)", color: T.sub }}
                          >
                            {tipHere.text}
                          </div>
                          <div
                            className="mt-2 inline-flex rounded-full bg-[#A63D63] px-3 py-1 text-[10.5px] font-semibold text-white"
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            Open ›
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {cat && (
                    <div
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: categoryColor(cat), background: T.chip, borderColor: T.rule }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: categoryColor(cat) }}
                      />
                      {cat}
                    </div>
                  )}
                  {notes.map((n) => (
                    <div key={n.id} className="mt-1 text-[11px]" style={{ color: isDark ? "#DC74A0" : "#8C2F51" }}>
                      ✎ {n.body.length > 90 ? `${n.body.slice(0, 90)}…` : n.body}
                    </div>
                  ))}
                  {sug && (
                    <div className="mt-1.5 flex items-center gap-[7px]">
                      <span
                        className="box-border inline-flex items-center gap-[5px] rounded-full border-[1.5px] border-dashed px-[9px] py-[2.5px] text-[10px] font-semibold"
                        style={{ borderColor: categoryColor(sug.category), color: categoryColor(sug.category), background: T.card }}
                      >
                        <span
                          className="box-border h-1.5 w-1.5 rounded-full border-[1.5px]"
                          style={{ borderColor: categoryColor(sug.category) }}
                        />
                        Suggested · {sug.category}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          acceptSuggestion(v.refInt, sug.category);
                        }}
                        className="flex h-[23px] w-[23px] items-center justify-center rounded-full bg-[#EAF3ED] text-[11px] text-[#3E7A54] transition-transform hover:scale-110"
                        aria-label="Accept suggestion"
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDismissed((prev) => new Set([...prev, v.refInt]));
                        }}
                        className="flex h-[23px] w-[23px] items-center justify-center rounded-full text-[10px] transition-transform hover:scale-110"
                        style={{ background: T.chip, color: T.faint }}
                        aria-label="Dismiss suggestion"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                {assignedHere?.to === v.verseNum && (
                  <div className="mb-1 mt-2.5 flex items-center gap-2.5 px-1">
                    <span className="h-px flex-1" style={{ background: T.rule }} />
                    <span
                      className="text-[9.5px] font-bold tracking-[0.13em]"
                      style={{ color: chipAccentFg }}
                    >
                      TODAY&apos;S READING ENDS HERE
                    </span>
                    <span className="h-px flex-1" style={{ background: T.rule }} />
                  </div>
                )}
              </div>
            );
          })}
          {assignedHere?.to && (
            <p className="px-2.5 pt-1 text-center text-[10px] leading-[1.6]" style={{ color: T.faint }}>
              the rest of the chapter is here if you want it — it just isn&apos;t assigned
            </p>
          )}
        </div>
      )}

      {/* the other half of a two-part assignment */}
      {assignment && assignment.segments.length > 1 && !freeMode && (
        <div className="mt-3 flex gap-2">
          {assignment.segments.map((seg, i) => (
            <button
              key={seg.label}
              onClick={() => {
                setSegIndex(i);
                setQ(seg.chapterQuery);
                setSel(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="tap-scale flex-1 rounded-[11px] px-3 py-2.5 text-left transition-colors"
              style={{
                background: i === segIndex ? chipAccentBg : T.card,
                boxShadow: T.shadow,
              }}
            >
              <span
                className="block text-[9px] font-bold tracking-[0.12em]"
                style={{ color: i === segIndex ? chipAccentFg : T.faint }}
              >
                PART {i + 1} OF {assignment.segments.length}
              </span>
              <span
                className="mt-0.5 block text-[12.5px] font-semibold"
                style={{ fontFamily: "var(--font-display)", color: T.ink }}
              >
                {seg.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* mark read */}
      {dayMeta && data && !freeMode && (
        <button
          onClick={markRead}
          disabled={marking}
          className="mt-3.5 w-full rounded-xl py-[13px] text-[13.5px] font-semibold transition-colors disabled:opacity-60"
          style={{
            fontFamily: "var(--font-display)",
            background: dayMeta.readingDone ? "#EAF3ED" : "#A63D63",
            color: dayMeta.readingDone ? "#3E7A54" : "#FFFFFF",
          }}
        >
          {dayMeta.readingDone
            ? `✓ ${dayMeta.readingLabel.split("·")[0].trim()} read`
            : "Mark today's reading read"}
        </button>
      )}

      <p className="mt-3 text-center text-[10.5px] leading-[1.6]" style={{ color: T.faint }}>
        ESV text &amp; cross-references via Crossway API · offline once loaded
        <br />
        word study arrives with the lexicon ·{" "}
        {firstRef ? (
          <a
            href={logosUrl(sel ?? firstRef)}
            target="_blank"
            rel="noreferrer"
            className="font-semibold"
            style={{ color: chipAccentFg }}
          >
            Open in Logos ›
          </a>
        ) : null}
      </p>

      {/* ——— the Bible's audio: element always mounted so the first tap actually plays ——— */}
      {data?.audioUrl && (
        <audio
          ref={audioRef}
          src={data.audioUrl}
          preload="metadata"
          onLoadedMetadata={(e) => {
            setAudDur(e.currentTarget.duration || 0);
            e.currentTarget.playbackRate = SPEEDS[audSpeed];
          }}
          onWaiting={() => setAudLoading(true)}
          onCanPlay={() => setAudLoading(false)}
          onPlaying={() => setAudLoading(false)}
          onPlay={() => setAudPlaying(true)}
          onPause={() => setAudPlaying(false)}
          onTimeUpdate={(e) => {
            if (scrubT === null) setAudT(e.currentTarget.currentTime);
          }}
          onEnded={() => {
            setAudPlaying(false);
            setAudT(0);
          }}
          onError={() => {
            setAudLoading(false);
            setAudPlaying(false);
          }}
          style={{ display: "none" }}
        />
      )}
      {audOn && data?.audioUrl && (
        <SheetPortal>
          <div
            className="fixed z-[95] rounded-2xl border px-3 py-2.5"
            style={{
              // frozen to the SCREEN, centred, so he can follow along and still reach it —
              // body-mounted because a transformed ancestor would otherwise capture "fixed"
              // Biased to the reading half of the desk, not the middle: centred, it sat over
              // the seam toolbar and the notebook's paper — the two places his hand lives.
              left: "min(72%, calc(100% - 372px))",
              // translateZ gives the dock its own compositing layer, so the ink canvas
              // repainting underneath never drags it along
              transform: "translateX(-50%) translateZ(0)",
              width: "min(680px, calc(100vw - 28px))",
              bottom: "max(calc(env(safe-area-inset-bottom, 0px) + 16px), 16px)",
              background: T.card,
              borderColor: T.rule,
              boxShadow: "0 18px 44px rgba(20,15,18,0.34)",
              backdropFilter: "saturate(180%) blur(8px)",
              WebkitBackdropFilter: "saturate(180%) blur(8px)",
            }}
          >
            <div className="flex items-center gap-2.5">
              <button
                onClick={toggleAudio}
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#A63D63] text-white hover:bg-[#8C2F51] ${audPlaying ? "desk-pulse" : ""}`}
                aria-label={audPlaying ? "Pause" : "Play"}
              >
                {audLoading ? (
                  <span className="text-[10px]">···</span>
                ) : audPlaying ? (
                  <svg width="10" height="11" viewBox="0 0 10 11" fill="#FFFFFF"><rect x="0" y="0" width="3.2" height="11" rx="1" /><rect x="6.2" y="0" width="3.2" height="11" rx="1" /></svg>
                ) : (
                  <svg width="10" height="11" viewBox="0 0 10 11" fill="#FFFFFF"><path d="M0 0l10 5.5L0 11Z" /></svg>
                )}
              </button>
              <button onClick={() => seekAudio((scrubT ?? audT) - 15)} className="flex-none rounded-full px-2 py-1 text-[10px] font-bold tabular-nums" style={{ background: T.chip, color: T.ink }} aria-label="Back 15 seconds">−15</button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold" style={{ fontFamily: "var(--font-display)", color: T.ink }}>
                  {data.canonical} · ESV audio
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, audDur)}
                  step={0.5}
                  value={scrubT ?? audT}
                  onChange={(e) => setScrubT(Number(e.target.value))}
                  onPointerUp={() => {
                    if (scrubT !== null) seekAudio(scrubT);
                    setScrubT(null);
                  }}
                  onKeyUp={() => {
                    if (scrubT !== null) seekAudio(scrubT);
                    setScrubT(null);
                  }}
                  aria-label="Scrub"
                  className="mt-1 w-full"
                  style={{ accentColor: "#A63D63", height: 14 }}
                />
              </div>
              <span className="flex-none text-[10px] tabular-nums" style={{ color: T.faint }}>
                {fmtTime(scrubT ?? audT)} / {fmtTime(audDur)}
              </span>
              <button onClick={() => seekAudio((scrubT ?? audT) + 15)} className="flex-none rounded-full px-2 py-1 text-[10px] font-bold tabular-nums" style={{ background: T.chip, color: T.ink }} aria-label="Forward 15 seconds">+15</button>
              <button onClick={stopAudio} className="flex h-7 w-7 flex-none items-center justify-center rounded-full" style={{ background: T.chip, color: T.ink }} aria-label="Stop">
                <svg width="9" height="9" viewBox="0 0 9 9"><rect width="9" height="9" rx="1.6" fill="currentColor" /></svg>
              </button>
              <button
                onClick={() => {
                  const next = (audSpeed + 1) % SPEEDS.length;
                  setAudSpeed(next);
                  if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
                }}
                className="flex-none rounded-full px-2.5 py-1.5 text-[10.5px] font-bold tabular-nums"
                style={{ fontFamily: "var(--font-display)", background: T.chip, color: T.ink }}
                aria-label="Playback speed"
              >
                {SPEEDS[audSpeed]}×
              </button>
              {cur && cur.chapter > 1 && (
                <button onClick={() => setQ(`${BOOKS[cur.book - 1]} ${cur.chapter - 1}`)} className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm" style={{ background: T.chip, color: T.ink }} aria-label="Previous chapter">‹</button>
              )}
              {cur && cur.chapter < maxCh && (
                <button onClick={() => setQ(`${BOOKS[cur.book - 1]} ${cur.chapter + 1}`)} className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm" style={{ background: T.chip, color: T.ink }} aria-label="Next chapter">›</button>
              )}
              <button
                onClick={() => {
                  audioRef.current?.pause();
                  setAudOn(false);
                }}
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px]"
                style={{ color: T.faint }}
                aria-label="Close player"
              >
                ✕
              </button>
            </div>
          </div>
        </SheetPortal>
      )}

      {/* ——— action bar sheet ——— */}
      {sel !== null && selVerse && !(embedded && props.externalActionBar && bar === "act") && (
        <Portal>
          <div
            className={`${sheetPos} px-5 pb-9 pt-4 sheet-up`}
            style={{ background: T.card, boxShadow: "0 -12px 40px rgba(20,15,18,0.3)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold tracking-[0.14em] text-[#A63D63]">
                {formatRef(sel, selEnd ?? sel).toUpperCase()} SELECTED
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setBar(bar === "more" ? "act" : "more")}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-sm font-bold"
                  style={{ background: T.chip, color: T.sub }}
                  aria-label="More actions"
                >
                  ⋯
                </button>
                <button
                  onClick={clearSel}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs"
                  style={{ background: T.chip, color: T.sub }}
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
            </div>

            {bar === "act" && (
              <>
                <div className="mt-3.5 flex gap-1.5">
                  {(
                    [
                      ["hl", "Highlight"],
                      ["note", "Note"],
                      ["link", "Link"],
                      ["word", "Word"],
                      ["ask", "Ask"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setBar(mode)}
                      className="flex-1 rounded-xl px-0 py-2.5 text-center"
                      style={{ background: T.chip }}
                    >
                      {mode === "hl" ? (
                        <span className="flex justify-center gap-[2.5px]">
                          <span className="h-[9px] w-[9px] rounded-full bg-[#3E7A54]" />
                          <span className="h-[9px] w-[9px] rounded-full bg-[#A63D63]" />
                        </span>
                      ) : (
                        <span className="text-[13px] font-bold leading-[11px] text-[#8C2F51]">
                          {mode === "note" ? "✎" : mode === "link" ? "⇄" : mode === "word" ? "אב" : "?"}
                        </span>
                      )}
                      <span className="mt-1 block text-[10px] font-semibold" style={{ color: T.ink }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px]" style={{ color: T.faint }}>
                  Memorize &amp; copy live under ⋯ · highlights, notes and links cost zero AI
                </p>
              </>
            )}

            {bar === "more" && (
              <div className="mt-3.5 grid gap-2">
                <button
                  onClick={() => setBar("mem")}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-left"
                  style={{ background: T.chip }}
                >
                  <span>
                    <span className="block text-[13px] font-semibold" style={{ color: T.ink }}>
                      Memorize
                    </span>
                    <span className="block text-[10.5px]" style={{ color: T.faint }}>
                      files into the deck by occasion — private, never scored
                    </span>
                  </span>
                  <span style={{ color: T.faint }}>›</span>
                </button>
                <button
                  onClick={copyVerse}
                  className="flex items-center justify-between rounded-xl px-4 py-3 text-left"
                  style={{ background: T.chip }}
                >
                  <span>
                    <span className="block text-[13px] font-semibold" style={{ color: T.ink }}>
                      Copy with attribution
                    </span>
                    <span className="block text-[10.5px]" style={{ color: T.faint }}>
                      “…” — {formatRef(sel)} (ESV)
                    </span>
                  </span>
                  <span style={{ color: T.faint }}>›</span>
                </button>
              </div>
            )}

            {bar === "mem" && (
              <>
                <p className="mt-3 text-[11px]" style={{ color: T.sub }}>
                  Filed by occasion, not by reference — pick the moment this verse is for.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {OCCASIONS.map((o) => (
                    <button
                      key={o}
                      onClick={() => setMemOccasion(o)}
                      className="rounded-full border px-[11px] py-[5px] text-[10.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: "var(--font-display)",
                        borderColor: T.rule,
                        background: memOccasion === o ? "#232227" : T.card,
                        color: memOccasion === o ? "#FFFFFF" : T.sub,
                      }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
                <input
                  value={memWhy}
                  onChange={(e) => setMemWhy(e.target.value)}
                  placeholder="Why this one? (optional, becomes the card's note)"
                  className="mt-2.5 w-full rounded-[10px] border px-3 py-2.5 text-[12.5px] outline-none"
                  style={{ borderColor: T.rule, background: T.card, color: T.ink }}
                />
                <button
                  onClick={saveMemory}
                  className="mt-2.5 w-full rounded-[10px] bg-[#A63D63] py-[11px] text-[12.5px] font-semibold text-white hover:bg-[#8C2F51]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Add to the deck · {memOccasion}
                </button>
              </>
            )}

            {bar === "hl" && (
              <>
                <p className="mt-3 text-[11px]" style={{ color: T.sub }}>
                  Colors mean something — pick the meaning, not the shade.
                </p>
                <div className="mt-2.5 flex gap-[5px]">
                  {HIGHLIGHT_CATEGORIES.map((c) => (
                    <button key={c.name} onClick={() => applyHighlight(c.name)} className="flex-1 text-center">
                      <span
                        className="block h-[34px] rounded-[10px] border-[1.5px] transition-transform hover:scale-105"
                        style={{ borderColor: c.color, background: `${c.color}26` }}
                      />
                      <span className="mt-1 block text-[8.5px] font-semibold leading-[1.2]" style={{ color: T.sub }}>
                        {c.short}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {bar === "note" && (
              <>
                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={2}
                    placeholder={
                      transcribing ? "Transcribing…" : "Speak it — typing is the fallback"
                    }
                    className="min-h-[52px] flex-1 resize-none rounded-xl border-[1.5px] border-dashed px-3 py-2.5 text-[13px] italic leading-[1.55] outline-none"
                    style={{ borderColor: T.rule, background: T.card, color: T.ink }}
                  />
                  <button
                    onClick={() =>
                      recording ? recorderRef.current?.stop() : startDictation()
                    }
                    disabled={transcribing}
                    aria-label="Dictate the note"
                    className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full transition-colors"
                    style={{
                      background: recording ? "#8C2F51" : "#A63D63",
                      boxShadow: `0 0 0 5px ${chipAccentBg}`,
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
                    </svg>
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="flex-none text-[10.5px]" style={{ color: T.faint }}>Sounds like a</span>
                  {NOTE_KINDS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setNoteKind(k)}
                      className="rounded-full border px-[11px] py-[5px] text-[10.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: "var(--font-display)",
                        borderColor: T.rule,
                        background: noteKind === k ? "#232227" : T.card,
                        color: noteKind === k ? "#FFFFFF" : T.sub,
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={saveNote}
                  disabled={!noteText.trim()}
                  className="mt-2.5 w-full rounded-[10px] bg-[#A63D63] py-[11px] text-[12.5px] font-semibold text-white hover:bg-[#8C2F51] disabled:opacity-50"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Save as {noteKind} note
                </button>
              </>
            )}

            {bar === "link" && (
              <>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ fontFamily: "var(--font-display)", color: T.ink }}
                  >
                    {formatRef(sel)}
                  </span>
                  <span className="font-bold text-[#A63D63]">⇄</span>
                  <input
                    value={linkTarget}
                    onChange={(e) => setLinkTarget(e.target.value)}
                    placeholder="Judges 2:14"
                    className="min-w-0 flex-1 rounded-[10px] border px-2.5 py-2 text-[13px] font-semibold outline-none"
                    style={{ fontFamily: "var(--font-display)", borderColor: T.rule, background: T.card, color: T.ink }}
                  />
                </div>
                <p className="mt-2.5 text-[11px]" style={{ color: T.sub }}>
                  Why are these connected? The reason is the link.
                </p>
                <div className="mt-2 flex gap-[5px]">
                  {LINK_REASONS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setLinkReason(k)}
                      className="rounded-full border px-[11px] py-[5px] text-[10.5px] font-semibold transition-colors"
                      style={{
                        fontFamily: "var(--font-display)",
                        borderColor: T.rule,
                        background: linkReason === k ? "#232227" : T.card,
                        color: linkReason === k ? "#FFFFFF" : T.sub,
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={saveLink}
                  disabled={!linkTarget.trim()}
                  className="mt-3 w-full rounded-[10px] bg-[#A63D63] py-[11px] text-[12.5px] font-semibold text-white hover:bg-[#8C2F51] disabled:opacity-50"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Save link
                </button>
              </>
            )}

            {bar === "word" && (
              <>
                <div className="mt-3 flex items-baseline gap-2">
                  <span
                    className="text-[17px] font-bold"
                    style={{ fontFamily: "var(--font-display)", color: T.ink }}
                  >
                    Word study
                  </span>
                  <span className="text-[13px] text-[#8C2F51]">אב</span>
                  <span className="flex-1" />
                  <span className="text-[10px]" style={{ color: T.faint }}>
                    original-language layer
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.6]" style={{ color: T.sub }}>
                  The Hebrew/Greek behind each word, its gloss, and every other place it
                  appears — designed and waiting. It lights up when the lexicon dataset
                  (Strong&apos;s) lands; nothing here will ever be AI-guessed.
                </p>
                <a
                  href={logosUrl(sel)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-full border px-3.5 py-2 text-[11px] font-semibold"
                  style={{ fontFamily: "var(--font-display)", borderColor: T.rule, background: T.chip, color: chipAccentFg }}
                >
                  Meanwhile — open {formatRef(sel)} in Logos ›
                </a>
              </>
            )}

            {bar === "ask" && (
              <>
                {!askAnswer && (
                  <div className="mt-3 flex items-end gap-2">
                    <textarea
                      value={askText}
                      onChange={(e) => setAskText(e.target.value)}
                      rows={2}
                      placeholder={`Ask about ${formatRef(sel)} — cited when your library covers it`}
                      className="min-h-[52px] flex-1 resize-none rounded-xl border px-3 py-2.5 text-[13px] leading-[1.55] outline-none"
                      style={{ borderColor: T.rule, background: T.card, color: T.ink }}
                    />
                    <button
                      onClick={ask}
                      disabled={askBusy || !askText.trim()}
                      className="h-[42px] flex-none rounded-[10px] bg-[#A63D63] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {askBusy ? "…" : "Ask"}
                    </button>
                  </div>
                )}
                {askAnswer && (
                  <>
                    <div className="mt-3 self-end rounded-[14px] rounded-br-[4px] bg-[#A63D63] px-3 py-[9px] text-[13px] leading-[1.5] text-white">
                      {askText}
                    </div>
                    <div
                      className="mt-2 rounded-[14px] rounded-bl-[4px] border px-3 py-[10px] text-[13px] leading-[1.55]"
                      style={{ borderColor: T.rule, background: T.chip, color: T.ink }}
                    >
                      {askAnswer.answer}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex rounded-full px-[9px] py-[3px] text-[9.5px] font-bold tracking-[0.1em]"
                          style={{
                            fontFamily: "var(--font-display)",
                            background: askAnswer.grounded ? "#EAF3ED" : T.card,
                            color: askAnswer.grounded ? "#3E7A54" : T.faint,
                            border: askAnswer.grounded ? "none" : `1px solid ${T.rule}`,
                          }}
                        >
                          {askAnswer.grounded ? "FROM YOUR LIBRARY" : "NOT IN YOUR LIBRARY"}
                        </span>
                        {askAnswer.citations.map((c) => (
                          <span
                            key={c.key}
                            className="inline-flex rounded-full border px-[9px] py-[3px] text-[10px] font-semibold text-[#8C2F51]"
                            style={{ fontFamily: "var(--font-display)", borderColor: T.rule, background: T.card }}
                          >
                            {c.label} ›
                          </span>
                        ))}
                      </div>
                      {!askAnswer.grounded && (
                        <p className="mt-1.5 text-[10.5px] leading-[1.5]" style={{ color: T.faint }}>
                          Taught in its own words — no source in your library covers this
                          yet, so nothing here is a quotation.
                        </p>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[10.5px]" style={{ color: T.faint }}>
                        Stored on {formatRef(sel)} — searchable forever
                      </span>
                      <button
                        onClick={() => {
                          setAskAnswer(null);
                          setAskText("");
                        }}
                        className="rounded-lg px-3.5 py-[7px] text-xs font-semibold"
                        style={{ fontFamily: "var(--font-display)", background: chipAccentBg, color: chipAccentFg }}
                      >
                        Ask again
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {bar === "done" && (
              <div className="mt-3.5 flex items-center gap-2.5">
                <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[#EAF3ED] text-[15px] text-[#3E7A54]">
                  ✓
                </span>
                <span className="flex-1 text-[13px] font-semibold" style={{ color: T.ink }}>{doneMsg}</span>
                <button
                  onClick={clearSel}
                  className="rounded-lg border px-3.5 py-[7px] text-xs font-semibold"
                  style={{ fontFamily: "var(--font-display)", borderColor: T.rule, color: T.sub }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </Portal>
      )}

      {/* ——— type & theme sheet ——— */}
      {typeOpen && (
        <Portal>
          <div className={embedded ? "absolute inset-0 z-[30] bg-[rgba(15,11,14,0.25)]" : "fixed inset-0 z-[85] bg-[rgba(15,11,14,0.5)]"} onClick={() => setTypeOpen(false)} />
          <div
            className={embedded ? "absolute inset-x-2 bottom-2 z-[31] max-h-[82%] overflow-y-auto rounded-[20px] px-6 pb-6 pt-5 sheet-up" : "fixed inset-x-0 bottom-0 z-[86] rounded-t-[28px] px-6 pb-10 pt-6 sheet-up"}
            style={{ background: T.card }}
          >
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full" style={{ background: T.rule }} />
            <p className="text-[19px] font-bold" style={{ fontFamily: "var(--font-display)", color: T.ink }}>
              Type &amp; theme
            </p>
            <p className="mt-0.5 text-xs" style={{ color: T.faint }}>
              The typography is the product — set it once, read for years.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => update({ size: Math.max(0, prefs.size - 1) })}
                className="flex h-[38px] w-11 items-center justify-center rounded-[11px] border text-[13px]"
                style={{ fontFamily: "var(--font-serif)", borderColor: T.rule, background: T.chip, color: T.ink }}
                aria-label="Smaller text"
              >
                A−
              </button>
              <div className="flex flex-1 justify-center gap-[7px]">
                {READER_SIZES.map((_, i) => (
                  <span
                    key={i}
                    className="h-[9px] w-[9px] rounded-full transition-colors"
                    style={{ background: i === prefs.size ? "#A63D63" : T.rule }}
                  />
                ))}
              </div>
              <button
                onClick={() => update({ size: Math.min(READER_SIZES.length - 1, prefs.size + 1) })}
                className="flex h-[38px] w-11 items-center justify-center rounded-[11px] border text-[17px]"
                style={{ fontFamily: "var(--font-serif)", borderColor: T.rule, background: T.chip, color: T.ink }}
                aria-label="Larger text"
              >
                A+
              </button>
            </div>
            <div
              className="mt-3 flex gap-1.5 rounded-xl border p-1"
              style={{ borderColor: T.rule, background: T.chip }}
            >
              {(
                [
                  [true, "Literata — serif"],
                  [false, "Instrument — sans"],
                ] as const
              ).map(([serif, label]) => (
                <button
                  key={label}
                  onClick={() => update({ serif })}
                  className="flex-1 rounded-[9px] py-2 text-center text-xs font-semibold transition-colors"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: prefs.serif === serif ? "#A63D63" : "transparent",
                    color: prefs.serif === serif ? "#FFFFFF" : T.sub,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3.5 flex items-center justify-between">
              <div>
                <div className="text-[13px] font-semibold" style={{ color: T.ink }}>
                  Justified + hyphenated
                </div>
                <div className="text-[10.5px]" style={{ color: T.faint }}>
                  set like a printed page
                </div>
              </div>
              <button
                onClick={() => update({ justify: !prefs.justify })}
                className="relative h-[26px] w-11 rounded-full transition-colors"
                style={{ background: prefs.justify ? "#A63D63" : T.rule }}
                aria-label="Toggle justification"
              >
                <span
                  className="absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all"
                  style={{ left: prefs.justify ? "20px" : "2px" }}
                />
              </button>
            </div>
            <div className="mt-4 flex gap-2.5">
              {(
                [
                  ["light", "Light", "#FFFFFF", "#232227"],
                  ["dark", "Dark", "#2A272E", "#F2F1F2"],
                  ["night", "Night", "#1C181E", "#E3DCE0"],
                ] as [ReaderTheme, string, string, string][]
              ).map(([theme, label, sw, swInk]) => (
                <button key={theme} onClick={() => update({ theme })} className="flex-1 text-center">
                  <span
                    className="flex h-[52px] items-center justify-center rounded-[13px] border-2 transition-colors"
                    style={{
                      borderColor: prefs.theme === theme ? "#A63D63" : T.rule,
                      background: sw,
                    }}
                  >
                    <span className="text-base" style={{ fontFamily: "var(--font-serif)", color: swInk }}>
                      Aa
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[10.5px] font-semibold" style={{ color: T.sub }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3.5 text-center text-[10px]" style={{ color: T.faint }}>
              Night is a designed surface, not an inversion — highlight tints are re-tuned for it.
            </p>
          </div>
        </Portal>
      )}

      {/* ——— legend sheet ——— */}
      {legendOpen && (
        <Portal>
          <div className={embedded ? "absolute inset-0 z-[30] bg-[rgba(27,21,24,0.25)]" : "fixed inset-0 z-[85] bg-[rgba(27,21,24,0.45)]"} onClick={() => setLegendOpen(false)} />
          <div
            className={embedded ? "absolute inset-x-2 bottom-2 z-[31] max-h-[82%] overflow-y-auto rounded-[20px] px-6 pb-6 pt-5 sheet-up" : "fixed inset-x-0 bottom-0 z-[86] rounded-t-[28px] px-6 pb-10 pt-6 sheet-up"}
            style={{ background: T.card }}
          >
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full" style={{ background: T.rule }} />
            <p className="text-[19px] font-bold" style={{ fontFamily: "var(--font-display)", color: T.ink }}>
              Your legend
            </p>
            <p className="mt-1 text-xs" style={{ color: T.sub }}>
              Each color carries a meaning you assigned — so it can be queried, not just admired.
            </p>
            <div
              className="mt-3.5 grid gap-px overflow-hidden rounded-[14px] border"
              style={{ borderColor: T.rule, background: T.rule }}
            >
              {HIGHLIGHT_CATEGORIES.map((c) => {
                const info = legendCounts?.[c.name];
                const open = legendRow === c.name;
                return (
                  <div
                    key={c.name}
                    onClick={() => setLegendRow(open ? null : c.name)}
                    className="cursor-pointer px-3.5 py-[11px]"
                    style={{ background: T.card }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="box-border h-4 w-4 flex-none rounded-[5px] border-[1.5px]"
                        style={{ borderColor: c.color, background: `${c.color}26` }}
                      />
                      <span className="flex-1 text-[13px] font-semibold" style={{ color: T.ink }}>{c.name}</span>
                      <span className="text-[11px] tabular-nums" style={{ color: T.faint }}>
                        {info ? info.count : ""}
                      </span>
                      <span className="text-sm" style={{ color: T.rule }}>›</span>
                    </div>
                    {open && (
                      <div className="ml-[26px] mt-2 text-[11.5px] leading-[1.6]" style={{ color: T.sub }}>
                        {info?.refs.length ? info.refs.join(" · ") : "nothing marked here yet"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setLegendOpen(false)}
              className="mt-3.5 w-full rounded-[10px] bg-[#A63D63] py-2.5 text-[12.5px] font-semibold text-white hover:bg-[#8C2F51]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Done
            </button>
            <p className="mt-3 text-center text-[10.5px]" style={{ color: T.faint }}>
              Ask anytime: “every promise I&apos;ve marked in the Psalms.”
            </p>
          </div>
        </Portal>
      )}
    </div>
  );
});

export const SpiritReader = memo(SpiritReaderInner);
