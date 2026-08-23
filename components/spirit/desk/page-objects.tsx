"use client";

// Page objects (03/04/09): header, section heads, prompts with lined areas,
// reference cards, typed blocks, photos, the Question-step answer box, the
// compare block. Rendered in page units inside the canvas's scaled layer —
// non-interactive there; taps route through the canvas and hit-test here.

import { useEffect, useState } from "react";
import type { PageObject } from "@/lib/ink";
import { RefCard, type RefCardData } from "./ref-card";
import { SectionHead, DISPLAY, SERIF } from "./ui";
import { Diamond, CheckIcon } from "./desk-icons";

export function objectRect(o: PageObject): { x: number; y: number; w: number; h: number } {
  const w = o.w ?? (o.type === "refcard" ? 196 : o.type === "image" ? 150 : 752);
  const h = o.h ?? (o.type === "refcard" ? 76 : o.type === "image" ? 120 : o.type === "section" ? 18 : o.type === "text" ? 60 : 80);
  return { x: o.x, y: o.y, w, h };
}

export function hitObject(objects: PageObject[], x: number, y: number): PageObject | null {
  // top-most last
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    const r = objectRect(o);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return o;
  }
  return null;
}

export function PageHeaderObject({ o }: { o: PageObject }) {
  const d = o.data as { kicker?: string; title?: string; chips?: string[]; aim?: string | null; editable?: boolean };
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: o.w ?? 752 }}>
      <div style={{ fontSize: 11.5, letterSpacing: "0.13em", fontWeight: 700, color: "#A9A7AE" }}>{d.kicker}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 5, flexWrap: "wrap" }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: "#232227", letterSpacing: "-0.01em" }}>{d.title}</span>
        {(d.chips ?? []).map((c) => (
          <span key={c} style={{ fontSize: 13, fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "2.5px 9px" }}>{c}</span>
        ))}
        {d.editable && <span style={{ fontSize: 14.5, color: "#C9C7CD" }}>✎</span>}
      </div>
      {d.aim && <div style={{ fontSize: 13.5, color: "#96949B", marginTop: 3 }}>{d.aim}</div>}
      <div style={{ height: 1, background: "#EDE7E0", marginTop: 12 }} />
    </div>
  );
}

export function SectionObject({ o }: { o: PageObject }) {
  const d = o.data as { label: string };
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, display: "flex", alignItems: "center", gap: 10 }}>
      <SectionHead label={d.label} />
      {/* "make room": pushes everything below this heading down. It sits BESIDE the heading —
          never out in the writing area, where it used to catch the start of a stroke. */}
      <span data-section-grow={o.id} style={{ fontSize: 9.5, letterSpacing: "0.06em", fontWeight: 700, color: "#C4B4BC", border: "1px dashed #EADFE4", borderRadius: 99, padding: "1.5px 8px", whiteSpace: "nowrap", pointerEvents: "auto" }}>+ room</span>
    </div>
  );
}

export function PromptObject({ o, onChip }: { o: PageObject; onChip?: (ref: string) => void }) {
  const d = o.data as { label?: string | null; text?: string | null; lined?: boolean; lines?: number; sketch?: boolean; chip?: string | null; chipRef?: string | null; field?: boolean; value?: string };
  const r = objectRect(o);
  const linesH = d.lined ? (d.lines ?? 3) * 32 + 8 : 0;
  void onChip;
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: r.w }}>
      {d.label && <div style={{ fontSize: 11, letterSpacing: "0.13em", fontWeight: 700, color: "#B7A2AC" }}>{d.label}</div>}
      {(d.text || d.chip) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: d.label ? 4 : 0 }}>
          {d.chip && (
            <span data-chip-ref={d.chipRef ?? d.chip} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "3px 10px" }}>
              {d.chip} · opens in the Bible pane →
            </span>
          )}
          {d.text && <span style={{ fontFamily: DISPLAY, fontSize: 17.5, fontWeight: 600, color: "#232227", lineHeight: 1.45 }}>{d.text}</span>}
        </div>
      )}
      {d.field && (
        <div style={{ marginTop: 4, height: 34, borderRadius: 9, border: "1px solid #EDEBEE", background: "rgba(255,255,255,0.6)", fontSize: 14.5, color: d.value ? "#454349" : "#B8B2AB", padding: "8px 10px", boxSizing: "border-box" }}>
          {d.value ?? "tap to type · or write below"}
        </div>
      )}
      {d.lined && (
        <div style={{ marginTop: 6, height: linesH, borderRadius: 9, background: "repeating-linear-gradient(rgba(255,253,249,0) 0 31px, #F0EAE4 31px 32px)" }} />
      )}
      {d.sketch && (
        <div style={{ marginTop: 8, border: "1.5px dashed #E4DED6", borderRadius: 11, padding: "9px 12px", minHeight: 180, boxSizing: "border-box" }}>
          <span style={{ fontSize: 10.5, letterSpacing: "0.12em", fontWeight: 700, color: "#C9C2B9" }}>{d.label ?? "SKETCH — A MAP, A TIMELINE, A FLOOR PLAN"}</span>
        </div>
      )}
    </div>
  );
}

