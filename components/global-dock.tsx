"use client";

import { VoiceInput } from "@/components/voice-input";
import { invalidateHealthCache } from "@/lib/cache";

// The floating chat·mic·camera dock, mounted once for every tab screen —
// the design shows it on all of them. Pages that need to refetch after a
// dock-confirmed log listen for the "pitaya:logged" window event.

export function notifyDataLogged() {
  invalidateHealthCache();
  window.dispatchEvent(new CustomEvent("pitaya:logged"));
}

export function GlobalDock() {
  return <VoiceInput onDataLogged={notifyDataLogged} />;
}
