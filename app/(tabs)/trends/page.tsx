"use client";

import { useState, useEffect, useMemo } from "react";
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
import { useCachedFetch } from "@/lib/cache";
import Link from "next/link";

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

// Explicit vivid colors that work on dark backgrounds
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

export default function TrendsPage() {
  const [range, setRange] = useState("30");
  const [calorieTarget, setCalorieTarget] = useState(2000);
  const [macroTargets, setMacroTargets] = useState({ proteinG: 150, carbsG: 200, fatG: 67 });
  const [bodyGoals, setBodyGoals] = useState<BodyGoals>({ goalWeightKg: null, goalWaistCm: null });
  const [aiLanguage, setAiLanguage] = useState("english");

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

  const trendsUrl = useMemo(() => `/api/health/trends?range=${range}`, [range]);
  const { data, loading } = useCachedFetch<TrendsData>(trendsUrl, { ttl: 120_000 });

  const insightUrl = useMemo(
    () =>
      `/api/health/trends/insights?calorieTarget=${calorieTarget}&proteinTargetG=${macroTargets.proteinG}&carbsTargetG=${macroTargets.carbsG}&fatTargetG=${macroTargets.fatG}&aiLanguage=${aiLanguage}`,
    [calorieTarget, macroTargets, aiLanguage]
  );
  const { data: insightData, loading: insightLoading, refresh: fetchInsight } =
    useCachedFetch<{ insight: string }>(insightUrl, { ttl: 300_000 });
  const insight = insightData?.insight ?? null;

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

  if (loading) {
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

  if (!data) {
    return (
      <div className="px-4 pt-12 pb-4">
        <h1 className="text-2xl font-bold mb-4">Trends</h1>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No data available yet.</p>
            <p className="text-xs mt-1">
              Start logging food, measurements, and workouts to see trends.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const macroData = [
    { name: "Protein", value: Math.round(data.macroTotals.protein), color: COLORS.protein },
    { name: "Carbs", value: Math.round(data.macroTotals.carbs), color: COLORS.carbs },
    { name: "Fat", value: Math.round(data.macroTotals.fat), color: COLORS.fat },
  ];
  const macroTotal = macroData.reduce((s, m) => s + m.value, 0);

  const hasCircumferenceData = data.circumferenceChart.length > 0;
  const circumKeys = ["waist", "chest", "arms", "hips", "shoulders"] as const;
  const circumColors: Record<string, string> = {
    waist: COLORS.amber,
    chest: COLORS.blue,
    arms: COLORS.purple,
    hips: COLORS.rose,
    shoulders: COLORS.green,
  };

  return (
    <div className="px-4 pt-12 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
          <p className="text-xs text-muted-foreground">
            Your health at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/trends/daily-log">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <TableProperties className="h-4 w-4" />
            </Button>
          </Link>
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
      </div>

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
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {insight}
                </p>
              )}
            </div>
          </div>
          {!insightLoading && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-violet-400 hover:text-violet-300 h-7 px-2"
              onClick={fetchInsight}
            >
              Refresh
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
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => `${label}`}
                  formatter={(value: unknown) => [
                    `${Math.round(Number(value) || 0)} kcal`,
                    "Calories",
                  ]}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <ReferenceLine
                  y={calorieTarget}
                  stroke={COLORS.rose}
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                />
                <ReferenceLine
                  y={calorieTarget * 1.1}
                  stroke="#737373"
                  strokeDasharray="2 6"
                  strokeWidth={0.5}
                  strokeOpacity={0.2}
                />
                <ReferenceLine
                  y={calorieTarget * 0.9}
                  stroke="#737373"
                  strokeDasharray="2 6"
                  strokeWidth={0.5}
                  strokeOpacity={0.2}
                />
                <Bar
                  dataKey="calories"
                  fill={COLORS.orange}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={28}
                  fillOpacity={0.85}
                />
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
              <AreaChart
                data={data.macroChart}
                margin={{ top: 8, right: 8, left: -10, bottom: 0 }}
              >
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
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
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
                <ReferenceLine
                  y={macroTargets.proteinG}
                  stroke={COLORS.protein}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  strokeOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="protein"
                  stroke={COLORS.protein}
                  strokeWidth={2}
                  fill="url(#proteinGrad)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="carbs"
                  stroke={COLORS.carbs}
                  strokeWidth={2}
                  fill="url(#carbsGrad)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="fat"
                  stroke={COLORS.fat}
                  strokeWidth={2}
                  fill="url(#fatGrad)"
                  dot={false}
                />
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
                    <p className="text-[10px] text-green-400 font-medium">
                      Goal: {bodyGoals.goalWeightKg} kg
                    </p>
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
                      <ReferenceLine
                        y={bodyGoals.goalWeightKg}
                        stroke={COLORS.green}
                        strokeDasharray="6 4"
                        strokeWidth={1.5}
                        strokeOpacity={0.7}
                        label={{
                          value: "Goal",
                          position: "right",
                          fill: COLORS.green,
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke={COLORS.weight}
                      strokeWidth={2.5}
                      fill="url(#weightGradient)"
                      dot={{ r: 3, strokeWidth: 2, fill: COLORS.weight }}
                      activeDot={{ r: 5, fill: COLORS.weight }}
                    />
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
                    <Area
                      type="monotone"
                      dataKey="bodyFat"
                      stroke={COLORS.bodyFat}
                      strokeWidth={2.5}
                      fill="url(#bfGradient)"
                      dot={{ r: 3, strokeWidth: 2, fill: COLORS.bodyFat }}
                      activeDot={{ r: 5, fill: COLORS.bodyFat }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Circumference Trends */}
      {hasCircumferenceData && (
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Ruler className="h-4 w-4 text-green-400" />
              Circumference Trends
            </CardTitle>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Tape measurements over time (cm)</p>
              {bodyGoals.goalWaistCm && (
                <p className="text-[10px] text-green-400 font-medium">
                  Waist goal: {bodyGoals.goalWaistCm} cm
                </p>
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
                  <ReferenceLine
                    y={bodyGoals.goalWaistCm}
                    stroke={COLORS.green}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    label={{
                      value: "Waist Goal",
                      position: "right",
                      fill: COLORS.green,
                      fontSize: 10,
                    }}
                  />
                )}
                {circumKeys.map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={circumColors[key]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: circumColors[key] }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-3 mt-2 flex-wrap">
              {circumKeys.map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: circumColors[key] }} />
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
          {/* BMI + Visceral Fat */}
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

          {/* Muscle Mass & Fat-Free Weight */}
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

          {/* Body Water & Skeletal Muscle % */}
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

          {/* BMR & Heart Rate */}
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
      {macroTotal > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-sm font-semibold">Macro Breakdown (Period Total)</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={macroData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    dataKey="value"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {macroData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {macroData.map((item) => {
                  const pct = macroTotal > 0 ? Math.round((item.value / macroTotal) * 100) : 0;
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
      {data.caloriesChart.length === 0 &&
        data.weightChart.length === 0 &&
        data.workoutChart.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No data for this time period.</p>
              <p className="text-xs mt-1">
                Start logging food, measurements, and workouts to see trends.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setRange("90")}>
                Try 90 days
              </Button>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
