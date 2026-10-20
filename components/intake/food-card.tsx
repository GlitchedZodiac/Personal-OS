"use client";

// The food proposal card's body and its food-only actions (2026-10-18, the
// intake lane). Extracted from app/(tabs)/chat/page.tsx so the chips, the
// "last time" line, the confidence hint and the save-as-usual offer live in
// one place while two other lanes edit that page. The page keeps the shared
// card frame (header, Confirm, Reject, the saved strip) and the scales state;
// everything food-specific is here.
//
// NO DESIGN SLICE exists for the chips, the hint lines or the usual offer
// (PORT GATE §5). Lane C's ratchet (2026-10-20): everything NEW here uses the
// shadcn Button, the standard type scale and token classes; the rows, the
// steppers, the totals and the Edit / Log usual buttons were moved verbatim
// from app/(tabs)/chat/page.tsx and keep their original markup.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { foodNameOf } from "@/lib/food-match";
import type { FoodFlag } from "@/lib/food-check";

export interface FoodCardUsual {
  id?: string;
  foodDescription: string;
  mealType?: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  kind?: string;
  servingLabel?: string | null;
}

export interface FoodCardHistory {
  count: number;
  days: number;
  medianKcal: number;
  medianProteinG: number;
  medianCarbsG: number;
  medianFatG: number;
  spreadPct: number;
  lastKcal: number;
  lastAt: string;
  matchedDescription: string;
}

export interface FoodCardItem {
  mealType?: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedAt?: string;
  confidence?: "high" | "medium" | "low";
  flags?: FoodFlag[];
  usual?: FoodCardUsual;
  history?: FoodCardHistory;
  suggestUsual?: boolean;
}

/** One tap on a portion: the whole card at ½×, 1.5× or 2× (1× puts it back). */
export const PORTION_CHIPS = [0.5, 1, 1.5, 2] as const;

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const DISMISSED_KEY = "pitaya.usual-dismissed";

// ─── scaling helpers (pure; the page owns the state) ─────────────────────

export function scaleFoodItems<T extends FoodCardItem>(items: T[], scales: number[] | undefined): T[] {
  return items.map((it, i) => {
    const s = scales?.[i] ?? 1;
    if (s === 1) return it;
    return {
      ...it,
      calories: Math.round(it.calories * s),
      proteinG: Math.round(it.proteinG * s * 10) / 10,
      carbsG: Math.round(it.carbsG * s * 10) / 10,
      fatG: Math.round(it.fatG * s * 10) / 10,
    };
  });
}

export function bumpFoodScale(scales: number[] | undefined, idx: number, dir: 1 | -1, count: number): number[] {
  const next = [...(scales ?? Array.from({ length: count }, () => 1))];
  next[idx] = Math.max(0.25, Math.round(((next[idx] ?? 1) + dir * 0.25) * 100) / 100);
  return next;
}

export function setAllFoodScales(count: number, factor: number): number[] {
  return Array.from({ length: count }, () => factor);
}

export function setFoodScale(scales: number[] | undefined, idx: number, value: number, count: number): number[] {
  const next = [...(scales ?? Array.from({ length: count }, () => 1))];
  next[idx] = Math.max(0.1, Math.round(value * 100) / 100);
  return next;
}

/** Which chip is "on": every item at the same factor. */
function currentFactor(scales: number[] | undefined, count: number): number | null {
  if (!scales || count === 0) return 1;
  const first = scales[0] ?? 1;
  return scales.slice(0, count).every((s) => (s ?? 1) === first) ? first : null;
}

