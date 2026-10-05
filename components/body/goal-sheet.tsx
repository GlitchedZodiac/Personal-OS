"use client";

import { useEffect, useState } from "react";
import { SheetPortal } from "@/components/sheet-portal";
import { type BodyTheme, DISPLAY, LABEL, chipStyle } from "@/components/body/theme";
import { addDays, dayLabel } from "@/lib/body-view";
import type { HealthGoals } from "@/lib/settings";

// Targets sheet (spec §2): weight and body-fat steppers in half steps, four
// month-end date chips, the forecast sentence for the draft, and Done.

/** Four month-ends as the design's date chips, starting about a season out —
 *  from Oct 4 that is Dec 31 / Jan 31 / Feb 28 / Mar 31, the spec's own row. */
export function goalDateChoices(today: string, current: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; out.length < 4 && i < 14; i++) {
    const firstOfNext = new Date(Date.UTC(y, m - 1 + i + 1, 1)).toISOString().slice(0, 10);
    const end = addDays(firstOfNext, -1);
    if (end >= addDays(today, 80)) out.push(end);
  }
  if (!out.includes(current)) {
    out.push(current);
    out.sort();
  }
  return out.slice(0, 5);
}

export function GoalSheet({
  open,
  theme,
  today,
  goals,
  sentenceFor,
  onClose,
}: {
  open: boolean;
  theme: BodyTheme;
  today: string;
  goals: HealthGoals;
  /** The forecast sentence for a draft, so it updates as he adjusts. */
  sentenceFor: (draft: HealthGoals) => string;
  /** Called with the draft when the sheet closes; unchanged drafts are a no-op upstream. */
  onClose: (draft: HealthGoals) => void;
}) {
  const [draft, setDraft] = useState(goals);
  useEffect(() => {
    if (open) setDraft(goals);
    // Reset only on open — edits inside the sheet must not be clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const step = (field: "weightKg" | "bodyFatPct", by: number, lo: number, hi: number) =>
    setDraft((d) => ({ ...d, [field]: Math.max(lo, Math.min(hi, +(d[field] + by).toFixed(1))) }));

  const roundButton = (label: string, glyph: string, onTap: () => void) => (
    <div
      role="button"
      aria-label={label}
      onClick={onTap}
      style={{
        width: 36, height: 36, borderRadius: 99, background: "var(--b-card)", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 20, color: "var(--b-ink)",
        cursor: "pointer", userSelect: "none",
      }}
    >
      {glyph}
    </div>
  );

  const stepper = (label: string, field: "weightKg" | "bodyFatPct", unit: string, lo: number, hi: number) => (
    <div style={{ background: "var(--b-card2)", borderRadius: 16, padding: 14 }}>
      <div style={{ ...LABEL, fontSize: 10.5 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        {roundButton(`Lower ${label.toLowerCase()} target`, "\u2212", () => step(field, -0.5, lo, hi))}
        <div style={{ ...DISPLAY, fontSize: 24, fontWeight: 700, color: "var(--b-ink)" }}>
          {draft[field].toFixed(1)}
          <span style={{ fontSize: 12, color: "var(--b-faint)", marginLeft: 2 }}>{unit}</span>
        </div>
        {roundButton(`Raise ${label.toLowerCase()} target`, "+", () => step(field, 0.5, lo, hi))}
      </div>
    </div>
  );

  const close = () => onClose(draft);

  return (
    <SheetPortal>
      <div className="body-theme" data-theme={theme}>
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, background: "var(--b-scrim)", opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none", transition: "opacity .35s", zIndex: 80,
          }}
        />
        <div
          role="dialog"
          aria-label="Targets"
          aria-hidden={!open}
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 520,
            background: "var(--b-card)", borderRadius: "28px 28px 0 0",
            padding: "12px 22px calc(40px + env(safe-area-inset-bottom))",
            transform: `translateY(${open ? "0%" : "110%"})`,
            transition: "transform .42s cubic-bezier(.32,.86,.3,1)", zIndex: 81,
            boxShadow: "0 -12px 40px rgba(0,0,0,.18)",
          }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 99, background: "var(--b-rule2)", margin: "0 auto" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ ...DISPLAY, fontSize: 20, fontWeight: 700, color: "var(--b-ink)" }}>Targets</div>
            <div
              role="button"
              aria-label="Close"
              onClick={close}
              style={{
                width: 30, height: 30, borderRadius: 99, background: "var(--b-card2)", display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--b-sub)", cursor: "pointer",
              }}
            >
              ✕
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            {stepper("WEIGHT", "weightKg", "kg", 60, 120)}
            {stepper("BODY FAT", "bodyFatPct", "%", 5, 40)}
          </div>
          <div style={{ ...LABEL, fontSize: 10.5, marginTop: 18 }}>BY</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {goalDateChoices(today, goals.byDate).map((day) => (
              <div
                key={day}
                role="button"
                onClick={() => setDraft((d) => ({ ...d, byDate: day }))}
                style={{ ...chipStyle(draft.byDate === day, "square"), flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10, fontSize: 12 }}
              >
                {dayLabel(day)}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 12.5, lineHeight: 1.55, color: "var(--b-sub)", marginTop: 16,
              background: "var(--b-wash)", borderRadius: 12, padding: "12px 14px",
            }}
          >
            {sentenceFor(draft)}
          </div>
          <button
            onClick={close}
            style={{
              ...DISPLAY, width: "100%", marginTop: 16, fontSize: 14, fontWeight: 600, color: "#FFFFFF",
              background: "var(--b-rasp)", border: "none", borderRadius: 12, padding: 14, cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </SheetPortal>
  );
}
