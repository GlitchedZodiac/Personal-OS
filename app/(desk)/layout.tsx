"use client";

import { PinGate } from "@/components/pin-gate";
import { NavStackTracker } from "@/components/nav-stack-tracker";
import { DialogHost } from "@/components/spirit/desk/dialog";

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
        /* ——— motion: every interaction has weight ———
           fill-mode is backwards, never both. The forwards half keeps applying the keyframe
           end state (transform: none) FOREVER, and the animation cascade origin outranks the
           style attribute — which silently ate the live pinch transform on .desk-page-in. */
        @keyframes deskFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes deskFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes deskPopIn { from { opacity: 0; transform: translateY(10px) scale(.94); } to { opacity: 1; transform: none; } }
        @keyframes deskPopOut { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(6px) scale(.96); } }
        @keyframes deskPageIn { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes deskStaggerIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @keyframes deskCardDrop { 0% { opacity: 0; transform: scale(.6) rotate(-3deg); } 60% { opacity: 1; transform: scale(1.05) rotate(.6deg); } 100% { transform: none; } }
        @keyframes deskChipPop { 0% { transform: scale(.7); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: none; } }
        @keyframes deskToolPop { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 100% { transform: scale(1); } }
        @keyframes deskPulseRing { 0% { box-shadow: 0 0 0 0 rgba(166,61,99,.45); } 100% { box-shadow: 0 0 0 14px rgba(166,61,99,0); } }
        @keyframes deskSlideInRight { from { transform: translateX(48px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes deskShimmer { from { background-position: -200px 0; } to { background-position: 200px 0; } }
        .desk-root button { transition: transform .14s cubic-bezier(.2,.8,.2,1), background-color .18s ease, color .18s ease, box-shadow .18s ease, border-color .18s ease, opacity .18s ease; }
        .desk-root button:not([data-no-press]):active { transform: scale(.95); }
        .desk-root a { transition: transform .14s cubic-bezier(.2,.8,.2,1), background-color .18s ease, box-shadow .18s ease; }
        .desk-root a:active { transform: scale(.97); }
        .desk-page-in { animation: deskPageIn .38s cubic-bezier(.2,.9,.25,1) backwards; }
        .desk-stagger > * { animation: deskStaggerIn .46s cubic-bezier(.2,.9,.25,1) backwards; }
        .desk-stagger > *:nth-child(1) { animation-delay: .02s } .desk-stagger > *:nth-child(2) { animation-delay: .07s } .desk-stagger > *:nth-child(3) { animation-delay: .12s }
        .desk-stagger > *:nth-child(4) { animation-delay: .17s } .desk-stagger > *:nth-child(5) { animation-delay: .22s } .desk-stagger > *:nth-child(6) { animation-delay: .27s }
        .desk-stagger > *:nth-child(7) { animation-delay: .32s } .desk-stagger > *:nth-child(8) { animation-delay: .37s } .desk-stagger > *:nth-child(n+9) { animation-delay: .42s }
        .desk-card-drop { animation: deskCardDrop .5s cubic-bezier(.2,.9,.3,1.2) backwards; }
        .desk-chip-pop { animation: deskChipPop .32s cubic-bezier(.2,.9,.3,1.2) backwards; }
        .desk-tool-pop { animation: deskToolPop .28s cubic-bezier(.2,.9,.3,1.2) backwards; }
        .desk-pulse { animation: deskPulseRing 1.4s ease-out infinite; }
        .desk-lift { transition: transform .22s cubic-bezier(.2,.9,.25,1), box-shadow .22s ease; }
        .desk-lift:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(35,34,39,0.10); }
        @media (prefers-reduced-motion: reduce) { .desk-root * { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
      <div className="desk-root min-h-screen bg-[#F2F1F2]" style={{ position: "relative" }} onContextMenu={(e) => { const t = e.target as HTMLElement; if (!(t.closest("input, textarea, [contenteditable='true']"))) e.preventDefault(); }}>{children}</div>
      <DialogHost />
    </PinGate>
  );
}
