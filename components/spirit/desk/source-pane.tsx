"use client";

// The Source pane (10c): Calvin beside the text he cites — any pane can
// host a public-domain source; citation chips in a teaching open it here
// when a Source pane exists; a selection in the source → Send to notes.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDesk, useDeskEvent } from "./desk-state";
import { PaneHeader, Chip, DISPLAY, SERIF, Kicker } from "./ui";

interface SourceDoc { key: string; title: string; meta: string; body: string }
interface SourceRow { key: string; title: string; meta: string; excerpt: string; cited: number }

export function SourcePane({ onKicker, initialKey }: { onKicker?: () => void; initialKey?: string | null }) {
  const { emit } = useDesk();
  const [list, setList] = useState<SourceRow[]>([]);
  const [doc, setDoc] = useState<SourceDoc | null>(null);
  const [selText, setSelText] = useState("");
  const open = (key: string) => {
    fetch(`/api/spirit/source?key=${encodeURIComponent(key)}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setDoc(d)).catch(() => {});
  };
  useEffect(() => {
    fetch("/api/spirit/source").then((r) => (r.ok ? r.json() : null)).then((d) => setList(d?.sources ?? [])).catch(() => {});
    if (initialKey) open(initialKey);
  }, [initialKey]);
  useDeskEvent((e) => {
    if (e.type === "open-source") open(e.key);
  }, []);
  const onUp = () => {
    const t = window.getSelection()?.toString().trim() ?? "";
    setSelText(t.length > 8 ? t : "");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#FFFFFF" }}>
      <PaneHeader kicker="SOURCE" onKicker={onKicker} title={doc ? doc.title : "the library"} right={doc ? <Chip tone="tint" style={{ fontSize: 7.5 }}>cited in today&apos;s teaching</Chip> : undefined} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "9px 12px" }} onPointerUp={onUp}>
        {!doc && (
          <>
            <Kicker>PUBLIC DOMAIN · STORED, NEVER RECALLED</Kicker>
            <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
              {list.map((s) => (
                <button key={s.key} type="button" onClick={() => open(s.key)} style={{ textAlign: "left", background: "#FAF9FA", border: "1px solid #EDEBEE", borderRadius: 11, padding: "9px 11px", cursor: "pointer" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#232227" }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: "#96949B", marginTop: 2 }}>{s.meta} · cited {s.cited}×</div>
                </button>
              ))}
              {list.length === 0 && <div style={{ fontSize: 11, color: "#A9A7AE" }}>the library is loading — or empty</div>}
            </div>
          </>
        )}
        {doc && (
          <>
            <div style={{ fontSize: 9.5, color: "#96949B" }}>{doc.meta}</div>
            <div style={{ fontFamily: SERIF, fontSize: 13.5, color: "#454349", lineHeight: 1.75, fontStyle: "italic", marginTop: 8, whiteSpace: "pre-wrap", userSelect: "text", WebkitUserSelect: "text" }}>{doc.body}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setDoc(null)} style={{ fontSize: 10, fontWeight: 600, color: "#66646C", border: "1px solid #E4E2E6", borderRadius: 99, padding: "3px 9px", cursor: "pointer", background: "#FFFFFF" }}>‹ the shelf</button>
              <Link href="/spirit/library" style={{ fontSize: 10, fontWeight: 600, color: "#8C2F51" }}>Open in Library</Link>
              <span style={{ flex: 1 }} />
              {selText && (
                <button type="button" onClick={() => { emit({ type: "send-to-notes", refStart: 0, refEnd: 0, label: doc.title, text: selText, source: "source" }); setSelText(""); }} style={{ fontSize: 10, fontWeight: 700, color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "4px 11px", border: 0, cursor: "pointer" }}>→ Send to notes</button>
              )}
              <span style={{ fontSize: 8.5, color: "#A9A7AE" }}>public domain · stored, never recalled</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
