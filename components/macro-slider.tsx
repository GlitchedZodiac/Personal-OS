"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";

interface MacroSliderProps {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  onChange: (protein: number, carbs: number, fat: number) => void;
  calorieTarget: number;
}

const MIN_PCT = 1; // minimum 1% per macro

/**
 * A horizontal bar with 2 draggable handles that divide it into 3 colored sections:
 *  [Protein (blue)] handle1 [Carbs (amber)] handle2 [Fat (rose)]
 *
 * The three percentages always sum to 100.
 * Supports 1% fine-tuning via both dragging and +/- buttons.
 */
export function MacroSlider({
  proteinPct,
  carbsPct,
  fatPct,
  onChange,
  calorieTarget,
}: MacroSliderProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"handle1" | "handle2" | null>(null);

  // handle1 position = proteinPct (0-100)
  // handle2 position = proteinPct + carbsPct (0-100)
  const handle1 = proteinPct;
  const handle2 = proteinPct + carbsPct;

  const getPositionFromEvent = useCallback(
    (clientX: number): number => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.round((x / rect.width) * 100);
      return Math.max(MIN_PCT, Math.min(100 - MIN_PCT, pct));
    },
    []
  );

  const handleMove = useCallback(
    (clientX: number) => {
      if (!dragging) return;
      const pos = getPositionFromEvent(clientX);

      if (dragging === "handle1") {
        // handle1 can't go past handle2 - MIN_PCT (carbs needs at least MIN_PCT%)
        const maxPos = handle2 - MIN_PCT;
        const newProtein = Math.max(MIN_PCT, Math.min(pos, maxPos));
        const newCarbs = handle2 - newProtein;
        const newFat = 100 - handle2;
        onChange(newProtein, newCarbs, newFat);
      } else {
        // handle2 can't go below handle1 + MIN_PCT
        const minPos = handle1 + MIN_PCT;
        const maxPos = 100 - MIN_PCT; // fat needs at least MIN_PCT%
        const newHandle2 = Math.max(minPos, Math.min(pos, maxPos));
        const newCarbs = newHandle2 - handle1;
        const newFat = 100 - newHandle2;
        onChange(handle1, newCarbs, newFat);
      }
    },
    [dragging, handle1, handle2, getPositionFromEvent, onChange]
  );

  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    };
    const onEnd = () => setDragging(null);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [dragging, handleMove]);

  // +/- button adjusters: adjust one macro by delta, steal/give from the largest other macro
  const adjustMacro = useCallback(
    (macro: "protein" | "carbs" | "fat", delta: number) => {
      let p = proteinPct;
      let c = carbsPct;
      let f = fatPct;

      if (macro === "protein") {
        const newP = p + delta;
        if (newP < MIN_PCT || newP > 100 - 2 * MIN_PCT) return;
        // Steal/give from the largest of the other two
        if (delta > 0) {
          // Increase protein → decrease the largest other macro
          if (c >= f && c > MIN_PCT) c -= delta;
          else if (f > MIN_PCT) f -= delta;
          else return;
        } else {
          // Decrease protein → increase the largest other macro
          if (c >= f) c -= delta;
          else f -= delta;
        }
        p = newP;
      } else if (macro === "carbs") {
        const newC = c + delta;
        if (newC < MIN_PCT || newC > 100 - 2 * MIN_PCT) return;
        if (delta > 0) {
          if (p >= f && p > MIN_PCT) p -= delta;
          else if (f > MIN_PCT) f -= delta;
          else return;
        } else {
          if (p >= f) p -= delta;
          else f -= delta;
        }
        c = newC;
      } else {
        const newF = f + delta;
        if (newF < MIN_PCT || newF > 100 - 2 * MIN_PCT) return;
        if (delta > 0) {
          if (p >= c && p > MIN_PCT) p -= delta;
          else if (c > MIN_PCT) c -= delta;
          else return;
        } else {
          if (p >= c) p -= delta;
          else c -= delta;
        }
        f = newF;
      }

      // Safety: ensure all are at least MIN_PCT and sum to 100
      if (p < MIN_PCT || c < MIN_PCT || f < MIN_PCT) return;
      if (p + c + f !== 100) return;

      onChange(p, c, f);
    },
    [proteinPct, carbsPct, fatPct, onChange]
  );

  const proteinG = Math.round((calorieTarget * proteinPct) / 100 / 4);
  const carbsG = Math.round((calorieTarget * carbsPct) / 100 / 4);
  const fatG = Math.round((calorieTarget * fatPct) / 100 / 9);

  return (
    <div className="space-y-3">
      {/* Labels row with +/- buttons */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <MacroLabel
          label="Protein"
          pct={proteinPct}
          grams={proteinG}
          color="blue"
          onIncrement={() => adjustMacro("protein", 1)}
          onDecrement={() => adjustMacro("protein", -1)}
        />
        <MacroLabel
          label="Carbs"
          pct={carbsPct}
          grams={carbsG}
          color="amber"
          onIncrement={() => adjustMacro("carbs", 1)}
          onDecrement={() => adjustMacro("carbs", -1)}
        />
        <MacroLabel
          label="Fat"
          pct={fatPct}
          grams={fatG}
          color="rose"
          onIncrement={() => adjustMacro("fat", 1)}
          onDecrement={() => adjustMacro("fat", -1)}
        />
      </div>

      {/* Slider bar */}
      <div
        ref={barRef}
        className="relative h-10 rounded-full overflow-hidden cursor-pointer select-none touch-none"
      >
        {/* Colored segments */}
        <div className="absolute inset-0 flex">
          <div
            className="h-full bg-blue-500/80 transition-[width] duration-75"
            style={{ width: `${proteinPct}%` }}
          />
          <div
            className="h-full bg-amber-500/80 transition-[width] duration-75"
            style={{ width: `${carbsPct}%` }}
          />
          <div
            className="h-full bg-rose-500/80 transition-[width] duration-75"
            style={{ width: `${fatPct}%` }}
          />
        </div>

        {/* Handle 1 - between protein and carbs */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10",
            "w-6 h-6 rounded-full bg-white border-2 border-blue-400 shadow-lg",
            "cursor-grab active:cursor-grabbing active:scale-110",
            "transition-shadow duration-150",
            dragging === "handle1" && "ring-4 ring-blue-400/30 scale-110"
          )}
          style={{ left: `${handle1}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging("handle1");
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            setDragging("handle1");
          }}
        />

        {/* Handle 2 - between carbs and fat */}
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10",
            "w-6 h-6 rounded-full bg-white border-2 border-rose-400 shadow-lg",
            "cursor-grab active:cursor-grabbing active:scale-110",
            "transition-shadow duration-150",
            dragging === "handle2" && "ring-4 ring-rose-400/30 scale-110"
          )}
          style={{ left: `${handle2}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging("handle2");
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            setDragging("handle2");
          }}
        />
      </div>

      {/* Calorie breakdown */}
      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
        <span>{Math.round((calorieTarget * proteinPct) / 100)} kcal</span>
        <span>{Math.round((calorieTarget * carbsPct) / 100)} kcal</span>
        <span>{Math.round((calorieTarget * fatPct) / 100)} kcal</span>
      </div>
    </div>
  );
}

/** Individual macro label with +/- buttons for 1% adjustments */
function MacroLabel({
  label,
  pct,
  grams,
  color,
  onIncrement,
  onDecrement,
}: {
  label: string;
  pct: number;
  grams: number;
  color: "blue" | "amber" | "rose";
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const colorClasses = {
    blue: { dot: "bg-blue-400", text: "text-blue-400", btn: "hover:bg-blue-500/20 active:bg-blue-500/30 text-blue-400" },
    amber: { dot: "bg-amber-400", text: "text-amber-400", btn: "hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-400" },
    rose: { dot: "bg-rose-400", text: "text-rose-400", btn: "hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400" },
  }[color];

  return (
    <div>
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        <div className={cn("w-2.5 h-2.5 rounded-full", colorClasses.dot)} />
        <span className={cn("text-xs font-medium", colorClasses.text)}>{label}</span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={onDecrement}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
            colorClasses.btn
          )}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <p className="text-lg font-bold tabular-nums min-w-[2.5rem]">{pct}%</p>
        <button
          type="button"
          onClick={onIncrement}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-colors",
            colorClasses.btn
          )}
          aria-label={`Increase ${label}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">{grams}g</p>
    </div>
  );
}
