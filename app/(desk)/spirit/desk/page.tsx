"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeskProvider } from "@/components/spirit/desk/desk-state";
import { DeskShell } from "@/components/spirit/desk/desk-shell";
import type { DeskContext } from "@/lib/desk-prefs";

// /spirit/desk?ctx=study|sermon|free&page=&q=&day=
// The desk resolves its context server-side (today's study, the active
// series' week) and remembers per device. Compact (< 700pt) falls back to
// the phone Spirit — the desk's seams never appear there (10b).

function DeskInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ctx = ((sp.get("ctx") as DeskContext | null) ?? "study") as DeskContext;
  const pageId = sp.get("page");
  const qParam = sp.get("q");
  const [ready, setReady] = useState<null | { title: string; chip: string | null; mainQ: string | null; refQ: string | null; dayId: string | null; free: boolean; layerContext: { key: string; label: string } | null }>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    (async () => {
      if (ctx === "sermon") {
        const r = await fetch("/api/spirit/sermon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open" }) }).catch(() => null);
        const d = r?.ok ? await r.json() : null;
        const passage: string | undefined = d?.week?.passageRef;
        const q = qParam ?? (passage ? passage.split(/[-–,;]/)[0].trim().replace(/:\d.*$/, "") : null);
        setReady({
          title: d?.series ? `Sunday — ${d.series.title.split("—")[0].trim()}` : "Sunday",
          chip: d?.series ? `wk ${d.series.currentWeek}${d.series.expectedWeeks ? ` of ≈${d.series.expectedWeeks}` : ""}` : null,
          mainQ: q,
          refQ: q,
          dayId: null,
          free: true,
          layerContext: d?.series ? { key: `sermon:${d.series.id}:${d.series.currentWeek}`, label: `Sermon · wk ${d.series.currentWeek}` } : null,
        });
        return;
      }
      if (ctx === "free") {
        let q = qParam;
        if (!q) {
          try {
            q = localStorage.getItem("spirit-last-free-read");
          } catch {}
        }
        setReady({ title: "Free reading", chip: null, mainQ: q ?? "John 1", refQ: null, dayId: null, free: true, layerContext: null });
        return;
      }
      const r = await fetch("/api/spirit/today").catch(() => null);
      const d = r?.ok ? await r.json() : null;
      const day = d?.day ?? null;
      const q = qParam ?? d?.assignment?.segments?.[0]?.chapterQuery ?? "John 1";
      setReady({
        title: d?.term ? `The study — Term ${d.term.orderIndex} · ${d.term.title}` : "The study",
        chip: d?.progress && day ? `study ${d.progress.done + 1} of ${d.progress.target} · wk ${day.weekIndex}` : null,
        mainQ: q,
        refQ: null,
        dayId: day?.id ?? null,
        free: false,
        layerContext: day ? { key: `study:${day.id}`, label: `This study · wk ${day.weekIndex}` } : null,
      });
    })();
  }, [ctx, qParam]);

  if (compact) {
    // the phone app, untouched
    const target = ctx === "sermon" ? "/spirit/church" : ctx === "free" ? "/spirit/read?free=1" : "/spirit/study";
    return (
      <div style={{ padding: 24, fontFamily: "var(--font-body)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.16em", fontWeight: 600, color: "#96949B" }}>COMPACT · THE PHONE LAYOUT</div>
        <p style={{ fontSize: 13, color: "#454349", marginTop: 8 }}>Below ~500 pt the desk steps aside. Opening the phone screen…</p>
        <button type="button" onClick={() => router.replace(target)} style={{ marginTop: 12, background: "#A63D63", color: "#fff", borderRadius: 10, padding: "10px 16px", border: 0, fontWeight: 600 }}>Open</button>
        <RedirectOnce to={target} />
      </div>
    );
  }
  if (!ready) return <div style={{ padding: 24, fontSize: 12, color: "#96949B" }}>Setting the desk…</div>;
  return (
    <DeskProvider initialContext={ctx}>
      <DeskShell
        context={ctx}
        title={ready.title}
        chip={ready.chip}
        mainQ={ready.mainQ}
        refQ={ready.refQ}
        free={ready.free}
        dayId={ready.dayId}
        pageId={pageId}
        layerContext={ready.layerContext}
        onTakeNotes={() => router.push("/spirit/desk?ctx=sermon")}
      />
    </DeskProvider>
  );
}

function RedirectOnce({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.replace(to), 600);
    return () => clearTimeout(t);
  }, [router, to]);
  return null;
}

export default function DeskPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontSize: 12, color: "#96949B" }}>Setting the desk…</div>}>
      <DeskInner />
    </Suspense>
  );
}
