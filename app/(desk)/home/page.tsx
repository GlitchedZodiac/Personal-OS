"use client";

// 00 — Home: Spirit is the front door, the OS waits behind it. Resume
// cards per context (Study at its step · Sunday's page · Free reading),
// the notebook shelf, a mini-hub of exactly three glance widgets
// (Training · Eating · Measurements), and the right rail — the honest
// directory of everything the app already is on the phone. Tapping an
// undesigned section slides the PHONE layout in as a ~500pt compact pane
// over the rail, untouched, Done to dismiss.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Diamond, GearIcon, TodayRailIcon, ChatRailIcon, FoodRailIcon, HealthRailIcon, TrendsRailIcon, JournalRailIcon, RecDot } from "@/components/spirit/desk/desk-icons";
import { DISPLAY, cardShadow } from "@/components/spirit/desk/ui";
import { fmtSeconds } from "@/lib/ink";

interface Today {
  term: { orderIndex: number; title: string } | null;
  day: { id: string; weekIndex: number; title: string; estMinutes: number } | null;
  progress: { done: number; target: number } | null;
  stats: { streak: number };
}
interface Hub {
  today: string;
  training: { sessionsThisWeek: number; prsThisWeek: number; spark: number[] };
  eating: { kcalToday: number; loggedDays: number; spark: number[] };
  measurements: { weight7dAvg: number | null; delta: number | null; lastMeasuredAt: string | null; spark: (number | null)[] };
  sunday: { seriesId: string; title: string; currentWeek: number; expectedWeeks: number | null; page: { id: string; title: string; updatedAt: string; recordingId: string | null; transcribedAt: string | null; refs: number[] } | null; recording: { durationSec: number; status: string } | null; isSunday: boolean } | null;
}
interface Notebook { id: string; title: string; kind: string; accent: string; pageCount: number; recordingCount: number }

