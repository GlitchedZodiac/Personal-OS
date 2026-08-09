"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchServerSettings,
  saveSettingsToServer,
} from "@/lib/settings";
import { SheetPortal } from "@/components/sheet-portal";

// Calorie + macro targets editor (moved here from the old settings page —
// Michael asked for it in the Food section). Drives the Today ring, the
// P/C/F bars, and chat's today_summary goals.

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
  const [protein, setProtein] = useState("30");
  const [carbs, setCarbs] = useState("40");
  const [fat, setFat] = useState("30");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchServerSettings().then((s) => {
      setCalories(String(s.calorieTarget));
      setProtein(String(s.proteinPct));
      setCarbs(String(s.carbsPct));
      setFat(String(s.fatPct));
    });
  }, [open]);

  if (!open) return null;

  const pctSum =
    (Number.parseInt(protein) || 0) +
    (Number.parseInt(carbs) || 0) +
    (Number.parseInt(fat) || 0);

  const kcal = Number.parseInt(calories) || 0;
  const grams = {
    p: Math.round((kcal * (Number.parseInt(protein) || 0)) / 100 / 4),
    c: Math.round((kcal * (Number.parseInt(carbs) || 0)) / 100 / 4),
    f: Math.round((kcal * (Number.parseInt(fat) || 0)) / 100 / 9),
  };

  const save = async () => {
    if (kcal < 800 || kcal > 6000) {
      toast.error("Calorie target looks off (800–6000).");
      return;
    }
    if (pctSum !== 100) {
      toast.error(`Macros must total 100% (now ${pctSum}%).`);
      return;
    }
    setSaving(true);
    try {
      await saveSettingsToServer({
        calorieTarget: kcal,
        proteinPct: Number.parseInt(protein),
        carbsPct: Number.parseInt(carbs),
        fatPct: Number.parseInt(fat),
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

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {(
            [
              ["P %", protein, setProtein, grams.p],
              ["C %", carbs, setCarbs, grams.c],
              ["F %", fat, setFat, grams.f],
            ] as const
          ).map(([label, value, setter, g]) => (
            <label key={label} className="block">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">
                {label}
              </span>
              <input
                inputMode="numeric"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="mt-0.5 w-full rounded-[10px] border border-border bg-background px-2 py-2 text-center text-[15px] font-semibold tabular-nums outline-none"
              />
              <span className="mt-0.5 block text-center text-[10px] tabular-nums text-muted-foreground">
                {g} g
              </span>
            </label>
          ))}
        </div>
        <p
          className="mt-2 text-center text-[11px] font-semibold"
          style={{ color: pctSum === 100 ? "#5E9B72" : "#B54B4B" }}
        >
          {pctSum}% of 100%
        </p>

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
