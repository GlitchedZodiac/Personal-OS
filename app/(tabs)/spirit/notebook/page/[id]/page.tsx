"use client";

// 8e — a notebook page read back on the phone: rendered, not editable.
// Live refs still tap, replay still works, ink never edits. Writing waits
// for the iPad.

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBackTo } from "@/lib/nav-stack";
import { drawStrokes, fmtSeconds, pageHeightFor, type PageObject, type Stroke } from "@/lib/ink";
import { formatRef } from "@/lib/bible-refs";
import { PageObjects } from "@/components/spirit/desk/page-objects";
import { ReplayBar, type SegmentMeta, type TranscriptLine } from "@/components/spirit/desk/recording-control";

export default function PhonePageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const goBack = useBackTo("/spirit/notebook");
  const [page, setPage] = useState<{ id: string; title: string; subtitle: string | null; kind: string; strokes: Stroke[]; objects: PageObject[]; refs: number[]; refStart: number | null; refEnd: number | null; background: string } | null>(null);
  const [rec, setRec] = useState<{ id: string; durationSec: number; status: string; transcript: TranscriptLine[] } | null>(null);
  const [segments, setSegments] = useState<SegmentMeta[]>([]);
  const [seek, setSeek] = useState<number | null>(null);
  const [w, setW] = useState(360);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    fetch(`/api/spirit/ink/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      setPage({ ...d.page, strokes: (d.page.strokes ?? []) as Stroke[], objects: (d.page.objects ?? []) as PageObject[], refs: (d.page.refs ?? []) as number[] });
      if (d.recording) {
        setRec({ ...d.recording, transcript: (d.recording.transcript ?? []) as TranscriptLine[] });
        fetch(`/api/spirit/recordings/${d.recording.id}`).then((x) => (x.ok ? x.json() : null)).then((rr) => rr && setSegments(rr.segments ?? [])).catch(() => {});
      }
    }).catch(() => {});
  }, [id]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [page]);
  const scale = w / 800;
  const height = page ? pageHeightFor(page.strokes, page.objects) : 1120;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !page) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(800 * scale * dpr);
    c.height = Math.round(height * scale * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale * dpr, scale * dpr);
    drawStrokes(ctx, page.strokes);
  }, [page, scale, height]);
  const tap = (e: React.PointerEvent) => {
    if (!page || !rec) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    let best: Stroke | null = null, bd = 20 / scale;
    for (const s of page.strokes) {
      for (const p of s.pts) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (best && typeof best.recT === "number") setSeek(best.recT);
  };
  return (
    <div className="push-in min-h-screen bg-[#F2F1F2] pb-52">
      <div className="bg-white px-[14px] pb-[10px] pt-12" style={{ borderBottom: "1px solid #EDEBEE" }}>
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="tap-scale text-[15px] text-[#8C2F51]" aria-label="Back">‹</button>
          <span className="text-[13px] font-bold text-[#232227]" style={{ fontFamily: "var(--font-display)" }}>{page?.title ?? "…"}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="rounded-full bg-[#F2F1F2] px-2 py-[2.5px] text-[8.5px] font-bold text-[#66646C]">READ-ONLY</span>
          <span className="text-[9px] text-[#A9A7AE]">the pen lives on the iPad</span>
          {page?.subtitle && <span className="ml-auto text-[9px] text-[#A9A7AE]">{page.subtitle}</span>}
        </div>
        {page?.refs?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {page.refs.slice(0, 8).map((r) => (
              <button key={r} onClick={() => router.push(`/spirit/read?q=${encodeURIComponent(formatRef(r).replace(/:\d.*$/, ""))}`)} className="rounded-full border border-[#E9CFDC] bg-[#F6E3EB] px-2 py-[2px] text-[9.5px] font-semibold text-[#8C2F51]">{formatRef(r)}</button>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={wrapRef} onPointerUp={tap} style={{ position: "relative", width: "100%", height: height * scale, background: page?.background === "lined" ? `repeating-linear-gradient(#FFFDF9 0 ${31 * scale}px, #F0EAE4 ${31 * scale}px ${32 * scale}px)` : "#FFFDF9", backgroundImage: page?.background === "dots" ? "radial-gradient(#EBE6E1 1px, transparent 1.2px)" : undefined, backgroundSize: page?.background === "dots" ? `${16}px ${16}px` : undefined }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 800, height, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}>
          {page && <PageObjects objects={page.objects} />}
        </div>
        <canvas ref={canvasRef} style={{ position: "absolute", left: 0, top: 0, width: 800 * scale, height: height * scale, pointerEvents: "none" }} />
      </div>
      {rec && (
        <div className="mx-3 mt-3 overflow-hidden rounded-[14px] bg-white">
          <ReplayBar recordingId={rec.id} duration={rec.durationSec} segments={segments} transcript={rec.transcript} audioGone={rec.status === "audio_deleted" || segments.length === 0} seekTo={seek} status={rec.status} />
          <div className="px-4 pb-3 text-[9px] text-[#A9A7AE]">tap ink → replay works here too · {fmtSeconds(rec.durationSec)}</div>
        </div>
      )}
    </div>
  );
}
