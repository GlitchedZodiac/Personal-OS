"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  Camera,
  LineChart,
  Moon,
  Scale,
  Sparkles,
  Sunrise,
  Sun,
  TableProperties,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AIMealSuggestion } from "@/components/ai-meal-suggestion";
import { VoiceInput } from "@/components/voice-input";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getMacroGrams, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getHourInTimeZone,
  getTimeZoneOffsetMinutes,
} from "@/lib/timezone";

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
  waterMlManual?: number;
  waterMlInferred?: number;
  waterGlasses: number;
  distanceMeters?: number;
  steps?: number;
  workoutSteps?: number;
  restingHeartRateBpm?: number | null;
  activeEnergyKcal?: number | null;
}

interface DailyBrief {
  greeting: string;
  summary: string;
  tip: string;
  todosToday: number;
  topPriority: string | null;
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
  waterMlManual: 0,
  waterMlInferred: 0,
  waterGlasses: 0,
  distanceMeters: 0,
  steps: 0,
  workoutSteps: 0,
  restingHeartRateBpm: null,
  activeEnergyKcal: null,
};

const quickActions = [
  {
    href: "/trends",
    label: "Trends",
    blurb: "Consistency, weekly insight, and projections.",
    icon: LineChart,
    accent: "text-teal-300",
  },
  {
    href: "/trends/daily-log",
    label: "Daily log",
    blurb: "Review past days and spot missing entries.",
    icon: TableProperties,
    accent: "text-amber-300",
  },
  {
    href: "/health/progress",
    label: "Progress",
    blurb: "Open photos and visual check-ins.",
    icon: Camera,
    accent: "text-orange-300",
  },
];

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="cockpit-card rounded-[28px] border-white/8 bg-transparent">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  detail,
  accentClass,
}: {
  label: string;
  value: string;
  detail: string;
  accentClass?: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/12 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accentClass ?? "text-foreground"}`}>
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MacroChip({
  label,
  value,
  percent,
  accentClass,
}: {
  label: string;
  value: string;
  percent: number;
  accentClass: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/12 p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-lg font-semibold tracking-tight ${accentClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(percent)}% of target</p>
    </div>
  );
}

export default function HealthDashboard() {
  const initialSettings = useMemo(() => getSettings(), []);
  const [timeZone, setTimeZone] = useState(initialSettings.timeZone);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [calorieTarget, setCalorieTarget] = useState(initialSettings.calorieTarget);
  const [macroTargets, setMacroTargets] = useState(() => getMacroGrams(initialSettings));

  useEffect(() => {
    const id = setInterval(() => setClockTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let mounted = true;

    fetchServerSettings().then((settings) => {
      if (!mounted) return;
      setTimeZone(settings.timeZone);
      setCalorieTarget(settings.calorieTarget);
      setMacroTargets(getMacroGrams(settings));
    });

    return () => {
      mounted = false;
    };
  }, []);

  const now = useMemo(() => new Date(clockTick), [clockTick]);
  const today = useMemo(() => getDateStringInTimeZone(now, timeZone), [now, timeZone]);
  const localHour = useMemo(() => getHourInTimeZone(now, timeZone), [now, timeZone]);
  const tzOffsetMinutes = useMemo(
    () => getTimeZoneOffsetMinutes(now, timeZone),
    [now, timeZone]
  );

  const summaryUrl = useMemo(
    () =>
      `/api/health/summary?date=${today}&tzOffsetMinutes=${tzOffsetMinutes}&timeZone=${encodeURIComponent(
        timeZone
      )}`,
    [today, tzOffsetMinutes, timeZone]
  );

  const briefUrl = useMemo(
    () =>
      `/api/health/daily-brief?timeZone=${encodeURIComponent(
        timeZone
      )}&localDate=${today}&localHour=${localHour}`,
    [timeZone, today, localHour]
  );

  const {
    data: summaryData,
    initialLoading: summaryLoading,
    refresh: refreshSummary,
  } = useCachedFetch<DailySummary>(summaryUrl, { ttl: 60_000 });
  const { data: briefData, refresh: refreshBrief } = useCachedFetch<DailyBrief>(briefUrl, {
    ttl: 60_000,
  });

  const summary = summaryData ?? DEFAULT_SUMMARY;

  const fetchData = () => {
    invalidateHealthCache();
    refreshSummary();
    refreshBrief();
  };

  const caloriePercent = Math.min(
    calorieTarget > 0 ? (summary.totalCalories / calorieTarget) * 100 : 0,
    100
  );
  const proteinPercent = Math.min(
    macroTargets.proteinG > 0 ? (summary.totalProtein / macroTargets.proteinG) * 100 : 0,
    100
  );
  const carbsPercent = Math.min(
    macroTargets.carbsG > 0 ? (summary.totalCarbs / macroTargets.carbsG) * 100 : 0,
    100
  );
  const fatPercent = Math.min(
    macroTargets.fatG > 0 ? (summary.totalFat / macroTargets.fatG) * 100 : 0,
    100
  );

  const greetingIcon =
    localHour < 6 ? (
      <Moon className="h-4 w-4 text-cyan-300" />
    ) : localHour < 12 ? (
      <Sunrise className="h-4 w-4 text-amber-300" />
    ) : localHour < 17 ? (
      <Sun className="h-4 w-4 text-orange-300" />
    ) : (
      <Moon className="h-4 w-4 text-cyan-300" />
    );

  const greeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="health-stage px-4 pb-40 pt-10">
      <div className="stagger-children space-y-4">
        <section className="cockpit-card card-glow relative overflow-hidden rounded-[32px] border border-white/8 bg-transparent p-5">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-teal-500/14 via-transparent to-amber-500/12" />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  {greetingIcon}
                  <span>{greeting}</span>
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Health cockpit</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone,
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    }).format(now)}
                  </p>
                </div>
              </div>
              <Badge className="border-white/10 bg-white/8 text-[11px] text-foreground">{timeZone}</Badge>
            </div>

            {summaryLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-44 rounded-[28px]" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-32 rounded-[28px]" />
                  <Skeleton className="h-32 rounded-[28px]" />
                </div>
                <Skeleton className="h-28 rounded-[28px]" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <Link
                    href="/health/food"
                    className="group rounded-[28px] border border-white/8 bg-white/4 p-4 transition duration-200 hover:border-white/14 hover:bg-white/6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
                          <Utensils className="h-4 w-4 text-teal-300" />
                          <span>Fuel status</span>
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                          {Math.round(summary.totalCalories)}
                          <span className="text-lg text-muted-foreground"> / {calorieTarget}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {summary.mealCount} meal{summary.mealCount === 1 ? "" : "s"} logged today
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">Click to view food logs.</p>
                      </div>
                      <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted-foreground">
                        {Math.round(caloriePercent)}%
                      </div>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-400 via-amber-300 to-orange-400 transition-all duration-700"
                        style={{ width: `${caloriePercent}%` }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <MacroChip
                        label="Protein"
                        value={`${Math.round(summary.totalProtein)}g`}
                        percent={proteinPercent}
                        accentClass="text-teal-300"
                      />
                      <MacroChip
                        label="Carbs"
                        value={`${Math.round(summary.totalCarbs)}g`}
                        percent={carbsPercent}
                        accentClass="text-amber-300"
                      />
                      <MacroChip
                        label="Fat"
                        value={`${Math.round(summary.totalFat)}g`}
                        percent={fatPercent}
                        accentClass="text-orange-300"
                      />
                    </div>
                  </Link>

                  <Link
                    href="/health/workouts"
                    className="group rounded-[28px] border border-white/8 bg-white/4 p-4 transition duration-200 hover:border-white/14 hover:bg-white/6"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
                          <Activity className="h-4 w-4 text-amber-300" />
                          <span>Output and recovery</span>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">Click to view workout logs.</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <MetricTile
                        label="Calories burned"
                        value={String(Math.round(summary.caloriesBurned))}
                        detail={`${summary.workoutCount} workout${summary.workoutCount === 1 ? "" : "s"} today`}
                        accentClass="text-amber-300"
                      />
                      <MetricTile
                        label="Daily steps"
                        value={(summary.steps ?? 0).toLocaleString()}
                        detail={`${summary.workoutMinutes} training minutes`}
                        accentClass="text-teal-300"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-[20px] border border-white/8 bg-black/12 p-3 text-xs">
                        <p className="text-muted-foreground">Training</p>
                        <p className="mt-2 text-base font-semibold text-foreground">{summary.workoutMinutes}m</p>
                      </div>
                      <div className="rounded-[20px] border border-white/8 bg-black/12 p-3 text-xs">
                        <p className="text-muted-foreground">Resting HR</p>
                        <p className="mt-2 text-base font-semibold text-foreground">
                          {summary.restingHeartRateBpm ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-[20px] border border-white/8 bg-black/12 p-3 text-xs">
                        <p className="text-muted-foreground">Active energy</p>
                        <p className="mt-2 text-base font-semibold text-foreground">
                          {summary.activeEnergyKcal ? Math.round(summary.activeEnergyKcal) : "-"}
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>

                <Link
                  href="/health/body"
                  className="group rounded-[28px] border border-white/8 bg-white/4 p-4 transition duration-200 hover:border-white/14 hover:bg-white/6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
                        <Scale className="h-4 w-4 text-cyan-300" />
                        <span>Latest body check</span>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Click to view measurements and body history.
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <MetricTile
                      label="Weight"
                      value={summary.latestWeight ? `${summary.latestWeight} kg` : "-"}
                      detail={summary.latestWeight ? "Latest recorded measurement" : "No weigh-in saved yet"}
                      accentClass="text-foreground"
                    />
                    <MetricTile
                      label="Body fat"
                      value={summary.latestBodyFat ? `${summary.latestBodyFat}%` : "-"}
                      detail={summary.latestBodyFat ? "Latest recorded measurement" : "Open body history to log it"}
                      accentClass="text-cyan-300"
                    />
                  </div>
                </Link>

                {briefData && (
                  <div className="rounded-[28px] border border-white/8 bg-black/15 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
                        <Sparkles className="h-4 w-4 text-teal-300" />
                        <span>Daily brief</span>
                      </div>
                      {briefData.todosToday > 0 ? (
                        <Link href="/todos" className="text-[11px] text-teal-300 transition hover:text-teal-200">
                          {briefData.todosToday} task{briefData.todosToday === 1 ? "" : "s"}
                        </Link>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-foreground/90">{briefData.summary}</p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{briefData.tip}</p>
                    {briefData.topPriority && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Bell className="h-3.5 w-3.5 text-amber-300" />
                        <span>Top priority: {briefData.topPriority}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {!summaryLoading && (
          <AIMealSuggestion
            totalCalories={summary.totalCalories}
            totalProtein={summary.totalProtein}
            totalCarbs={summary.totalCarbs}
            totalFat={summary.totalFat}
            mealCount={summary.mealCount}
          />
        )}

        <SectionCard title="Quick actions">
          <div className="grid gap-3 sm:grid-cols-3">
            {quickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-[24px] border border-white/8 bg-white/4 p-4 transition duration-200 hover:border-white/14 hover:bg-white/6"
              >
                <div className="flex items-center justify-between gap-3">
                  <item.icon className={`h-5 w-5 ${item.accent}`} />
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
                </div>
                <p className="mt-4 text-base font-medium tracking-tight">{item.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.blurb}</p>
              </Link>
            ))}
          </div>
        </SectionCard>

        <VoiceInput onDataLogged={fetchData} />
      </div>
    </div>
  );
}