export function RefCardObject({ o, fresh, selected }: { o: PageObject; fresh?: boolean; selected?: boolean }) {
  const d = o.data as unknown as RefCardData;
  return (
    <div className={fresh ? "desk-card-drop" : undefined} data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, transformOrigin: "left top" }}>
      <RefCard data={d} width={o.w ?? 196} fresh={fresh} selected={selected} />
    </div>
  );
}

export function TextObject({ o, editing }: { o: PageObject; editing?: boolean }) {
  const d = o.data as { text?: string; pending?: boolean; label?: string };
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: o.w ?? 420, background: "#FFFFFF", border: `1px solid ${editing ? "#A63D63" : "#EDEBEE"}`, borderRadius: 11, padding: "10px 12px", boxShadow: "0 1px 6px rgba(35,34,39,0.04)", boxSizing: "border-box", minHeight: 44 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, color: "#C9C7CD" }}>{d.label ?? (d.pending ? "DICTATED — TAP TO KEEP" : "TYPED")}</div>
      <div style={{ fontSize: 17, color: d.pending ? "#B07A93" : "#454349", lineHeight: 1.6, marginTop: 4, whiteSpace: "pre-wrap" }}>{d.text || (editing ? "" : "…")}</div>
    </div>
  );
}

export function ImageObject({ o }: { o: PageObject }) {
  const d = o.data as { src: string; caption?: string };
  const r = objectRect(o);
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: r.w, background: "#FFFFFF", border: "1px solid #E4E2E6", borderRadius: 10, padding: "6px 6px 8px", transform: "rotate(1.6deg)", boxShadow: "0 2px 10px rgba(35,34,39,0.08)", boxSizing: "border-box" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.src} alt={d.caption ?? "photo"} style={{ width: "100%", height: Math.max(40, (o.h ?? 120) - 30), objectFit: "cover", borderRadius: 6, display: "block" }} />
      {d.caption && <div style={{ fontSize: 11.5, color: "#96949B", marginTop: 6, textAlign: "center" }}>{d.caption}</div>}
    </div>
  );
}

/** Step 5's answer box on the study page (04): INK / TYPE / SPEAK, lined area, filed chip. */
export function AnswerObject({ o }: { o: PageObject }) {
  const d = o.data as { question: string; mode?: "ink" | "type" | "speak"; text?: string; filed?: boolean; filedLabel?: string };
  const mode = d.mode ?? "ink";
  const chip = (k: "ink" | "type" | "speak", label: string) => (
    <span data-answer-mode={k} style={{ fontSize: 12.5, fontWeight: k === mode ? 700 : 600, color: k === mode ? "#FFFFFF" : "#66646C", background: k === mode ? "#A63D63" : "#FFFFFF", border: k === mode ? "none" : "1px solid #E4E2E6", borderRadius: 99, padding: "3px 11px" }}>
      {label}
    </span>
  );
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: o.w ?? 752 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Diamond size={7} />
        <span style={{ fontSize: 11.5, letterSpacing: "0.15em", fontWeight: 700, color: "#8C2F51" }}>THE QUESTION · CARRIED FROM STEP 5</span>
      </div>
      <div style={{ border: "1.5px dashed #E9CFDC", borderRadius: 14, padding: "12px 14px", marginTop: 7, background: "rgba(255,255,255,0.6)" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: "#232227", lineHeight: 1.45 }}>{d.question}</div>
        <div style={{ display: "flex", gap: 5, marginTop: 9, alignItems: "center" }}>
          {chip("ink", "INK")}
          {chip("type", "TYPE")}
          {chip("speak", "SPEAK")}
          <span style={{ fontSize: 11.5, color: "#A9A7AE", marginLeft: 2 }}>answer here — or leave it open</span>
        </div>
        <div style={{ height: 92, marginTop: 9, borderRadius: 9, background: "repeating-linear-gradient(#FFFFFF 0 27px, #F0EAE4 27px 28px)", position: "relative", padding: "4px 8px", boxSizing: "border-box" }}>
          {mode !== "ink" && <div style={{ fontSize: 17, color: "#454349", lineHeight: "36px", whiteSpace: "pre-wrap" }}>{d.text || ""}</div>}
        </div>
        {d.filed && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#3E7A54", background: "#EAF3ED", borderRadius: 99, padding: "3.5px 10px", marginTop: 8 }}>
            <CheckIcon size={10} color="#3E7A54" /> filed — {d.filedLabel ?? "an open Question"}
          </div>
        )}
      </div>
    </div>
  );
}

