// Haptics for the desk. Safari on iPad has no vibration API, so the
// companion's WKWebView exposes a message handler (ios/iOSApp/WebShellView
// .swift) that plays UIKit feedback generators. Outside the companion this
// is a no-op — the web is never worse for calling it.

export type HapticKind = "light" | "medium" | "heavy" | "rigid" | "soft" | "selection" | "success" | "warning" | "error";

type Bridge = { webkit?: { messageHandlers?: { haptic?: { postMessage: (m: string) => void } } } };

let last = 0;
let lastKind: HapticKind | null = null;

export function haptic(kind: HapticKind = "light") {
  if (typeof window === "undefined") return;
  const h = (window as unknown as Bridge).webkit?.messageHandlers?.haptic;
  if (!h) return;
  // the same tick twice within 40 ms is one tick (a burst of state changes)
  const now = performance.now();
  if (kind === lastKind && now - last < 40) return;
  last = now;
  lastKind = kind;
  try {
    h.postMessage(kind);
  } catch {
    // the bridge is best-effort
  }
}

/** true inside the iPad/iPhone companion (the haptic bridge exists) */
export function inCompanion(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as unknown as Bridge).webkit?.messageHandlers?.haptic);
}
