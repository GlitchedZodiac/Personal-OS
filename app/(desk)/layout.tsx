"use client";

import { PinGate } from "@/components/pin-gate";
import { NavStackTracker } from "@/components/nav-stack-tracker";

// The iPad desk routes — full-bleed, no phone chrome (tab bar, dock,
// sidebar). Below ~700pt the pages themselves step aside for the phone
// layout (10b: compact = the phone app, untouched).
export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <PinGate>
      <NavStackTracker />
      {/* The desk is a pen surface: no system text selection, no Copy/Look Up callout,
          no long-press context menu — the desk has its own copy/ask/link actions.
          Typed fields keep their selection. */}
      <style>{`
        .desk-root, .desk-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
        .desk-root input, .desk-root textarea, .desk-root [contenteditable="true"], .desk-root input *, .desk-root textarea * { -webkit-user-select: text; user-select: text; }
      `}</style>
      <div className="desk-root min-h-screen bg-[#F2F1F2]" style={{ position: "relative" }} onContextMenu={(e) => { const t = e.target as HTMLElement; if (!(t.closest("input, textarea, [contenteditable='true']"))) e.preventDefault(); }}>{children}</div>
    </PinGate>
  );
}
