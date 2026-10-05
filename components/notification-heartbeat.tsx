"use client";

import { useEffect } from "react";

// The open app's part in notifications (mounted once, inside the PIN gate):
//
//  1. A HEARTBEAT. Once a minute while the app is on screen it asks the
//     server to run its notification sweep (GET /api/reminders/due). The
//     server does the delivering — to every subscribed device, not just this
//     one — so simply having Pitaya open anywhere makes timed reminders
//     land within a minute. It used to be the other way round: this tab
//     fetched the due reminders and showed them itself, which reached one
//     device, and only if that device had already granted notifications.
//
//  2. THE DEVICE'S TIMEZONE. "Quiet hours 10pm–7am" means his 10pm, wherever
//     he is. The server cannot know that, so the device says so — once, and
//     again whenever it changes (the day he lands in Houston).
//
// A tab that may show notifications but has no push subscription of its own
// still shows due reminders locally (`?local=1`), so nothing regresses for a
// browser that granted permission under the old flow.

const BEAT_MS = 60_000;
const TZ_KEY = "pitaya:notification-tz";

async function syncTimeZone() {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || localStorage.getItem(TZ_KEY) === timeZone) return;
    const res = await fetch("/api/push/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs: { timeZone } }),
    });
    if (res.ok) localStorage.setItem(TZ_KEY, timeZone);
  } catch {
    // offline or storage unavailable — the next visit tries again
  }
}

async function localDisplay(): Promise<ServiceWorkerRegistration | null> {
  if (!("Notification" in window) || Notification.permission !== "granted") return null;
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  const subscribed = await registration.pushManager?.getSubscription().catch(() => null);
  // Subscribed devices get the push like every other device; showing it
  // locally as well would ring twice.
  return subscribed ? null : registration;
}

async function beat() {
  try {
    const registration = await localDisplay();
    const res = await fetch(`/api/reminders/due${registration ? "?local=1" : ""}`);
    if (!res.ok || !registration) return;
    const reminders = (await res.json()) as Array<{
      id: string;
      title: string;
      body: string;
      url?: string;
    }>;
    for (const reminder of reminders) {
      await registration.showNotification(reminder.title, {
        body: reminder.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: reminder.url || "/dashboard" },
        tag: `reminder-${reminder.id}`,
      });
    }
  } catch {
    // never let the heartbeat break the app
  }
}

export function NotificationHeartbeat() {
  useEffect(() => {
    syncTimeZone();
    beat();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") beat();
    }, BEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
