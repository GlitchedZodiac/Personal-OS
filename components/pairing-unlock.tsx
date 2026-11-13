"use client";

// Device pairing locked by a flood of wrong PINs (audit 2026-10, review of D2).
// Native apps carry no known-device marker, so only a signed-in browser can
// reopen the pairing door. Renders nothing unless the door is locked.
// Self-contained: Settings is being restyled by another lane.

import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PairingUnlock() {
  const [lock, setLock] = useState<{ locked: boolean; retryAfterSeconds: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/pairing-unlock")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => body && setLock(body))
      .catch(() => {});
  }, []);

  if (!lock?.locked) return null;

  const unlock = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/pairing-unlock", { method: "POST" });
      if (!res.ok) throw new Error();
      setLock({ locked: false, retryAfterSeconds: 0 });
      toast.success("Pairing is open — pair the device now");
    } catch {
      toast.error("Couldn't unlock pairing — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="mt-3 rounded-[12px] border border-border bg-card p-3 text-[12px] leading-[1.6] text-muted-foreground">
      <span className="font-semibold text-foreground">Device pairing is locked</span> — someone tried too many wrong
      PINs (about {Math.ceil(lock.retryAfterSeconds / 60)} min left). If you are pairing your own watch or phone,
      unlock it here first.
      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        className="mt-2 block rounded-[8px] bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "…" : "Unlock device pairing"}
      </button>
    </div>
  );
}
