"use client";

// "Forget all known devices" (audit 2026-10, review of D2b). Every browser you
// have signed in on carries a marker that lets it in while a wrong-PIN lock is
// on. After a lost laptop, this voids them all; this browser gets a new one.
// Self-contained: Settings is being restyled by another lane.

import { useState } from "react";
import { toast } from "sonner";

export function KnownDevicesReset() {
  const [busy, setBusy] = useState(false);
  const forget = async () => {
    if (!window.confirm("Forget every browser you have signed in on? They will still sign in with your PIN — they just lose their pass through a wrong-PIN lock.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/known-devices", { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Known devices forgotten — this browser is the only one now");
    } catch {
      toast.error("Couldn't do that — try again");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={forget}
      disabled={busy}
      className="mt-3 block text-[11.5px] font-semibold text-muted-foreground underline decoration-dotted disabled:opacity-60"
    >
      {busy ? "…" : "Forget all known devices"}
    </button>
  );
}
