"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2, Flame, Dumbbell } from "lucide-react";
import { MarkdownText } from "@/components/markdown-text";
import { getSettings, getMacroGrams } from "@/lib/settings";
import { format } from "date-fns";

interface AIMealSuggestionProps {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  mealCount: number;
}

export function AIMealSuggestion({
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFat,
  mealCount,
}: AIMealSuggestionProps) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasTriedOnce, setHasTriedOnce] = useState(false);
  const [workoutCalories, setWorkoutCalories] = useState(0);

  // Fetch today's workout calories burned
  useEffect(() => {
    const fetchWorkoutCals = async () => {
      try {
        const now = new Date();
        const today = format(now, "yyyy-MM-dd");
        const tzOffsetMinutes = now.getTimezoneOffset();
        const res = await fetch(`/api/health/summary?date=${today}&tzOffsetMinutes=${tzOffsetMinutes}`);
        if (res.ok) {
          const data = await res.json();
          setWorkoutCalories(data.caloriesBurned || 0);
        }
      } catch {
        // silent
      }
    };
    fetchWorkoutCals();
  }, []);

  const fetchSuggestion = useCallback(async () => {
    setLoading(true);
    try {
      const settings = getSettings();
      const macros = getMacroGrams(settings);

      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalCalories,
          totalProtein,
          totalCarbs,
          totalFat,
          calorieTarget: settings.calorieTarget,
          proteinTargetG: macros.proteinG,
          carbsTargetG: macros.carbsG,
          fatTargetG: macros.fatG,
          mealCount,
          workoutCaloriesBurned: workoutCalories,
          customInstructions: settings.aiInstructions?.health || "",
          aiLanguage: settings.aiLanguage || "english",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestion(data.suggestion);
      }
    } catch (error) {
      console.error("Failed to get AI suggestion:", error);
    } finally {
      setLoading(false);
      setHasTriedOnce(true);
    }
  }, [totalCalories, totalProtein, totalCarbs, totalFat, mealCount, workoutCalories]);

  // Auto-fetch once when there's food data
  useEffect(() => {
    if (mealCount > 0 && !hasTriedOnce && !suggestion) {
      fetchSuggestion();
    }
  }, [mealCount, hasTriedOnce, suggestion, fetchSuggestion]);

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">AI Coach</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchSuggestion}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

        {/* Workout context badge */}
        {workoutCalories > 0 && (
          <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/10">
            <Dumbbell className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-[10px] text-orange-400">
              {Math.round(workoutCalories)} cal burned today
            </span>
            <Flame className="h-3 w-3 text-orange-400 ml-auto" />
          </div>
        )}

        {loading && !suggestion ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing your intake & activity...
          </div>
        ) : suggestion ? (
          <MarkdownText text={suggestion} />
        ) : mealCount === 0 ? (
          <p className="text-xs text-muted-foreground">
            Log some food first and I&apos;ll suggest what to eat next!
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={fetchSuggestion}
            disabled={loading}
          >
            <Sparkles className="h-3 w-3 mr-1.5" />
            Get meal suggestions
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
