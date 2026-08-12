"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  fetchServerSettings,
  saveSettingsToServer,
} from "@/lib/settings";
import { SheetPortal } from "@/components/sheet-portal";

// Calorie + macro targets editor. The split is ONE bar that is always
// 100% with two draggable dividers (Michael, 2026-08-11: "the bar already
// represents a hundred percent... two sliders that kind of meet") — no
// arithmetic, the segments ARE the percentages. Drives the Today ring,
// the P/C/F bars, and chat's today_summary goals.

export function MacroTargetsSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [calories, setCalories] = useState("2000");
  // The two dividers: d1 = end of protein, d2 = end of carbs (0–100).
  // P = d1 · C = d2 − d1 · F = 100 − d2. Always sums to 100 by shape.
  const [d1, setD1] = useState(30);
  const [d2, setD2] = useState(70);
  const [saving, setSaving] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | 1 | 2>(null);

  useEffect(() => {
    if (!open) return;
    fetchServerSettings().then((s) => {
      setCalories(String(s.calorieTarget));
      const p = Math.max(5, Math.min(90, Math.round(s.proteinPct)));
      const c = Math.max(5, Math.min(90, Math.round(s.carbsPct)));
      setD1(p);
      setD2(Math.min(95, p + c));
    });
  }, [open]);

  if (!open) return null;

  const pct = { p: d1, c: d2 - d1, f: 100 - d2 };
  const kcal = Number.parseInt(calories) || 0;
  const grams = {
    p: Math.round((kcal * pct.p) / 100 / 4),
    c: Math.round((kcal * pct.c) / 100 / 4),
    f: Math.round((kcal * pct.f) / 100 / 9),
  };

  const MIN_SEG = 5; // no macro squeezed below 5%
  const dragTo = (clientX: number) => {
    const which = dragRef.current;
    const rect = barRef.current?.getBoundingClientRect();
    if (!which || !rect) return;
    const raw = Math.round(((clientX - rect.left) / rect.width) * 100);
    if (which === 1) {
      setD1(Math.max(MIN_SEG, Math.min(d2 - MIN_SEG, raw)));
    } else {
      setD2(Math.max(d1 + MIN_SEG, Math.min(100 - MIN_SEG, raw)));
    }
  };

  const save = async () => {
    if (kcal < 800 || kcal > 6000) {
      toast.error("Calorie target looks off (800–6000).");
      return;
    }
    setSaving(true);
    try {
      await saveSettingsToServer({
        calorieTarget: kcal,
        proteinPct: pct.p,
        carbsPct: pct.c,
        fatPct: pct.f,
      });
      toast.success("Targets set — the ring follows.");
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetPortal>
      <div className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]" onClick={onClose} />
      <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
        <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
        <p
          className="text-xl font-bold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Daily targets
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Calories plus the macro split — grams update live.
        </p>

        <label className="mt-4 block">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
            CALORIES / DAY
          </span>
          <input
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            className="mt-0.5 w-full rounded-[10px] border border-border bg-background px-3 py-2.5 text-center text-lg font-bold tabular-nums outline-none"
            style={{ fontFamily: "var(--font-display)" }}
          />
        </label>

        {/* The split bar — always 100%; drag the two dividers */}
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-[10px] font-semibold tracking-wide text-muted-foreground">
            <span>MACRO SPLIT · DRAG THE DIVIDERS</span>
          </div>
          <div
            ref={barRef}
            className="relative h-9 touch-none select-none overflow-visible rounded-full"
            onPointerDown={(e) => {
              // grab the nearer divider
              const rect = e.currentTarget.getBoundingClientRect();
              const raw = ((e.clientX - rect.left) / rect.width) * 100;
              dragRef.current = Math.abs(raw - d1) <= Math.abs(raw - d2) ? 1 : 2;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              dragTo(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons > 0) dragTo(e.clientX);
            }}
            onPointerUp={() => (dragRef.current = null)}
          >
            <div className="absolute inset-0 flex overflow-hidden rounded-full">
              <div style={{ width: `${pct.p}%`, background: "#A63D63" }} />
              <div style={{ width: `${pct.c}%`, background: "#232227" }} />
              <div style={{ width: `${pct.f}%`, background: "#A9A7AE" }} />
            </div>
            {[d1, d2].map((d, i) => (
              <div
                key={i}
                className="absolute top-1/2 h-[46px] w-[18px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-full border-[3px] border-white bg-card shadow-[0_2px_8px_rgba(35,34,39,0.35)]"
                style={{ left: `${d}%` }}
              />
            ))}
          </div>
          <div className="mt-2.5 flex text-center">
            {(
              [
                ["P", pct.p, grams.p, "#A63D63"],
                ["C", pct.c, grams.c, "#232227"],
                ["F", pct.f, grams.f, "#A9A7AE"],
              ] as const
            ).map(([label, percent, g, color]) => (
              <div key={label} className="flex-1">
                <span
                  className="text-[15px] font-bold tabular-nums"
                  style={{ fontFamily: "var(--font-display)", color }}
                >
                  {label} {percent}%
                </span>
                <span className="block text-[10.5px] tabular-nums text-muted-foreground">
                  {g} g
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-[12px] border border-[#D9D7DC] bg-card py-3 text-[13.5px] font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-[1.5] rounded-[12px] bg-primary py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {saving ? "Saving…" : "Save targets"}
          </button>
        </div>
      </div>
    </SheetPortal>
  );
}
