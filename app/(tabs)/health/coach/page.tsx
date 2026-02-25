"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Brain, CheckSquare, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getWeekStartDateString,
} from "@/lib/timezone";

type WeeklyCoachResponse = {
  week: { start: string; end: string };
  summary: {
    avgCalories: number;
    calorieTarget: number;
    avgProtein: number;
    proteinTarget: number;
    avgHydrationMl: number;
    workoutCount: number;
    plannedWorkoutDays: number;
    remainingWorkoutSessions: number;
    totalWorkoutMinutes: number;
    totalBurnedCalories: number;
    completedTodos: number;
  };
  focusAreas: string[];
  tasks: string[];
  weeklyPlan: {
    training: string;
    nutrition: string;
    execution: string;
  };
};

export default function WeeklyCoachPage() {
  const initialTimeZone = getSettings().timeZone;
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStartDateString(getDateStringInTimeZone(new Date(), initialTimeZone), 1)
  );
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchServerSettings().then((s) => {
      setTimeZone(s.timeZone);
      setWeekStart(getWeekStartDateString(getDateStringInTimeZone(new Date(), s.timeZone), 1));
    });
  }, []);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("weekStart", weekStart);
    params.set("timeZone", timeZone);
    return `/api/health/coach?${params.toString()}`;
  }, [weekStart, timeZone]);
  const { data, initialLoading, refresh } = useCachedFetch<WeeklyCoachResponse>(url, {
    ttl: 60_000,
  });

  const applyTasksWithTimeZone = async () => {
    if (!data || data.tasks.length === 0) return;
    setApplying(true);
    try {
      const response = await fetch("/api/health/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, tasks: data.tasks, timeZone }),
      });
      if (!response.ok) throw new Error("Failed to apply");
      const result: { created: number; skipped: number } = await response.json();
      invalidateHealthCache();
      toast.success(`Coach tasks applied: ${result.created} created, ${result.skipped} skipped`);
      refresh();
    } catch {
      toast.error("Failed to apply weekly tasks");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Weekly AI Coach</h1>
          <p className="text-xs text-muted-foreground">
            Actionable weekly plan from your actual data
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Input
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={refresh}>
            Regenerate
          </Button>
        </CardContent>
      </Card>

      {initialLoading || !data ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Building your weekly plan...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Protein avg</p>
                <p className="text-lg font-bold">
                  {data.summary.avgProtein}g / {data.summary.proteinTarget}g
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Workouts</p>
                <p className="text-lg font-bold">
                  {data.summary.workoutCount}/{data.summary.plannedWorkoutDays}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-400" />
                Focus Areas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.focusAreas.map((focus, index) => (
                <p key={`${focus}-${index}`} className="text-sm">
                  - {focus}
                </p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                Weekly Strategy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Training:</span>{" "}
                {data.weeklyPlan.training}
              </p>
              <p>
                <span className="text-muted-foreground">Nutrition:</span>{" "}
                {data.weeklyPlan.nutrition}
              </p>
              <p>
                <span className="text-muted-foreground">Execution:</span>{" "}
                {data.weeklyPlan.execution}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-green-400" />
                Coach Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.tasks.map((task, index) => (
                <p key={`${task}-${index}`} className="text-sm">
                  - {task}
                </p>
              ))}
              <Button className="w-full mt-2" onClick={applyTasksWithTimeZone} disabled={applying}>
                {applying ? "Applying..." : "Apply Tasks To Todos"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
