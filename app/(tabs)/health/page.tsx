"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  Brain,
  ChevronDown,
  ChevronUp,
  Droplets,
  Flame,
  Footprints,
  HeartPulse,
  LayoutDashboard,
  LineChart,
  Moon,
  Scale,
  Sparkles,
  Sunrise,
  Sun,
  Target,
  Trophy,
  Utensils,
  Dumbbell,
  Zap,
  Camera,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AIMealSuggestion } from "@/components/ai-meal-suggestion";
import { QuickFavorites } from "@/components/quick-favorites";
import { VoiceInput } from "@/components/voice-input";
import { WaterTracker } from "@/components/water-tracker";
import { invalidateHealthCache, useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getMacroGrams, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getHourInTimeZone,
  getTimeZoneOffsetMinutes,
} from "@/lib/timezone";
import { cn } from "@/lib/utils";

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

interface StreakData {
  streak: number;
  totalDaysLogged: number;
  weekDays: number;
  weekLogged: boolean[];
  loggedToday: boolean;
}

interface DailyBrief {
  greeting: string;
  summary: string;
  tip: string;
  todosToday: number;
  topPriority: string | null;
}

interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  earned: boolean;
  progress?: number;
  progressLabel?: string;
  tier: "bronze" | "silver" | "gold" | "diamond";
}

