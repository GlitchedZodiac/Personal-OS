"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { disablePush, enablePush, pushStatus, sendTestPush, type PushState } from "@/lib/push-client";

// The evening reminder, and the only notification the app sends.
//
// It names the homework he is already carrying — nothing else. No
// streak-saving, no "you haven't opened Pitaya today", no re-engagement.
// A reminder of something he chose, once, or it is off.

const COPY: Record<PushState, { label: string; note: string }> = {
  on: {
    label: "On for this device",
    note: "Around 7pm, only when you're carrying homework you haven't ticked.",
  },
  off: {
    label: "Turn on the evening reminder",
    note: "One notification, around 7pm, naming the homework you're carrying. Nothing else — ever.",
  },
  denied: {
    label: "Blocked in your device settings",
    note: "Notifications are denied for Pitaya. On iPhone: Settings → Notifications → Pitaya. In a desktop browser: the padlock in the address bar.",
  },
  "needs-install": {
    label: "Add Pitaya to your home screen",
    note: "iOS only delivers notifications to an installed app. Share → Add to Home Screen, then come back here.",
  },
  unsupported: {
    label: "Not available in this browser",
    note: "Push needs a browser with service-worker notifications.",
  },
  unconfigured: {
    label: "Not configured on the server",
    note: "VAPID keys are missing from the deployment's environment.",
  },
};

export function ReminderToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    pushStatus()
      .then((s) => setState(s.state))
      .catch(() => setState("unsupported"));
  };
  useEffect(refresh, []);

  const toggle = async () => {
    if (busy || !state) return;
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        toast("Reminders off. Nothing will be sent.");
      } else {
        const result = await enablePush();
        toast[result.ok ? "success" : "error"](result.message);
      }
      refresh();
    } catch {
      toast.error("Couldn't change the reminder setting.");
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;
  const copy = COPY[state];
  const actionable = state === "on" || state === "off";

  return (
    <div className="mt-2.5 rounded-[16px] bg-white p-4 shadow-[0_2px_12px_rgba(35,34,39,0.06)]">
      <p className="text-[10px] font-bold tracking-[0.16em] text-muted-foreground">
        THE EVENING REMINDER
      </p>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-foreground">{copy.label}</p>
          <p className="mt-1 text-[11.5px] leading-[1.55] text-[#66646C]">{copy.note}</p>
        </div>
        {actionable && (
          <button
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={state === "on"}
            aria-label="Evening reminder"
            className="mt-0.5 flex h-[26px] w-[46px] flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-60"
            style={{ background: state === "on" ? "#A63D63" : "#DFDDE2" }}
          >
            <span
              className="h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: state === "on" ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        )}
      </div>
      {state === "on" && (
        <button
          onClick={async () => {
            const ok = await sendTestPush();
            toast[ok ? "success" : "error"](
              ok ? "Sent — it should arrive in a moment." : "Nothing was sent.",
            );
          }}
          className="mt-3 rounded-[9px] border border-[#E4E2E6] bg-[#FAF9FA] px-3.5 py-2 text-[11.5px] font-semibold text-[#66646C]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Send a test notification
        </button>
      )}
    </div>
  );
}
