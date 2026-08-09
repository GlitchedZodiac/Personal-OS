"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Droplets, Dumbbell, Flame, PersonStanding } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VoiceInput } from "@/components/voice-input";
import { useCachedFetch } from "@/lib/cache";

// Pitaya "Today" v1 — the calm daily hub. Habits, journal, voice memos, and
// the weekly PDF arrive with the full Today build; this v1 already honors
// the design's core: date header, today's numbers, and the notebook (chat).

interface HealthSummary {
  totalCalories: number;
  totalProtein: number;
  workoutCount: number;
  workoutMinutes: number;
  waterMl: number;
}

function todayHeader() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
  );
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  return `Week ${week} · ${weekday}`;
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  href,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="tap-scale card-glow h-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            <span className="micro-label">{label}</span>
          </div>
          <p
            className="mt-2 text-2xl font-bold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function TodayPage() {
  const { data: health, initialLoading, refresh } = useCachedFetch<HealthSummary>(
    "/api/health/summary",
    { ttl: 60_000 }
  );

  const onLogged = useCallback(() => refresh(), [refresh]);

  return (
    <div className="px-4 pb-40 pt-12 lg:px-0 lg:pt-8 space-y-5">
      {/* Date header */}
      <header>
        <p className="micro-label">{todayHeader()}</p>
        <h1
          className="mt-1 text-3xl font-bold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Today
        </h1>
      </header>

      {/* Today's numbers */}
      {initialLoading && !health ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 stagger-children">
          <StatTile
            icon={Flame}
            label="Calories"
            value={`${Math.round(health?.totalCalories ?? 0)}`}
            sub={`${Math.round(health?.totalProtein ?? 0)}g protein`}
            href="/health/food"
          />
          <StatTile
            icon={Dumbbell}
            label="Training"
            value={
              health?.workoutCount ? `${health.workoutMinutes} min` : "—"
            }
            sub={
              health?.workoutCount
                ? `${health.workoutCount} session${health.workoutCount > 1 ? "s" : ""}`
                : "Nothing logged yet"
            }
            href="/health/workouts"
          />
          <StatTile
            icon={Droplets}
            label="Water"
            value={`${((health?.waterMl ?? 0) / 1000).toFixed(1)} L`}
            sub={`${Math.round((health?.waterMl ?? 0) / 250)} glasses`}
            href="/health/water"
          />
          <StatTile
            icon={PersonStanding}
            label="Body"
            value="Trends"
            sub="Weight · photos · recovery"
            href="/health/body"
          />
        </div>
      )}

      {/* The notebook that talks back */}
      <Card className="border-primary/20 bg-accent">
        <CardContent className="p-5">
          <p className="micro-label text-accent-foreground/70">
            The notebook that talks back
          </p>
          <p className="mt-2 text-sm leading-relaxed text-accent-foreground">
            Say it or type it below — meals, sets, weight, water. Nothing is
            saved until you confirm.
          </p>
        </CardContent>
      </Card>

      {/* Chat / voice dock */}
      <VoiceInput onDataLogged={onLogged} />
    </div>
  );
}
