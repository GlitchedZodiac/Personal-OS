"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchServerSettings, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getTimeZoneOffsetMinutesForDateString,
} from "@/lib/timezone";

interface WaterTrackerProps {
  onUpdate?: () => void;
  compact?: boolean;
}

const BASE_WATER_TARGET_ML = 2500;
const GLASS_ML = 250;

type WaterResponse = {
  logs: Array<{ id: string; loggedAt: string; amountMl: number }>;
  manualMl: number;
  inferredFluidMl: number;
  workoutAdjustmentMl: number;
  targetMl: number;
  totalMl: number;
  glasses: number;
};

export function WaterTracker({ onUpdate, compact = false }: WaterTrackerProps) {
  const [timeZone, setTimeZone] = useState(getSettings().timeZone);
  const [totalMl, setTotalMl] = useState(0);
  const [manualMl, setManualMl] = useState(0);
  const [inferredFluidMl, setInferredFluidMl] = useState(0);
  const [glasses, setGlasses] = useState(0);
  const [targetMl, setTargetMl] = useState(BASE_WATER_TARGET_ML);
  const [loading, setLoading] = useState(true);

  const fetchWater = async () => {
    try {
      const now = new Date();
      const today = getDateStringInTimeZone(now, timeZone);
      const tzOffsetMinutes = getTimeZoneOffsetMinutesForDateString(
        today,
        timeZone
      );
      const res = await fetch(
        `/api/health/water?date=${today}&tzOffsetMinutes=${tzOffsetMinutes}&timeZone=${encodeURIComponent(
          timeZone
        )}`
      );
      if (!res.ok) return;

      const data: Partial<WaterResponse> = await res.json();
      setTotalMl(data.totalMl ?? 0);
      setManualMl(data.manualMl ?? data.totalMl ?? 0);
      setInferredFluidMl(data.inferredFluidMl ?? 0);
      setGlasses(data.glasses ?? 0);
      setTargetMl(data.targetMl ?? BASE_WATER_TARGET_ML);
    } catch (error) {
      console.error("Failed to fetch water:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServerSettings().then((s) => setTimeZone(s.timeZone));
  }, []);

  useEffect(() => {
    fetchWater();
  }, [timeZone]);

  const addWater = async () => {
    try {
      const res = await fetch("/api/health/water", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMl: GLASS_ML }),
      });
      if (res.ok) {
        await fetchWater();
        onUpdate?.();
      }
    } catch {
      toast.error("Failed to log water");
    }
  };

  const removeWater = async () => {
    if (glasses <= 0) return;
    try {
      const now = new Date();
      const date = getDateStringInTimeZone(now, timeZone);
      const tzOffsetMinutes = getTimeZoneOffsetMinutesForDateString(date, timeZone);
      const res = await fetch(
        `/api/health/water?date=${date}&tzOffsetMinutes=${tzOffsetMinutes}&timeZone=${encodeURIComponent(
          timeZone
        )}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchWater();
        onUpdate?.();
      }
    } catch {
      toast.error("Failed to remove water");
    }
  };

  const pct = Math.min((totalMl / Math.max(targetMl, 1)) * 100, 100);
  const targetGlasses = Math.ceil(targetMl / GLASS_ML);

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
            {loading ? "..." : `${(totalMl / 1000).toFixed(1)} / ${(targetMl / 1000).toFixed(1)}L`}
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

        {!loading && (
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {inferredFluidMl > 0
                ? `Auto +${Math.round(inferredFluidMl)}ml from drinks and soups`
                : "Only manual water entries counted so far"}
            </span>
            <Link href="/health/water" className="text-[10px] text-primary hover:underline">
              manage
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">Hydration</span>
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
              i < Math.ceil(totalMl / GLASS_ML)
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
          {loading ? "..." : `${(totalMl / 1000).toFixed(1)}L`} / {(targetMl / 1000).toFixed(1)}L
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

      {!loading && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-muted-foreground">
            Manual: {Math.round(manualMl)}ml
            {inferredFluidMl > 0 ? ` • Auto inferred: ${Math.round(inferredFluidMl)}ml` : ""}
          </p>
          <Link href="/health/water" className="text-xs text-primary hover:underline">
            Open hydration log
          </Link>
        </div>
      )}
    </div>
  );
}
