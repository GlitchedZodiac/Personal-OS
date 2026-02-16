"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { getSettings, getMacroGrams } from "@/lib/settings";

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
  }, [totalCalories, totalProtein, totalCarbs, totalFat, mealCount]);

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

        {loading && !suggestion ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyzing your intake...
          </div>
        ) : suggestion ? (
          <div className="text-sm leading-relaxed whitespace-pre-line">
            {suggestion}
          </div>
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
