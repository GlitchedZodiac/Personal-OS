"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDataLoggedListener } from "@/components/use-data-logged";
import { SheetPortal } from "@/components/sheet-portal";
import { MacroTargetsSheet } from "@/components/macro-targets-sheet";

// Pitaya Food — port of the design's Food screen (docs/design/
// pitaya-app.dc.html, screen 2): date header + kcal pill, the day
// timeline with per-meal colour tiles and usual / via-chat pills, the
// dashed not-logged row, MY USUALS, and SUPPLEMENTS.
//
// Surfaced deviations (not in the design, added on Michael's ask):
// nutrition-label scanning — a label photo becomes a reusable PRODUCT in
// MY USUALS (per-serving macros + the stored label), so a scanned tub of
// whey is re-logged with one tap forever. Supplements ride on the same
// habit_checks rows Today uses, so a tick is a tick on both screens.

interface FoodEntry {
  id: string;
  loggedAt: string;
  mealType: string;
  foodDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  notes: string | null;
  source: string;
}

interface Favorite {
  id: string;
  foodDescription: string;
  mealType: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  usageCount: number;
  kind: string;
  servingLabel: string | null;
}

interface LabelReading {
  productName: string;
  servingLabel: string;
  servingsPerContainer: number | null;
  perServing: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  confident: boolean;
}

// Design's per-meal tile palette (screen 2 rows, top to bottom).
const MEAL_TILE: Record<string, { bg: string; fg: string }> = {
  breakfast: { bg: "#E8D9C8", fg: "#8A7355" },
  lunch: { bg: "#C8D6C6", fg: "#55704F" },
  dinner: { bg: "#6B4A5C", fg: "#F0E8EC" },
  snack: { bg: "#D8CBE0", fg: "#6E5A7A" },
};

// The design shows dinner as the "not logged" prompt; Michael eats lunch
// and dinner, so those two are the slots worth nagging about.
const PROMPTED_MEALS = ["lunch", "dinner"] as const;

const SUPPLEMENTS = [
  { key: "creatine", label: "Creatine · 5g" },
  { key: "omega-3", label: "Omega-3" },
  { key: "vitamin-d", label: "Vitamin D" },
  { key: "magnesium", label: "Magnesium · evening" },
];

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clockLabel(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M$/i, "");
}

function macroLine(e: { proteinG: number; carbsG: number; fatG: number }) {
  return `${Math.round(e.proteinG)}P · ${Math.round(e.carbsG)}C · ${Math.round(e.fatG)}F`;
}

