"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";
import { enablePush, pushStatus, type PushState } from "@/lib/push-client";

// The moment to ask for notifications: right after he has set a reminder.
//
// Not on first launch, and not on a schedule — the only time a permission
// prompt is self-explanatory is the second after he asked the app to tell
// him something later. So this card appears in the chat thread under a
// reminder (or a week plan with reminders) he has just confirmed, once, and
// only where it can lead somewhere:
//
//   off            → one tap turns notifications on for this device
//   needs-install  → iPhone Safari: say how to install, since that is the gate
//   native-shell   → the TestFlight app: say plainly that it cannot yet
//
// Anything else (already on, blocked by him, unsupported) renders nothing.
// "Not now" is remembered for two weeks. Everything stays reachable from
// Settings → Notifications.
//
// UNDESIGNED (surfaced): no notification prompt exists in the design. It
// wears the proposal card's own clothes — 16px radius, 1.5px #E9CFDC border,
// the tint header with a 10.5px tracked label — so it reads as part of the
// thread rather than as a system dialog.

const SNOOZE_KEY = "pitaya:push-nudge-snoozed-until";
const SNOOZE_MS = 14 * 86_400_000;

const COPY: Partial<Record<PushState, { text: string; action?: string }>> = {
  off: {
    text: "Want that to reach you when Pitaya is closed? Turn on notifications for this device.",
    action: "Turn on",
  },
  "needs-install": {
    text: "To get that as a notification, iPhone needs Pitaya on the home screen: Share → Add to Home Screen, then switch notifications on from there.",
  },
  "native-shell": {
    text: "Heads-up: this iPhone app can't send notifications yet — that needs a native update. Until then they can reach Pitaya installed from Safari, or on your Mac.",
  },
};

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    // private mode — it simply asks again next time
  }
}

export function PushNudge({ onSettled }: { onSettled?: () => void }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (snoozed()) return;
    let alive = true;
    pushStatus()
      .then((s) => alive && setState(s.state))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const copy = state ? COPY[state] : undefined;
  if (!copy || gone) return null;

  const dismiss = () => {
    snooze();
    setGone(true);
    onSettled?.();
  };

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    haptic("medium");
    try {
      // enablePush asks for permission before any network call, so the
      // system prompt opens inside this tap.
      const result = await enablePush();
      toast[result.ok ? "success" : "error"](result.message);
      if (result.ok) {
        haptic("success");
        setGone(true);
        onSettled?.();
      }
    } catch {
      toast.error("Couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-[16px] border-[1.5px] border-[#E9CFDC] bg-card"
      style={{ animation: "fadeUp .45s ease both .25s" }}
    >
      <div className="bg-accent px-3.5 py-2.5 text-[10.5px] font-bold tracking-[0.14em] text-[#8C2F51]">
        NOTIFICATIONS
      </div>
      <p className="px-3.5 pt-3 text-[13px] leading-relaxed text-foreground">{copy.text}</p>
      <div className="flex gap-2 px-3.5 pb-3.5 pt-3">
        {copy.action ? (
          <>
            <button
              type="button"
              onClick={turnOn}
              disabled={busy}
              className="tap-scale flex-[1.4] rounded-[10px] bg-primary py-[11px] text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {busy ? "Asking…" : copy.action}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="tap-scale flex-1 rounded-[10px] border border-border py-[11px] text-[13px] font-semibold text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Not now
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={dismiss}
              className="tap-scale flex-1 rounded-[10px] border border-[#D9D7DC] py-[11px] text-[13px] font-semibold text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Got it
            </button>
            <Link
              href="/settings/notifications"
              className="tap-scale flex-1 rounded-[10px] border border-border py-[11px] text-center text-[13px] font-semibold text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Settings
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
