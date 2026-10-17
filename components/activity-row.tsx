"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Today's way into the Activity screen (2026-10-17): yesterday's steps from
// the Health Shortcut, or a nudge to set it up. Same row shape as the Sunday
// Report beside it. Undesigned — see app/(tabs)/health/activity/page.tsx.

interface Summary {
  morning: {
    hasData: boolean;
    metrics: { steps: { value: number | null; vsAvg7Pct: number | null } };
  };
  totalDays: number;
}

export function ActivityRow() {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/health/activity")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const steps = data?.morning.hasData ? data.morning.metrics.steps : null;
  const line = !data
    ? "steps & calories from Apple Health"
    : data.totalDays === 0
      ? "waiting for the Health Shortcut"
      : steps?.value != null
        ? `yesterday ${Math.round(steps.value).toLocaleString("en-US")} steps${
            steps.vsAvg7Pct != null
              ? ` · ${steps.vsAvg7Pct >= 0 ? "↑" : "↓"} ${Math.abs(steps.vsAvg7Pct)}% vs avg`
              : ""
          }`
        : "yesterday hasn't arrived yet";

  return (
    <div className="mt-3 flex items-center justify-between rounded-[16px] bg-card p-3.5 px-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
      <div>
        <p
          className="text-sm font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Activity
        </p>
        <p className="mt-0.5 text-[11.5px] text-secondary-foreground">{line}</p>
      </div>
      <button
        onClick={() => router.push("/health/activity")}
        className="rounded-[8px] bg-accent px-3.5 py-2 text-xs font-semibold text-[#8C2F51]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Open →
      </button>
    </div>
  );
}
