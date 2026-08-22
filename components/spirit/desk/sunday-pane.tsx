"use client";

// The Sunday document (01/06d): the church week — passage, context, three
// questions to bring back, "Take notes" first on a Sunday.

import { useEffect, useState } from "react";
import { useDesk } from "./desk-state";
import { PaneHeader, Chip, DISPLAY } from "./ui";

interface Week { index: number; passageRef: string; title: string; context: string; questions: string[]; status?: string; pageId?: string }
interface Series { id: string; title: string; currentWeek: number; expectedWeeks: number | null; weeks: Week[] }

export function SundayPane({ onKicker, onTakeNotes }: { onKicker?: () => void; onTakeNotes?: () => void }) {
  const { emit } = useDesk();
  const [series, setSeries] = useState<Series | null>(null);
  useEffect(() => {
    fetch("/api/spirit/church").then((r) => (r.ok ? r.json() : null)).then((d) => setSeries(d?.series ?? null)).catch(() => {});
  }, []);
  const week = series?.weeks?.find((w) => w.index === series.currentWeek) ?? series?.weeks?.[0] ?? null;
  const isSunday = new Date().getDay() === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "#FFFFFF" }}>
      <PaneHeader kicker="SUNDAY" onKicker={onKicker} title={series ? series.title : "the Sunday track"} right={series ? <Chip tone="tint">wk {series.currentWeek}{series.expectedWeeks ? ` of ≈${series.expectedWeeks}` : ""}</Chip> : undefined} />
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
        {!series && <div style={{ fontSize: 12, color: "#96949B" }}>No series running — start one from the phone&apos;s Church track.</div>}
        {series && week && (
          <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "15px 17px", boxShadow: "0 2px 12px rgba(35,34,39,0.06)", border: "1px solid #F2F1F2" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>SUNDAY · {series.title.split("—")[0].trim().toUpperCase()}</span>
              {week.status === "preached" && <Chip tone="success">preached ✓</Chip>}
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6 }}>{isSunday ? "Today" : "This week"}: {week.title}</div>
            <div style={{ fontSize: 12, color: "#66646C", lineHeight: 1.6, marginTop: 6 }}>{week.context}</div>
            <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
              {(week.questions ?? []).map((q, i) => (
                <div key={i} style={{ display: "flex", gap: 8, background: "#FAF9FA", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8C2F51" }}>{i + 1}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.55, color: "#454349" }}>{q}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 11 }}>
              <button type="button" onClick={onTakeNotes} style={{ flex: 1.4, background: "#A63D63", color: "#FFFFFF", borderRadius: 10, padding: "10px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, cursor: "pointer", border: 0 }}>Take notes →</button>
              <button type="button" onClick={() => week.passageRef && emit({ type: "open-main", q: week.passageRef.split(/[-–,;]/)[0].trim().replace(/:\d.*$/, "") })} style={{ flex: 1, border: "1px solid #E4E2E6", borderRadius: 10, padding: "10px 0", textAlign: "center", fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#454349", cursor: "pointer", background: "#FFFFFF" }}>The passage</button>
            </div>
            <div style={{ fontSize: 9.5, color: "#A9A7AE", marginTop: 8 }}>{isSunday ? "Sunday morning — Take notes leads. It opens the Sermon layout, page pre-filled, recording ready." : "The week's follow-along deepens what was preached — you arrive next Sunday primed."}</div>
          </div>
        )}
      </div>
    </div>
  );
}