function Spark({ points, color }: { points: (number | null)[]; color: string }) {
  const vals = points.map((p) => (p === null || p === undefined ? null : p));
  const nums = vals.filter((v): v is number => v !== null);
  const max = Math.max(1, ...nums);
  const min = Math.min(...(nums.length ? nums : [0]));
  const range = Math.max(1e-6, max - min);
  const pts = vals.map((v, i) => `${2 + (i * 62) / Math.max(1, vals.length - 1)},${v === null ? 20 : 20 - ((v - min) / range) * 16}`).join(" ");
  return (
    <svg width="66" height="24" viewBox="0 0 66 24" style={{ flex: "none" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [today, setToday] = useState<Today | null>(null);
  const [hub, setHub] = useState<Hub | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [step, setStep] = useState<number | null>(null);
  const [freeRead, setFreeRead] = useState<string | null>(null);
  const [readerTheme, setReaderTheme] = useState<string>("light");
  const [compact, setCompact] = useState<{ href: string; title: string } | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < 700);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  useEffect(() => {
    if (narrow) router.replace("/spirit");
  }, [narrow, router]);
  useEffect(() => {
    fetch("/api/spirit/today").then((r) => (r.ok ? r.json() : null)).then((d) => {
      setToday(d);
      if (d?.day?.id) {
        const s = Number(localStorage.getItem(`spirit-step:${d.day.id}`));
        setStep(s > 0 ? s : 1);
      }
      try {
        setFreeRead(localStorage.getItem("spirit-last-free-read"));
        const prefs = JSON.parse(localStorage.getItem("spirit-reader-prefs") ?? "{}");
        if (prefs.theme) setReaderTheme(prefs.theme);
      } catch {}
    }).catch(() => {});
    fetch("/api/spirit/hub").then((r) => (r.ok ? r.json() : null)).then(setHub).catch(() => {});
    fetch("/api/spirit/notebooks").then((r) => (r.ok ? r.json() : null)).then((d) => setNotebooks(d?.notebooks ?? [])).catch(() => {});
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const dateKicker = now.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" }).toUpperCase().replace(",", " ·");
  const totalSteps = 6;
  const stepTitles = ["Read the passage", "The teaching", "Behind the text", "What it means", "The question", "The homework"];
  const minutesLeft = today?.day ? Math.max(1, Math.round(today.day.estMinutes * (1 - ((step ?? 1) - 1) / totalSteps))) : null;
  const sunday = hub?.sunday;
  const sundayLine = useMemo(() => {
    if (!sunday) return "no series running — start one on the phone";
    if (!sunday.page) return sunday.isSunday ? "Take notes opens the Sermon layout, page pre-filled, recording ready" : "the week's page opens on the desk";
    const bits: string[] = [];
    if (sunday.recording) bits.push(`recording ${fmtSeconds(sunday.recording.durationSec)}`);
    if (sunday.page.transcribedAt) bits.push("transcribed ✓");
    else if (sunday.recording?.status === "transcribing") bits.push("transcribing…");
    const refs = Array.isArray(sunday.page.refs) ? sunday.page.refs.length : 0;
    if (refs) bits.push(`${refs} ref${refs === 1 ? "" : "s"} kept`);
    if (!sunday.page.transcribedAt) bits.push("the confirm card waits");
    return bits.join(" · ");
  }, [sunday]);

  const card: React.CSSProperties = { background: "#FFFFFF", borderRadius: 16, padding: "15px 17px", boxShadow: cardShadow };
  const railRows: { key: string; label: string; sub: string; icon: React.ReactNode; href?: string; badge?: string; dim?: boolean; desk?: boolean }[] = [
    { key: "today", label: "Today", sub: hub ? `${hub.eating.kcalToday.toLocaleString()} kcal today · ${hub.training.sessionsThisWeek} session${hub.training.sessionsThisWeek === 1 ? "" : "s"} this week` : "…", icon: <TodayRailIcon />, href: "/dashboard" },
    { key: "chat", label: "Chat", sub: "the notebook that talks back", icon: <ChatRailIcon />, href: "/chat" },
    { key: "food", label: "Food", sub: hub ? `${hub.eating.loggedDays} of 7 days logged` : "…", icon: <FoodRailIcon />, href: "/health/food" },
    { key: "health", label: "Health", sub: hub?.measurements.weight7dAvg ? `${hub.measurements.weight7dAvg} kg · ${hub.measurements.delta !== null ? `${hub.measurements.delta > 0 ? "+" : ""}${hub.measurements.delta} this week` : "7-day avg"}` : "weight, sleep, recovery", icon: <HealthRailIcon />, href: "/health/body", badge: "iPad · round 2" },
    { key: "trends", label: "Trends", sub: "the scorecards come with Health's round", icon: <TrendsRailIcon />, href: "/health/body" },
    { key: "settings", label: "Settings", sub: "handedness · pen defaults · recording consent · layouts", icon: <GearIcon size={16} />, href: "/spirit/desk-settings", desk: true },
    { key: "journal", label: "Journal", sub: "the thesis holds — its round comes later", icon: <JournalRailIcon />, badge: "deferred", dim: true },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: "var(--font-body)", overflow: "auto" }}>
      <div style={{ position: "relative", minHeight: "100%", padding: "calc(40px + env(safe-area-inset-top, 0px)) 28px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", fontWeight: 600, color: "#96949B" }}>{dateKicker}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 29, fontWeight: 700, color: "#232227", letterSpacing: "-0.02em", marginTop: 2 }}>{greet}, Michael.</div>
          </div>
          <span style={{ flex: 1 }} />
          {today?.stats?.streak ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", padding: "6px 13px", borderRadius: 99, marginBottom: 3 }}><Diamond size={9} /> {today.stats.streak}-day streak</div>
          ) : null}
          <Link href="/spirit/desk-settings" aria-label="Settings" style={{ width: 36, height: 36, borderRadius: "50%", background: "#FFFFFF", border: "1px solid #E4E2E6", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 1 }}><GearIcon size={16} /></Link>
        </div>

        <div style={{ display: "flex", gap: 28, marginTop: 30, flex: 1, minHeight: 0 }}>
          {/* left: the desk */}
          <div style={{ flex: 1.83, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Diamond size={9} /><span style={{ fontSize: 10.5, letterSpacing: "0.16em", fontWeight: 700, color: "#8C2F51" }}>SPIRIT · THE DESK</span><span style={{ flex: 1, height: 1, background: "#E4E2E6" }} /><span style={{ fontSize: 10, color: "#96949B" }}>the desk remembers each context</span></div>

            <div style={{ ...card, borderRadius: 18, padding: "18px 20px", display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>{step && step > 1 ? "PICK UP WHERE YOU STOPPED" : "TODAY'S STUDY"} · STUDY LAYOUT</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, color: "#232227", letterSpacing: "-0.01em", marginTop: 5 }}>{today?.day?.title ?? (today ? "No study is waiting" : "…")}</div>
                <div style={{ fontSize: 11.5, color: "#66646C", marginTop: 3 }}>
                  {today?.term && today?.day ? `Term ${today.term.orderIndex} · study ${(today.progress?.done ?? 0) + 1} of ${today.progress?.target ?? "?"} · step ${step ?? 1} of ${totalSteps} — ${stepTitles[(step ?? 1) - 1]} · ≈ ${minutesLeft} min left` : "the next term takes the lectern when it's announced"}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 10, maxWidth: 300 }}>
                  {Array.from({ length: totalSteps }).map((_, i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < (step ?? 1) ? "#A63D63" : "#DFDDE2" }} />)}
                </div>
              </div>
              <div style={{ width: 86, flex: "none", textAlign: "center" }}>
                <div style={{ width: 86, height: 58, border: "1px solid #E4E2E6", borderRadius: 9, display: "flex", gap: 3, padding: 4, boxSizing: "border-box", background: "#FAF9FA" }}><span style={{ flex: 1.1, background: "#F0D3E0", borderRadius: 4 }} /><span style={{ flex: 1, background: "#E4E2E6", borderRadius: 4 }} /></div>
                <div style={{ fontSize: 8.5, color: "#A9A7AE", marginTop: 4 }}>Notebook | Teaching</div>
              </div>
              <Link href="/spirit/desk?ctx=study" style={{ flex: "none", display: "block", background: "#A63D63", color: "#FFFFFF", borderRadius: 11, padding: "13px 20px", fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                {step && step > 1 ? `Continue · ${stepTitles[step - 1]} →` : "Begin the study →"}
              </Link>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ ...card, flex: 1.15 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>SUNDAY{sunday ? ` · ${sunday.title.split("—")[0].trim().toUpperCase()}` : ""}</span>
                  {sunday && <span style={{ fontSize: 9, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "2.5px 8px" }}>wk {sunday.currentWeek}{sunday.expectedWeeks ? ` of ≈${sunday.expectedWeeks}` : ""}</span>}
                </div>
                <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6 }}>{sunday?.page ? `Sunday's page — ${new Date(sunday.page.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : sunday?.isSunday ? "It's Sunday — take notes" : "Sunday's page"}</div>
                <div style={{ fontSize: 11, color: "#66646C", lineHeight: 1.55, marginTop: 3 }}>{sundayLine}</div>
                <Link href="/spirit/desk?ctx=sermon" style={{ display: "inline-block", marginTop: 10, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: sunday?.isSunday ? "#FFFFFF" : "#8C2F51", background: sunday?.isSunday ? "#A63D63" : "#F6E3EB", borderRadius: 9, padding: "8px 14px", textDecoration: "none" }}>{sunday?.isSunday ? "Take notes →" : "Open the sermon page →"}</Link>
              </div>
              <div style={{ ...card, flex: 1 }}>
                <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>FREE READING</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6 }}>{freeRead ?? "Pick up anywhere"}{readerTheme !== "light" ? ` · ${readerTheme} surface` : ""}</div>
                <div style={{ fontSize: 11, color: "#66646C", lineHeight: 1.55, marginTop: 3 }}>{freeRead ? "where you left the shelf" : "the whole Bible, no term coupling"}</div>
                <Link href={`/spirit/desk?ctx=free${freeRead ? `&q=${encodeURIComponent(freeRead)}` : ""}`} style={{ display: "inline-block", marginTop: 10, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#454349", border: "1px solid #E4E2E6", borderRadius: 9, padding: "8px 14px", textDecoration: "none" }}>Open the reader →</Link>
              </div>
            </div>

            <div style={{ ...card, padding: "15px 17px 17px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>THE NOTEBOOK · SHELF</span>
                <Link href="/spirit/notebooks" style={{ fontSize: 11, fontWeight: 600, color: "#8C2F51", textDecoration: "none" }}>all notebooks ›</Link>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 11 }}>
                {(notebooks.length ? notebooks : [{ id: "a", title: "Sermons", kind: "sermons", accent: "#A63D63", pageCount: 0, recordingCount: 0 }]).slice(0, 4).map((n) => (
                  <Link key={n.id} href={`/spirit/notebooks?nb=${n.id}`} style={{ flex: 1, border: "1px solid #E4E2E6", borderLeft: `4px solid ${n.accent}`, borderRadius: 10, padding: "10px 12px", textDecoration: "none", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>{n.recordingCount > 0 && <RecDot size={6} live={false} />}</div>
                    <div style={{ fontSize: 10, color: "#96949B", marginTop: 2 }}>{n.pageCount} page{n.pageCount === 1 ? "" : "s"}{n.kind === "sermons" && n.recordingCount ? ` · ${n.recordingCount} recording${n.recordingCount === 1 ? "" : "s"}` : n.kind === "term" ? " · study-fed" : n.kind === "worksheets" ? " · system-made" : ""}</div>
                  </Link>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}><span style={{ fontSize: 10.5, letterSpacing: "0.16em", fontWeight: 700, color: "#96949B" }}>MINI-HUB</span><span style={{ flex: 1, height: 1, background: "#E4E2E6" }} /><span style={{ fontSize: 10, color: "#96949B" }}>tap → that section&apos;s app · phone layout, compact pane</span></div>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" onClick={() => setCompact({ href: "/health/workouts", title: "Training" })} style={{ ...card, flex: 1, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>TRAINING</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub ? hub.training.sessionsThisWeek : "…"}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>session{hub?.training.sessionsThisWeek === 1 ? "" : "s"} this week{hub?.training.prsThisWeek ? ` · ${hub.training.prsThisWeek} PR` : ""}</div></div>
                <Spark points={hub?.training.spark ?? []} color="#A63D63" />
              </button>
              <button type="button" onClick={() => setCompact({ href: "/health/food", title: "Eating" })} style={{ ...card, flex: 1, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>EATING</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub ? hub.eating.kcalToday.toLocaleString() : "…"}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>kcal today · {hub ? `${hub.eating.loggedDays} of 7 days logged` : ""}</div></div>
                <Spark points={hub?.eating.spark ?? []} color="#232227" />
              </button>
              <button type="button" onClick={() => setCompact({ href: "/health/body", title: "Measurements" })} style={{ ...card, flex: 1, borderRadius: 14, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>MEASUREMENTS</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub?.measurements.weight7dAvg ?? "—"} {hub?.measurements.delta !== null && hub?.measurements.delta !== undefined && <span style={{ fontSize: 11, fontWeight: 600, color: hub.measurements.delta <= 0 ? "#5E9B72" : "#B4533F" }}>{hub.measurements.delta > 0 ? "+" : ""}{hub.measurements.delta}</span>}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>kg · 7-day avg{hub?.measurements.lastMeasuredAt ? ` · checked ${new Date(hub.measurements.lastMeasuredAt).toLocaleDateString("en-US", { weekday: "short" })}` : ""}</div></div>
                <Spark points={hub?.measurements.spark ?? []} color="#A9A7AE" />
              </button>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 10, color: "#A9A7AE", textAlign: "center" }}>serious, warm, unhurried — nothing here scores you, nothing is behind</div>
          </div>

          {/* right: the rest of the OS */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: 392, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 10.5, letterSpacing: "0.16em", fontWeight: 700, color: "#96949B" }}>THE REST OF THE OS</span><span style={{ flex: 1, height: 1, background: "#E4E2E6" }} /></div>
            <div style={{ background: "#FFFFFF", borderRadius: 16, marginTop: 12, boxShadow: cardShadow, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column" }}>
              {railRows.map((r, i) => {
                const inner = (
                  <>
                    <span style={{ width: 34, height: 34, flex: "none", borderRadius: 11, background: "#F2F1F2", display: "flex", alignItems: "center", justifyContent: "center" }}>{r.icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#232227" }}>{r.label}{r.badge && <span style={{ fontSize: 9, fontWeight: 600, color: "#96949B", background: "#F2F1F2", borderRadius: 99, padding: "2px 8px", verticalAlign: 2, marginLeft: 4 }}>{r.badge}</span>}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "#96949B", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                    </span>
                    {!r.dim && <span style={{ fontSize: 13, color: "#C9C7CD" }}>›</span>}
                  </>
                );
                const style: React.CSSProperties = { flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderBottom: i < railRows.length - 1 ? "1px solid #F2F1F2" : "none", cursor: r.dim ? "default" : "pointer", opacity: r.dim ? 0.62 : 1, textDecoration: "none", background: "transparent", border: 0, borderBottomStyle: "solid", width: "100%", textAlign: "left" };
                if (r.dim) return <div key={r.key} style={style}>{inner}</div>;
                if (r.desk) return <Link key={r.key} href={r.href!} style={style}>{inner}</Link>;
                return <button key={r.key} type="button" onClick={() => setCompact({ href: r.href!, title: r.label })} style={style}>{inner}</button>;
              })}
            </div>
            <div style={{ fontSize: 10, color: "#A9A7AE", lineHeight: 1.55, marginTop: 10 }}>These live on the phone today — each earns its own desk in a later round (Health is round 2). Tapping one opens the phone layout in a compact pane, untouched.</div>
          </div>
        </div>
      </div>

      {/* the compact pane — the phone layout in ~500pt, over the rail, Done to dismiss */}
      {compact && (
        <>
          <div onClick={() => setCompact(null)} style={{ position: "fixed", inset: 0, background: "rgba(35,34,39,0.18)", zIndex: 70 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 500, maxWidth: "100vw", background: "#F2F1F2", zIndex: 71, boxShadow: "-16px 0 48px rgba(20,15,18,0.25)", display: "flex", flexDirection: "column", animation: "slideIn .28s cubic-bezier(.3,.9,.3,1) both" }}>
            <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderBottom: "1px solid #E4E2E6", background: "#FFFFFF" }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>COMPACT · {compact.title.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: "#A9A7AE" }}>the phone layout, untouched</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setCompact(null)} style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, color: "#FFFFFF", background: "#232227", borderRadius: 99, padding: "6px 14px", border: 0, cursor: "pointer" }}>Done</button>
            </div>
            <iframe src={compact.href} title={compact.title} style={{ flex: 1, border: 0, width: "100%", background: "#F2F1F2" }} />
          </div>
          <style jsx global>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
        </>
      )}
    </div>
  );
}
