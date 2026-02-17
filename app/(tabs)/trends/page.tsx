"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  Scale,
  Dumbbell,
  Minus,
  Target,
  Sparkles,
  Loader2,
  Ruler,
  TableProperties,
  Activity,
  Heart,
  Droplets,
  ArrowRight,
  CalendarClock,
  Telescope,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getSettings, getMacroGrams, fetchServerSettings, type BodyGoals } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { useCachedFetch, setCacheEntry } from "@/lib/cache";
import Link from "next/link";
import { MarkdownText } from "@/components/markdown-text";

// ─── Types ───────────────────────────────────────────────────────────

interface TrendsData {
  caloriesChart: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    count: number;
  }>;
  weightChart: Array<{ date: string; weight: number }>;
  bodyFatChart: Array<{ date: string; bodyFat: number }>;
  workoutChart: Array<{
    date: string;
    count: number;
    minutes: number;
    caloriesBurned: number;
  }>;
  macroTotals: { protein: number; carbs: number; fat: number };
  macroChart: Array<{
    date: string;
    protein: number;
    carbs: number;
    fat: number;
  }>;
  circumferenceChart: Array<{
    date: string;
    waist: number | null;
    chest: number | null;
    arms: number | null;
    hips: number | null;
    legs: number | null;
    neck: number | null;
    shoulders: number | null;
  }>;
  bodyCompChart: Array<{
    date: string;
    bmi: number | null;
    muscleMassKg: number | null;
    fatFreeWeightKg: number | null;
    bodyWaterPct: number | null;
    skeletalMusclePct: number | null;
    visceralFat: number | null;
    subcutaneousFatPct: number | null;
    boneMassKg: number | null;
    proteinPct: number | null;
    bmrKcal: number | null;
    metabolicAge: number | null;
    heartRateBpm: number | null;
  }>;
  summary: {
    avgCalories: number;
    totalWorkouts: number;
    totalWorkoutMinutes: number;
    totalCaloriesBurned: number;
    weightChange: number | null;
    bodyFatChange: number | null;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
  };
}

interface ProjectionPoint {
  date: string;
  projected: number;
  optimistic: number;
  pessimistic: number;
}

interface MetricProjection {
  historical: Array<{ date: string; value: number }>;
  projections: ProjectionPoint[];
  currentValue: number | null;
  ratePerWeek: number;
  estimatedGoalDate?: string | null;
  goal?: number | null;
}

interface ProjectionsData {
  weight: MetricProjection;
  waist: MetricProjection;
  bodyFat: MetricProjection;
  bmi: MetricProjection;
  muscleMass: MetricProjection;
  habits: {
    avgCalories: number;
    avgBurned: number;
    avgProtein: number;
    avgWorkoutMins: number;
    workoutsPerWeek: number;
    daysLogged: number;
    totalWorkouts: number;
  };
  aiOutlook: string;
  outlookCached?: boolean;
}

interface WeeklyReportData {
  weekOf: string;
  nutrition: {
    daysLogged: number;
    avgCalories: number;
    avgProtein: number;
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFat: number;
    caloriesTrend: number | null;
  };
  workouts: {
    total: number;
    totalMinutes: number;
    totalBurned: number;
    workoutsTrend: number | null;
  };
  hydration: {
    totalMl: number;
    avgGlassesPerDay: number;
    trend: number | null;
  };
  body: {
    latestWeight: number | null;
    weightChange: number | null;
  };
  aiSummary: string;
}

// ─── Constants ───────────────────────────────────────────────────────

const COLORS = {
  orange: "#f97316",
  blue: "#60a5fa",
  green: "#34d399",
  purple: "#a78bfa",
  rose: "#fb7185",
  amber: "#fbbf24",
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  protein: "#60a5fa",
  carbs: "#fbbf24",
  fat: "#fb7185",
  calorie: "#f97316",
  weight: "#60a5fa",
  bodyFat: "#a78bfa",
  workout: "#a78bfa",
};

const PIE_COLORS = [COLORS.protein, COLORS.carbs, COLORS.fat];

const tooltipStyle = {
  backgroundColor: "rgba(23, 23, 23, 0.95)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  color: "#e5e5e5",
};

const axisStyle = { fontSize: 10, fill: "#737373" };
const gridColor = "rgba(255,255,255,0.06)";

// ─── Main Component ──────────────────────────────────────────────────

