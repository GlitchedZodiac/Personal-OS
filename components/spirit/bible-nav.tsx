"use client";

// The Bible navigator — how you actually get from John to Romans.
// Until now the Reader could only step to the neighbouring chapter, so most of
// Scripture was unreachable. This is the whole canon in three taps: a book, a
// chapter, an optional verse — plus a type-ahead that takes what he would say
// out loud ("jn 3", "1co 13:4", "Romans 9:6").
//
// It serves the phone Reader AND the desk's Bible pane, which can be as narrow
// as ~240px in a three-column tab, so it is a sheet on the phone and a popover
// on the desk, with the same body.

import { useEffect, useMemo, useRef, useState } from "react";
import { BOOKS, BOOK_ABBREV, CHAPTERS, refInt } from "@/lib/bible-refs";
import { parseReadingRef } from "@/lib/spirit-refs";
import { haptic } from "@/lib/haptics";

const OT_COUNT = 39;
const DISPLAY = "var(--font-display)";

export interface BibleNavTokens {
  card: string;
  ink: string;
  sub: string;
  faint: string;
  rule: string;
  chip: string;
}

const RECENTS_KEY = "spirit-bible-recents";

export function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function pushRecent(ref: string) {
  if (typeof window === "undefined" || !ref) return;
  try {
    const next = [ref, ...readRecents().filter((r) => r !== ref)].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // a full disk should never break navigation
  }
}

/** the canon, matched the way he would type it: "jn3", "1 co 13:4", "romans 9" */
/** do the letters of `key` appear in `name`, in order? "jn" -> joh(n), "gl" -> ga(l)atians */
function isSubsequence(key: string, name: string): boolean {
  let i = 0;
  for (const ch of name) {
    if (ch === key[i]) i++;
    if (i === key.length) return true;
  }
  return false;
}

export function matchBooks(term: string): number[] {
  const q = term.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return [];
  const letters = q.replace(/[0-9:.-]+$/g, ""); // drop a trailing chapter/verse
  const key = letters || q;
  const starts: number[] = [];
  const abbrev: number[] = [];
  const initials: number[] = [];
  const contains: number[] = [];
  BOOKS.slice(0, 66).forEach((b, i) => {
    const n = b.toLowerCase().replace(/\s+/g, "");
    const a = (BOOK_ABBREV[i] ?? "").toLowerCase();
    if (n.startsWith(key)) starts.push(i);
    else if (a.startsWith(key)) abbrev.push(i);
    // how people actually type: "jn" for John, "phlp" for Philippians, "rms" for Romans
    else if (key.length >= 2 && isSubsequence(key, n)) initials.push(i);
    else if (n.includes(key)) contains.push(i);
  });
  // among initials matches, the shortest name is the tightest fit: "jn" means John, not Jonah
  initials.sort((a, b) => BOOKS[a].length - BOOKS[b].length);
  return [...starts, ...abbrev, ...initials, ...contains];
}

