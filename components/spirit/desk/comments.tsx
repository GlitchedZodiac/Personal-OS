"use client";

// V3 §1 — the comment model's UI: the offer dot, the bubble (ink + type in one
// thread), the collapsed chips in the 32pt rail, and the thread view. A note is
// ABOUT something: every bubble anchors to a mark on words or to a verse range;
// the margin is retired as a writing surface.
//
// The bubble NEVER transforms (motion law): it clips + fades from the mark's
// edge. Ink inside a bubble is drawn 1:1 on its own little canvas and stored on
// the entry itself. Nothing persists until there is content — the dot proposes,
// his first DONE confirms (the confirmation-dock rule, kept).

import { useEffect, useRef, useState } from "react";
import { InkCanvas } from "./ink-canvas";
import { ArmTwice, E_SWIFT, ringBloom } from "./patterns";
import { DISPLAY } from "./ui";
import { formatRef } from "@/lib/bible-refs";
import type { Stroke } from "@/lib/ink";
import type { CommentEntry } from "@/lib/spirit-comments";

export interface SpiritCommentRow {
  id: string;
  refStart: number;
  refEnd: number | null;
  wordStart: number | null;
  wordEnd: number | null;
  anchorText: string | null;
  markKind: string | null;
  markStrokeIds: string[] | null;
  entries: CommentEntry[];
}

/** a comment being born — nothing saved yet; DONE with content is what persists */
export interface CommentDraft {
  refStart: number;
  refEnd: number | null;
  wordStart: number | null;
  wordEnd: number | null;
  anchorText: string | null;
  markKind: "circle" | "underline" | null;
  markStrokeIds: string[];
  /** ink adopted from "just start writing beside it" — becomes the first entry */
  seedStrokes?: Stroke[];
}

export const newEntryId = () => `e-${Math.random().toString(36).slice(2, 9)}`;

const INK_H_MIN = 140; // §1 — he writes big with heavy ink

