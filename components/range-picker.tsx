"use client";

import { useEffect, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";

// From–to calendar sheet (design 2026-08-11e rev, "Range picker" screen) —
// shared by Food History and Activities. Tap a start day, then an end day;
// future days are locked. Surfaced deviation from the design demo: month
// ‹ › navigation (the demo showed one fixed month; real history runs back
// to Nov 2024).

interface RangePickerProps {
  open: boolean;
  title: string;
  from: string | null; // YYYY-MM-DD
  to: string | null;
  onCancel: () => void;
  onApply: (from: string, to: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function todayLocal(): string {
  const now = new Date();
  return dayStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function labelOf(day: string | null): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RangePicker({ open, title, from, to, onCancel, onApply }: RangePickerProps) {
  const [selFrom, setSelFrom] = useState<string | null>(from);
  const [selTo, setSelTo] = useState<string | null>(to);
  const [cursor, setCursor] = useState(() => {
    const base = to ?? todayLocal();
    const [y, m] = base.split("-").map(Number);
    return { y, m };
  });

  useEffect(() => {
    if (open) {
      setSelFrom(from);
      setSelTo(to);
      const base = to ?? todayLocal();
      const [y, m] = base.split("-").map(Number);
      setCursor({ y, m });
    }
  }, [open, from, to]);

  if (!open) return null;

  const today = todayLocal();
  const monthLabel = new Date(Date.UTC(cursor.y, cursor.m - 1, 1))
    .toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .toUpperCase();
  const firstDow = new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay(); // Sun-first
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();

  const tapDay = (day: string) => {
    if (!selFrom || selTo) {
      setSelFrom(day);
      setSelTo(null);
    } else if (day >= selFrom) {
      setSelTo(day);
    } else {
      setSelFrom(day);
      setSelTo(null);
    }
  };

  const ok = Boolean(selFrom && selTo);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={`b${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const day = dayStr(cursor.y, cursor.m, d);
    const future = day > today;
    const isF = day === selFrom;
    const isT = day === selTo;
    const inR = Boolean(selFrom && selTo && day > selFrom && day < selTo);
    const radius =
      (isF && isT) || (isF && !selTo)
        ? "99px"
        : isF
          ? "99px 0 0 99px"
          : isT
            ? "0 99px 99px 0"
            : inR
              ? "0"
              : "99px";
    cells.push(
      <button
        key={day}
        type="button"
        disabled={future}
        onClick={() => tapDay(day)}
        className="flex h-[38px] items-center justify-center text-[13px] font-semibold tabular-nums"
        style={{
          borderRadius: radius,
          background: isF || isT ? "#A63D63" : inR ? "#F6E3EB" : "transparent",
          color: future ? "#C9C7CD" : isF || isT ? "#FFFFFF" : inR ? "#8C2F51" : "#232227",
        }}
      >
        {d}
      </button>
    );
  }

  const stepMonth = (dir: -1 | 1) => {
    setCursor((c) => {
      let m = c.m + dir;
      let y = c.y;
      if (m < 1) (m = 12), (y -= 1);
      if (m > 12) (m = 1), (y += 1);
      return { y, m };
    });
  };

  return (
    <SheetPortal>
      <div onClick={onCancel} className="fixed inset-0 z-[76] bg-[rgba(27,21,24,0.45)]" />
      <div
        className="fixed inset-x-0 bottom-0 z-[77] rounded-t-[28px] bg-white px-6 pb-10 pt-6"
        style={{ animation: "sheetUp .35s cubic-bezier(.3,.9,.3,1) both" }}
      >
        <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-[#E4E2E6]" />
        <div className="flex items-center justify-between">
          <div
            className="text-[19px] font-bold text-[#232227]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E4E2E6] text-sm text-[#232227]"
            >
              ‹
            </button>
            <span className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E4E2E6] text-sm text-[#232227]"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-3.5 flex gap-2.5">
          <div className="flex-1 rounded-xl border-[1.5px] border-[#E9CFDC] px-3 py-2">
            <div className="text-[9.5px] font-bold tracking-[0.14em] text-[#8C2F51]">FROM</div>
            <div
              className="mt-0.5 text-[15px] font-semibold text-[#232227]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {labelOf(selFrom)}
            </div>
          </div>
          <div className="flex-1 rounded-xl border-[1.5px] border-[#E4E2E6] px-3 py-2">
            <div className="text-[9.5px] font-bold tracking-[0.14em] text-muted-foreground">TO</div>
            <div
              className="mt-0.5 text-[15px] font-semibold text-[#232227]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {selTo ? labelOf(selTo) : "pick a day"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[10px] font-semibold text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-y-1">{cells}</div>

        <div className="mt-2 text-[10.5px] text-muted-foreground">
          Tap a start day, then an end day. Days after today are locked.
        </div>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[#D9D7DC] py-3 text-[13.5px] font-semibold text-[#232227] hover:bg-[#FAF9FA]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ok}
            onClick={() => ok && onApply(selFrom as string, selTo as string)}
            className="flex-[1.6] rounded-xl bg-[#A63D63] py-3 text-[13.5px] font-semibold text-white hover:bg-[#8C2F51]"
            style={{ fontFamily: "var(--font-display)", opacity: ok ? 1 : 0.4 }}
          >
            Apply range
          </button>
        </div>
      </div>
    </SheetPortal>
  );
}
