"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Utensils,
  Scale,
  Dumbbell,
  Flame,
  TrendingDown,
  Activity,
  TrendingUp,
  Zap,
  Camera,
} from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { WaterTracker } from "@/components/water-tracker";
import { QuickFavorites } from "@/components/quick-favorites";
import { AIMealSuggestion } from "@/components/ai-meal-suggestion";
import { format } from "date-fns";
import { getSettings, getMacroGrams } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useCachedFetch, invalidateHealthCache } from "@/lib/cache";

interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  mealCount: number;
  latestWeight: number | null;
  latestBodyFat: number | null;
  workoutCount: number;
  workoutMinutes: number;
  caloriesBurned: number;
  netCalories: number;
  waterMl: number;
  waterGlasses: number;
}

interface StreakData {
  streak: number;
  totalDaysLogged: number;
  weekDays: number;
  weekLogged: boolean[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
  loggedToday: boolean;
}

const DEFAULT_SUMMARY: DailySummary = {
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  mealCount: 0,
  latestWeight: null,
  latestBodyFat: null,
  workoutCount: 0,
  workoutMinutes: 0,
  caloriesBurned: 0,
  netCalories: 0,
  waterMl: 0,
  waterGlasses: 0,
};

const DEFAULT_STREAK: StreakData = {
  streak: 0,
  totalDaysLogged: 0,
  weekDays: 0,
  weekLogged: [false, false, false, false, false, false, false],
  loggedToday: false,
};

export default function HealthDashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: summaryData, initialLoading: summaryLoading, refresh: refreshSummary } =
    useCachedFetch<DailySummary>(`/api/health/summary?date=${today}`, { ttl: 60_000 });
  const { data: streakData, refresh: refreshStreak } =
    useCachedFetch<StreakData>("/api/health/streak", { ttl: 60_000 });

  const summary = summaryData ?? DEFAULT_SUMMARY;
  const streak = streakData ?? DEFAULT_STREAK;
  const initialLoading = summaryLoading;

  const [calorieTarget, setCalorieTarget] = useState(2000);
  const [macroTargets, setMacroTargets] = useState({ proteinG: 150, carbsG: 200, fatG: 67 });

  // Refresh helper for child components to call after mutations
  const fetchData = () => {
    invalidateHealthCache();
    refreshSummary();
    refreshStreak();
  };

  useEffect(() => {
    const settings = getSettings();
    setCalorieTarget(settings.calorieTarget);
    setMacroTargets(getMacroGrams(settings));
  }, []);

  const caloriePercent = Math.min(
    (summary.totalCalories / calorieTarget) * 100,
    100
  );
  const remaining = Math.max(calorieTarget - summary.totalCalories, 0);

  // Macro progress percentages
  const proteinPct = macroTargets.proteinG > 0
    ? Math.min((summary.totalProtein / macroTargets.proteinG) * 100, 100)
    : 0;
  const carbsPct = macroTargets.carbsG > 0
    ? Math.min((summary.totalCarbs / macroTargets.carbsG) * 100, 100)
    : 0;
  const fatPct = macroTargets.fatG > 0
    ? Math.min((summary.totalFat / macroTargets.fatG) * 100, 100)
    : 0;

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight">Health</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            variant="outline"
            className={cn("text-xs", initialLoading && "animate-pulse")}
          >
            {initialLoading ? "..." : `${summary.mealCount} meals`}
          </Badge>
          {streak.streak > 0 && (
            <Badge className="text-[10px] bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border-orange-500/20">
              🔥 {streak.streak}-day streak
            </Badge>
          )}
        </div>
      </div>

      {/* Calorie Progress */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">Daily Calories</span>
          </div>
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className="text-4xl font-bold tracking-tight">
                {initialLoading ? "—" : Math.round(summary.totalCalories)}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                / {calorieTarget}
              </span>
            </div>
            {!initialLoading && remaining > 0 && (
              <div className="text-right">
                <p className="text-lg font-semibold text-green-500">
                  {Math.round(remaining)}
                </p>
                <p className="text-[10px] text-muted-foreground">remaining</p>
              </div>
            )}
          </div>

          {/* Calorie progress bar */}
          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700 ease-out",
                caloriePercent >= 100
                  ? "bg-red-500"
                  : caloriePercent >= 80
                  ? "bg-gradient-to-r from-orange-400 to-orange-500"
                  : "bg-gradient-to-r from-green-400 to-green-500"
              )}
              style={{ width: `${caloriePercent}%` }}
            />
          </div>

          {/* Macro progress bars */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {/* Protein */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-[10px] text-muted-foreground">Protein</span>
                </div>
              </div>
              <p className="text-base font-semibold">
                {initialLoading ? "—" : `${Math.round(summary.totalProtein)}g`}
              </p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all duration-700"
                  style={{ width: `${proteinPct}%` }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {initialLoading ? "" : `${Math.round(summary.totalProtein)} / ${macroTargets.proteinG}g`}
              </p>
            </div>

            {/* Carbs */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[10px] text-muted-foreground">Carbs</span>
                </div>
              </div>
              <p className="text-base font-semibold">
                {initialLoading ? "—" : `${Math.round(summary.totalCarbs)}g`}
              </p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-700"
                  style={{ width: `${carbsPct}%` }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {initialLoading ? "" : `${Math.round(summary.totalCarbs)} / ${macroTargets.carbsG}g`}
              </p>
            </div>

            {/* Fat */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                  <span className="text-[10px] text-muted-foreground">Fat</span>
                </div>
              </div>
              <p className="text-base font-semibold">
                {initialLoading ? "—" : `${Math.round(summary.totalFat)}g`}
              </p>
              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className="h-full bg-rose-400 rounded-full transition-all duration-700"
                  style={{ width: `${fatPct}%` }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {initialLoading ? "" : `${Math.round(summary.totalFat)} / ${macroTargets.fatG}g`}
              </p>
            </div>
          </div>

          {/* Water Tracker (compact) */}
          <WaterTracker onUpdate={fetchData} compact />
        </CardContent>
      </Card>

      {/* Net Calories (only show if there are workouts) */}
      {!initialLoading && summary.caloriesBurned > 0 && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium">Net Calories</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">
                  {Math.round(summary.netCalories)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.round(summary.totalCalories)} eaten −{" "}
                  {Math.round(summary.caloriesBurned)} burned
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Meal Suggestion */}
      {!initialLoading && (
        <AIMealSuggestion
          totalCalories={summary.totalCalories}
          totalProtein={summary.totalProtein}
          totalCarbs={summary.totalCarbs}
          totalFat={summary.totalFat}
          mealCount={summary.mealCount}
        />
      )}

      {/* Quick-Add Favorites */}
      <QuickFavorites onFoodLogged={fetchData} />

      {/* Quick Links Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Link href="/health/food">
          <Card className="hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <CardContent className="p-3 flex flex-col items-center gap-1.5">
              <div className="p-1.5 rounded-xl bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
                <Utensils className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-[10px] font-medium">Food</span>
              <span className="text-base font-bold">
                {initialLoading ? "—" : summary.mealCount}
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/health/body">
          <Card className="hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <CardContent className="p-3 flex flex-col items-center gap-1.5">
              <div className="p-1.5 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 transition-colors">
                <Scale className="h-4 w-4 text-blue-500" />
              </div>
              <span className="text-[10px] font-medium">Body</span>
              <span className="text-base font-bold">
                {initialLoading
                  ? "—"
                  : summary.latestWeight
                  ? `${summary.latestWeight}kg`
                  : "—"}
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/health/workouts">
          <Card className="hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <CardContent className="p-3 flex flex-col items-center gap-1.5">
              <div className="p-1.5 rounded-xl bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                <Dumbbell className="h-4 w-4 text-purple-500" />
              </div>
              <span className="text-[10px] font-medium">Workouts</span>
              <span className="text-base font-bold">
                {initialLoading ? "—" : summary.workoutCount}
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link href="/health/progress">
          <Card className="hover:bg-accent/50 transition-all duration-200 cursor-pointer group">
            <CardContent className="p-3 flex flex-col items-center gap-1.5">
              <div className="p-1.5 rounded-xl bg-pink-500/10 group-hover:bg-pink-500/20 transition-colors">
                <Camera className="h-4 w-4 text-pink-500" />
              </div>
              <span className="text-[10px] font-medium">Progress</span>
              <span className="text-base font-bold">📸</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Latest Metrics */}
      {(summary.latestWeight || summary.latestBodyFat) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              Latest Measurements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {summary.latestWeight && (
                <div>
                  <p className="text-2xl font-bold">{summary.latestWeight}</p>
                  <p className="text-xs text-muted-foreground">kg</p>
                </div>
              )}
              {summary.latestBodyFat && (
                <div>
                  <p className="text-2xl font-bold">
                    {summary.latestBodyFat}%
                  </p>
                  <p className="text-xs text-muted-foreground">body fat</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Workouts */}
      {summary.workoutCount > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              Today&apos;s Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold">{summary.workoutCount}</p>
                <p className="text-xs text-muted-foreground">workouts</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.workoutMinutes}</p>
                <p className="text-xs text-muted-foreground">minutes</p>
              </div>
              {summary.caloriesBurned > 0 && (
                <div>
                  <p className="text-2xl font-bold">
                    {Math.round(summary.caloriesBurned)}
                  </p>
                  <p className="text-xs text-muted-foreground">cal burned</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Tip */}
      {!initialLoading && summary.mealCount === 0 && (
        <Card className="border-dashed border-primary/20">
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-8 w-8 text-primary/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Tap the microphone below to log your first meal!
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Try: &quot;I had coffee and eggs for breakfast&quot;
            </p>
          </CardContent>
        </Card>
      )}

      {/* Streak Info */}
      {streak.totalDaysLogged > 0 && (
        <Card className="border-orange-500/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🔥</div>
                <div>
                  <p className="text-sm font-medium">
                    {streak.streak > 0
                      ? `${streak.streak}-day streak!`
                      : "Start a streak!"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {streak.weekDays}/7 days this week • {streak.totalDaysLogged}{" "}
                    total days
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-colors",
                        streak.weekLogged?.[i]
                          ? "bg-orange-400"
                          : "bg-secondary/50"
                      )}
                    />
                    <span className="text-[8px] text-muted-foreground">
                      {day}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Voice Input */}
      <VoiceInput onDataLogged={fetchData} />
    </div>
  );
}
