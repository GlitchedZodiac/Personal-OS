"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Utensils, Dumbbell, Droplets, Flame, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCachedFetch } from "@/lib/cache";
import Link from "next/link";

interface DayLog {
  date: string;
  foods: Array<{ meal: string; description: string; calories: number; protein: number; carbs: number; fat: number }>;
  workouts: Array<{ type: string; description: string | null; minutes: number; burned: number }>;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalBurned: number;
  workoutMinutes: number;
  waterMl: number;
}

export default function DailyLogPage() {
  const [range, setRange] = useState("30");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const url = useMemo(() => `/api/health/daily-log?range=${range}`, [range]);
  const { data, loading } = useCachedFetch<{ days: DayLog[] }>(url, { ttl: 60_000 });

  const days = data?.days ?? [];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const isToday = (dateStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    return dateStr === today;
  };

  return (
    <div className="px-4 pt-12 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/trends">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Daily Log</h1>
            <p className="text-[10px] text-muted-foreground">Food, workouts & calories by day</p>
          </div>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-24 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const hasData = day.foods.length > 0 || day.workouts.length > 0 || day.waterMl > 0;
            const net = Math.round(day.totalCalories - day.totalBurned);
            const expanded = expandedDay === day.date;

            return (
              <Card
                key={day.date}
                className={cn(
                  "overflow-hidden transition-all",
                  !hasData && "opacity-40",
                  isToday(day.date) && "border-primary/30"
                )}
              >
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedDay(expanded ? null : day.date)}
                >
                  <CardContent className="p-3">
                    {/* Summary row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn("text-xs font-semibold", isToday(day.date) && "text-primary")}>
                          {isToday(day.date) ? "Today" : formatDate(day.date)}
                        </span>
                        {day.foods.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {day.foods.length} food{day.foods.length !== 1 ? "s" : ""}
                          </span>
                        )}
                        {day.workouts.length > 0 && (
                          <span className="text-[10px] text-purple-400">
                            {day.workouts.length} workout{day.workouts.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                        {day.totalCalories > 0 && (
                          <span className="text-orange-400 font-medium">
                            {Math.round(day.totalCalories)} <span className="text-[9px] text-muted-foreground">in</span>
                          </span>
                        )}
                        {day.totalBurned > 0 && (
                          <span className="text-green-400 font-medium">
                            {Math.round(day.totalBurned)} <span className="text-[9px] text-muted-foreground">out</span>
                          </span>
                        )}
                        {hasData && (
                          <span className={cn(
                            "font-bold",
                            net > 0 ? "text-orange-300" : "text-green-300"
                          )}>
                            {net > 0 ? "+" : ""}{net}
                          </span>
                        )}
                        {!hasData && (
                          <Minus className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Compact macro bar */}
                    {day.totalCalories > 0 && (
                      <div className="flex gap-2 mt-2 text-[9px] text-muted-foreground">
                        <span>P: {Math.round(day.totalProtein)}g</span>
                        <span>C: {Math.round(day.totalCarbs)}g</span>
                        <span>F: {Math.round(day.totalFat)}g</span>
                        {day.waterMl > 0 && (
                          <span className="text-blue-400 ml-auto flex items-center gap-0.5">
                            <Droplets className="h-2.5 w-2.5" />
                            {(day.waterMl / 1000).toFixed(1)}L
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </button>

                {/* Expanded details */}
                {expanded && hasData && (
                  <div className="border-t border-border/50 px-3 pb-3">
                    {/* Foods */}
                    {day.foods.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Utensils className="h-3 w-3" /> Food
                        </p>
                        <div className="space-y-1.5">
                          {day.foods.map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[9px] text-muted-foreground capitalize w-14 shrink-0">{f.meal}</span>
                                <span className="truncate">{f.description}</span>
                              </div>
                              <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                                {Math.round(f.calories)} cal
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Workouts */}
                    {day.workouts.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Dumbbell className="h-3 w-3" /> Workouts
                        </p>
                        <div className="space-y-1.5">
                          {day.workouts.map((w, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="capitalize text-purple-400">{w.type}</span>
                                {w.description && (
                                  <span className="text-muted-foreground truncate">{w.description}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground tabular-nums shrink-0">
                                <span>{w.minutes}m</span>
                                {w.burned > 0 && <span className="text-green-400">-{Math.round(w.burned)}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