export default function TrendsPage() {
  const [tab, setTab] = useState<"current" | "projections" | "weekly-report">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      if (t === "weekly-report") return "weekly-report";
      if (t === "projections") return "projections";
    }
    return "current";
  });
  const [range, setRange] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("trends_range") || "30";
    }
    return "30";
  });
  const [calorieTarget, setCalorieTarget] = useState(2000);
  const [macroTargets, setMacroTargets] = useState({ proteinG: 150, carbsG: 200, fatG: 67 });
  const [bodyGoals, setBodyGoals] = useState<BodyGoals>({ goalWeightKg: null, goalWaistCm: null });
  const [aiLanguage, setAiLanguage] = useState("english");

  // Save range to localStorage
  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
    if (typeof window !== "undefined") {
      localStorage.setItem("trends_range", newRange);
    }
  };

  useEffect(() => {
    const local = getSettings();
    setCalorieTarget(local.calorieTarget);
    setMacroTargets(getMacroGrams(local));
    if (local.bodyGoals) setBodyGoals(local.bodyGoals);
    setAiLanguage(local.aiLanguage || "english");

    fetchServerSettings().then((s) => {
      setCalorieTarget(s.calorieTarget);
      setMacroTargets(getMacroGrams(s));
      if (s.bodyGoals) setBodyGoals(s.bodyGoals);
      setAiLanguage(s.aiLanguage || "english");
    });
  }, []);

  // Trends data
  const trendsUrl = useMemo(() => `/api/health/trends?range=${range}`, [range]);
  const { data, loading } = useCachedFetch<TrendsData>(trendsUrl, { ttl: 120_000 });

  // Weekly insight — 1 hour TTL, server caches in DB too
  const insightUrl = useMemo(
    () =>
      `/api/health/trends/insights?calorieTarget=${calorieTarget}&proteinTargetG=${macroTargets.proteinG}&carbsTargetG=${macroTargets.carbsG}&fatTargetG=${macroTargets.fatG}&aiLanguage=${aiLanguage}`,
    [calorieTarget, macroTargets, aiLanguage]
  );
  const { data: insightData, loading: insightLoading, refresh: fetchInsight } =
    useCachedFetch<{ insight: string; cached?: boolean }>(insightUrl, { ttl: 3_600_000 });
  const insight = insightData?.insight ?? null;

  // Force server-side AI regeneration for weekly insight
  const [insightRefreshing, setInsightRefreshing] = useState(false);
  const refreshInsightAI = useCallback(async () => {
    setInsightRefreshing(true);
    try {
      const res = await fetch(insightUrl + "&refresh=true");
      if (res.ok) {
        const newData = await res.json();
        setCacheEntry(insightUrl, newData);
        fetchInsight();
      }
    } catch (err) {
      console.error("Insight refresh failed:", err);
    } finally {
      setInsightRefreshing(false);
    }
  }, [insightUrl, fetchInsight]);

  // Projections data — long TTL (24h), only re-fetched on manual refresh or new data
  const projectionsUrl = useMemo(
    () =>
      tab === "projections"
        ? `/api/health/trends/projections?goalWeightKg=${bodyGoals.goalWeightKg || ""}&goalWaistCm=${bodyGoals.goalWaistCm || ""}&calorieTarget=${calorieTarget}&aiLanguage=${aiLanguage}`
        : null,
    [tab, bodyGoals, calorieTarget, aiLanguage]
  );
  const {
    data: projectionsData,
    loading: projectionsLoading,
    refresh: refreshProjections,
  } = useCachedFetch<ProjectionsData>(projectionsUrl, { ttl: 86_400_000 }); // 24 hours

  // Separate AI outlook refresh — appends refreshAI=true
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const refreshAIOutlook = useCallback(async () => {
    if (!projectionsUrl) return;
    setAiRefreshing(true);
    try {
      const res = await fetch(projectionsUrl + "&refreshAI=true");
      if (res.ok) {
        const newData = await res.json();
        // Update the cached data in-place
        if (projectionsUrl) {
          setCacheEntry(projectionsUrl, newData);
        }
        // Trigger re-render by refreshing the cache hook
        refreshProjections();
      }
    } catch (err) {
      console.error("AI outlook refresh failed:", err);
    } finally {
      setAiRefreshing(false);
    }
  }, [projectionsUrl, refreshProjections]);

  // Weekly report — only fetch when that tab is active
  const weeklyReportUrl = useMemo(
    () => (tab === "weekly-report" ? "/api/health/weekly-report" : null),
    [tab]
  );
  const { data: weeklyReport, loading: weeklyReportLoading } =
    useCachedFetch<WeeklyReportData>(weeklyReportUrl, { ttl: 3_600_000 });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const weeklyCalAvg =
    data && data.caloriesChart.length > 0
      ? Math.round(
          data.caloriesChart.slice(-7).reduce((s, d) => s + d.calories, 0) /
            Math.min(data.caloriesChart.length, 7)
        )
      : null;

  if (loading && tab === "current") {
    return (
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-2xl font-bold mb-4">Trends</h1>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          Loading trends...
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-12 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-xs text-muted-foreground">
            {tab === "current" ? "Your health at a glance" : "Where you're heading"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "current" && (
            <>
              <Link href="/trends/daily-log">
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <TableProperties className="h-4 w-4" />
                </Button>
              </Link>
              <Select value={range} onValueChange={handleRangeChange}>
                <SelectTrigger className="w-24 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" sideOffset={4} className="z-[200]">
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-secondary/30 rounded-lg p-0.5">
        <button
          onClick={() => setTab("current")}
          className={cn(
            "flex-1 text-xs font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1.5",
            tab === "current"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Current
        </button>
        <button
          onClick={() => setTab("projections")}
          className={cn(
            "flex-1 text-xs font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1.5",
            tab === "projections"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Telescope className="h-3.5 w-3.5" />
          Projections
        </button>
        <button
          onClick={() => setTab("weekly-report")}
          className={cn(
            "flex-1 text-xs font-medium py-2 rounded-md transition-all flex items-center justify-center gap-1.5",
            tab === "weekly-report"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Weekly
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          CURRENT TRENDS TAB
         ═══════════════════════════════════════════════════════════════ */}
      {tab === "current" && (
        <>
          {!data ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No data available yet.</p>
                <p className="text-xs mt-1">
                  Start logging food, measurements, and workouts to see trends.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* AI Weekly Insights */}
              <Card className="border-violet-500/20 bg-violet-500/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-violet-500/10 shrink-0">
                      <Sparkles className="h-4 w-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-violet-400 mb-1">
                        AI Weekly Insight
                      </p>
                      {insightLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analyzing your week...
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground leading-relaxed">
                          <MarkdownText text={insight || ""} />
                        </div>
                      )}
                    </div>
                  </div>
                  {!insightLoading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-violet-400 hover:text-violet-300 h-7 px-2"
                      onClick={refreshInsightAI}
                      disabled={insightRefreshing}
                    >
                      <RefreshCw className={cn("h-3 w-3 mr-1", insightRefreshing && "animate-spin")} />
                      {insightRefreshing ? "Generating..." : "Refresh"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-orange-500/10">
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Avg Calories
                      </span>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">{data.summary.avgCalories}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Target className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-[10px] text-muted-foreground">
                        target {calorieTarget}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-blue-500/10">
                        <Scale className="h-3.5 w-3.5 text-blue-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Weight
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-2xl font-bold tracking-tight">
                        {data.summary.weightChange !== null
                          ? `${data.summary.weightChange > 0 ? "+" : ""}${data.summary.weightChange}`
                          : "—"}
                      </p>
                      {data.summary.weightChange !== null &&
                        (data.summary.weightChange < 0 ? (
                          <TrendingDown className="h-4 w-4 text-green-400" />
                        ) : data.summary.weightChange > 0 ? (
                          <TrendingUp className="h-4 w-4 text-red-400" />
                        ) : (
                          <Minus className="h-4 w-4 text-muted-foreground" />
                        ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">kg change</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/10">
                        <Dumbbell className="h-3.5 w-3.5 text-purple-400" />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        Workouts
                      </span>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">{data.summary.totalWorkouts}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {data.summary.totalWorkoutMinutes} min total
                    </p>
                    {data.summary.totalCaloriesBurned > 0 && (
                      <p className="text-[10px] text-orange-400 mt-0.5 font-medium">
                        🔥 {data.summary.totalCaloriesBurned.toLocaleString()} cal burned
                        {data.summary.totalWorkouts > 0 && (
                          <span className="text-muted-foreground font-normal">
                            {" "}(~{Math.round(data.summary.totalCaloriesBurned / data.summary.totalWorkouts)}/workout)
                          </span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        7-Day Avg
                      </span>
                    </div>
                    <p className="text-2xl font-bold tracking-tight">
                      {weeklyCalAvg ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      kcal/day (last 7)
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Calorie Adherence Chart */}
              {data.caloriesChart.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-400" />
                      Calorie Adherence
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground">
                      Dashed line = target ({calorieTarget} kcal)
                    </p>
                  </CardHeader>
                  <CardContent className="p-2 pb-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={data.caloriesChart}
                        margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={(label) => `${label}`}
                          formatter={(value: unknown) => [`${Math.round(Number(value) || 0)} kcal`, "Calories"]}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <ReferenceLine y={calorieTarget} stroke={COLORS.rose} strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.6} />
                        <ReferenceLine y={calorieTarget * 1.1} stroke="#737373" strokeDasharray="2 6" strokeWidth={0.5} strokeOpacity={0.2} />
                        <ReferenceLine y={calorieTarget * 0.9} stroke="#737373" strokeDasharray="2 6" strokeWidth={0.5} strokeOpacity={0.2} />
                        <Bar dataKey="calories" fill={COLORS.orange} radius={[6, 6, 0, 0]} maxBarSize={28} fillOpacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Macro Adherence Over Time */}
              {data.macroChart && data.macroChart.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold">Macro Trends</CardTitle>
                    <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.protein }} />
                        P: {data.summary.avgProtein}g / {macroTargets.proteinG}g
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.carbs }} />
                        C: {data.summary.avgCarbs}g / {macroTargets.carbsG}g
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS.fat }} />
                        F: {data.summary.avgFat}g / {macroTargets.fatG}g
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pb-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={data.macroChart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="proteinGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.protein} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={COLORS.protein} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="carbsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.carbs} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={COLORS.carbs} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.fat} stopOpacity={0.25} />
                            <stop offset="95%" stopColor={COLORS.fat} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={(label) => `${label}`}
                          formatter={(value: unknown, name: unknown) => [
                            `${Math.round(Number(value) || 0)}g`,
                            String(name ?? "").charAt(0).toUpperCase() + String(name ?? "").slice(1),
                          ]}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <ReferenceLine y={macroTargets.proteinG} stroke={COLORS.protein} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.3} />
                        <Area type="monotone" dataKey="protein" stroke={COLORS.protein} strokeWidth={2} fill="url(#proteinGrad)" dot={false} />
                        <Area type="monotone" dataKey="carbs" stroke={COLORS.carbs} strokeWidth={2} fill="url(#carbsGrad)" dot={false} />
                        <Area type="monotone" dataKey="fat" stroke={COLORS.fat} strokeWidth={2} fill="url(#fatGrad)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-5 mt-2">
                      {[
                        { name: "Protein", color: COLORS.protein },
                        { name: "Carbs", color: COLORS.carbs },
                        { name: "Fat", color: COLORS.fat },
                      ].map((m) => (
                        <div key={m.name} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                          <span className="text-[10px] text-muted-foreground font-medium">{m.name}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Combined Body Composition */}
              {(data.weightChart.length > 0 || data.bodyFatChart.length > 0) && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Scale className="h-4 w-4 text-blue-400" />
                      Body Composition
                    </CardTitle>
                    <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                      {data.summary.weightChange !== null && (
                        <span className="flex items-center gap-1">
                          Weight: {data.summary.weightChange > 0 ? "+" : ""}{data.summary.weightChange} kg
                          {data.summary.weightChange < 0 ? (
                            <TrendingDown className="h-3 w-3 text-green-400" />
                          ) : data.summary.weightChange > 0 ? (
                            <TrendingUp className="h-3 w-3 text-red-400" />
                          ) : null}
                        </span>
                      )}
                      {data.summary.bodyFatChange !== null && (
                        <span className="flex items-center gap-1">
                          BF: {data.summary.bodyFatChange > 0 ? "+" : ""}{data.summary.bodyFatChange}%
                          {data.summary.bodyFatChange < 0 ? (
                            <TrendingDown className="h-3 w-3 text-green-400" />
                          ) : data.summary.bodyFatChange > 0 ? (
                            <TrendingUp className="h-3 w-3 text-red-400" />
                          ) : null}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pb-3">
                    {data.weightChart.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between px-2 mb-1">
                          <p className="text-[10px] text-muted-foreground font-medium">Weight (kg)</p>
                          {bodyGoals.goalWeightKg && (
                            <p className="text-[10px] text-green-400 font-medium">Goal: {bodyGoals.goalWeightKg} kg</p>
                          )}
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart data={data.weightChart} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.weight} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={COLORS.weight} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                            <YAxis domain={["auto", "auto"]} tick={axisStyle} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => [`${value ?? 0} kg`, "Weight"]} />
                            {bodyGoals.goalWeightKg && (
                              <ReferenceLine y={bodyGoals.goalWeightKg} stroke={COLORS.green} strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.7} label={{ value: "Goal", position: "right", fill: COLORS.green, fontSize: 10 }} />
                            )}
                            <Area type="monotone" dataKey="weight" stroke={COLORS.weight} strokeWidth={2.5} fill="url(#weightGradient)" dot={{ r: 3, strokeWidth: 2, fill: COLORS.weight }} activeDot={{ r: 5, fill: COLORS.weight }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {data.bodyFatChart.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground px-2 mb-1 font-medium">Body Fat (%)</p>
                        <ResponsiveContainer width="100%" height={140}>
                          <AreaChart data={data.bodyFatChart} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="bfGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS.bodyFat} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={COLORS.bodyFat} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                            <YAxis domain={["auto", "auto"]} tick={axisStyle} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={tooltipStyle} formatter={(value: unknown) => [`${value ?? 0}%`, "Body Fat"]} />
                            <Area type="monotone" dataKey="bodyFat" stroke={COLORS.bodyFat} strokeWidth={2.5} fill="url(#bfGradient)" dot={{ r: 3, strokeWidth: 2, fill: COLORS.bodyFat }} activeDot={{ r: 5, fill: COLORS.bodyFat }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Circumference Trends */}
              {data.circumferenceChart.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-green-400" />
                      Circumference Trends
                    </CardTitle>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Tape measurements over time (cm)</p>
                      {bodyGoals.goalWaistCm && (
                        <p className="text-[10px] text-green-400 font-medium">Waist goal: {bodyGoals.goalWaistCm} cm</p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pb-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={data.circumferenceChart} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis domain={["auto", "auto"]} tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          labelFormatter={(label) => `${label}`}
                          formatter={(value: unknown, name: unknown) => [
                            value != null ? `${value} cm` : "—",
                            String(name ?? "").charAt(0).toUpperCase() + String(name ?? "").slice(1),
                          ]}
                          cursor={{ stroke: "rgba(255,255,255,0.1)" }}
                        />
                        {bodyGoals.goalWaistCm && (
                          <ReferenceLine y={bodyGoals.goalWaistCm} stroke={COLORS.green} strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.7} label={{ value: "Waist Goal", position: "right", fill: COLORS.green, fontSize: 10 }} />
                        )}
                        {(["waist", "chest", "arms", "hips", "shoulders"] as const).map((key) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={key}
                            stroke={{ waist: COLORS.amber, chest: COLORS.blue, arms: COLORS.purple, hips: COLORS.rose, shoulders: COLORS.green }[key]}
                            strokeWidth={2}
                            dot={{ r: 3, fill: { waist: COLORS.amber, chest: COLORS.blue, arms: COLORS.purple, hips: COLORS.rose, shoulders: COLORS.green }[key] }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-3 mt-2 flex-wrap">
                      {(["waist", "chest", "arms", "hips", "shoulders"] as const).map((key) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: { waist: COLORS.amber, chest: COLORS.blue, arms: COLORS.purple, hips: COLORS.rose, shoulders: COLORS.green }[key] }} />
                          <span className="text-[10px] text-muted-foreground font-medium capitalize">{key}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Workout Chart */}
              {data.workoutChart.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Dumbbell className="h-4 w-4 text-purple-400" />
                      Workouts
                    </CardTitle>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.purple }} /> Minutes
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.orange }} /> Cal Burned
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pb-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.workoutChart} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={axisStyle} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={axisStyle} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: unknown, name: unknown) => {
                            if (name === "minutes") return [`${value ?? 0} min`, "Duration"];
                            if (name === "caloriesBurned") return [`${value ?? 0} cal`, "Burned"];
                            return [`${value}`, String(name ?? "")];
                          }}
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        />
                        <Bar yAxisId="left" dataKey="minutes" fill={COLORS.purple} radius={[6, 6, 0, 0]} maxBarSize={24} fillOpacity={0.85} />
                        <Bar yAxisId="right" dataKey="caloriesBurned" fill={COLORS.orange} radius={[6, 6, 0, 0]} maxBarSize={24} fillOpacity={0.7} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Body Composition Charts (Smart Scale) */}
              {data.bodyCompChart && data.bodyCompChart.length > 0 && (
                <>
                  <Card>
                    <CardHeader className="pb-1 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Activity className="h-4 w-4 text-cyan-400" />
                        Body Composition
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.cyan }} /> BMI
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.rose }} /> Visceral Fat
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 pb-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={data.bodyCompChart} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="bmi" tick={axisStyle} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                          <YAxis yAxisId="vf" orientation="right" tick={axisStyle} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: unknown, name: unknown) => {
                              if (name === "bmi") return [`${value ?? 0}`, "BMI"];
                              if (name === "visceralFat") return [`${value ?? 0}`, "Visceral Fat"];
                              return [`${value}`, String(name ?? "")];
                            }}
                          />
                          <Line yAxisId="bmi" type="monotone" dataKey="bmi" stroke={COLORS.cyan} strokeWidth={2} dot={false} connectNulls />
                          <Line yAxisId="vf" type="monotone" dataKey="visceralFat" stroke={COLORS.rose} strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-1 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Dumbbell className="h-4 w-4 text-green-400" />
                        Muscle & Lean Mass
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.green }} /> Muscle Mass (kg)
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.teal }} /> Fat-Free (kg)
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 pb-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={data.bodyCompChart} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                          <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: unknown, name: unknown) => {
                              if (name === "muscleMassKg") return [`${value ?? 0} kg`, "Muscle Mass"];
                              if (name === "fatFreeWeightKg") return [`${value ?? 0} kg`, "Fat-Free Weight"];
                              return [`${value}`, String(name ?? "")];
                            }}
                          />
                          <Area type="monotone" dataKey="fatFreeWeightKg" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={0.1} strokeWidth={2} dot={false} connectNulls />
                          <Area type="monotone" dataKey="muscleMassKg" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.15} strokeWidth={2} dot={false} connectNulls />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-1 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-blue-400" />
                        Hydration & Skeletal Muscle
                      </CardTitle>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.blue }} /> Body Water %
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.amber }} /> Skeletal Muscle %
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="p-2 pb-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={data.bodyCompChart} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                          <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                          <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(value: unknown, name: unknown) => {
                              if (name === "bodyWaterPct") return [`${value ?? 0}%`, "Body Water"];
                              if (name === "skeletalMusclePct") return [`${value ?? 0}%`, "Skeletal Muscle"];
                              return [`${value}`, String(name ?? "")];
                            }}
                          />
                          <Line type="monotone" dataKey="bodyWaterPct" stroke={COLORS.blue} strokeWidth={2} dot={false} connectNulls />
                          <Line type="monotone" dataKey="skeletalMusclePct" stroke={COLORS.amber} strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {data.bodyCompChart.some(d => d.bmrKcal || d.heartRateBpm) && (
                    <Card>
                      <CardHeader className="pb-1 pt-4 px-4">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Heart className="h-4 w-4 text-red-400" />
                          BMR & Heart Rate
                        </CardTitle>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.orange }} /> BMR (kcal)
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS.rose }} /> Heart Rate (bpm)
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="p-2 pb-3">
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={data.bodyCompChart} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="bmr" tick={axisStyle} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                            <YAxis yAxisId="hr" orientation="right" tick={axisStyle} axisLine={false} tickLine={false} domain={[50, 130]} />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value: unknown, name: unknown) => {
                                if (name === "bmrKcal") return [`${value ?? 0} kcal`, "BMR"];
                                if (name === "heartRateBpm") return [`${value ?? 0} bpm`, "Heart Rate"];
                                return [`${value}`, String(name ?? "")];
                              }}
                            />
                            <Line yAxisId="bmr" type="monotone" dataKey="bmrKcal" stroke={COLORS.orange} strokeWidth={2} dot={false} connectNulls />
                            <Line yAxisId="hr" type="monotone" dataKey="heartRateBpm" stroke={COLORS.rose} strokeWidth={2} dot={{ r: 3, fill: COLORS.rose }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Latest Composition Snapshot */}
                  {(() => {
                    const latest = [...data.bodyCompChart].reverse().find(d =>
                      d.muscleMassKg || d.bodyWaterPct || d.visceralFat || d.bmrKcal
                    );
                    if (!latest) return null;
                    const stats = [
                      { label: "BMI", value: latest.bmi, unit: "", color: "text-cyan-400" },
                      { label: "Visceral Fat", value: latest.visceralFat, unit: "", color: "text-rose-400" },
                      { label: "Muscle Mass", value: latest.muscleMassKg, unit: "kg", color: "text-green-400" },
                      { label: "Body Water", value: latest.bodyWaterPct, unit: "%", color: "text-blue-400" },
                      { label: "Skeletal Muscle", value: latest.skeletalMusclePct, unit: "%", color: "text-amber-400" },
                      { label: "Bone Mass", value: latest.boneMassKg, unit: "kg", color: "text-purple-400" },
                      { label: "Protein", value: latest.proteinPct, unit: "%", color: "text-teal-400" },
                      { label: "BMR", value: latest.bmrKcal, unit: "kcal", color: "text-orange-400" },
                      { label: "Metabolic Age", value: latest.metabolicAge, unit: "", color: "text-pink-400" },
                    ].filter(s => s.value != null);

                    return (
                      <Card>
                        <CardHeader className="pb-2 pt-4 px-4">
                          <CardTitle className="text-sm font-semibold">Latest Body Scan</CardTitle>
                          <p className="text-[10px] text-muted-foreground">{latest.date}</p>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="grid grid-cols-3 gap-2">
                            {stats.map(({ label, value, unit, color }) => (
                              <div key={label} className="bg-secondary/30 rounded-lg p-2.5 text-center">
                                <p className={cn("text-base font-bold tabular-nums", color)}>
                                  {value}{unit && <span className="text-[10px] font-normal ml-0.5">{unit}</span>}
                                </p>
                                <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}
                </>
              )}

              {/* Macro Breakdown Pie */}
              {data.macroTotals && (data.macroTotals.protein + data.macroTotals.carbs + data.macroTotals.fat) > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold">Macro Breakdown (Period Total)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={120} height={120}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Protein", value: Math.round(data.macroTotals.protein), color: COLORS.protein },
                              { name: "Carbs", value: Math.round(data.macroTotals.carbs), color: COLORS.carbs },
                              { name: "Fat", value: Math.round(data.macroTotals.fat), color: COLORS.fat },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={55}
                            dataKey="value"
                            paddingAngle={3}
                            strokeWidth={0}
                          >
                            {PIE_COLORS.map((c, i) => (
                              <Cell key={i} fill={c} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-3">
                        {[
                          { name: "Protein", value: Math.round(data.macroTotals.protein), color: COLORS.protein },
                          { name: "Carbs", value: Math.round(data.macroTotals.carbs), color: COLORS.carbs },
                          { name: "Fat", value: Math.round(data.macroTotals.fat), color: COLORS.fat },
                        ].map((item) => {
                          const total = Math.round(data.macroTotals.protein + data.macroTotals.carbs + data.macroTotals.fat);
                          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                          return (
                            <div key={item.name} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-xs font-medium">{item.name}</span>
                                </div>
                                <span className="text-xs font-semibold tabular-nums">
                                  {item.value}g ({pct}%)
                                </span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-secondary/50">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty state */}
              {data.caloriesChart.length === 0 && data.weightChart.length === 0 && data.workoutChart.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No data for this time period.</p>
                    <p className="text-xs mt-1">Start logging food, measurements, and workouts to see trends.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => handleRangeChange("90")}>
                      Try 90 days
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PROJECTIONS TAB
         ═══════════════════════════════════════════════════════════════ */}
      {tab === "projections" && (
        <ProjectionsView
          data={projectionsData}
          loading={projectionsLoading}
          bodyGoals={bodyGoals}
          onRefreshData={refreshProjections}
          onRefreshAI={refreshAIOutlook}
          aiRefreshing={aiRefreshing}
          formatDate={formatDate}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════
          WEEKLY REPORT TAB
         ═══════════════════════════════════════════════════════════════ */}
      {tab === "weekly-report" && (
        <WeeklyReportView data={weeklyReport} loading={weeklyReportLoading} />
      )}
    </div>
  );
}

// ─── Projections View Component ──────────────────────────────────────

function ProjectionsView({
  data,
  loading,
  bodyGoals,
  onRefreshData,
  onRefreshAI,
  aiRefreshing,
  formatDate,
}: {
  data: ProjectionsData | null;
  loading: boolean;
  bodyGoals: BodyGoals;
  onRefreshData: () => void;
  onRefreshAI: () => void;
  aiRefreshing: boolean;
  formatDate: (d: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">Generating projections...</p>
        <p className="text-xs mt-1 text-muted-foreground/60">Analyzing your data with AI</p>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Telescope className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Unable to generate projections.</p>
          <p className="text-xs mt-1">Log more data to unlock future predictions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI 90-Day Outlook */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 shrink-0">
              <Telescope className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-emerald-400">AI 90-Day Outlook</p>
                {data.outlookCached && (
                  <span className="text-[9px] text-muted-foreground/50">cached</span>
                )}
              </div>
              {aiRefreshing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating AI outlook...
                </div>
              ) : data.aiOutlook && !data.aiOutlook.includes("Tap refresh") ? (
                <div className="text-sm text-muted-foreground leading-relaxed">
                  <MarkdownText text={data.aiOutlook} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/70 py-1">
                  Tap refresh to generate your personalized 90-day AI outlook.
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 h-7 px-2"
            onClick={onRefreshAI}
            disabled={aiRefreshing}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", aiRefreshing && "animate-spin")} />
            {aiRefreshing ? "Generating..." : "Refresh AI Outlook"}
          </Button>
        </CardContent>
      </Card>

      {/* Milestone Cards */}
      <div className="grid grid-cols-2 gap-3">
        {data.weight.currentValue && (
          <Card className="border-blue-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10">
                  <Scale className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Weight
                </span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{data.weight.currentValue} kg</p>
              <div className="space-y-0.5 mt-1">
                <p className="text-[10px] text-muted-foreground">
                  {data.weight.ratePerWeek > 0 ? "+" : ""}{data.weight.ratePerWeek} kg/week
                </p>
                {data.weight.estimatedGoalDate && (
                  <p className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                    <CalendarClock className="h-2.5 w-2.5" />
                    Goal by {data.weight.estimatedGoalDate}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {data.waist.currentValue && (
          <Card className="border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <Ruler className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Waist
                </span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{data.waist.currentValue} cm</p>
              <div className="space-y-0.5 mt-1">
                <p className="text-[10px] text-muted-foreground">
                  {data.waist.ratePerWeek > 0 ? "+" : ""}{data.waist.ratePerWeek} cm/week
                </p>
                {data.waist.estimatedGoalDate && (
                  <p className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                    <CalendarClock className="h-2.5 w-2.5" />
                    Goal by {data.waist.estimatedGoalDate}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {data.bodyFat.currentValue && (
          <Card className="border-purple-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10">
                  <Activity className="h-3.5 w-3.5 text-purple-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Body Fat
                </span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{data.bodyFat.currentValue}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {data.bodyFat.ratePerWeek > 0 ? "+" : ""}{data.bodyFat.ratePerWeek}%/week
              </p>
            </CardContent>
          </Card>
        )}

        {data.muscleMass.currentValue && (
          <Card className="border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-green-500/10">
                  <Dumbbell className="h-3.5 w-3.5 text-green-400" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Muscle
                </span>
              </div>
              <p className="text-2xl font-bold tracking-tight">{data.muscleMass.currentValue} kg</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {data.muscleMass.ratePerWeek > 0 ? "+" : ""}{data.muscleMass.ratePerWeek} kg/week
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Weight Projection Chart */}
      {data.weight.projections.length > 0 && (
        <ProjectionChart
          title="Weight Projection"
          icon={<Scale className="h-4 w-4 text-blue-400" />}
          historical={data.weight.historical}
          projections={data.weight.projections}
          goal={data.weight.goal}
          unit="kg"
          color={COLORS.blue}
          formatDate={formatDate}
        />
      )}

      {/* Waist Projection Chart */}
      {data.waist.projections.length > 0 && (
        <ProjectionChart
          title="Waist Projection"
          icon={<Ruler className="h-4 w-4 text-amber-400" />}
          historical={data.waist.historical}
          projections={data.waist.projections}
          goal={data.waist.goal}
          unit="cm"
          color={COLORS.amber}
          formatDate={formatDate}
        />
      )}

      {/* Body Fat Projection */}
      {data.bodyFat.projections.length > 0 && (
        <ProjectionChart
          title="Body Fat Projection"
          icon={<Activity className="h-4 w-4 text-purple-400" />}
          historical={data.bodyFat.historical}
          projections={data.bodyFat.projections}
          goal={null}
          unit="%"
          color={COLORS.purple}
          formatDate={formatDate}
        />
      )}

      {/* Muscle Mass Projection */}
      {data.muscleMass.projections.length > 0 && (
        <ProjectionChart
          title="Muscle Mass Projection"
          icon={<Dumbbell className="h-4 w-4 text-green-400" />}
          historical={data.muscleMass.historical}
          projections={data.muscleMass.projections}
          goal={null}
          unit="kg"
          color={COLORS.green}
          formatDate={formatDate}
        />
      )}

      {/* Habit Stats */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Your Habits (90-Day Avg)</CardTitle>
          <p className="text-[10px] text-muted-foreground">What the projections are based on</p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Avg Daily Cal", value: `${data.habits.avgCalories}`, unit: "kcal", color: "text-orange-400" },
              { label: "Avg Burned", value: `${data.habits.avgBurned}`, unit: "kcal", color: "text-rose-400" },
              { label: "Avg Protein", value: `${data.habits.avgProtein}`, unit: "g", color: "text-blue-400" },
              { label: "Workouts/Week", value: `${data.habits.workoutsPerWeek}`, unit: "", color: "text-purple-400" },
              { label: "Days Logged", value: `${data.habits.daysLogged}`, unit: "/90", color: "text-green-400" },
              { label: "Total Workouts", value: `${data.habits.totalWorkouts}`, unit: "", color: "text-amber-400" },
            ].map(({ label, value, unit, color }) => (
              <div key={label} className="bg-secondary/30 rounded-lg p-3 text-center">
                <p className={cn("text-lg font-bold tabular-nums", color)}>
                  {value}
                  {unit && <span className="text-[10px] font-normal ml-0.5">{unit}</span>}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* No data state */}
      {data.weight.projections.length === 0 && data.waist.projections.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Telescope className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Not enough data yet</p>
            <p className="text-xs mt-1">
              Log at least 2 weight or waist measurements to see projections.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Projection Chart Component ──────────────────────────────────────

function ProjectionChart({
  title,
  icon,
  historical,
  projections,
  goal,
  unit,
  color,
  formatDate,
}: {
  title: string;
  icon: React.ReactNode;
  historical: Array<{ date: string; value: number }>;
  projections: ProjectionPoint[];
  goal: number | null | undefined;
  unit: string;
  color: string;
  formatDate: (d: string) => string;
}) {
  // Combine historical + projected into single chart data
  const chartData = [
    ...historical.map((h) => ({
      date: h.date,
      actual: h.value,
      projected: null as number | null,
      optimistic: null as number | null,
      pessimistic: null as number | null,
    })),
    // Bridge point: last actual = first projected
    ...(historical.length > 0 && projections.length > 0
      ? [{
          date: historical[historical.length - 1].date,
          actual: null as number | null,
          projected: historical[historical.length - 1].value,
          optimistic: historical[historical.length - 1].value,
          pessimistic: historical[historical.length - 1].value,
        }]
      : []),
    ...projections.map((p) => ({
      date: p.date,
      actual: null as number | null,
      projected: p.projected,
      optimistic: p.optimistic,
      pessimistic: p.pessimistic,
    })),
  ];

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} /> Actual
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block w-6 h-0.5 border-t-2 border-dashed" style={{ borderColor: color }} /> Projected
          </span>
          {goal && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Target className="h-2.5 w-2.5" /> Goal: {goal} {unit}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-2 pb-3">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id={`projGrad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: "#737373" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "#737373" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(23, 23, 23, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
                fontSize: "12px",
                padding: "8px 12px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                color: "#e5e5e5",
              }}
              formatter={(value: unknown, name: unknown) => {
                if (value == null) return [null, null];
                const label = name === "actual" ? "Actual" : name === "projected" ? "Projected" : name === "optimistic" ? "Best case" : "Worst case";
                return [`${value} ${unit}`, label];
              }}
            />
            {goal && (
              <ReferenceLine
                y={goal}
                stroke="#34d399"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                strokeOpacity={0.7}
                label={{ value: "Goal", position: "right", fill: "#34d399", fontSize: 10 }}
              />
            )}
            {/* Confidence band */}
            <Area type="monotone" dataKey="pessimistic" stroke="none" fill={color} fillOpacity={0.06} connectNulls />
            <Area type="monotone" dataKey="optimistic" stroke="none" fill={color} fillOpacity={0.06} connectNulls />
            {/* Projected line */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls
            />
            {/* Actual line */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#projGrad-${title})`}
              dot={{ r: 3, fill: color, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: color }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Weekly Report View Component ─────────────────────────────────────

function WeeklyReportView({
  data,
  loading,
}: {
  data: WeeklyReportData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Generating your weekly report...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No weekly data available yet.</p>
          <p className="text-xs mt-1">
            Log food, workouts, and measurements throughout the week.
          </p>
        </CardContent>
      </Card>
    );
  }

  const calTrend = data.nutrition.caloriesTrend;
  const workoutTrend = data.workouts.workoutsTrend;

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10">
              <CalendarClock className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Weekly Report</p>
              <p className="text-xs text-muted-foreground">{data.weekOf}</p>
            </div>
          </div>
          {/* AI Summary */}
          <div className="bg-background/50 rounded-lg p-3 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-[10px] font-medium text-indigo-400 uppercase tracking-wide">
                AI Coach Summary
              </span>
            </div>
            <div className="text-sm text-foreground/80 leading-relaxed">
              <MarkdownText text={data.aiSummary} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nutrition Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            Nutrition
            {calTrend !== null && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] h-5 ml-auto",
                  calTrend > 0
                    ? "text-red-400 bg-red-500/10"
                    : calTrend < 0
                    ? "text-green-400 bg-green-500/10"
                    : "text-muted-foreground"
                )}
              >
                {calTrend > 0 ? "+" : ""}
                {calTrend} cal/day vs last week
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Days Logged</p>
              <p className="text-xl font-bold">{data.nutrition.daysLogged}</p>
              <p className="text-[10px] text-muted-foreground">/ 7 days</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Avg Calories</p>
              <p className="text-xl font-bold">{data.nutrition.avgCalories}</p>
              <p className="text-[10px] text-muted-foreground">kcal/day</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center bg-blue-500/5 rounded-lg py-2">
              <p className="text-xs font-semibold text-blue-400">{data.nutrition.totalProtein}g</p>
              <p className="text-[9px] text-muted-foreground">Protein</p>
            </div>
            <div className="text-center bg-amber-500/5 rounded-lg py-2">
              <p className="text-xs font-semibold text-amber-400">{data.nutrition.totalCarbs}g</p>
              <p className="text-[9px] text-muted-foreground">Carbs</p>
            </div>
            <div className="text-center bg-rose-500/5 rounded-lg py-2">
              <p className="text-xs font-semibold text-rose-400">{data.nutrition.totalFat}g</p>
              <p className="text-[9px] text-muted-foreground">Fat</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workouts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-purple-500" />
            Workouts
            {workoutTrend !== null && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] h-5 ml-auto",
                  workoutTrend > 0
                    ? "text-green-400 bg-green-500/10"
                    : workoutTrend < 0
                    ? "text-red-400 bg-red-500/10"
                    : "text-muted-foreground"
                )}
              >
                {workoutTrend > 0 ? "+" : ""}
                {workoutTrend} vs last week
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xl font-bold">{data.workouts.total}</p>
              <p className="text-[10px] text-muted-foreground">Sessions</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xl font-bold">{data.workouts.totalMinutes}</p>
              <p className="text-[10px] text-muted-foreground">Minutes</p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-3 text-center">
              <p className="text-xl font-bold">{data.workouts.totalBurned}</p>
              <p className="text-[10px] text-muted-foreground">Cal Burned</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hydration & Body */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Droplets className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-medium">Hydration</span>
            </div>
            <p className="text-xl font-bold">{data.hydration.avgGlassesPerDay}</p>
            <p className="text-[10px] text-muted-foreground">glasses/day avg</p>
            <p className="text-[9px] text-muted-foreground mt-1">
              {Math.round(data.hydration.totalMl / 1000)}L total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">Weight</span>
            </div>
            {data.body.latestWeight ? (
              <>
                <p className="text-xl font-bold">{data.body.latestWeight}kg</p>
                {data.body.weightChange !== null && (
                  <p
                    className={cn(
                      "text-[10px]",
                      data.body.weightChange < 0
                        ? "text-green-400"
                        : data.body.weightChange > 0
                        ? "text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {data.body.weightChange > 0 ? "+" : ""}
                    {data.body.weightChange}kg this month
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No weigh-ins</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