/** one thread entry, read-only rendering + edit/delete controls */
function EntryRow({ entry, onEdit, onDelete }: { entry: CommentEntry; onEdit: () => void; onDelete: () => void }) {
  const strokes = (entry.strokes ?? []) as Stroke[];
  // size the ink preview to its content
  let w = 300, h = 60;
  if (entry.kind === "ink" && strokes.length) {
    let maxX = 0, maxY = 0;
    for (const st of strokes) for (const p of st.pts) { if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
    w = Math.max(120, Math.ceil(maxX + 12));
    h = Math.max(40, Math.ceil(maxY + 12));
  }
  return (
    <div style={{ borderTop: "1px solid #F2F1F2", padding: "8px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.08em", fontWeight: 700, color: "#A9A7AE" }}>
          {new Date(entry.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {entry.kind === "ink" ? "INK" : "TYPED"}
        </span>
        <span style={{ flex: 1 }} />
        {entry.kind === "typed" && (
          <button type="button" title="Edit in place" onClick={onEdit} style={{ width: 26, height: 26, borderRadius: 8, border: 0, background: "transparent", color: "#96949B", fontSize: 11, cursor: "pointer" }}>✎</button>
        )}
        <ArmTwice onConfirm={onDelete} title="Delete this entry" armedTitle="tap again" style={{ width: 26, height: 26, borderRadius: 8, color: "#96949B", fontSize: 11 }}>
          ✕
        </ArmTwice>
      </div>
      {entry.kind === "typed" ? (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#232227", whiteSpace: "pre-wrap", marginTop: 2 }}>{entry.text}</div>
      ) : (
        <div style={{ marginTop: 2, maxWidth: "100%", overflow: "hidden", borderRadius: 8 }}>
          <InkCanvas strokes={strokes} width={w} height={h} scale={Math.min(1, 300 / w)} enabled={false} background="none" style={{ pointerEvents: "none" }} />
        </div>
      )}
    </div>
  );
}

/** the ≥140pt big-ink box with the corner drag-grip that grows it downward */
function InkComposer({ width, strokes, onChange, height, onHeight }: { width: number; strokes: Stroke[]; onChange: (s: Stroke[]) => void; height: number; onHeight: (h: number) => void }) {
  const growing = useRef<{ y0: number; h0: number } | null>(null);
  return (
    <div style={{ position: "relative", border: "1.5px dashed #E9CFDC", borderRadius: 10, overflow: "hidden", background: "#FFFDF9" }}>
      <InkCanvas
        strokes={strokes}
        onStrokesChange={(next) => onChange(next)}
        width={width}
        height={height}
        scale={1}
        enabled
        fingerDraws
        background="none"
      />
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          growing.current = { y0: e.clientY, h0: height };
          const mv = (ev: PointerEvent) => {
            if (!growing.current) return;
            onHeight(Math.max(INK_H_MIN, Math.round(growing.current.h0 + (ev.clientY - growing.current.y0))));
          };
          const up = () => {
            growing.current = null;
            window.removeEventListener("pointermove", mv);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", mv);
          window.addEventListener("pointerup", up);
        }}
        title="Drag to grow the writing room"
        style={{ position: "absolute", right: 2, bottom: 2, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "ns-resize", color: "#C9C7CD", touchAction: "none" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="9" cy="9" r="1.2" /><circle cx="9" cy="4.5" r="1.2" /><circle cx="4.5" cy="9" r="1.2" /></svg>
      </div>
    </div>
  );
}

export function CommentBubble({
  anchorLabel,
  comment,
  draft,
  width,
  switcher,
  onSave,
  onDelete,
  onClose,
}: {
  anchorLabel: string;
  /** an existing thread — or null when this is a draft being born */
  comment: SpiritCommentRow | null;
  draft: CommentDraft | null;
  width: number;
  /** "‹ 2 of 3 ›" when a counted chip opened this — the pane builds it */
  switcher?: React.ReactNode;
  /** persist the whole thread (create on first save) */
  onSave: (entries: CommentEntry[]) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const entries = comment?.entries ?? [];
  // §1 — two input modes in ONE bubble; ink is the default (the pencil keeps working)
  const [mode, setMode] = useState<"ink" | "type" | null>(entries.length ? null : "ink");
  const [inkStrokes, setInkStrokes] = useState<Stroke[]>(draft?.seedStrokes ?? []);
  const [inkH, setInkH] = useState(() => {
    // adopted handwriting sizes its own room
    let maxY = 0;
    for (const st of draft?.seedStrokes ?? []) for (const p of st.pts) if (p.y > maxY) maxY = p.y;
    return Math.max(INK_H_MIN, Math.ceil(maxY + 30));
  });
  const [typed, setTyped] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const commitComposer = (): CommentEntry | null => {
    if (mode === "ink" && inkStrokes.length) {
      return { id: newEntryId(), kind: "ink", strokes: inkStrokes as unknown as unknown[], at: Date.now() };
    }
    if (mode === "type" && typed.trim()) {
      return { id: newEntryId(), kind: "typed", text: typed.trim(), at: Date.now() };
    }
    return null;
  };
  const done = () => {
    const add = commitComposer();
    const next = add ? [...entries, add] : entries;
    if (!next.length) {
      onClose(); // nothing written — nothing persists; the mark stays plain ink
      return;
    }
    onSave(next);
    onClose();
  };

  return (
    <>
    {/* §1 — tap-out collapses like DONE: content saves, an empty draft evaporates */}
    <div
      onPointerDown={(e) => { e.preventDefault(); ringBloom(e.clientX, e.clientY); done(); }}
      style={{ position: "fixed", inset: 0, zIndex: 94 }}
    />
    <div
      data-comment-bubble
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width,
        background: "#FFFFFF",
        border: "1px solid #EDE7E0",
        borderRadius: 14,
        boxShadow: "0 16px 46px rgba(20,15,18,0.22)",
        position: "relative",
        zIndex: 95,
        padding: "10px 12px",
        animation: `deskMenuIn .2s ${E_SWIFT} both`,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 8.5, letterSpacing: "0.1em", fontWeight: 700, color: "#8C2F51" }}>
          {anchorLabel.toUpperCase()}
        </span>
        {switcher}
        <span style={{ flex: 1 }} />
        {onDelete && entries.length > 0 && (
          <ArmTwice
            onConfirm={onDelete}
            title="Delete this comment"
            armedTitle="tap again — the mark stays as ink"
            style={{ height: 24, padding: "0 9px", borderRadius: 99, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: "#B4533F", background: "#FFFFFF", border: "1px solid #EDEBEE" }}
            armedChildren={<>DELETE?</>}
          >
            DELETE
          </ArmTwice>
        )}
        <button type="button" onClick={done} style={{ height: 24, padding: "0 11px", borderRadius: 99, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>
          DONE
        </button>
      </div>

      {/* the thread — newest last */}
      <div style={{ marginTop: 6, maxHeight: 320, overflowY: "auto" }}>
        {entries.map((e) =>
          editing === e.id ? (
            <div key={e.id} style={{ borderTop: "1px solid #F2F1F2", padding: "8px 0 6px" }}>
              <textarea
                autoFocus
                value={editText}
                onChange={(ev) => setEditText(ev.target.value)}
                style={{ width: "100%", minHeight: 64, fontSize: 12.5, lineHeight: 1.6, color: "#232227", border: "1.5px solid #A63D63", borderRadius: 9, padding: 8, boxSizing: "border-box", fontFamily: "var(--font-body)", resize: "vertical", background: "#FFFFFF" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 5 }}>
                <button type="button" onClick={() => setEditing(null)} style={{ fontSize: 10, color: "#A9A7AE", background: "none", border: 0, cursor: "pointer" }}>cancel</button>
                <button
                  type="button"
                  onClick={() => {
                    // edit-in-place keeps the entry's place AND timestamp (§1)
                    onSave(entries.map((x) => (x.id === e.id ? { ...x, text: editText } : x)));
                    setEditing(null);
                  }}
                  style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "4px 12px", border: 0, cursor: "pointer" }}
                >
                  DONE
                </button>
              </div>
            </div>
          ) : (
            <EntryRow
              key={e.id}
              entry={e}
              onEdit={() => { setEditing(e.id); setEditText(e.text ?? ""); }}
              onDelete={() => {
                const next = entries.filter((x) => x.id !== e.id);
                if (!next.length && onDelete) onDelete(); // deleting the last entry removes the chip
                else onSave(next);
              }}
            />
          ),
        )}
      </div>

      {/* the composer — ✎ INK and Aa TYPE land in the same thread */}
      {mode === "ink" && (
        <div style={{ marginTop: 8 }}>
          <InkComposer width={width - 26} strokes={inkStrokes} onChange={setInkStrokes} height={inkH} onHeight={setInkH} />
        </div>
      )}
      {mode === "type" && (
        <textarea
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="a note about these words…"
          style={{ width: "100%", minHeight: 84, marginTop: 8, fontSize: 12.5, lineHeight: 1.6, color: "#232227", border: "1px solid #E4E2E6", borderRadius: 10, padding: 9, boxSizing: "border-box", fontFamily: "var(--font-body)", resize: "vertical", background: "#FFFDF9" }}
        />
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => {
            if (mode && mode !== "ink") {
              const add = commitComposer();
              if (add) { onSave([...entries, add]); setTyped(""); }
            }
            setMode("ink");
          }}
          style={{ flex: 1, height: 32, borderRadius: 9, fontSize: 10.5, fontWeight: 700, fontFamily: DISPLAY, cursor: "pointer", border: mode === "ink" ? "1.5px solid #A63D63" : "1px solid #E4E2E6", background: mode === "ink" ? "#F6E3EB" : "#FFFFFF", color: mode === "ink" ? "#8C2F51" : "#66646C" }}
        >
          ✎ {mode === "ink" ? "Ink" : "Add ink"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (mode && mode !== "type") {
              const add = commitComposer();
              if (add) { onSave([...entries, add]); setInkStrokes([]); }
            }
            setMode("type");
          }}
          style={{ flex: 1, height: 32, borderRadius: 9, fontSize: 10.5, fontWeight: 700, fontFamily: DISPLAY, cursor: "pointer", border: mode === "type" ? "1.5px solid #A63D63" : "1px solid #E4E2E6", background: mode === "type" ? "#F6E3EB" : "#FFFFFF", color: mode === "type" ? "#8C2F51" : "#66646C" }}
        >
          Aa {mode === "type" ? "Typing" : "Add a note"}
        </button>
      </div>
    </div>
    </>
  );
}

/** the collapsed state: chips in the rail, one cell per verse, counted when several */
export function CommentChips({
  perVerse,
  positions,
  railLeft,
  onOpen,
}: {
  /** refStart → comments on that verse */
  perVerse: Map<number, SpiritCommentRow[]>;
  /** refStart → y (content coords, the verse's top) */
  positions: Map<number, number>;
  railLeft: number;
  onOpen: (refStart: number) => void;
}) {
  // stack chips down the gutter so adjacent verses can never overlap (§1)
  const sorted = Array.from(perVerse.entries())
    .map(([ref, list]) => ({ ref, list, y: positions.get(ref) }))
    .filter((r): r is { ref: number; list: SpiritCommentRow[]; y: number } => typeof r.y === "number")
    .sort((a, b) => a.y - b.y);
  const rows: { ref: number; list: SpiritCommentRow[]; top: number }[] = [];
  for (const r of sorted) {
    const prev = rows[rows.length - 1];
    rows.push({ ref: r.ref, list: r.list, top: Math.max(r.y + 2, prev ? prev.top + 27 : -Infinity) });
  }
  return (
    <>
      {rows.map(({ ref, list, top }) => {
        const wordAnchored = list.some((c) => c.wordStart !== null);
        return (
          <button
            key={ref}
            type="button"
            title={`${list.length} comment${list.length === 1 ? "" : "s"} on ${formatRef(ref)}`}
            onClick={(e) => { e.stopPropagation(); onOpen(ref); }}
            className="desk-chip-pop"
            style={{
              position: "absolute",
              left: railLeft,
              top,
              width: 24,
              height: 24,
              borderRadius: 9,
              border: "1px solid #E9CFDC",
              background: "#F6E3EB",
              color: "#8C2F51",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 7,
              padding: 0,
            }}
          >
            {list.length > 1 ? (
              <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: DISPLAY }}>{list.length}</span>
            ) : wordAnchored ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17 3.5a2.4 2.4 0 0 1 3.4 3.4L8 19.3 3.6 20.4 4.7 16Z" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.9-5.6a8 8 0 0 1-.9-3.9A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z" />
              </svg>
            )}
          </button>
        );
      })}
    </>
  );
}

/** the offer dot — blooms at the mark's rim after the dwell; dies quietly */
export function OfferDot({ x, y, onTake }: { x: number; y: number; onTake: () => void }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3900); // fade just before the 4s decay
    return () => clearTimeout(t);
  }, []);
  return (
    <button
      type="button"
      aria-label="Comment on this mark"
      onClick={(e) => { e.stopPropagation(); onTake(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: x - 11,
        top: y - 11,
        width: 22, // an 8px dot with a real 22px target
        height: 22,
        borderRadius: "50%",
        border: 0,
        background: "transparent",
        cursor: "pointer",
        zIndex: 8,
        padding: 0,
        opacity: visible ? 1 : 0,
        transition: "opacity .3s ease",
      }}
    >
      <span className="desk-pulse" style={{ display: "block", width: 8, height: 8, margin: "0 auto", borderRadius: "50%", background: "#A63D63" }} />
    </button>
  );
}
