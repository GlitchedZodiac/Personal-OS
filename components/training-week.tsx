"use client";

// THIS WEEK · PLANNED — the dynamic training week he dictates in chat
// (2026-08-28): planned days with their routine/trail, auto-marked done when
// a session saves, editable in place. Renders nothing while no week is
// planned, so the Train screen stays untouched until he uses it.
//
// UNDESIGNED: no design slice exists for this strip — built inside the Train
// page's visual register and flagged for the next design round (the
// FreestyleRunView precedent). PORT GATE applies when a slice lands.

import { useCallback, useEffect, useState } from "react";

interface PlanRow {
  id: string;
  localDate: string;
  title: string;
  notes: string | null;
  sequenceName: string | null;
  trailName: string | null;
  targetWeightKg: number | null;
  status: string;
}

interface WeekPayload {
  weekStart: string;
  weekEnd: string;
  plans: PlanRow[];
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  planned: { label: "planned", color: "#96949B" },
  done: { label: "done", color: "#5E9B72" },
  skipped: { label: "skipped", color: "#D9A23E" },
};

function dayLabel(day: string) {
  const d = new Date(`${day}T12:00:00`);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })
    : day;
}

function isToday(day: string) {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return local === day;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TrainingWeek() {
  const [week, setWeek] = useState<WeekPayload | null>(null);
  const [isNextWeek, setIsNextWeek] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/health/planner");
      if (!res.ok) return;
      const current: WeekPayload = await res.json();
      if (current.plans.length > 0) {
        setWeek(current);
        setIsNextWeek(false);
        return;
      }
      // Friday-planning reality: a week dictated for next Monday would be
      // invisible until Monday — fall forward when this week is empty.
      const upcoming = await fetch(
        `/api/health/planner?weekStart=${nextDay(current.weekEnd)}`
      );
      if (upcoming.ok) {
        const next: WeekPayload = await upcoming.json();
        if (next.plans.length > 0) {
          setWeek(next);
          setIsNextWeek(true);
          return;
        }
      }
      setWeek(current);
      setIsNextWeek(false);
    } catch {
      // The strip is optional chrome — a failed load just hides it.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: "planned" | "done" | "skipped") {
    setBusy(true);
    try {
      await fetch("/api/health/planner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      setOpenId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/health/planner?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setOpenId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!week || week.plans.length === 0) return null;

  const done = week.plans.filter((p) => p.status === "done").length;

  return (
    <div className="mt-3 rounded-[18px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
      <div className="flex items-center justify-between">
        <p className="text-[10.5px] font-semibold tracking-[0.16em] text-muted-foreground">
          {isNextWeek ? "NEXT WEEK · PLANNED" : "THIS WEEK · PLANNED"}
        </p>
        <p className="text-[11px] font-semibold text-[#5E9B72] tabular-nums">
          {done} of {week.plans.length} done
        </p>
      </div>
      <div className="mt-2">
        {week.plans.map((p) => {
          const meta = STATUS_META[p.status] ?? STATUS_META.planned;
          const sub = [p.sequenceName ?? p.trailName, p.notes]
            .filter(Boolean)
            .join(" · ");
          const open = openId === p.id;
          return (
            <div key={p.id} className="border-b border-muted last:border-b-0">
              <button
                onClick={() => setOpenId(open ? null : p.id)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <span
                  className="w-14 flex-none text-[11px] font-bold tabular-nums"
                  style={{ color: isToday(p.localDate) ? "#8C2F51" : "#96949B" }}
                >
                  {dayLabel(p.localDate)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-semibold text-foreground"
                    style={{
                      textDecoration: p.status === "skipped" ? "line-through" : undefined,
                    }}
                  >
                    {p.title}
                    {p.targetWeightKg ? ` · ${p.targetWeightKg} kg` : ""}
                  </span>
                  {sub && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {sub}
                    </span>
                  )}
                </span>
                <span
                  className="flex-none text-[11px] font-semibold"
                  style={{ color: meta.color }}
                >
                  {p.status === "done" ? "✓ done" : meta.label}
                </span>
              </button>
              {open && (
                <div className="flex gap-2 pb-2.5 pl-[68px]">
                  {p.status !== "done" && (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(p.id, "done")}
                      className="rounded-full bg-[#EAF3ED] px-3 py-1 text-[11px] font-semibold text-[#3E7A54]"
                    >
                      Mark done
                    </button>
                  )}
                  {p.status === "planned" ? (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(p.id, "skipped")}
                      className="rounded-full bg-[#F7F0E4] px-3 py-1 text-[11px] font-semibold text-[#A87B24]"
                    >
                      Skip
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => setStatus(p.id, "planned")}
                      className="rounded-full bg-[#F0EEF2] px-3 py-1 text-[11px] font-semibold text-[#66646C]"
                    >
                      Re-plan
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => remove(p.id)}
                    className="rounded-full px-3 py-1 text-[11px] font-semibold text-[#B4536F]"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Plan the week in Chat — &ldquo;this week: Armor Builder Monday, Thursday
        climb Tres Cruces&rdquo;. A saved session marks its day done.
      </p>
    </div>
  );
}