// Compress to a data URL — same shape as the journal photo path.
function compressImage(file: File, maxW = 1100): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const w = Math.min(img.width, maxW);
        const h = Math.round((img.height * w) / img.width);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export default function FoodPage() {
  const [entries, setEntries] = useState<FoodEntry[] | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [supplementsDone, setSupplementsDone] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [labelPhoto, setLabelPhoto] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [savingScan, setSavingScan] = useState(false);
  const [saveUsualFor, setSaveUsualFor] = useState<FoodEntry | null>(null);
  const [showTargets, setShowTargets] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const dateStr = localDateStr();

  const load = useCallback(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/health/food?date=${dateStr}&timeZone=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setEntries(Array.isArray(rows) ? rows : []))
      .catch(() => setEntries([]));
    fetch("/api/health/favorites")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setFavorites(Array.isArray(rows) ? rows : []))
      .catch(() => setFavorites([]));
    fetch(`/api/health/habits?date=${dateStr}`)
      .then((r) => (r.ok ? r.json() : { checked: [] }))
      .then((d) => setSupplementsDone(d.checked ?? []))
      .catch(() => setSupplementsDone([]));
  }, [dateStr]);

  useEffect(load, [load]);
  useDataLoggedListener(load);

  const dayTotal = useMemo(
    () => (entries ?? []).reduce((sum, e) => sum + (e.calories || 0), 0),
    [entries]
  );

  // Oldest first — the design reads the day downward.
  const timeline = useMemo(
    () =>
      [...(entries ?? [])].sort(
        (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
      ),
    [entries]
  );

  const missingMeals = PROMPTED_MEALS.filter(
    (m) => !(entries ?? []).some((e) => e.mealType === m)
  );

  const dateHeader = new Date()
    .toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })
    .toUpperCase()
    .replace(",", " ·");

  // ── Log a usual / product with one tap ──
  const logFavorite = async (fav: Favorite, servingCount = 1) => {
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: fav.foodDescription,
          mealType: fav.mealType,
          calories: fav.calories,
          proteinG: fav.proteinG,
          carbsG: fav.carbsG,
          fatG: fav.fatG,
          kind: fav.kind,
          servingLabel: fav.servingLabel,
          servings: servingCount,
          logNow: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${fav.foodDescription} logged`);
      load();
    } catch {
      toast.error("Couldn't log that one");
    }
  };

  // ── Save an existing entry as a usual ──
  const saveAsUsual = async (entry: FoodEntry) => {
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: entry.foodDescription,
          mealType: entry.mealType,
          calories: entry.calories,
          proteinG: entry.proteinG,
          carbsG: entry.carbsG,
          fatG: entry.fatG,
          kind: "meal",
          logNow: false,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${entry.foodDescription}" saved to your usuals`);
      setSaveUsualFor(null);
      load();
    } catch {
      toast.error("Couldn't save that usual");
    }
  };

  const deleteEntry = async (entry: FoodEntry) => {
    try {
      const res = await fetch(`/api/health/food?id=${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Entry removed");
      setSaveUsualFor(null);
      load();
    } catch {
      toast.error("Couldn't remove that entry");
    }
  };

  // ── Scan a nutrition label ──
  const handleLabel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const dataUrl = await compressImage(file);
      setLabelPhoto(dataUrl);
      const res = await fetch("/api/health/food/scan-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setReading(body as LabelReading);
      setServings(1);
    } catch (err) {
      setLabelPhoto(null);
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't read that label"
      );
    } finally {
      setScanning(false);
    }
  };

  const confirmScan = async () => {
    if (!reading) return;
    setSavingScan(true);
    try {
      const res = await fetch("/api/health/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foodDescription: reading.productName,
          mealType: "snack",
          calories: reading.perServing.calories,
          proteinG: reading.perServing.proteinG,
          carbsG: reading.perServing.carbsG,
          fatG: reading.perServing.fatG,
          kind: "product",
          servingLabel: reading.servingLabel,
          photoData: labelPhoto,
          servings,
          logNow: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${reading.productName} logged and saved`);
      setReading(null);
      setLabelPhoto(null);
      load();
    } catch {
      toast.error("Couldn't save that scan");
    } finally {
      setSavingScan(false);
    }
  };

  const toggleSupplement = async (key: string) => {
    setSupplementsDone((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    try {
      await fetch("/api/health/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: key, localDate: dateStr }),
      });
    } catch {
      load();
    }
  };

  return (
    // pb-44: the floating dock sits over the last card at pb-32 (the
    // supplements rows were unreachable behind the mic).
    <div className="px-4 pb-44 pt-12 lg:px-0 lg:pt-8 max-w-lg lg:max-w-2xl">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="micro-label">{dateHeader}</p>
          <h1
            className="mt-0.5 text-3xl font-bold tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Food
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Kept from his bug sweep — the only place to set calorie/macro goals */}
          <button
            onClick={() => setShowTargets(true)}
            className="rounded-full border border-border px-3 py-[5px] text-xs font-semibold text-secondary-foreground"
          >
            Targets
          </button>
          <span className="rounded-full bg-accent px-3 py-[5px] text-xs font-semibold tabular-nums text-[#8C2F51]">
            {fmt(dayTotal)} kcal
          </span>
        </div>
      </div>

      {/* Day timeline */}
      <div className="mt-[18px] overflow-hidden rounded-[18px] bg-card shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        {timeline.map((entry) => {
          const tile = MEAL_TILE[entry.mealType] ?? MEAL_TILE.snack;
          return (
            <button
              key={entry.id}
              onClick={() => setSaveUsualFor(entry)}
              className="flex w-full items-center justify-between border-b border-muted px-4 py-3.5 text-left last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] text-[9px] tracking-[0.08em]"
                  style={{ background: tile.bg, color: tile.fg }}
                >
                  {clockLabel(entry.loggedAt)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">
                    {entry.foodDescription}{" "}
                    {entry.source === "usual" && (
                      <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-[#8C2F51]">
                        usual
                      </span>
                    )}
                    {(entry.source === "ai" || entry.source === "chat") && (
                      <span className="rounded-full bg-[#EAF3ED] px-1.5 py-px text-[10px] font-semibold text-[#3E7A54]">
                        via chat ✓
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {macroLine(entry)}
                  </p>
                </div>
              </div>
              <span className="ml-2 shrink-0 text-[13.5px] font-semibold tabular-nums text-foreground">
                {fmt(entry.calories)}
              </span>
            </button>
          );
        })}

        {/* Not-logged prompts — the design's dashed row */}
        {missingMeals.map((meal) => (
          <div
            key={meal}
            className="flex items-center justify-between border-b border-muted px-4 py-3.5 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#D9D7DC] text-[18px] text-muted-foreground">
                +
              </div>
              <div>
                <p className="text-[13.5px] font-semibold text-muted-foreground">
                  <span className="capitalize">{meal}</span> — not logged
                </p>
                <p className="mt-0.5 text-[11px] text-[#B9B7BE]">the mic knows</p>
              </div>
            </div>
          </div>
        ))}

        {entries !== null && timeline.length === 0 && missingMeals.length === 0 && (
          <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
            Nothing logged yet today.
          </p>
        )}
      </div>

      {/* MY USUALS */}
      <p className="micro-label mb-2.5 mt-5">My usuals</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {favorites.map((fav) => (
          <button
            key={fav.id}
            onClick={() => logFavorite(fav)}
            className="flex-none rounded-[14px] bg-card px-3.5 py-3 text-left shadow-[0_2px_12px_rgba(35,34,39,0.06)]"
          >
            <p className="text-[12.5px] font-semibold text-foreground">
              {fav.foodDescription}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              {fmt(fav.calories)} · {Math.round(fav.proteinG)}P
              {fav.kind === "product" && fav.servingLabel
                ? ` · ${fav.servingLabel}`
                : ""}
            </p>
          </button>
        ))}
        <button
          onClick={() => labelInputRef.current?.click()}
          disabled={scanning}
          className="flex flex-none items-center rounded-[14px] border-[1.5px] border-dashed border-[#D9D7DC] px-3.5 py-3 text-[12.5px] text-muted-foreground disabled:opacity-60"
        >
          {scanning ? "Reading label…" : "+ scan a label"}
        </button>
      </div>
      <input
        ref={labelInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleLabel}
      />

      {/* SUPPLEMENTS */}
      <div className="mt-4 rounded-[16px] bg-card p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
        <p className="micro-label mb-2.5">Supplements</p>
        <div className="grid gap-2.5">
          {SUPPLEMENTS.map(({ key, label }) => {
            const done = supplementsDone.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggleSupplement(key)}
                className="flex items-center justify-between text-left"
              >
                <span className="text-[13px] text-[#454349]">{label}</span>
                <span
                  className="text-[11.5px] font-semibold"
                  style={{ color: done ? "#5E9B72" : "#96949B" }}
                >
                  {done ? "✓ taken" : "tap when taken"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ——— Label reading confirm (AI proposes → you confirm → it saves) ——— */}
      {reading && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => !savingScan && setReading(null)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p className="micro-label">
              Label read{reading.confident ? "" : " · check these numbers"}
            </p>
            <p
              className="mt-1 text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {reading.productName}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              per {reading.servingLabel}
              {reading.servingsPerContainer
                ? ` · ${reading.servingsPerContainer} per container`
                : ""}
            </p>

            <div className="mt-3.5 rounded-[16px] bg-accent p-4">
              <div className="flex items-center gap-3.5">
                <button
                  onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
                  className="h-11 w-11 rounded-[12px] bg-card text-[22px] leading-none text-[#8C2F51]"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <p
                    className="text-[26px] font-bold tabular-nums text-foreground"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {servings} × serving{servings === 1 ? "" : "s"}
                  </p>
                  <p className="text-[11px] font-semibold text-[#8C2F51]">
                    {fmt(reading.perServing.calories * servings)} kcal ·{" "}
                    {Math.round(reading.perServing.proteinG * servings)}P ·{" "}
                    {Math.round(reading.perServing.carbsG * servings)}C ·{" "}
                    {Math.round(reading.perServing.fatG * servings)}F
                  </p>
                </div>
                <button
                  onClick={() => setServings((s) => s + 0.5)}
                  className="h-11 w-11 rounded-[12px] bg-primary text-[22px] leading-none text-white"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={confirmScan}
              disabled={savingScan}
              className="mt-4 w-full rounded-[12px] bg-foreground py-[13px] text-sm font-semibold text-background disabled:opacity-60"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {savingScan ? "Saving…" : "Log it & save the product"}
            </button>
            <button
              onClick={() => {
                setReading(null);
                setLabelPhoto(null);
              }}
              disabled={savingScan}
              className="mx-auto mt-3 block text-[12.5px] font-semibold text-muted-foreground"
            >
              Discard scan
            </button>
          </div>
        </SheetPortal>
      )}

      {/* ——— Save an entry as a usual ——— */}
      {saveUsualFor && (
        <SheetPortal>
          <div
            className="fixed inset-0 z-[80] bg-[rgba(27,21,24,0.45)]"
            onClick={() => setSaveUsualFor(null)}
          />
          <div className="sheet-up fixed inset-x-0 bottom-0 z-[81] rounded-t-[28px] bg-card px-6 pb-11 pt-6">
            <div className="mx-auto mb-[18px] h-1 w-10 rounded-full bg-border" />
            <p
              className="text-xl font-bold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {saveUsualFor.foodDescription}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {fmt(saveUsualFor.calories)} kcal · {macroLine(saveUsualFor)}
            </p>
            <button
              onClick={() => saveAsUsual(saveUsualFor)}
              className="mt-4 w-full rounded-[12px] bg-foreground py-[13px] text-sm font-semibold text-background"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Save to my usuals
            </button>
            {/* The design's Food screen has no edit/delete affordance —
                logging is a mic job. A wrong row still has to be fixable,
                so removal lives here rather than on the timeline. */}
            <button
              onClick={() => deleteEntry(saveUsualFor)}
              className="mx-auto mt-3 block text-[12.5px] font-semibold text-destructive"
            >
              Delete this entry
            </button>
            <button
              onClick={() => setSaveUsualFor(null)}
              className="mx-auto mt-3 block text-[12.5px] font-semibold text-muted-foreground"
            >
              Close
            </button>
          </div>
        </SheetPortal>
      )}

      <MacroTargetsSheet
        open={showTargets}
        onClose={() => setShowTargets(false)}
        onSaved={load}
      />
    </div>
  );
}
