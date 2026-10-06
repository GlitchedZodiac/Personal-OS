"use client";

// Train → the jump rope section (2026-10-05). Jump rope lifts no kilograms,
// so the tonnage cards have nothing to say about it; this is where its week
// shows up — jump time instead of volume, the bests, and each protocol's
// sessions side by side. NO DESIGN SLICE EXISTS: built in the Train page's
// card language at Michael's call and flagged for a design pass.

import { useRouter } from "next/navigation";
import { RopeIcon } from "@/components/pitaya-icons";
import { formatClock, type ProtocolGroup } from "@/lib/jump-rope";

export interface JumpRopeTrainData {
  sessions: number;
  weekJumpSeconds: number;
  weeklyJump: { weekStart: string; label: string; jumpSeconds: number }[];
  protocols: (ProtocolGroup & { count: number })[];
  bests: {
    kind: string;
    label: string;
    value: string;
    achievedAt: string;
    workoutLogId: string | null;
  }[];
}

// The Train page's own 8-bar ramp, oldest → current week.
const BAR_COLORS = [
  "#EADFE5", "#EADFE5", "#EADFE5", "#DCA8BE", "#DCA8BE", "#C97D9C", "#C97D9C", "#A63D63",
];

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Oct 5", or "Oct 5 · 5:23 PM" when another session shares the day. */
function sessionLabel(iso: string, all: { startedAt: string }[]) {
  const day = shortDate(iso);
  if (all.filter((s) => shortDate(s.startedAt) === day).length < 2) return day;
  const time = new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** ↑ / ↓ / → between the last two values; "better" depends on the column. */
function trend(values: (number | null)[], higherIsBetter: boolean) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const delta = v[v.length - 1] - v[v.length - 2];
  if (delta === 0) return { glyph: "→", color: "#96949B" };
  const good = higherIsBetter ? delta > 0 : delta < 0;
  return { glyph: delta > 0 ? "↑" : "↓", color: good ? "#5E9B72" : "#D9A23E" };
}

export function JumpRopeSection({ data }: { data: JumpRopeTrainData }) {
  const router = useRouter();
  const max = Math.max(...data.weeklyJump.map((w) => w.jumpSeconds), 1);
  const open = (id: string | null) => {
    if (id) router.push(`/health/workouts/activities/${encodeURIComponent(id)}`);
  };

  return (
    <div className="mt-3 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          <span className="flex text-[#A63D63]">
            <RopeIcon size={14} strokeWidth={2} />
          </span>
          JUMP ROPE · 8 WEEKS
        </p>
        <p className="whitespace-nowrap text-[11px] font-semibold text-[#8C2F51] tabular-nums">
          {formatClock(data.weekJumpSeconds)} jumped this week
        </p>
      </div>

      <div className="mt-3 flex h-[58px] items-end gap-2">
        {data.weeklyJump.map((w, i) => (
          <div
            key={w.weekStart}
            className="flex-1 rounded-t-[6px]"
            style={{
              background: BAR_COLORS[i] ?? "#A63D63",
              height: `${Math.max(4, Math.round((w.jumpSeconds / max) * 100))}%`,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[9.5px] text-muted-foreground">
        <span>{data.weeklyJump[0]?.label ?? ""}</span>
        <span>{data.weeklyJump[data.weeklyJump.length - 1]?.label ?? ""}</span>
      </div>

      {data.bests.length > 0 && (
        <div className="mt-3.5 border-t border-[#F2F1F2] pt-3">
          <p className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">BESTS</p>
          <div className="mt-1.5 grid gap-1.5">
            {data.bests.map((b) => (
              <button
                key={`${b.kind}:${b.label}`}
                onClick={() => open(b.workoutLogId)}
                className="flex items-center justify-between text-left"
              >
                <span className="text-[12.5px] text-foreground">{b.label}</span>
                <span className="text-[12.5px] font-semibold text-[#8C2F51] tabular-nums">
                  {b.value}
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                    {shortDate(b.achievedAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data.protocols.map((g) => {
        const continuous = g.protocol === "continuous";
        const rounds = trend(
          g.sessions.map((s) => (continuous ? s.jumpSeconds : s.roundsCompleted)),
          true
        );
        const workHr = trend(g.sessions.map((s) => s.avgWorkHr), false);
        const drop = trend(g.sessions.map((s) => s.avgDrop), true);
        return (
          <div key={g.protocol} className="mt-3.5 border-t border-[#F2F1F2] pt-3">
            <div className="flex items-center justify-between">
              <p className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">
                {continuous ? "CONTINUOUS" : g.protocol} · {g.count}{" "}
                {g.count === 1 ? "SESSION" : "SESSIONS"}
              </p>
              <p className="text-[10.5px] text-muted-foreground tabular-nums">
                {continuous
                  ? `longest ${formatClock(g.longestJumpSeconds)}`
                  : `best ${g.bestRounds} rounds`}
              </p>
            </div>
            <div className="mt-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 text-[12px] tabular-nums">
              <span className="text-[9px] font-bold tracking-[0.1em] text-muted-foreground">DATE</span>
              <span className="text-right text-[9px] font-bold tracking-[0.1em] text-muted-foreground">
                {continuous ? "TIME" : "ROUNDS"} {rounds && <span style={{ color: rounds.color }}>{rounds.glyph}</span>}
              </span>
              <span className="text-right text-[9px] font-bold tracking-[0.1em] text-muted-foreground">
                WORK HR {workHr && <span style={{ color: workHr.color }}>{workHr.glyph}</span>}
              </span>
              <span className="text-right text-[9px] font-bold tracking-[0.1em] text-muted-foreground">
                DROP {drop && <span style={{ color: drop.color }}>{drop.glyph}</span>}
              </span>
              {[...g.sessions].reverse().map((s) => (
                <button key={s.id} onClick={() => open(s.id)} className="contents text-left">
                  <span className="text-foreground">{sessionLabel(s.startedAt, g.sessions)}</span>
                  <span className="text-right text-foreground">
                    {continuous ? formatClock(s.jumpSeconds) : s.roundsCompleted}
                  </span>
                  <span className="text-right text-foreground">{s.avgWorkHr ?? "—"}</span>
                  <span className="text-right text-foreground">
                    {s.avgDrop != null ? `−${s.avgDrop}` : "—"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-[10px] leading-[1.5] text-muted-foreground">
        Work HR is the average while the rope is turning; drop is how far it fell in each rest. Lower
        work HR for the same rounds, or a bigger drop, is fitness arriving.
      </p>
    </div>
  );
}
