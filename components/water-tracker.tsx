"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Droplets, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WaterTrackerProps {
  onUpdate?: () => void;
  compact?: boolean;
}

const WATER_TARGET_ML = 2500;
const GLASS_ML = 250;

export function WaterTracker({ onUpdate, compact = false }: WaterTrackerProps) {
  const [totalMl, setTotalMl] = useState(0);
  const [glasses, setGlasses] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchWater = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/health/water?date=${today}`);
      if (res.ok) {
        const data = await res.json();
        setTotalMl(data.totalMl);
        setGlasses(data.glasses);
      }
    } catch (error) {
      console.error("Failed to fetch water:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWater();
  }, []);

  const addWater = async () => {
    try {
      const res = await fetch("/api/health/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl: GLASS_ML }),
      });
      if (res.ok) {
        setTotalMl((prev) => prev + GLASS_ML);
        setGlasses((prev) => prev + 1);
        onUpdate?.();
      }
    } catch {
      toast.error("Failed to log water");
    }
  };

  const removeWater = async () => {
    if (glasses <= 0) return;
    try {
      const res = await fetch("/api/health/water", { method: "DELETE" });
      if (res.ok) {
        setTotalMl((prev) => Math.max(prev - GLASS_ML, 0));
        setGlasses((prev) => Math.max(prev - 1, 0));
        onUpdate?.();
      }
    } catch {
      toast.error("Failed to remove water");
    }
  };

  const pct = Math.min((totalMl / WATER_TARGET_ML) * 100, 100);
  const targetGlasses = Math.ceil(WATER_TARGET_ML / GLASS_ML);

  // Compact mode: just a thin blue bar with +/- buttons
  if (compact) {
    return (
      <div className="mt-4 pt-3 border-t border-border/30">
        <div className="flex items-center gap-2">
          <Droplets className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <div className="flex-1 h-3 rounded-full bg-secondary/40 overflow-hidden relative">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-16 text-right">
            {loading ? "..." : `${(totalMl / 1000).toFixed(1)} / ${(WATER_TARGET_ML / 1000).toFixed(1)}L`}
          </span>
          <div className="flex gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full"
              onClick={removeWater}
              disabled={glasses <= 0}
            >
              <Minus className="h-2.5 w-2.5" />
            </Button>
            <Button
              size="icon"
              className="h-6 w-6 rounded-full bg-blue-500 hover:bg-blue-600"
              onClick={addWater}
            >
              <Plus className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Full mode (legacy)
  return (
    <div className="p-4 border rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">Water</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {loading ? "..." : `${glasses}/${targetGlasses} glasses`}
        </span>
      </div>

      <div className="flex gap-1 mb-3 flex-wrap">
        {Array.from({ length: targetGlasses }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-5 h-6 rounded-sm border transition-all duration-300",
              i < glasses
                ? "bg-blue-400/80 border-blue-400/50"
                : "bg-secondary/30 border-border/30"
            )}
          />
        ))}
      </div>

      <div className="w-full h-2 rounded-full bg-secondary/50 overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? "—" : `${(totalMl / 1000).toFixed(1)}L`} /{" "}
          {(WATER_TARGET_ML / 1000).toFixed(1)}L
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={removeWater}
            disabled={glasses <= 0}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-600"
            onClick={addWater}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
