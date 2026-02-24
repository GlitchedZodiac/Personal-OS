"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, LineChart } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCachedFetch } from "@/lib/cache";

type OutcomeResponse = {
  hasData: boolean;
  message?: string;
  windowDays: number;
  projectDays: number;
  projectionDate: string;
  current: {
    measuredAt: string;
    weightKg: number | null;
    bodyFatPct: number | null;
    waistCm: number | null;
  };
  projected: {
    weightKg: number | null;
    bodyFatPct: number | null;
    waistCm: number | null;
  };
  goals: {
    weightKg: number | null;
    waistCm: number | null;
  };
  onTrack: {
    weight: boolean | null;
    waist: boolean | null;
  };
  confidence: {
    dataPoints: {
      weight: number;
      bodyFat: number;
      waist: number;
    };
    fit: {
      weightR2: number | null;
      bodyFatR2: number | null;
      waistR2: number | null;
    };
    qualityScore: number;
  };
  recommendations: string[];
};

function fmt(value: number | null, suffix: string) {
  if (value == null) return "--";
  return `${value}${suffix}`;
}

function trackLabel(value: boolean | null) {
  if (value == null) return "No goal";
  return value ? "On track" : "Off track";
}

export default function OutcomesPage() {
  const [windowDays, setWindowDays] = useState("120");
  const [projectDays, setProjectDays] = useState("30");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("windowDays", windowDays || "120");
    params.set("projectDays", projectDays || "30");
    return `/api/health/outcomes?${params.toString()}`;
  }, [windowDays, projectDays]);

  const { data, initialLoading, refresh } =
    useCachedFetch<OutcomeResponse>(url, { ttl: 60_000 });

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Outcome Forecasting</h1>
          <p className="text-xs text-muted-foreground">Projection from your measurement trends</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">History window (days)</p>
            <Input
              type="number"
              min={30}
              value={windowDays}
              onChange={(event) => setWindowDays(event.target.value)}
            />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Projection horizon (days)</p>
            <Input
              type="number"
              min={7}
              max={120}
              value={projectDays}
              onChange={(event) => setProjectDays(event.target.value)}
            />
          </div>
          <Button variant="outline" onClick={refresh} className="col-span-2">
            Recalculate
          </Button>
        </CardContent>
      </Card>

      {initialLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Building forecast...
          </CardContent>
        </Card>
      ) : !data || !data.hasData ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {data?.message ?? "Not enough data yet for forecasting."}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-indigo-500/20 bg-indigo-500/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Projection date</p>
                <p className="text-lg font-semibold">
                  {format(new Date(data.projectionDate), "MMM d, yyyy")}
                </p>
              </div>
              <LineChart className="h-8 w-8 text-indigo-400" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Weight</p>
                <p className="text-xs text-muted-foreground">Now {fmt(data.current.weightKg, "kg")}</p>
                <p className="text-base font-semibold">Then {fmt(data.projected.weightKg, "kg")}</p>
                <p className="text-[10px] text-muted-foreground">{trackLabel(data.onTrack.weight)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Body fat</p>
                <p className="text-xs text-muted-foreground">Now {fmt(data.current.bodyFatPct, "%")}</p>
                <p className="text-base font-semibold">Then {fmt(data.projected.bodyFatPct, "%")}</p>
                <p className="text-[10px] text-muted-foreground">Trend only</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Waist</p>
                <p className="text-xs text-muted-foreground">Now {fmt(data.current.waistCm, "cm")}</p>
                <p className="text-base font-semibold">Then {fmt(data.projected.waistCm, "cm")}</p>
                <p className="text-[10px] text-muted-foreground">{trackLabel(data.onTrack.waist)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Forecast Confidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border/40 p-2">
                  <p className="text-muted-foreground">Weight R2</p>
                  <p className="font-semibold">{data.confidence.fit.weightR2 ?? "--"}</p>
                </div>
                <div className="rounded-lg border border-border/40 p-2">
                  <p className="text-muted-foreground">Body fat R2</p>
                  <p className="font-semibold">{data.confidence.fit.bodyFatR2 ?? "--"}</p>
                </div>
                <div className="rounded-lg border border-border/40 p-2">
                  <p className="text-muted-foreground">Waist R2</p>
                  <p className="font-semibold">{data.confidence.fit.waistR2 ?? "--"}</p>
                </div>
              </div>
              <p className="text-muted-foreground">
                Data points: {data.confidence.dataPoints.weight} weight, {data.confidence.dataPoints.bodyFat} body fat, {data.confidence.dataPoints.waist} waist.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recommendations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {data.recommendations.map((item, index) => (
                <p key={`${index}-${item}`} className="text-sm">
                  - {item}
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
