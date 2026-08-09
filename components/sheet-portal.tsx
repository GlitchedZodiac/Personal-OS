"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Bottom sheets must escape the page's stacking context: the tab content
// animates in (transform), which traps fixed children beneath the dock no
// matter their z-index — the on-phone "mic node covers my sheet" bug.
// Portaling to <body> puts sheets in the root context, where z-80/81
// decisively beats the dock's z-60.

export function SheetPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