export function BibleNav({
  currentBook,
  currentChapter,
  onPick,
  onClose,
  tokens,
  variant = "popover",
}: {
  /** 1-based book index */
  currentBook: number | null;
  currentChapter: number | null;
  /** a query the Reader understands, e.g. "John 3" — plus the verse to select, if he chose one */
  onPick: (query: string, verse?: number | null) => void;
  onClose: () => void;
  tokens: BibleNavTokens;
  variant?: "popover" | "sheet";
}) {
  const T = tokens;
  const [term, setTerm] = useState("");
  const [testament, setTestament] = useState<"ot" | "nt">((currentBook ?? 40) > OT_COUNT ? "nt" : "ot");
  const [book, setBook] = useState<number | null>(currentBook ? currentBook - 1 : null);
  const [recents] = useState<string[]>(() => readRecents());
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // the keyboard is a choice on a tablet with a pen in hand — do not force it up
    if (variant === "sheet") inputRef.current?.focus();
  }, [variant]);

  const typed = useMemo(() => (term.trim() ? parseReadingRef(term.trim()) : []), [term]);
  const suggestions = useMemo(() => matchBooks(term).slice(0, 8), [term]);
  const list = useMemo(() => {
    const from = testament === "ot" ? 0 : OT_COUNT;
    const to = testament === "ot" ? OT_COUNT : 66;
    return BOOKS.slice(from, to).map((name, i) => ({ name, index: from + i }));
  }, [testament]);

  const go = (b: number, c: number, vNum?: number | null) => {
    const q = `${BOOKS[b]} ${c}`;
    pushRecent(vNum ? `${q}:${vNum}` : q);
    haptic("selection");
    // consumers expect a canonical refInt, never a bare verse number
    onPick(q, vNum ? refInt(b + 1, c, vNum) : null);
    onClose();
  };

  /** the verse stage: which chapter is asking, and how many verses it has */
  const [versePick, setVersePick] = useState<{ ch: number; count: number | null } | null>(null);
  useEffect(() => {
    if (!versePick || book === null || versePick.count !== null) return;
    let alive = true;
    fetch(`/api/spirit/passage?q=${encodeURIComponent(`${BOOKS[book]} ${versePick.ch}`)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setVersePick((v) => (v && v.ch === versePick.ch ? { ...v, count: (d?.verses?.length as number) || 0 } : v)); })
      .catch(() => { if (alive) setVersePick((v) => (v && v.ch === versePick.ch ? { ...v, count: 0 } : v)); });
    return () => { alive = false; };
  }, [versePick, book]);

  const chapters = book !== null ? (CHAPTERS[book] ?? 1) : 0;
  const compact = variant === "popover";

  return (
    <div style={{ width: "100%", maxHeight: compact ? "min(70vh, 520px)" : "72vh", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* type it the way you'd say it */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const seg = typed[0];
            if (seg) {
              pushRecent(seg.label);
              haptic("selection");
              onPick(seg.chapterQuery, seg.startVerse !== null ? seg.refStart : null);
              onClose();
            } else if (suggestions.length) {
              setBook(suggestions[0]);
              setVersePick(null);
              setTerm("");
            }
          }}
          placeholder="John 3:16 · jn3 · 1co 13"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13.5,
            padding: "9px 12px",
            border: `1px solid ${T.rule}`,
            borderRadius: 11,
            outline: "none",
            background: T.card,
            color: T.ink,
            fontFamily: "var(--font-body)",
          }}
        />
        <button type="button" onClick={onClose} aria-label="Close" style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", border: `1px solid ${T.rule}`, background: T.card, color: T.sub, fontSize: 12, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* what he typed, understood */}
      {typed.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const seg = typed[0];
            pushRecent(seg.label);
            haptic("selection");
            onPick(seg.chapterQuery, seg.startVerse !== null ? seg.refStart : null);
            onClose();
          }}
          style={{ marginTop: 8, flex: "none", textAlign: "left", background: "#F6E3EB", border: 0, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }}
        >
          <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: "#8C2F51" }}>Go to {typed[0].label} →</span>
        </button>
      )}
      {typed.length === 0 && suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8, flex: "none" }}>
          {suggestions.map((b) => (
            <button key={b} type="button" onClick={() => {
              // "jn 3:16" typed, John chip tapped — the :16 must survive the tap, not vanish
              const digits = /(\d+)\s*[:.]\s*(\d+)/.exec(term) ?? /(?:^|\s)(\d+)\s*$/.exec(term);
              if (digits) {
                const ch = Math.max(1, Math.min(Number(digits[1]) || 1, CHAPTERS[b] ?? 1));
                const vs = digits[2] ? Number(digits[2]) : null;
                go(b, ch, vs);
                return;
              }
              setBook(b); setVersePick(null); setTerm(""); haptic("selection");
            }} style={{ fontSize: 11.5, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", border: 0, borderRadius: 99, padding: "5px 11px", cursor: "pointer" }}>
              {BOOKS[b]}
            </button>
          ))}
        </div>
      )}

      {recents.length > 0 && term === "" && book === null && (
        <div style={{ marginTop: 10, flex: "none" }}>
          <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: T.faint }}>WHERE YOU&apos;VE BEEN</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {recents.map((r) => (
              <button key={r} type="button" onClick={() => { const seg = parseReadingRef(r)[0]; if (seg) { haptic("selection"); onPick(seg.chapterQuery, seg.startVerse !== null ? seg.refStart : null); onClose(); } }} style={{ fontSize: 11, fontWeight: 600, color: T.sub, background: T.chip, border: 0, borderRadius: 99, padding: "5px 10px", cursor: "pointer" }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* book → chapter */}
      {book === null ? (
        <>
          <div style={{ display: "flex", background: T.chip, borderRadius: 99, padding: 3, marginTop: 12, flex: "none" }}>
            {(["ot", "nt"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setTestament(t); haptic("selection"); }} style={{ flex: 1, fontSize: 10.5, letterSpacing: "0.08em", fontWeight: 700, color: testament === t ? "#FFFFFF" : T.sub, background: testament === t ? "#A63D63" : "transparent", border: 0, borderRadius: 99, padding: "6px 0", cursor: "pointer" }}>
                {t === "ot" ? "OLD TESTAMENT" : "NEW TESTAMENT"}
              </button>
            ))}
          </div>
          <div style={{ overflowY: "auto", marginTop: 10, minHeight: 0, flex: 1, display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "1fr 1fr 1fr", gap: 4 }}>
            {list.map((b) => (
              <button
                key={b.index}
                type="button"
                onClick={() => { setBook(b.index); setVersePick(null); haptic("selection"); }}
                style={{ textAlign: "left", fontSize: 12.5, fontWeight: b.index === (currentBook ?? 0) - 1 ? 700 : 500, color: b.index === (currentBook ?? 0) - 1 ? "#8C2F51" : T.ink, background: b.index === (currentBook ?? 0) - 1 ? "#F6E3EB" : "transparent", border: 0, borderRadius: 8, padding: "9px 10px", cursor: "pointer", minHeight: 38 }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flex: "none" }}>
            {versePick ? (
              <button type="button" onClick={() => setVersePick(null)} style={{ fontSize: 12, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer", padding: 0 }}>‹ Chapters</button>
            ) : (
              <button type="button" onClick={() => { setBook(null); setVersePick(null); }} style={{ fontSize: 12, fontWeight: 600, color: "#8C2F51", background: "none", border: 0, cursor: "pointer", padding: 0 }}>‹ All books</button>
            )}
            <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 700, color: T.ink }}>{BOOKS[book]}{versePick ? ` ${versePick.ch}` : ""}</span>
          </div>
          {versePick ? (
            /* His field note: "our Book Chapter selection also ends there — it doesn't let me
               select a verse too, and sometimes we're not asked to reference verse 1 but verse
               30." The header hint has promised "Book, chapter, verse" all along. */
            <div style={{ overflowY: "auto", marginTop: 10, minHeight: 0, flex: 1 }}>
              <button
                type="button"
                onClick={() => go(book, versePick.ch)}
                style={{ display: "block", width: "100%", textAlign: "left", fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", border: 0, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
              >
                Read {BOOK_ABBREV[book]} {versePick.ch} →
              </button>
              {versePick.count === null && <div style={{ fontSize: 11, color: T.faint, marginTop: 10 }}>…</div>}
              {versePick.count !== null && versePick.count > 0 && (
                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: `repeat(${compact ? 5 : 7}, minmax(0, 1fr))`, gap: 5 }}>
                  {Array.from({ length: versePick.count }, (_, i) => i + 1).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => go(book, versePick.ch, v)}
                      style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, color: T.ink, background: T.chip, border: 0, borderRadius: 9, height: 36, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
              {versePick.count === 0 && <div style={{ fontSize: 11, color: T.faint, marginTop: 10 }}>Couldn&apos;t load the verses — &ldquo;Read {BOOK_ABBREV[book]} {versePick.ch}&rdquo; still works.</div>}
            </div>
          ) : (
          <div style={{ overflowY: "auto", marginTop: 10, minHeight: 0, flex: 1, display: "grid", gridTemplateColumns: `repeat(${compact ? 5 : 8}, minmax(0, 1fr))`, gap: 5 }}>
            {Array.from({ length: chapters }, (_, i) => i + 1).map((c) => {
              const on = book === (currentBook ?? 0) - 1 && c === currentChapter;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setVersePick({ ch: c, count: null }); haptic("selection"); }}
                  style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: on ? "#FFFFFF" : T.ink, background: on ? "#A63D63" : T.chip, border: 0, borderRadius: 9, height: 40, cursor: "pointer" }}
                >
                  {c}
                </button>
              );
            })}
          </div>
          )}
        </>
      )}
    </div>
  );
}
