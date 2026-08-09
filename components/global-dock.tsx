"use client";

import { usePathname } from "next/navigation";
import { VoiceInput } from "@/components/voice-input";
import { invalidateHealthCache } from "@/lib/cache";

// The floating chat·mic·camera dock, mounted once for every tab screen —
// except /chat, where the thread's own composer (text + mic + send) IS the
// input and the dock only overlapped it on real phones. Pages that need to
// refetch after a dock-confirmed log listen for "pitaya:logged".

export function notifyDataLogged() {
  invalidateHealthCache();
  window.dispatchEvent(new CustomEvent("pitaya:logged"));
}

export function GlobalDock() {
  const pathname = usePathname();
  if (pathname === "/chat") return null;
  return <VoiceInput onDataLogged={notifyDataLogged} />;
}