/** The compare worksheet's two columns (9c): ESV | BSB, fetched live — NBLA stays in Logos. */
export function CompareObject({ o }: { o: PageObject }) {
  const d = o.data as { chipRef?: string | null; chip?: string | null; label?: string };
  const ref = d.chipRef ?? d.chip ?? "";
  const [esv, setEsv] = useState<string | null>(null);
  const [bsb, setBsb] = useState<string | null>(null);
  useEffect(() => {
    if (!ref) return;
    fetch(`/api/spirit/passage?q=${encodeURIComponent(ref)}`).then((r) => (r.ok ? r.json() : null)).then((p) => {
      const vs = (p?.verses ?? []) as { verseNum: number; text: string; lines?: string[] }[];
      setEsv(vs.slice(0, 6).map((v) => `${v.verseNum} ${v.lines ? v.lines.join(" ") : v.text}`).join(" ") || "—");
    }).catch(() => setEsv("ESV unavailable"));
    fetch(`/api/spirit/bsb?q=${encodeURIComponent(ref)}`).then((r) => (r.ok ? r.json() : null)).then((p) => {
      const vs = (p?.verses ?? []) as { verse: number; text: string }[];
      setBsb(vs.slice(0, 6).map((v) => `${v.verse} ${v.text}`).join(" ") || "BSB unavailable");
    }).catch(() => setBsb("BSB unavailable"));
  }, [ref]);
  return (
    <div data-obj={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: o.w ?? 752 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.13em", fontWeight: 700, color: "#B7A2AC" }}>{d.label ?? "ESV | BSB"} · {ref.toUpperCase()}</div>
      <div style={{ display: "flex", marginTop: 6, background: "rgba(255,255,255,0.7)", borderRadius: 10, border: "1px solid #EDEBEE" }}>
        <div style={{ flex: 1, padding: "10px 12px", borderRight: "1px solid #F2F1F2" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>ESV</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: "#232227", lineHeight: 1.65, marginTop: 4 }}>{esv ?? "…"}</div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", fontWeight: 700, color: "#96949B" }}>BSB</div>
          <div style={{ fontFamily: SERIF, fontSize: 16, color: "#232227", lineHeight: 1.65, marginTop: 4 }}>{bsb ?? "…"}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: "#A9A7AE", marginTop: 5 }}>NBLA stays in Logos — Split View</div>
    </div>
  );
}

export function PageObjects({ objects, fresh, selectedId, editingId, liftedId }: { objects: PageObject[]; fresh?: Set<string>; selectedId?: string | null; editingId?: string | null; liftedId?: string | null }) {
  return (
    <>
      {liftedId && <style>{`[data-obj="${liftedId}"] { filter: drop-shadow(0 12px 22px rgba(35,34,39,0.22)); }`}</style>}
      {objects.map((o) => {
        // the one being dragged rides above the page
        const lifted = liftedId === o.id;
        if (lifted) o = { ...o, data: o.data };
        switch (o.type) {
          case "header":
            return <PageHeaderObject key={o.id} o={o} />;
          case "section":
            return <SectionObject key={o.id} o={o} />;
          case "prompt":
            return (o.data as { label?: string }).label === "ESV | BSB" ? <CompareObject key={o.id} o={o} /> : <PromptObject key={o.id} o={o} />;
          case "refcard":
            return <RefCardObject key={o.id} o={o} fresh={fresh?.has(o.id)} selected={selectedId === o.id} />;
          case "text":
            return <TextObject key={o.id} o={o} editing={editingId === o.id} />;
          case "image":
            return <ImageObject key={o.id} o={o} />;
          case "answer":
            return <AnswerObject key={o.id} o={o} />;
          default:
            return null;
        }
      })}
    </>
  );
}
