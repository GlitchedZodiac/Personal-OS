"use client";

// Browser side of web push. Everything here must run from a real tap:
// iOS only shows the permission prompt on a user gesture, and only for a
// PWA installed to the home screen.

export type PushState =
  | "unsupported"
  | "needs-install"
  /** inside the TestFlight/companion app: a WKWebView has no Push API */
  | "native-shell"
  | "unconfigured"
  | "denied"
  | "off"
  | "on";

interface Status {
  state: PushState;
  installs: number;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * The iPhone/iPad companion app. It is a WKWebView around this same web app,
 * and WKWebView has no service-worker push at all — so there is nothing to
 * "install" and no Share button to do it with. It used to be reported as
 * needs-install, which told him to do something the app cannot do. Reaching
 * the companion means APNs (docs/push-notifications.md).
 */
function inNativeShell(): boolean {
  return Boolean(
    (window as unknown as { webkit?: { messageHandlers?: { haptic?: unknown } } }).webkit
      ?.messageHandlers?.haptic
  );
}

async function existingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function pushStatus(): Promise<Status> {
  if (typeof window === "undefined") return { state: "unsupported", installs: 0 };
  if (inNativeShell() && !("PushManager" in window)) {
    return { state: "native-shell", installs: 0 };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // Safari on iOS only exposes PushManager to an installed PWA.
    return { state: isIos() && !isStandalone() ? "needs-install" : "unsupported", installs: 0 };
  }
  if (isIos() && !isStandalone()) return { state: "needs-install", installs: 0 };

  const sub = await existingSubscription();
  const res = await fetch(
    `/api/push/subscribe${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`,
  );
  const body = await res.json().catch(() => ({}));
  if (!body?.configured) return { state: "unconfigured", installs: 0 };
  if (Notification.permission === "denied") return { state: "denied", installs: body.installs ?? 0 };
  return {
    state: sub && body.registered ? "on" : "off",
    installs: body.installs ?? 0,
  };
}

/**
 * Must be called from a click handler.
 *
 * The permission prompt is requested FIRST, before any network call. iOS
 * only shows it inside the user's tap, and this function used to await a
 * fetch (pushStatus) ahead of it — which can use the tap up, so the prompt
 * silently never appears. Everything that can be known without the network
 * (is there a Push API here at all, is this an installed app) is checked
 * synchronously; the server is consulted only once permission is in hand.
 */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (typeof window === "undefined") {
    return { ok: false, message: "This browser can't do push notifications." };
  }
  if (inNativeShell() && !("PushManager" in window)) {
    return {
      ok: false,
      message: "The iPhone app can't receive notifications yet — that needs a native update.",
    };
  }
  const needsInstall = isIos() && !isStandalone();
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return needsInstall
      ? {
          ok: false,
          message:
            "Add Pitaya to your home screen first — iOS only delivers push to installed apps.",
        }
      : { ok: false, message: "This browser can't do push notifications." };
  }
  if (needsInstall) {
    return {
      ok: false,
      message: "Add Pitaya to your home screen first — iOS only delivers push to installed apps.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications stay off — permission wasn't granted." };
  }

  const keyRes = await fetch("/api/push/subscribe");
  const { publicKey } = (await keyRes.json().catch(() => ({}))) as { publicKey?: string };
  if (!publicKey) return { ok: false, message: "Push keys aren't set on the server yet." };

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      label: isIos() ? "iPhone · home screen" : navigator.platform || "this device",
    }),
  });
  if (!res.ok) return { ok: false, message: "Couldn't register with the server." };
  return { ok: true, message: "Notifications are on for this device." };
}

export async function disablePush(): Promise<void> {
  const sub = await existingSubscription();
  if (!sub) return;
  await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
    method: "DELETE",
  });
  await sub.unsubscribe();
}

export async function sendTestPush(): Promise<boolean> {
  const res = await fetch("/api/push/subscribe?test=1", { method: "POST" });
  if (!res.ok) return false;
  const body = (await res.json()) as { sent?: number };
  return (body.sent ?? 0) > 0;
}
