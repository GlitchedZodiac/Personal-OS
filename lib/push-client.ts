"use client";

// Browser side of web push. Everything here must run from a real tap:
// iOS only shows the permission prompt on a user gesture, and only for a
// PWA installed to the home screen.

export type PushState =
  | "unsupported"
  | "needs-install"
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

async function existingSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function pushStatus(): Promise<Status> {
  if (typeof window === "undefined") return { state: "unsupported", installs: 0 };
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

/** Must be called from a click handler. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  const status = await pushStatus();
  if (status.state === "needs-install") {
    return {
      ok: false,
      message: "Add Pitaya to your home screen first — iOS only delivers push to installed apps.",
    };
  }
  if (status.state === "unsupported") {
    return { ok: false, message: "This browser can't do push notifications." };
  }
  if (status.state === "unconfigured") {
    return { ok: false, message: "Push keys aren't set on the server yet." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "Notifications stay off — permission wasn't granted." };
  }

  const keyRes = await fetch("/api/push/subscribe");
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
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
  return { ok: true, message: "Reminders are on for this device." };
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
