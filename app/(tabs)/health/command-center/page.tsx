"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Bell,
  CheckSquare,
  Droplets,
  Dumbbell,
  Scale,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCachedFetch } from "@/lib/cache";
import { fetchServerSettings, getSettings } from "@/lib/settings";
import {
  getDateStringInTimeZone,
  getTimeZoneOffsetMinutesForDateString,
} from "@/lib/timezone";

type TimelineEvent = {
  id: string;
  type: "food" | "workout" | "water" | "measurement" | "todo" | "reminder";
  occurredAt: string;
  title: string;
  subtitle: string;
};

type CommandCenterResponse = {
  summary: {
    foodCount: number;
    workoutCount: number;
    hydrationEntries: number;
    todoCount: number;
    reminderCount: number;
    totalCalories: number;
    totalWorkoutMinutes: number;
    totalWaterMl: number;
  };
  events: TimelineEvent[];
};

function getEventIcon(type: TimelineEvent["type"]) {
  if (type === "food") return <Utensils className="h-3.5 w-3.5 text-green-400" />;
  if (type === "workout") return <Dumbbell className="h-3.5 w-3.5 text-purple-400" />;
  if (type === "water") return <Droplets className="h-3.5 w-3.5 text-cyan-400" />;
  if (type === "measurement") return <Scale className="h-3.5 w-3.5 text-blue-400" />;
  if (type === "todo") return <CheckSquare className="h-3.5 w-3.5 text-amber-400" />;
  return <Bell className="h-3.5 w-3.5 text-orange-400" />;
}

export default function CommandCenterPage() {
  const initialTimeZone = getSettings().timeZone;
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [dateFilter, setDateFilter] = useState(
    getDateStringInTimeZone(new Date(), initialTimeZone)
  );

  useEffect(() => {
    fetchServerSettings().then((s) => {
      setTimeZone(s.timeZone);
      setDateFilter(getDateStringInTimeZone(new Date(), s.timeZone));
    });
  }, []);

  const tzOffsetMinutes = useMemo(
    () => getTimeZoneOffsetMinutesForDateString(dateFilter, timeZone),
    [dateFilter, timeZone]
  );

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("date", dateFilter);
    params.set("tzOffsetMinutes", String(tzOffsetMinutes));
    params.set("timeZone", timeZone);
    return `/api/health/command-center?${params.toString()}`;
  }, [dateFilter, tzOffsetMinutes, timeZone]);

  const { data, initialLoading, refresh } =
    useCachedFetch<CommandCenterResponse>(url, { ttl: 30_000 });

  return (
    <div className="px-4 pt-12 pb-36 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/health">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Daily Command Center</h1>
          <p className="text-xs text-muted-foreground">Single timeline for your full day</p>
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

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Calories</p>
            <p className="text-lg font-bold">{data?.summary.totalCalories ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Workout</p>
            <p className="text-lg font-bold">{data?.summary.totalWorkoutMinutes ?? 0}m</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Water</p>
            <p className="text-lg font-bold">{Math.round((data?.summary.totalWaterMl ?? 0) / 1000)}L</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {initialLoading ? (
            <p className="text-sm text-muted-foreground">Loading timeline...</p>
          ) : !data || data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity found for this day.</p>
          ) : (
            data.events.map((event) => (
              <div key={event.id} className="rounded-lg border border-border/40 p-2.5 flex items-start gap-2">
                <div className="pt-0.5">{getEventIcon(event.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-[10px] text-muted-foreground">{event.subtitle}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(event.occurredAt), "h:mm a")}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
