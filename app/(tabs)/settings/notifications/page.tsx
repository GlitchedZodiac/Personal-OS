"use client";

// Settings → Notifications (2026-08-28): the device subscription plus one
// switch per sender. The rule every sender obeys (lib/push.ts): a
// notification is a REMINDER of something he chose, never a summons — this
// page is where each of those choices can be silenced.
//
// Sibling of /settings/export and deliberately in ITS visual register — the
// designed /settings screen links here from the DATA card. No design slice
// exists for this page yet; logged in docs/state.md as a pending stage.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disablePush,
  enablePush,
  pushStatus,
  sendTestPush,
  type PushState,
} from "@/lib/push-client";

type PrefKey =
  | "spiritHomework"
  | "dueReminders"
  | "plannedWorkout"
  | "prCelebration"
  | "weeklyReport";

const SENDERS: Array<{ key: PrefKey; label: string; note: string }> = [
  {
    key: "dueReminders",
    label: "Reminders, delivered",
    note: "Your reminders and automations push when due — not only while a tab is open.",
  },
  {
    key: "plannedWorkout",
    label: "Planned training day",
    note: "7am on days your week plans training; silent once you've trained.",
  },
  {
    key: "prCelebration",
    label: "PR celebrations",
    note: "A new personal record from a watch save earns one push.",
  },
  {
    key: "weeklyReport",
    label: "Weekly report ready",
    note: "When the Sunday report is written up.",
  },
  {
    key: "spiritHomework",
    label: "Spirit evening reminder",
    note: "Around 7pm, only when you're carrying homework you haven't ticked.",
  },
];

const DEVICE_COPY: Record<PushState, string> = {
  on: "This device receives notifications.",
  off: "Notifications are off for this device.",
  denied:
    "Blocked in your device settings — Settings → Notifications → Pitaya (or the padlock in a desktop browser).",
  "needs-install":
    "iOS only delivers notifications to an installed app. Share → Add to Home Screen, then come back here.",
  unsupported: "This browser can't do service-worker notifications.",
  unconfigured: "VAPID keys are missing from the deployment's environment.",
};

export default function NotificationsSettingsPage() {
  const [device, setDevice] = useState<PushState | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean> | null>(null);
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);

  const refreshDevice = () => {
    pushStatus()
      .then((s) => setDevice(s.state))
      .catch(() => setDevice("unsupported"));
  };

  useEffect(() => {
    refreshDevice();
    fetch("/api/push/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.prefs && setPrefs(d.prefs))
      .catch(() => {});
  }, []);

  async function toggleDevice() {
    if (deviceBusy || !device) return;
    setDeviceBusy(true);
    try {
      if (device === "on") {
        await disablePush();
        toast("This device is off. Nothing will be sent here.");
      } else {
        const result = await enablePush();
        toast[result.ok ? "success" : "error"](result.message);
      }
      refreshDevice();
    } catch {
      toast.error("Couldn't change the device setting.");
    } finally {
      setDeviceBusy(false);
    }
  }

  async function togglePref(key: PrefKey) {
    if (!prefs || savingKey) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setSavingKey(key);
    setPrefs(next);
    try {
      const res = await fetch("/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: { [key]: next[key] } }),
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (body?.prefs) setPrefs(body.prefs);
    } catch {
      setPrefs(prefs); // roll back
      toast.error("Couldn't save that switch.");
    } finally {
      setSavingKey(null);
    }
  }

  const deviceOn = device === "on";
  const deviceActionable = device === "on" || device === "off";

  return (
    <div className="space-y-4 px-4 pt-12 pb-8 lg:space-y-6 lg:px-0 lg:pt-10">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-xs text-muted-foreground">
            Every notification is a reminder of something you chose — never a
            summons.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4" />
            This device
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {device ? DEVICE_COPY[device] : "Checking…"}
            </p>
            {deviceActionable && (
              <button
                onClick={toggleDevice}
                disabled={deviceBusy}
                role="switch"
                aria-checked={deviceOn}
                aria-label="Notifications on this device"
                className="mt-0.5 flex h-[26px] w-[46px] flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-60"
                style={{ background: deviceOn ? "#A63D63" : "#DFDDE2" }}
              >
                <span
                  className="h-5 w-5 rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: deviceOn ? "translateX(20px)" : "translateX(0)",
                  }}
                />
              </button>
            )}
          </div>
          {deviceOn && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const ok = await sendTestPush();
                toast[ok ? "success" : "error"](
                  ok ? "Sent — it should arrive in a moment." : "Nothing was sent."
                );
              }}
            >
              Send a test notification
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">What gets sent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {SENDERS.map(({ key, label, note }) => (
            <div
              key={key}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
              </div>
              {prefs ? (
                <button
                  onClick={() => togglePref(key)}
                  disabled={savingKey !== null}
                  role="switch"
                  aria-checked={prefs[key]}
                  aria-label={label}
                  className="mt-0.5 flex h-[26px] w-[46px] flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-60"
                  style={{ background: prefs[key] ? "#A63D63" : "#DFDDE2" }}
                >
                  <span
                    className="h-5 w-5 rounded-full bg-white shadow transition-transform"
                    style={{
                      transform: prefs[key] ? "translateX(20px)" : "translateX(0)",
                    }}
                  />
                </button>
              ) : (
                <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
