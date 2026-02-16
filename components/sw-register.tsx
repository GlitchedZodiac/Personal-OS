"use client";

import { useEffect, useRef } from "react";

/** Check for due reminders every 30 seconds and fire notifications */
async function checkReminders(registration: ServiceWorkerRegistration) {
  try {
    const res = await fetch("/api/reminders/due");
    if (!res.ok) return;
    const reminders: Array<{ id: string; title: string; body: string; url?: string }> =
      await res.json();

    for (const r of reminders) {
      registration.active?.postMessage({
        type: "SHOW_NOTIFICATION",
        title: r.title,
        body: r.body,
        url: r.url || "/todos",
        tag: `reminder-${r.id}`,
      });

      // Mark as fired
      await fetch(`/api/reminders/${r.id}/fire`, { method: "POST" }).catch(() => {});
    }
  } catch {
    // Silently ignore — don't break the app
  }
}

export function ServiceWorkerRegister() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Register the service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("SW registered:", registration.scope);

        // Start reminder polling if notifications are granted
        if (Notification.permission === "granted") {
          intervalRef.current = setInterval(() => checkReminders(registration), 30_000);
          // Also check immediately
          checkReminders(registration);
        }
      })
      .catch((error) => {
        console.log("SW registration failed:", error);
      });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
}
