"use client";

// The shelf, standalone: all notebooks → a notebook's pages (08a) → open
// the page on the desk.

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DISPLAY, cardShadow } from "@/components/spirit/desk/ui";
import { RecDot } from "@/components/spirit/desk/desk-icons";
import { fmtSeconds } from "@/lib/ink";
import { askConfirm } from "@/components/spirit/desk/dialog";
import { haptic } from "@/lib/haptics";
import { formatRef } from "@/lib/bible-refs";

interface Nb { id: string; title: string; kind: string; accent: string; pageCount: number; recordingCount: number }
interface Pg { id: string; kind: string; title: string; subtitle: string | null; thumbnail: string | null; recordingId: string | null; transcribedAt: string | null; updatedAt: string; refStart: number | null; refEnd: number | null; recording: { durationSec: number; status: string } | null; status: string }

function Inner() {
  const sp = useSearchParams();
  const nbId = sp.get("nb");
  const [nbs, setNbs] = useState<Nb[]>([]);
  const [pages, setPages] = useState<Pg[]>([]);
  useEffect(() => {
    fetch("/api/spirit/notebooks").then((r) => (r.ok ? r.json() : null)).then((d) => setNbs(d?.notebooks ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!nbId) return;
    fetch(`/api/spirit/notebooks/${nbId}`).then((r) => (r.ok ? r.json() : null)).then((d) => setPages(d?.pages ?? [])).catch(() => {});
  }, [nbId]);
  const nb = nbs.find((n) => n.id === nbId) ?? null;
  const shown = nb ? pages : [];
  const router = useRouter();
  const reload = () => nbId && fetch(`/api/spirit/notebooks/${nbId}`).then((r) => (r.ok ? r.json() : null)).then((d) => setPages(d?.pages ?? [])).catch(() => {});
  const newPage = async () => {
    if (!nb) return;
    if (nb.kind === "sermons") {
      const r = await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", fresh: true }) });
      if (r.ok) router.push(`/spirit/desk?ctx=sermon&page=${(await r.json()).page.id}`);
      return;
    }
    const r = await fetch("/api/spirit/ink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "free", notebookId: nb.id, title: `${nb.title} · page ${nb.pageCount + 1}`, objects: [] }) });
    if (r.ok) router.push(`/spirit/desk?ctx=free&page=${(await r.json()).page.id}`);
  };
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const deletePages = async (ids: string[]) => {
    if (!ids.length) return;
    const titles = pages.filter((p) => ids.includes(p.id)).map((p) => p.title || p.kind);
    const ok = await askConfirm({
      title: ids.length === 1 ? `Delete "${titles[0]}"?` : `Delete ${ids.length} pages?`,
      body: ids.length === 1 ? "Its ink is gone for good. A recording attached to it stays in the library." : `${titles.slice(0, 3).join(" · ")}${ids.length > 3 ? ` · +${ids.length - 3} more` : ""}. Their ink is gone for good; recordings stay in the library.`,
      confirmLabel: ids.length === 1 ? "Delete page" : `Delete ${ids.length} pages`,
      danger: true,
    });
    if (!ok) return;
    haptic("warning");
    await Promise.all(ids.map((id) => fetch(`/api/spirit/ink/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    setSelectMode(false);
    await reload();
  };
  const deletePage = (p: Pg) => deletePages([p.id]);
  const ctxFor = (p: Pg) => (p.kind === "sermon" ? "sermon" : p.kind === "worksheet" || p.kind === "study" ? "study" : "free");
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "calc(40px + env(safe-area-inset-top, 0px)) 28px 24px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href={nbId ? "/spirit/notebooks" : "/home"} style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}><span style={{ fontSize: 17, color: "#232227", lineHeight: 1, marginTop: -2 }}>‹</span></Link>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "#96949B" }}>THE NOTEBOOK · {nb ? "PAGES" : "SHELF"}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: "#232227", letterSpacing: "-0.02em" }}>{nb ? nb.title : "All notebooks"}</div>
          </div>
          <span style={{ flex: 1 }} />
          {nb && selectMode && selected.size > 0 && (
            <button type="button" onClick={() => void deletePages(Array.from(selected))} style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#FFFFFF", background: "#B4533F", borderRadius: 99, padding: "9px 16px", border: 0, cursor: "pointer", marginRight: 8 }}>Delete {selected.size}</button>
          )}
          {nb && shown.length > 0 && (
            <button type="button" onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); haptic("selection"); }} style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: selectMode ? "#FFFFFF" : "#454349", background: selectMode ? "#232227" : "#FFFFFF", border: selectMode ? 0 : "1px solid #E4E2E6", borderRadius: 99, padding: "9px 16px", cursor: "pointer", marginRight: 8 }}>{selectMode ? "Done" : "Select"}</button>
          )}
          {nb && !selectMode && (
            <button type="button" onClick={() => void newPage()} style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "9px 16px", border: 0, cursor: "pointer" }}>+ New {nb.kind === "sermons" ? "sermon " : ""}page</button>
          )}
        </div>
        {!nb && (
          <div className="desk-stagger" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 22 }}>
            {nbs.map((n) => (
              <Link key={n.id} href={`/spirit/notebooks?nb=${n.id}`} style={{ background: "#FFFFFF", border: "1px solid #E4E2E6", borderLeft: `4px solid ${n.accent}`, borderRadius: 12, padding: "14px 16px", textDecoration: "none", boxShadow: cardShadow }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: "#232227" }}>{n.title}</span>{n.recordingCount > 0 && <RecDot size={6} live={false} />}</div>
                <div style={{ fontSize: 10.5, color: "#96949B", marginTop: 3 }}>{n.pageCount} page{n.pageCount === 1 ? "" : "s"}{n.recordingCount ? ` · ${n.recordingCount} recording${n.recordingCount === 1 ? "" : "s"}` : ""}</div>
              </Link>
            ))}
          </div>
        )}
        {nb && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12, marginTop: 22 }}>
            {shown.map((p, idx) => (
              <div key={p.id} className="desk-lift" style={{ position: "relative", animation: "deskStaggerIn .42s cubic-bezier(.2,.9,.25,1) both", animationDelay: `${Math.min(idx, 9) * 40}ms` }}>
              {selectMode ? (
                <span aria-hidden style={{ position: "absolute", top: 6, left: 7, zIndex: 2, width: 24, height: 24, borderRadius: "50%", background: selected.has(p.id) ? "#A63D63" : "rgba(255,255,255,0.92)", border: `1.5px solid ${selected.has(p.id) ? "#A63D63" : "#C9C7CD"}`, color: "#FFFFFF", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", transition: "background .18s, border-color .18s" }}>{selected.has(p.id) ? "✓" : ""}</span>
              ) : (
                <button type="button" aria-label="Delete page" onClick={() => void deletePage(p)} style={{ position: "absolute", top: 6, left: 7, zIndex: 2, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.92)", border: "1px solid #E4E2E6", color: "#B4533F", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              )}
              <Link href={selectMode ? "#" : `/spirit/desk?ctx=${ctxFor(p)}&page=${p.id}`} onClick={(e) => { if (selectMode) { e.preventDefault(); toggleSelect(p.id); } }} style={{ display: "block", background: "#FFFFFF", border: `1px solid ${selectMode && selected.has(p.id) ? "#A63D63" : "#E4E2E6"}`, boxShadow: selectMode && selected.has(p.id) ? "inset 0 0 0 1px #A63D63" : "none", borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
                <div style={{ height: 110, background: "#FFFDF9", backgroundImage: "radial-gradient(#EBE6E1 1px, transparent 1.2px)", backgroundSize: "14px 14px", position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />}
                  {p.recordingId && <span style={{ position: "absolute", top: 6, right: 7 }}><RecDot size={7} live={false} /></span>}
                </div>
                <div style={{ padding: "8px 10px 9px", borderTop: "1px solid #F2F1F2" }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title || p.kind}</div>
                  <div style={{ fontSize: 9.5, color: "#96949B", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.refStart ? formatRef(p.refStart, p.refEnd ?? p.refStart) : p.subtitle ?? new Date(p.updatedAt).toLocaleDateString()}{p.recording ? ` · ${fmtSeconds(p.recording.durationSec)} rec` : ""}{p.transcribedAt ? " · transcribed ✓" : ""}{p.status === "submitted" ? " · submitted ✓" : ""}
                  </div>
                </div>
              </Link>
              </div>
            ))}
            <button type="button" onClick={() => void newPage()} style={{ border: "1.5px dashed #D9D7DC", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", minHeight: 150, background: "transparent" }}>
              <span style={{ fontSize: 22, color: "#96949B", lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 11, color: "#96949B" }}>new {nb?.kind === "sermons" ? "sermon " : ""}page</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotebooksPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
