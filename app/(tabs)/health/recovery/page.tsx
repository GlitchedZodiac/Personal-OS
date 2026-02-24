"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, BatteryCharging, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCachedFetch } from "@/lib/cache";

type RecoveryFactor = {
  key: string;
  label: string;
  value: number;
  target: number;
  detail: string;
};

type RecoveryResponse = {
  score: number;
  factors: RecoveryFactor[];
  recommendation: string;
  adjustments: {
    workoutIntensity: "recovery" | "moderate" | "full";
    calorieAdjustmentPct: number;
    hydrationTargetMl: number;
  };
};

function scoreTone(score: number) {
  if (score >= 85) return "text-green-400";
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

export default function RecoveryPage() {
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const tzOffsetMinutes = new Date().getTimezoneOffset();

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date", dateFilter);
    params.set("tzOffsetMinutes", String(tzOffsetMinutes));
    return `/api/health/recovery?${params.toString()}`;
  }, [dateFilter, tzOffsetMinutes]);

  const { data, initialLoading, refresh } =
    useCachedFetch<RecoveryResponse>(url, { ttl: 30_000 });

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Recovery + Readiness</h1>
          <p className="text-xs text-muted-foreground">Daily training and recovery score</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 flex items-center gap-2">
          <Input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="flex-1"
          />
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Readiness Score</p>
            <p className={`text-4xl font-bold ${scoreTone(data?.score ?? 0)}`}>
              {initialLoading ? "--" : data?.score ?? 0}
            </p>
          </div>
          <BatteryCharging className="h-10 w-10 text-blue-400" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-rose-400" />
            Readiness Factors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialLoading ? (
            <p className="text-sm text-muted-foreground">Calculating factors...</p>
          ) : !data || data.factors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No factor data available.</p>
          ) : (
            data.factors.map((factor) => {
              const pct = Math.max(0, Math.min(100, factor.value));
              return (
                <div key={factor.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{factor.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {factor.value} / {factor.target}
                    </p>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{factor.detail}</p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Coach Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{data?.recommendation ?? "No recommendation yet."}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground">Workout intensity</p>
              <p className="font-semibold capitalize">{data?.adjustments.workoutIntensity ?? "--"}</p>
            </div>
            <div className="rounded-lg border border-border/40 p-2">
              <p className="text-muted-foreground">Calories</p>
              <p className="font-semibold">
                {data ? `${data.adjustments.calorieAdjustmentPct}%` : "--"}
              </p>
            </div>
            <div className="rounded-lg border border-border/40 p-2 col-span-2">
              <p className="text-muted-foreground">Hydration target</p>
              <p className="font-semibold">
                {data ? `${Math.round(data.adjustments.hydrationTargetMl)} ml` : "--"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