function dismissedUsuals(): Set<string> {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function fmtLastTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── body ────────────────────────────────────────────────────────────────

export function FoodCardBody({
  items,
  scales,
  editing,
  pending,
  collapsed,
  onBump,
  onSetAll,
  onUseLastTime,
}: {
  /** the proposal's items as stored (unscaled, with usual/history/flags) */
  items: FoodCardItem[];
  scales: number[] | undefined;
  editing: boolean;
  pending: boolean;
  /** rows the server folded because the model listed them twice */
  collapsed?: number;
  onBump: (idx: number, dir: 1 | -1) => void;
  onSetAll: (factor: number) => void;
  /** scale one item so its kcal equals what he logged last time */
  onUseLastTime: (idx: number, factor: number) => void;
}) {
  const shown = scaleFoodItems(items, scales);
  const totalKcal = shown.reduce((s, i) => s + i.calories, 0);
  const totals = shown.reduce(
    (acc, i) => ({ p: acc.p + i.proteinG, c: acc.c + i.carbsG, f: acc.f + i.fatG }),
    { p: 0, c: 0, f: 0 }
  );
  const factor = currentFactor(scales, items.length);

  return (
    <>
      {shown.map((it, i) => {
        const raw = items[i];
        const mismatch = raw.flags?.find((f) => f.kind === "macro_mismatch");
        const dup = raw.flags?.find((f) => f.kind === "duplicate_collapsed");
        const unsure = raw.confidence === "low" || raw.confidence === "medium";
        const h = raw.history;
        // "use it" only when last time's number is about this portion — a half
        // arepa must never be scaled up to a whole one's kcal.
        const ratio = h && raw.calories > 0 ? h.medianKcal / raw.calories : null;
        const lastTimeFactor = ratio != null && ratio >= 2 / 3 && ratio <= 1.5 ? ratio : null;
        return (
          <div key={i} className="flex items-center justify-between border-b border-muted py-2.5">
            <div className="min-w-0 pr-2">
              <p className="text-[13.5px] font-semibold text-foreground">{it.foodDescription}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {Math.round(it.proteinG)}P · {Math.round(it.carbsG)}C · {Math.round(it.fatG)}F
                {unsure ? <span className="ml-1.5 text-muted-foreground/80">· {raw.confidence === "low" ? "a guess" : "roughly"}</span> : null}
              </p>
              {raw.usual ? (
                <p className="mt-0.5 text-[10.5px] font-semibold text-primary">≈ your usual · {raw.usual.foodDescription}</p>
              ) : null}
              {h && !raw.usual ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>
                    last time: {h.lastKcal} kcal
                    {h.count > 1 ? ` · ×${h.count}` : ""}
                    {h.lastAt ? ` · ${fmtLastTime(h.lastAt)}` : ""}
                  </span>
                  {pending && lastTimeFactor && h.spreadPct <= 25 && Math.abs(lastTimeFactor - (scales?.[i] ?? 1)) > 0.02 ? (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto px-0"
                      onClick={() => onUseLastTime(i, lastTimeFactor)}
                    >
                      use it
                    </Button>
                  ) : null}
                </p>
              ) : null}
              {mismatch ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  kcal and macros disagree (4P+4C+9F = {mismatch.macroKcal})
                </p>
              ) : null}
              {dup ? (
                <p className="mt-0.5 text-xs text-muted-foreground">listed {dup.copies}× by the model — kept once</p>
              ) : null}
            </div>
            {editing ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onBump(i, -1)}
                  className="h-[26px] w-[26px] rounded-[8px] border border-border bg-card text-[15px] leading-none text-primary"
                  aria-label="Smaller portion"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-[13.5px] font-bold tabular-nums text-primary">{it.calories}</span>
                <button
                  type="button"
                  onClick={() => onBump(i, 1)}
                  className="h-[26px] w-[26px] rounded-[8px] border border-border bg-card text-[15px] leading-none text-primary"
                  aria-label="Larger portion"
                >
                  +
                </button>
              </span>
            ) : (
              <span className="text-[13.5px] font-semibold tabular-nums text-foreground">{it.calories}</span>
            )}
          </div>
        );
      })}

      {collapsed ? (
        <p className="pt-2 text-xs text-muted-foreground">
          {collapsed} repeated {collapsed === 1 ? "row was" : "rows were"} folded into the list above.
        </p>
      ) : null}

      {items.length > 0 && (
        <div className="flex items-center justify-between py-[11px]">
          <span className="text-sm font-bold text-foreground" style={DISPLAY}>
            Total · {Math.round(totals.p)}P / {Math.round(totals.c)}C / {Math.round(totals.f)}F
          </span>
          <span className="text-[17px] font-bold tabular-nums text-foreground" style={DISPLAY}>
            {totalKcal.toLocaleString()} kcal
          </span>
        </div>
      )}

      {pending && items.length > 0 && (
        <div className="flex items-center gap-1.5 pb-2" role="group" aria-label="Portion">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">portion</span>
          {PORTION_CHIPS.map((f) => {
            const on = factor === f;
            return (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => onSetAll(f)}
                aria-pressed={on}
                className="min-w-11 rounded-full"
              >
                {f === 0.5 ? "½×" : `${f}×`}
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── food-only actions (beside the page's Confirm and Reject) ────────────

export function FoodCardActions({
  items,
  editing,
  onToggleEdit,
  onResolve,
}: {
  items: FoodCardItem[];
  editing: boolean;
  onToggleEdit: () => void;
  /** the page marks the card saved/rejected and PATCHes the proposal */
  onResolve: (status: "saved" | "rejected") => Promise<void> | void;
}) {
  const usual = items.length === 1 ? items[0].usual : undefined;
  const [busy, setBusy] = useState(false);

  const logUsual = async () => {
    if (!usual || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...usual, logNow: true, loggedAt: items[0].loggedAt }),
      });
      if (!res.ok) throw new Error();
      await onResolve("rejected");
      toast.success("Logged your usual — exact saved macros");
    } catch {
      toast.error("Couldn't log the usual");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onToggleEdit}
        className="tap-scale flex-1 rounded-[10px] border border-border py-[11px] text-[13px] font-semibold text-foreground"
        style={DISPLAY}
      >
        {editing ? "Done" : "Edit"}
      </button>
      {usual ? (
        <button
          type="button"
          onClick={logUsual}
          disabled={busy}
          className="tap-scale flex-1 rounded-[10px] border border-primary/30 bg-accent py-[11px] text-[13px] font-semibold text-primary disabled:opacity-60"
          style={DISPLAY}
        >
          Log usual
        </button>
      ) : null}
    </>
  );
}

// ─── "save as a usual?" — a proposal of its own, never automatic ─────────

export function SaveAsUsualOffer({ items }: { items: FoodCardItem[] }) {
  const candidate = items.find((it) => it.suggestUsual && it.history && !it.usual);
  const name = candidate ? foodNameOf(candidate.foodDescription) : null;
  const [state, setState] = useState<"offer" | "saving" | "saved" | "dismissed">(() =>
    name && typeof window !== "undefined" && dismissedUsuals().has(name.toLowerCase()) ? "dismissed" : "offer"
  );
  if (!candidate || !name || !candidate.history || state === "dismissed") return null;
  const h = candidate.history;

  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: name,
          mealType: candidate.mealType ?? "snack",
          calories: h.medianKcal,
          proteinG: h.medianProteinG,
          carbsG: h.medianCarbsG,
          fatG: h.medianFatG,
          kind: "meal",
        }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      toast.success(`"${name}" is in My usuals — one tap next time.`);
    } catch {
      setState("offer");
      toast.error("Couldn't save that usual");
    }
  };
  const dismiss = () => {
    try {
      const set = dismissedUsuals();
      set.add(name.toLowerCase());
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
    } catch {
      // a per-viewer convenience; losing it only re-asks
    }
    setState("dismissed");
  };

  return (
    <div className="mx-3.5 mb-3 flex items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2">
      <p className="min-w-0 text-xs text-foreground">
        {state === "saved" ? (
          <>Saved as a usual.</>
        ) : (
          <>
            <span className="font-semibold">{name}</span> on {h.days} days, ≈{h.medianKcal} kcal each time — save it as a usual?
          </>
        )}
      </p>
      {state !== "saved" && (
        <span className="flex flex-none gap-1.5">
          <Button type="button" size="sm" onClick={save} disabled={state === "saving"}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
        </span>
      )}
    </div>
  );
}
