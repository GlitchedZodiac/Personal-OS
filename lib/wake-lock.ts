"use client";

/**
 * Hold the screen awake while something is running that dies without it.
 *
 * WHY THIS EXISTS: on 2026-08-30 a sermon recording stopped mid-service. One of the two
 * causes was that nothing kept the iPad awake — WebKit suspends the content process when the
 * screen locks, and `MediaRecorder` stops with it. There is no `UIBackgroundModes` in the
 * companion and no `AVAudioSession`, so the web page going quiet is the whole story.
 *
 * The lock is released by the browser whenever the page is hidden, so it has to be re-taken on
 * `visibilitychange` — returning from a locked screen or the app switcher does not restore it.
 *
 * Best effort throughout: low-power mode, an unsupported browser, or a denied request all
 * leave the app exactly as it was before. (components/emom-runner.tsx grew this pattern first,
 * for the workout timer; it still has its own copy.)
 */

import { useEffect, useRef } from "react";

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
};

export function useWakeLock(active: boolean) {
  const held = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const request = async () => {
      if (held.current) return;
      try {
        const wl = (navigator as WakeLockNavigator).wakeLock;
        if (!wl) return;
        const sentinel = await wl.request("screen");
        // the effect may have torn down while the request was in flight
        if (cancelled) void sentinel.release().catch(() => {});
        else held.current = sentinel;
      } catch {
        // low-power mode, an insecure origin, a denied request — never fatal
      }
    };

    // The browser drops the lock every time the page hides. Coming back from a locked screen
    // therefore arrives WITHOUT one, which is precisely the moment a recording needs it most.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        held.current = null;
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void held.current?.release().catch(() => {});
      held.current = null;
    };
  }, [active]);
}
