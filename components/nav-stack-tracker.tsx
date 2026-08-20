"use client";

import { useNavStack } from "@/lib/nav-stack";

// Records the pages visited in this tab so every ‹ knows whether there
// is anywhere to go back to. Renders nothing.
export function NavStackTracker() {
  useNavStack();
  return null;
}