interface AchievementsData {
  achievements: Achievement[];
  totalEarned: number;
  totalAvailable: number;
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

const DEFAULT_STREAK: StreakData = {
  streak: 0,
  totalDaysLogged: 0,
  weekDays: 0,
  weekLogged: [false, false, false, false, false, false, false],
  loggedToday: false,
};

const quickLinks = [
  {
    href: "/health/food",
    label: "Food log",
    eyebrow: "Nutrition",
    icon: Utensils,
    accent: "text-teal-300",
    surface: "from-teal-500/18 to-transparent",
  },
  {
    href: "/health/workouts",
    label: "Workouts",
    eyebrow: "Training",
    icon: Dumbbell,
    accent: "text-amber-300",
    surface: "from-amber-500/18 to-transparent",
  },
  {
    href: "/health/body",
    label: "Body",
    eyebrow: "Measures",
    icon: Scale,
    accent: "text-orange-300",
    surface: "from-orange-500/18 to-transparent",
  },
  {
    href: "/health/coach",
    label: "Coach",
    eyebrow: "Planning",
    icon: Brain,
    accent: "text-cyan-300",
    surface: "from-cyan-500/18 to-transparent",
  },
  {
    href: "/health/command-center",
    label: "Command",
    eyebrow: "Day view",
    icon: LayoutDashboard,
    accent: "text-sky-300",
    surface: "from-sky-500/18 to-transparent",
  },
  {
    href: "/health/outcomes",
    label: "Forecast",
    eyebrow: "Trends",
    icon: LineChart,
    accent: "text-emerald-300",
    surface: "from-emerald-500/18 to-transparent",
  },
  {
    href: "/health/recovery",
    label: "Recovery",
    eyebrow: "Readiness",
    icon: HeartPulse,
    accent: "text-rose-300",
    surface: "from-rose-500/18 to-transparent",
  },
  {
    href: "/health/progress",
    label: "Progress",
    eyebrow: "Photos",
    icon: Camera,
    accent: "text-fuchsia-300",
    surface: "from-fuchsia-500/18 to-transparent",
  },
  {
    href: "/health/automations",
    label: "Rules",
    eyebrow: "Automation",
    icon: Settings2,
    accent: "text-lime-300",
    surface: "from-lime-500/18 to-transparent",
  },
];

function formatMetersToKm(value: number | null | undefined) {
  if (!value) return "0.0 km";
  return `${(value / 1000).toFixed(1)} km`;
}

function MetricOrb({
  label,
  value,
  detail,
  accentClass,
}: {
  label: string;
  value: string;
  detail: string;
  accentClass: string;
}) {
  return (
    <div className="metric-orb card-glow p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn("mt-3 text-3xl font-semibold tracking-tight metric-mono", accentClass)}>
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

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

export default function HealthDashboard() {
  const initialSettings = useMemo(() => getSettings(), []);
  const [timeZone, setTimeZone] = useState(initialSettings.timeZone);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [calorieTarget, setCalorieTarget] = useState(initialSettings.calorieTarget);
  const [showAchievements, setShowAchievements] = useState(false);
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
  const { data: streakData, refresh: refreshStreak } = useCachedFetch<StreakData>(
    "/api/health/streak",
    { ttl: 60_000 }
  );
  const { data: briefData } = useCachedFetch<DailyBrief>(briefUrl, { ttl: 60_000 });
  const { data: achievementsData } = useCachedFetch<AchievementsData>(
    "/api/health/achievements",
    { ttl: 300_000 }
  );

  const summary = summaryData ?? DEFAULT_SUMMARY;
  const streak = streakData ?? DEFAULT_STREAK;

  const fetchData = () => {
    invalidateHealthCache();
    refreshSummary();
    refreshStreak();
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
      <Moon className="h-5 w-5 text-cyan-300" />
    ) : localHour < 12 ? (
      <Sunrise className="h-5 w-5 text-amber-300" />
    ) : localHour < 17 ? (
      <Sun className="h-5 w-5 text-orange-300" />
    ) : (
      <Moon className="h-5 w-5 text-cyan-300" />
    );

  const greeting = localHour < 12 ? "Good morning" : localHour < 17 ? "Good afternoon" : "Good evening";
  const distanceText = formatMetersToKm(summary.distanceMeters);

  const earnedAchievements = achievementsData?.achievements.filter((item) => item.earned) ?? [];
  const inProgressAchievements =
    achievementsData?.achievements
      .filter((item) => !item.earned && (item.progress || 0) > 0)
      .sort((a, b) => (b.progress || 0) - (a.progress || 0)) ?? [];

  return (
    <div className="health-stage px-4 pb-40 pt-10">
      <div className="stagger-children space-y-4">
        <section className="cockpit-card card-glow relative overflow-hidden rounded-[32px] p-5">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-teal-500/16 via-transparent to-amber-500/14" />
          <div className="relative space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                  {greetingIcon}
                  <span>{greeting}</span>
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Health cockpit</h1>
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
              <div className="flex flex-col items-end gap-2">
                <Badge className="border-white/10 bg-white/8 text-[11px] text-foreground">
                  {timeZone}
                </Badge>
                {streak.streak > 0 && (
                  <Badge className="border-orange-400/20 bg-orange-500/12 text-orange-200">
                    {streak.streak}-day streak
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MetricOrb
                label="Calories"
                value={String(Math.round(summary.totalCalories))}
                detail={`${Math.max(calorieTarget - summary.totalCalories, 0)} kcal remaining`}
                accentClass="text-white"
              />
              <MetricOrb
                label="Protein"
                value={`${Math.round(summary.totalProtein)}g`}
                detail={`${Math.max(macroTargets.proteinG - summary.totalProtein, 0)}g to target`}
                accentClass="text-teal-300"
              />
              <MetricOrb
                label="Steps"
                value={(summary.steps ?? 0).toLocaleString()}
                detail={`${distanceText} movement tracked`}
                accentClass="text-amber-300"
              />
              <MetricOrb
                label="Training"
                value={`${summary.workoutMinutes}m`}
                detail={`${summary.workoutCount} workout${summary.workoutCount === 1 ? "" : "s"} today`}
                accentClass="text-orange-300"
              />
            </div>
          </div>
        </section>

        {briefData && (
          <SectionCard
            title="Daily brief"
            action={
              briefData.todosToday > 0 ? (
                <Link href="/todos" className="text-xs text-teal-300 transition hover:text-teal-200">
                  {briefData.todosToday} task{briefData.todosToday === 1 ? "" : "s"}
                </Link>
              ) : null
            }
          >
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                <div className="rounded-2xl bg-teal-500/12 p-2 text-teal-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed text-foreground/90">{briefData.summary}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{briefData.tip}</p>
                </div>
              </div>
              {briefData.topPriority && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bell className="h-3.5 w-3.5 text-amber-300" />
                  <span>Top priority: {briefData.topPriority}</span>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        <section className="dashboard-grid grid-cols-1 md:grid-cols-2">
          <SectionCard title="Intake and hydration">
            {summaryLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 rounded-[24px]" />
                <Skeleton className="h-24 rounded-[24px]" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Fuel status</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {Math.round(summary.totalCalories)} / {calorieTarget}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summary.mealCount} meal{summary.mealCount === 1 ? "" : "s"} logged today
                      </p>
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
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-[20px] border border-white/8 bg-white/4 p-3">
                    <p className="text-muted-foreground">Protein</p>
                    <p className="mt-1 text-lg font-semibold text-teal-300">{Math.round(summary.totalProtein)}g</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(proteinPercent)}%</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/4 p-3">
                    <p className="text-muted-foreground">Carbs</p>
                    <p className="mt-1 text-lg font-semibold text-amber-300">{Math.round(summary.totalCarbs)}g</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(carbsPercent)}%</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-white/4 p-3">
                    <p className="text-muted-foreground">Fat</p>
                    <p className="mt-1 text-lg font-semibold text-orange-300">{Math.round(summary.totalFat)}g</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(fatPercent)}%</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Droplets className="h-4 w-4 text-cyan-300" />
                      <span>Hydration mix</span>
                    </div>
                    <span className="text-sm metric-mono text-cyan-200">{Math.round(summary.waterMl)} ml</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      Manual {Math.round(summary.waterMlManual ?? 0)} ml
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      Inferred {Math.round(summary.waterMlInferred ?? 0)} ml
                    </div>
                  </div>
                  <div className="mt-4">
                    <WaterTracker onUpdate={fetchData} compact />
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Output and recovery">
            {summaryLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 rounded-[24px]" />
                <Skeleton className="h-24 rounded-[24px]" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Activity className="h-4 w-4 text-amber-300" />
                      <span>Calories burned</span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight">
                      {Math.round(summary.caloriesBurned)}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Footprints className="h-4 w-4 text-teal-300" />
                      <span>Daily steps</span>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-tight">
                      {(summary.steps ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-orange-300" />
                    <span>Performance snapshot</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      <p>Distance</p>
                      <p className="mt-1 text-base font-semibold text-foreground">{distanceText}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      <p>Workout steps</p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {(summary.workoutSteps ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      <p>Resting HR</p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {summary.restingHeartRateBpm ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                      <p>Active energy</p>
                      <p className="mt-1 text-base font-semibold text-foreground">
                        {summary.activeEnergyKcal ? Math.round(summary.activeEnergyKcal) : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {(summary.latestWeight || summary.latestBodyFat) && (
                  <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                      <Scale className="h-4 w-4 text-cyan-300" />
                      <span>Latest body check</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                        <p>Weight</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {summary.latestWeight ? `${summary.latestWeight} kg` : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-black/10 p-3">
                        <p>Body fat</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {summary.latestBodyFat ? `${summary.latestBodyFat}%` : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </section>

        {!summaryLoading && summary.caloriesBurned > 0 && (
          <SectionCard title="Coach momentum">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Net calories</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-teal-300">
                  {Math.round(summary.netCalories)}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Protein gap</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-300">
                  {Math.max(macroTargets.proteinG - summary.totalProtein, 0)}g
                </p>
              </div>
              <div className="rounded-[22px] border border-white/8 bg-white/4 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Activity load</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-orange-300">
                  {summary.workoutMinutes}m
                </p>
              </div>
            </div>
          </SectionCard>
        )}

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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative overflow-hidden rounded-[24px] border border-white/8 bg-white/4 p-4 transition duration-200 hover:border-white/14 hover:bg-white/6",
                  "tap-scale"
                )}
              >
                <div className={cn("absolute inset-x-0 top-0 h-16 bg-gradient-to-r opacity-70", item.surface)} />
                <div className="relative space-y-4">
                  <div className="flex items-center justify-between">
                    <item.icon className={cn("h-5 w-5", item.accent)} />
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {item.eyebrow}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-medium tracking-tight">{item.label}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <QuickFavorites onFoodLogged={fetchData} />

        {(streak.totalDaysLogged > 0 || (achievementsData && achievementsData.totalEarned > 0)) && (
          <SectionCard
            title="Consistency"
            action={
              achievementsData ? (
                <button
                  type="button"
                  onClick={() => setShowAchievements((value) => !value)}
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  {showAchievements ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showAchievements ? "Hide badges" : "Show badges"}
                </button>
              ) : null
            }
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-white/4 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-orange-500/12 p-2 text-orange-300">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium tracking-tight">
                      {streak.streak > 0 ? `${streak.streak}-day streak running` : "Start building your streak"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {streak.weekDays}/7 days this week and {streak.totalDaysLogged} total logged days
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {streak.weekLogged.map((logged, index) => (
                    <div
                      key={`streak-${index}`}
                      className={cn(
                        "h-3 w-3 rounded-full border transition-all",
                        logged
                          ? "border-orange-300 bg-orange-300 shadow-[0_0_12px_rgba(253,186,116,0.4)]"
                          : "border-white/10 bg-white/6"
                      )}
                    />
                  ))}
                </div>
              </div>

              {achievementsData && (
                <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-amber-300" />
                      <p className="text-sm font-medium tracking-tight">Achievements</p>
                    </div>
                    <Badge className="border-amber-300/20 bg-amber-500/12 text-amber-200">
                      {achievementsData.totalEarned}/{achievementsData.totalAvailable}
                    </Badge>
                  </div>

                  {showAchievements && (
                    <div className="mt-4 space-y-4">
                      {earnedAchievements.length > 0 && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {earnedAchievements.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-[20px] border border-white/8 bg-black/10 p-3"
                            >
                              <p className="text-sm font-medium">{item.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {inProgressAchievements.length > 0 && (
                        <div className="space-y-2">
                          {inProgressAchievements.slice(0, 4).map((item) => (
                            <div
                              key={item.id}
                              className="rounded-[20px] border border-white/8 bg-black/10 p-3"
                            >
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="font-medium text-foreground">{item.title}</span>
                                <span className="text-muted-foreground">{item.progressLabel}</span>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-300 transition-all duration-700"
                                  style={{ width: `${item.progress || 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {!summaryLoading && summary.mealCount === 0 && summary.workoutCount === 0 && (
          <Card className="cockpit-card rounded-[28px] border-dashed border-white/10 bg-transparent">
            <CardContent className="p-6 text-center">
              <Flame className="mx-auto h-8 w-8 text-teal-300/70" />
              <p className="mt-3 text-sm text-foreground/90">No meaningful data is logged yet today.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the dock below to log a meal, workout, photo, or note.
              </p>
            </CardContent>
          </Card>
        )}

        <VoiceInput onDataLogged={fetchData} />
      </div>
    </div>
  );
}
