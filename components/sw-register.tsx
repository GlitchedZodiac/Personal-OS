"use client";

import { useEffect } from "react";

// Registers the service worker — offline reading, and the push handler.
//
// The reminder poll that used to live here moved to components/
// notification-heartbeat.tsx (2026-10-04): it only ran when this browser had
// already granted notification permission, and it delivered to this browser
// alone. The server delivers now; the heartbeat just asks it to.

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.log("SW registration failed:", error);
    });
  }, []);

  return null;
}
