"use client";

// The shelf, standalone: all notebooks → a notebook's pages (08a) → open
// the page on the desk.

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DISPLAY, cardShadow } from "@/components/spirit/desk/ui";
import { RecDot } from "@/components/spirit/desk/desk-icons";
import { fmtSeconds } from "@/lib/ink";
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
  const ctxFor = (p: Pg) => (p.kind === "sermon" ? "sermon" : p.kind === "worksheet" || p.kind === "study" ? "study" : "free");
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "40px 28px 24px", maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href={nbId ? "/spirit/notebooks" : "/home"} style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}><span style={{ fontSize: 17, color: "#232227", lineHeight: 1, marginTop: -2 }}>‹</span></Link>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "#96949B" }}>THE NOTEBOOK · {nb ? "PAGES" : "SHELF"}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: "#232227", letterSpacing: "-0.02em" }}>{nb ? nb.title : "All notebooks"}</div>
          </div>
        </div>
        {!nb && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 22 }}>
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
            {shown.map((p) => (
              <Link key={p.id} href={`/spirit/desk?ctx=${ctxFor(p)}&page=${p.id}`} style={{ background: "#FFFFFF", border: "1px solid #E4E2E6", borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
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
            ))}
            {shown.length === 0 && <div style={{ fontSize: 12, color: "#96949B" }}>No pages yet.</div>}
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
