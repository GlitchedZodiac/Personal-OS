"use client";

// Settings → Notifications (2026-08-28): the device subscription plus one
// switch per sender. The rule every sender obeys (lib/push.ts): a
// notification is a REMINDER of something he chose, never a summons — this
// page is where each of those choices can be silenced.
//
// 2026-10-04: two more categories (weigh-in synced, system alerts), quiet
// hours, and a record of everything that was sent and what became of it.
//
// Sibling of /settings/export and deliberately in ITS visual register — the
// designed /settings screen links here from the DATA card. No design slice
// exists for this page yet; logged in docs/state.md as a pending stage.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing, History, Loader2, Moon } from "lucide-react";
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

type CategoryKey =
  | "dueReminders"
  | "plannedWorkout"
  | "weighIn"
  | "systemAlerts"
  | "prCelebration"
  | "weeklyReport"
  | "spiritHomework";

interface Prefs extends Record<CategoryKey, boolean> {
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  remindersBreakQuiet: boolean;
  timeZone: string | null;
}

const SENDERS: Array<{ key: CategoryKey; label: string; note: string }> = [
  {
    key: "dueReminders",
    label: "Reminders",
    note: "Anything you asked to be reminded of — from chat, a week plan, or an automation — at the time you set.",
  },
  {
    key: "plannedWorkout",
    label: "Training day",
    note: "The morning of a day your week plans training; silent once you've trained.",
  },
  {
    key: "weighIn",
    label: "New weigh-in synced",
    note: "One line when a weigh-in arrives from your scale: the number, body fat, and the change.",
  },
  {
    key: "systemAlerts",
    label: "System alerts",
    note: "When something that should be syncing has been failing or silent for two days.",
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
  "native-shell":
    "The iPhone app from TestFlight can't receive notifications yet — it needs a native update. Today they can reach Pitaya installed from Safari (Share → Add to Home Screen) or open on your Mac; switch them on from there.",
  unsupported: "This browser can't do service-worker notifications.",
  unconfigured: "VAPID keys are missing from the deployment's environment.",
};

interface LogEntry {
  id: string;
  category: string;
  title: string;
  body: string;
  status: string;
  detail: { sent?: number; failed?: number; error?: string } | null;
  deliverAfter: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface SyncRow {
  source: string;
  label: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  failingSince: string | null;
}

const STATUS_COPY: Record<string, { label: string; tone: "ok" | "warn" | "muted" }> = {
  sent: { label: "Delivered", tone: "ok" },
  local: { label: "Shown in app", tone: "ok" },
  held: { label: "Held · quiet hours", tone: "muted" },
  sending: { label: "Sending…", tone: "muted" },
  no_devices: { label: "No device subscribed", tone: "warn" },
  failed: { label: "Failed", tone: "warn" },
  expired: { label: "Too late to send", tone: "muted" },
  muted: { label: "Switched off", tone: "muted" },
};

const TONE_CLASS = {
  ok: "bg-[#EAF3ED] text-[#3E7A54]",
  warn: "bg-[#FBEDED] text-[#B5484E]",
  muted: "bg-muted text-muted-foreground",
} as const;

function when(iso: string): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

function Switch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="mt-0.5 flex h-[26px] w-[46px] flex-none items-center rounded-full p-[3px] transition-colors duration-200 disabled:opacity-60"
      style={{ background: on ? "#A63D63" : "#DFDDE2" }}
    >
      <span
        className="h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out"
        style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export default function NotificationsSettingsPage() {
  const [device, setDevice] = useState<PushState | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [sync, setSync] = useState<SyncRow[]>([]);

  const refreshDevice = () => {
    pushStatus()
      .then((s) => setDevice(s.state))
      .catch(() => setDevice("unsupported"));
  };

  const refreshLog = useCallback(() => {
    fetch("/api/push/log")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLog(d.entries ?? []);
        setDevices(typeof d.devices === "number" ? d.devices : null);
        setSync(d.sync ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshDevice();
    refreshLog();
    fetch("/api/push/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.prefs && setPrefs(d.prefs))
      .catch(() => {});
  }, [refreshLog]);

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
      refreshLog();
    } catch {
      toast.error("Couldn't change the device setting.");
    } finally {
      setDeviceBusy(false);
    }
  }

  // One optimistic save for every control on the page; a failure puts the
  // switch back where it was rather than leaving the screen lying.
  async function save(patch: Partial<Prefs>) {
    if (!prefs || saving) return;
    const before = prefs;
    setSaving(true);
    setPrefs({ ...prefs, ...patch });
    try {
      const res = await fetch("/api/push/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: patch }),
      });
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (body?.prefs) setPrefs(body.prefs);
    } catch {
      setPrefs(before);
      toast.error("Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  const deviceOn = device === "on";
  const deviceActionable = device === "on" || device === "off";
  const deviceZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

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
              <Switch
                on={deviceOn}
                disabled={deviceBusy}
                label="Notifications on this device"
                onToggle={toggleDevice}
              />
            )}
          </div>
          {devices !== null && (
            <p className="text-[11px] text-muted-foreground">
              {devices === 0
                ? "No device is subscribed yet, so nothing can be delivered — reminders wait until one is."
                : `${devices} device${devices === 1 ? "" : "s"} subscribed in total.`}
            </p>
          )}
          {deviceOn && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const ok = await sendTestPush();
                toast[ok ? "success" : "error"](
                  ok ? "Sent — it should arrive in a moment." : "Nothing was sent."
                );
                refreshLog();
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
                <Switch
                  on={prefs[key]}
                  disabled={saving}
                  label={label}
                  onToggle={() => save({ [key]: !prefs[key] })}
                />
              ) : (
                <Loader2 className="mt-1 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Moon className="h-4 w-4" />
            Quiet hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              Nothing arrives during these hours. Whatever comes up is held and
              delivered when they end.
            </p>
            {prefs && (
              <Switch
                on={prefs.quietHoursEnabled}
                disabled={saving}
                label="Quiet hours"
                onToggle={() => save({ quietHoursEnabled: !prefs.quietHoursEnabled })}
              />
            )}
          </div>

          {prefs && (
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
              style={{
                gridTemplateRows: prefs.quietHoursEnabled ? "1fr" : "0fr",
                opacity: prefs.quietHoursEnabled ? 1 : 0,
              }}
              aria-hidden={!prefs.quietHoursEnabled}
            >
              <div className="min-h-0 space-y-3 overflow-hidden">
                <div className="flex items-center gap-3">
                  <label className="flex flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <span className="text-xs text-muted-foreground">From</span>
                    <input
                      type="time"
                      value={prefs.quietStart}
                      disabled={!prefs.quietHoursEnabled}
                      onChange={(e) => e.target.value && save({ quietStart: e.target.value })}
                      className="bg-transparent text-sm font-medium tabular-nums outline-none"
                    />
                  </label>
                  <label className="flex flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Until</span>
                    <input
                      type="time"
                      value={prefs.quietEnd}
                      disabled={!prefs.quietHoursEnabled}
                      onChange={(e) => e.target.value && save({ quietEnd: e.target.value })}
                      className="bg-transparent text-sm font-medium tabular-nums outline-none"
                    />
                  </label>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Let my timed reminders through</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      A reminder you set for 5:30am arrives at 5:30am. Off, even
                      those wait until quiet hours end.
                    </p>
                  </div>
                  <Switch
                    on={prefs.remindersBreakQuiet}
                    disabled={saving || !prefs.quietHoursEnabled}
                    label="Let my timed reminders through quiet hours"
                    onToggle={() => save({ remindersBreakQuiet: !prefs.remindersBreakQuiet })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Times follow this device&apos;s clock
                  {prefs.timeZone ?? deviceZone ? ` — ${prefs.timeZone ?? deviceZone}` : ""}. Travel,
                  and they travel with you.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {sync.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">What&apos;s syncing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {sync.map((row) => (
              <div
                key={row.source}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.failingSince
                      ? `Failing since ${when(row.failingSince)}${row.lastError ? ` — ${row.lastError}` : ""}`
                      : row.lastSuccessAt
                        ? `Last synced ${when(row.lastSuccessAt)}`
                        : "Never synced"}
                  </p>
                </div>
                <span
                  className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                    TONE_CLASS[row.failingSince ? "warn" : "ok"]
                  }`}
                >
                  {row.failingSince ? "Failing" : "OK"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4" />
            Recently sent
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {log === null && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {log !== null && log.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nothing has been sent yet. Everything that is — and whether it
              arrived — will be listed here.
            </p>
          )}
          {log?.map((entry) => {
            const status = STATUS_COPY[entry.status] ?? {
              label: entry.status,
              tone: "muted" as const,
            };
            return (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm font-medium">{entry.title}</p>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                      TONE_CLASS[status.tone]
                    }`}
                  >
                    {status.label}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{entry.body}</p>
                <p className="mt-1 text-[10.5px] text-muted-foreground">
                  {when(entry.sentAt ?? entry.createdAt)}
                  {entry.status === "held" && entry.deliverAfter
                    ? ` · goes out ${when(entry.deliverAfter)}`
                    : ""}
                  {entry.status === "failed" && entry.detail?.error
                    ? ` · ${entry.detail.error}`
                    : ""}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
