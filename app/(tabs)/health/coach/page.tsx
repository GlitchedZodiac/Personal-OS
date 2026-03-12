"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  CalendarDays,
  CheckSquare,
  Dumbbell,
  Droplets,
  Flame,
  RefreshCw,
  Target,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getSettings } from "@/lib/settings";
import { getDateStringInTimeZone, getWeekStartDateString } from "@/lib/timezone";

const numberFormatter = new Intl.NumberFormat("en-US");

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

function SnapshotCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <div className="metric-orb card-glow p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <Icon className={accent} />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight metric-mono">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function WeeklyCoachPage() {
  const initialTimeZone = getSettings().timeZone;
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStartDateString(getDateStringInTimeZone(new Date(), initialTimeZone), 1)
  );
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchServerSettings().then((settings) => {
      setTimeZone(settings.timeZone);
      setWeekStart(
        getWeekStartDateString(getDateStringInTimeZone(new Date(), settings.timeZone), 1)
      );
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

      if (!response.ok) throw new Error("Failed to apply coach tasks");

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
    <div className="health-stage px-4 pb-36 pt-10">
      <div className="stagger-children space-y-4">
        <section className="cockpit-card card-glow relative overflow-hidden rounded-[32px] p-5">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-cyan-500/16 via-transparent to-amber-500/14" />
          <div className="relative space-y-5">
            <div className="flex items-start gap-3">
              <Link href="/health">
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-white/10 bg-white/4">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  <Brain className="h-4 w-4 text-cyan-300" />
                  <span>Performance coach</span>
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Weekly game plan</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Direct coaching built from your logged intake, hydration, training, and execution.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-4 w-4 text-amber-300" />
                <Input
                  type="date"
                  value={weekStart}
                  onChange={(event) => setWeekStart(event.target.value)}
                  className="h-11 flex-1 border-white/10 bg-black/10"
                />
                <Button variant="outline" className="h-11 border-white/10 bg-white/4" onClick={refresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>
          </div>
        </section>

        {initialLoading || !data ? (
          <Card className="cockpit-card rounded-[28px] border-white/8 bg-transparent">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Building your weekly plan from real data...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <SnapshotCard
                label="Protein"
                value={`${data.summary.avgProtein}g`}
                detail={`Target ${data.summary.proteinTarget}g per day`}
                icon={Flame}
                accent="h-4 w-4 text-teal-300"
              />
              <SnapshotCard
                label="Hydration"
                value={`${numberFormatter.format(data.summary.avgHydrationMl)}ml`}
                detail="Average daily intake"
                icon={Droplets}
                accent="h-4 w-4 text-cyan-300"
              />
              <SnapshotCard
                label="Workouts"
                value={`${data.summary.workoutCount}/${data.summary.plannedWorkoutDays}`}
                detail={`${data.summary.remainingWorkoutSessions} sessions left this week`}
                icon={Dumbbell}
                accent="h-4 w-4 text-amber-300"
              />
              <SnapshotCard
                label="Execution"
                value={String(data.summary.completedTodos)}
                detail={`${data.summary.totalWorkoutMinutes} total workout min`}
                icon={Timer}
                accent="h-4 w-4 text-orange-300"
              />
            </div>

            <Card className="cockpit-card rounded-[28px] border-white/8 bg-transparent">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-300" />
                  <h2 className="text-lg font-semibold tracking-tight">Focus areas</h2>
                </div>
                <div className="space-y-2">
                  {data.focusAreas.map((focus, index) => (
                    <div
                      key={`${focus}-${index}`}
                      className="rounded-[22px] border border-white/8 bg-white/4 p-4 text-sm text-foreground/90"
                    >
                      {focus}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="cockpit-card rounded-[28px] border-white/8 bg-transparent">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-cyan-300" />
                  <h2 className="text-lg font-semibold tracking-tight">Weekly strategy</h2>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Training</p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.weeklyPlan.training}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Nutrition</p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.weeklyPlan.nutrition}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Execution</p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.weeklyPlan.execution}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="cockpit-card rounded-[28px] border-white/8 bg-transparent">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-teal-300" />
                  <h2 className="text-lg font-semibold tracking-tight">Coach tasks</h2>
                </div>
                <div className="space-y-2">
                  {data.tasks.map((task, index) => (
                    <div
                      key={`${task}-${index}`}
                      className="rounded-[22px] border border-white/8 bg-white/4 p-4 text-sm text-foreground/90"
                    >
                      {task}
                    </div>
                  ))}
                </div>
                <Button
                  className="h-12 w-full rounded-2xl"
                  onClick={applyTasksWithTimeZone}
                  disabled={applying}
                >
                  {applying ? "Applying tasks..." : "Apply tasks to todos"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
