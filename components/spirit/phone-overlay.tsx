"use client";

// 5d — the overlay on the phone: read-only, toggleable. The chapter's ink
// (every layer) renders over the phone Reader, anchored per verse exactly
// as on the iPad; INK ON/OFF in the corner; the pen lives on the iPad.

import { useCallback, useEffect, useRef, useState } from "react";
import { DeskProvider } from "@/components/spirit/desk/desk-state";
import { InkCanvas } from "@/components/spirit/desk/ink-canvas";
import { EyeIcon } from "@/components/spirit/desk/desk-icons";
import type { Stroke } from "@/lib/ink";

function Host({ children, chapterKey }: { children: React.ReactNode; chapterKey: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [on, setOn] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!chapterKey) return;
    fetch(`/api/spirit/ink?kind=overlay&chapterKey=${chapterKey}&full=1&take=10`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const all: Stroke[] = [];
      for (const p of d?.pages ?? []) all.push(...((p.strokes ?? []) as Stroke[]));
      setStrokes(all);
    }).catch(() => {});
  }, [chapterKey]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.scrollHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.scrollHeight });
    return () => ro.disconnect();
  }, []);
  const offsetFor = useCallback((s: Stroke) => {
    if (!s.anchor || !ref.current) return null;
    const el = ref.current.querySelector<HTMLElement>(`#v-${s.anchor.ref}`);
    if (!el) return null;
    const c = ref.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const p0 = s.pts[0];
    // the phone column is narrower: keep the verse-relative offset but clamp inside the column
    const dx = Math.min(s.anchor.dx, Math.max(0, c.width - 40));
    return { x: r.left - c.left + dx - p0.x, y: r.top - c.top + s.anchor.dy - p0.y };
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {children}
      {strokes.length > 0 && (
        <>
          {on && size.w > 0 && (
            <InkCanvas strokes={strokes} width={size.w} height={size.h} scale={1} enabled={false} background="none" offsetFor={offsetFor} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 5 }} />
          )}
          <button type="button" onClick={() => setOn((v) => !v)} style={{ position: "fixed", right: 14, top: 14, zIndex: 50, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 8.5, fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "4px 9px", border: 0 }}>
            <EyeIcon size={10} color="#8C2F51" strokeWidth={2} /> INK {on ? "ON" : "OFF"}
          </button>
        </>
      )}
    </div>
  );
}

export function PhoneOverlayHost({ children, chapterKey }: { children: React.ReactNode; chapterKey: number | null }) {
  return (
    <DeskProvider initialContext="free">
      <Host chapterKey={chapterKey}>{children}</Host>
    </DeskProvider>
  );
}
