"use client";

// V3 §10 — Home, rebuilt around the app's real structure: a 64pt bottom tab
// bar with the phone's real tabs at iPad size — Today · Chat · Food · Spirit.
// Journal is removed entirely. Spirit is the desk section (pick-up hero,
// Sunday, free reading, the HIMNARIO, the shelf); Today grows the phone's
// glance into tiles that open the PHONE layout in a compact ~500pt pane,
// untouched — each earns its own iPad desk in a later round, nothing gets
// restyled early. Greeting + streak persist across tabs.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Diamond, GearIcon, TodayRailIcon, ChatRailIcon, FoodRailIcon, HealthRailIcon, TrendsRailIcon, RecDot } from "@/components/spirit/desk/desk-icons";
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
interface HymnRow { id: string; title: string; updatedAt: string }

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

type HomeTab = "today" | "chat" | "food" | "spirit";

/** the hand-drawn hymn glyph — a small open hymnal; never lucide on designed surfaces */
function HymnGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#A63D63" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5.5C10 3.8 6.6 3.4 4 4.4v13.2c2.6-1 6-.6 8 1.1 2-1.7 5.4-2.1 8-1.1V4.4c-2.6-1-6-.6-8 1.1Z" />
      <path d="M12 5.5v13.2" />
      <path d="M15.5 9.2v4.1" />
      <circle cx="14.4" cy="13.9" r="1.15" />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<HomeTab>("spirit");
  const [today, setToday] = useState<Today | null>(null);
  const [hub, setHub] = useState<Hub | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [hymns, setHymns] = useState<HymnRow[] | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [freeRead, setFreeRead] = useState<string | null>(null);
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
      try { setFreeRead(localStorage.getItem("spirit-last-free-read")); } catch {}
    }).catch(() => {});
    fetch("/api/spirit/hub").then((r) => (r.ok ? r.json() : null)).then(setHub).catch(() => {});
    fetch("/api/spirit/notebooks").then((r) => (r.ok ? r.json() : null)).then((d) => setNotebooks(d?.notebooks ?? [])).catch(() => {});
    fetch("/api/spirit/hymns").then((r) => (r.ok ? r.json() : null)).then((d) => setHymns((d?.hymns ?? []) as HymnRow[])).catch(() => {});
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
  const lastHymn = hymns?.length ? [...hymns].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0] : null;

  const TABS: { key: HomeTab; label: string; icon: React.ReactNode }[] = [
    { key: "today", label: "Today", icon: <TodayRailIcon /> },
    { key: "chat", label: "Chat", icon: <ChatRailIcon /> },
    { key: "food", label: "Food", icon: <FoodRailIcon /> },
    { key: "spirit", label: "Spirit", icon: <Diamond size={13} /> },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, fontFamily: "var(--font-body)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ position: "relative", minHeight: "100%", maxWidth: 1060, margin: "0 auto", padding: "calc(34px + env(safe-area-inset-top, 0px)) 28px 24px", boxSizing: "border-box" }}>
          {/* the greeting + streak persist across tabs (§10) */}
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

          {/* ——— SPIRIT — the desk section ——— */}
          {tab === "spirit" && (
            <div className="desk-stagger" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
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

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ ...card, flex: "1.15 1 250px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>SUNDAY{sunday ? ` · ${sunday.title.split("—")[0].trim().toUpperCase()}` : ""}</span>
                    {sunday && <span style={{ fontSize: 9, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 99, padding: "2.5px 8px" }}>wk {sunday.currentWeek}{sunday.expectedWeeks ? ` of ≈${sunday.expectedWeeks}` : ""}</span>}
                  </div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6 }}>{sunday?.page ? `Sunday's page — ${new Date(sunday.page.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : sunday?.isSunday ? "It's Sunday — take notes" : "Sunday's page"}</div>
                  <div style={{ fontSize: 11, color: "#66646C", lineHeight: 1.55, marginTop: 3 }}>{sundayLine}</div>
                  <Link href="/spirit/desk?ctx=sermon" style={{ display: "inline-block", marginTop: 10, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: sunday?.isSunday ? "#FFFFFF" : "#8C2F51", background: sunday?.isSunday ? "#A63D63" : "#F6E3EB", borderRadius: 9, padding: "8px 14px", textDecoration: "none" }}>{sunday?.isSunday ? "Take notes →" : "Open the sermon page →"}</Link>
                </div>
                <div style={{ ...card, flex: "1 1 220px" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>FREE READING</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6 }}>{freeRead ?? "Pick up anywhere"}</div>
                  <div style={{ fontSize: 11, color: "#66646C", lineHeight: 1.55, marginTop: 3 }}>{freeRead ? "where you left the shelf" : "the whole Bible, no term coupling"}</div>
                  <Link href={`/spirit/desk?ctx=free${freeRead ? `&q=${encodeURIComponent(freeRead)}` : ""}`} style={{ display: "inline-block", marginTop: 10, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#454349", border: "1px solid #E4E2E6", borderRadius: 9, padding: "8px 14px", textDecoration: "none" }}>Open the reader →</Link>
                </div>
                {/* §10 — the HIMNARIO card */}
                <div style={{ ...card, flex: "1 1 220px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>HIMNARIO</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: "#FFFFFF", background: "#A63D63", borderRadius: 99, padding: "2px 7px" }}>NEW</span>
                    <span style={{ flex: 1 }} />
                    <HymnGlyph />
                  </div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: "#232227", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lastHymn ? lastHymn.title : "The hymns you actually sing"}
                  </div>
                  <div style={{ fontSize: 11, color: "#66646C", lineHeight: 1.55, marginTop: 3 }}>
                    {hymns === null ? "…" : hymns.length ? `${hymns.length} hymn${hymns.length === 1 ? "" : "s"} · search any line, accents forgiven` : "photograph a pliego — or just tell Claude one"}
                  </div>
                  <Link href="/spirit/hymns" style={{ display: "inline-block", marginTop: 10, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 600, color: "#8C2F51", background: "#F6E3EB", borderRadius: 9, padding: "8px 14px", textDecoration: "none" }}>Open the himnario →</Link>
                </div>
              </div>

              <div style={{ ...card, padding: "15px 17px 17px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>THE NOTEBOOK · SHELF</span>
                  <Link href="/spirit/notebooks" style={{ fontSize: 11, fontWeight: 600, color: "#8C2F51", textDecoration: "none" }}>all notebooks ›</Link>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 11, flexWrap: "wrap" }}>
                  {(notebooks.length ? notebooks : [{ id: "a", title: "Sermons", kind: "sermons", accent: "#A63D63", pageCount: 0, recordingCount: 0 }]).slice(0, 4).map((n) => (
                    <Link key={n.id} href={`/spirit/notebooks?nb=${n.id}`} style={{ flex: "1 1 180px", border: "1px solid #E4E2E6", borderLeft: `4px solid ${n.accent}`, borderRadius: 10, padding: "10px 12px", textDecoration: "none", minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ fontFamily: DISPLAY, fontSize: 12.5, fontWeight: 600, color: "#232227", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>{n.recordingCount > 0 && <RecDot size={6} live={false} />}</div>
                      <div style={{ fontSize: 10, color: "#96949B", marginTop: 2 }}>{n.pageCount} page{n.pageCount === 1 ? "" : "s"}{n.kind === "sermons" && n.recordingCount ? ` · ${n.recordingCount} recording${n.recordingCount === 1 ? "" : "s"}` : n.kind === "term" ? " · study-fed" : n.kind === "worksheets" ? " · system-made" : ""}</div>
                    </Link>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#A9A7AE", textAlign: "center", marginTop: 4 }}>serious, warm, unhurried — nothing here scores you, nothing is behind</div>
            </div>
          )}

          {/* ——— TODAY — the phone's glance grown to tiles ——— */}
          {tab === "today" && (
            <div className="desk-stagger" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setCompact({ href: "/health/workouts", title: "Training" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", minWidth: 220, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>TRAINING</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub ? hub.training.sessionsThisWeek : "…"}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>session{hub?.training.sessionsThisWeek === 1 ? "" : "s"} this week{hub?.training.prsThisWeek ? ` · ${hub.training.prsThisWeek} PR` : ""}</div></div>
                  <Spark points={hub?.training.spark ?? []} color="#A63D63" />
                </button>
                <button type="button" onClick={() => setCompact({ href: "/health/food", title: "Eating" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", minWidth: 220, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>EATING</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub ? hub.eating.kcalToday.toLocaleString() : "…"}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>kcal today · {hub ? `${hub.eating.loggedDays} of 7 days logged` : ""}</div></div>
                  <Spark points={hub?.eating.spark ?? []} color="#232227" />
                </button>
                <button type="button" onClick={() => setCompact({ href: "/health/body", title: "Measurements" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", minWidth: 220, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 9, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>MEASUREMENTS</div><div style={{ fontFamily: DISPLAY, fontSize: 19, fontWeight: 700, color: "#232227", marginTop: 3 }}>{hub?.measurements.weight7dAvg ?? "—"} {hub?.measurements.delta !== null && hub?.measurements.delta !== undefined && <span style={{ fontSize: 11, fontWeight: 600, color: hub.measurements.delta <= 0 ? "#5E9B72" : "#B4533F" }}>{hub.measurements.delta > 0 ? "+" : ""}{hub.measurements.delta}</span>}</div><div style={{ fontSize: 10, color: "#66646C", marginTop: 1 }}>kg · 7-day avg{hub?.measurements.lastMeasuredAt ? ` · checked ${new Date(hub.measurements.lastMeasuredAt).toLocaleDateString("en-US", { weekday: "short" })}` : ""}</div></div>
                  <Spark points={hub?.measurements.spark ?? []} color="#A9A7AE" />
                </button>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setCompact({ href: "/health/body", title: "Health" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <span style={{ width: 34, height: 34, flex: "none", borderRadius: 11, background: "#F2F1F2", display: "flex", alignItems: "center", justifyContent: "center" }}><HealthRailIcon /></span>
                  <span style={{ minWidth: 0 }}><span style={{ display: "block", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#232227" }}>Health · Sunday Report</span><span style={{ display: "block", fontSize: 10.5, color: "#96949B" }}>weight, sleep, recovery — iPad desk in a later round</span></span>
                </button>
                <button type="button" onClick={() => setCompact({ href: "/trends", title: "Trends" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <span style={{ width: 34, height: 34, flex: "none", borderRadius: 11, background: "#F2F1F2", display: "flex", alignItems: "center", justifyContent: "center" }}><TrendsRailIcon /></span>
                  <span style={{ minWidth: 0 }}><span style={{ display: "block", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#232227" }}>Trends</span><span style={{ display: "block", fontSize: 10.5, color: "#96949B" }}>the scorecards, phone layout</span></span>
                </button>
                <button type="button" onClick={() => setCompact({ href: "/dashboard", title: "Up next" })} className="desk-lift" style={{ ...card, flex: "1 1 220px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, border: 0, textAlign: "left" }}>
                  <span style={{ width: 34, height: 34, flex: "none", borderRadius: 11, background: "#F2F1F2", display: "flex", alignItems: "center", justifyContent: "center" }}><TodayRailIcon /></span>
                  <span style={{ minWidth: 0 }}><span style={{ display: "block", fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: "#232227" }}>Up next</span><span style={{ display: "block", fontSize: 10.5, color: "#96949B" }}>the day&apos;s full glance — phone layout</span></span>
                </button>
              </div>
              <div style={{ fontSize: 10, color: "#A9A7AE", lineHeight: 1.55, textAlign: "center", marginTop: 4 }}>These open the phone layout in a compact pane, untouched — each earns its own iPad desk in a later round; nothing gets restyled early.</div>
            </div>
          )}

          {/* ——— CHAT / FOOD — the compact-pane rooms ——— */}
          {(tab === "chat" || tab === "food") && (
            <div style={{ ...card, marginTop: 26, padding: "26px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: "#232227" }}>{tab === "chat" ? "Chat — the notebook that talks back" : "Food — logging and the day's plate"}</div>
              <div style={{ fontSize: 11.5, color: "#66646C", lineHeight: 1.6, marginTop: 6, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
                This room lives on the phone today. It opens here in a compact ~500pt pane, untouched — it earns its own iPad desk in a later round.
              </div>
              <button type="button" onClick={() => setCompact(tab === "chat" ? { href: "/chat", title: "Chat" } : { href: "/health/food", title: "Food" })} style={{ marginTop: 14, height: 42, padding: "0 20px", borderRadius: 11, fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: "#FFFFFF", background: "#A63D63", border: 0, cursor: "pointer" }}>
                Open {tab === "chat" ? "Chat" : "Food"} →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ——— §10: the 64pt bottom tab bar — the phone's real tabs at iPad size ——— */}
      <div style={{ flex: "none", height: 64, background: "#FFFFFF", borderTop: "1px solid #EDEBEE", display: "flex", alignItems: "stretch", justifyContent: "center", gap: 6, padding: "0 16px", boxSizing: "border-box" }}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "center", height: 44, padding: "0 22px", borderRadius: 12, border: 0, cursor: "pointer", background: on ? (t.key === "spirit" ? "#F6E3EB" : "#F2F1F2") : "transparent", color: on ? (t.key === "spirit" ? "#8C2F51" : "#232227") : "#96949B" }}
            >
              {t.icon}
              <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: on ? 700 : 600 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* the compact pane — the phone layout in ~500pt, Done to dismiss */}
      {compact && (
        <>
          <div onClick={() => setCompact(null)} style={{ position: "fixed", inset: 0, background: "rgba(35,34,39,0.18)", zIndex: 70 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 500, maxWidth: "100vw", background: "#F2F1F2", zIndex: 71, boxShadow: "-16px 0 48px rgba(20,15,18,0.25)", display: "flex", flexDirection: "column", animation: "deskSlideInRight .34s cubic-bezier(.2,.9,.25,1.05) both" }}>
            <div style={{ height: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderBottom: "1px solid #E4E2E6", background: "#FFFFFF" }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 700, color: "#96949B" }}>COMPACT · {compact.title.toUpperCase()}</span>
              <span style={{ fontSize: 10, color: "#A9A7AE" }}>the phone layout, untouched</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setCompact(null)} style={{ fontFamily: DISPLAY, fontSize: 12, fontWeight: 600, color: "#FFFFFF", background: "#232227", borderRadius: 99, padding: "6px 14px", border: 0, cursor: "pointer" }}>Done</button>
            </div>
            <iframe src={compact.href} title={compact.title} style={{ flex: 1, border: 0, width: "100%", background: "#F2F1F2" }} />
          </div>
        </>
      )}
    </div>
  );
}
