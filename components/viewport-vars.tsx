"use client";

import { useEffect, useState } from "react";
import { computeViewportState, isEditable, type ViewportState } from "@/lib/visual-viewport";

// Publishes the visual viewport (see lib/visual-viewport.ts) to CSS:
//
//   --vv-height   height of what is actually visible (shrinks with the keyboard)
//   --vv-top      how far WebKit panned the visual viewport
//   --kb-height   how much the keyboard covers; 0 when it is down
//   <html data-keyboard="open|closed">
//
// Applied synchronously inside the viewport events rather than through
// requestAnimationFrame: these events are already frame-aligned, and a rAF
// hop would leave the layout one frame behind the keyboard.
//
// `?vvdebug=1` (sticky for the tab) pins a small live readout to the screen —
// the same idea as the desk's ?pendebug=1: a real-device check should be
// able to SHOW what the viewport reported, not have it inferred afterwards.

function read(): ViewportState & { raw: string } {
  const vv = window.visualViewport;
  const state = computeViewportState({
    layoutHeight: Math.max(window.innerHeight, document.documentElement.clientHeight),
    visualHeight: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    scale: vv?.scale ?? 1,
    editableFocused: isEditable(document.activeElement),
  });
  const raw =
    `inner ${window.innerHeight} · client ${document.documentElement.clientHeight}` +
    ` · vv ${vv ? `${Math.round(vv.height)}@${Math.round(vv.offsetTop)} ×${vv.scale.toFixed(2)}` : "n/a"}` +
    ` · scrollY ${Math.round(window.scrollY)}`;
  return { ...state, raw };
}

export function ViewportVars() {
  const [debug, setDebug] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    let wantDebug = false;
    try {
      if (new URLSearchParams(window.location.search).get("vvdebug") === "1") {
        sessionStorage.setItem("pitaya:vvdebug", "1");
      }
      wantDebug = sessionStorage.getItem("pitaya:vvdebug") === "1";
    } catch {
      // private mode — no readout, the variables still publish
    }

    const apply = () => {
      const s = read();
      root.style.setProperty("--vv-height", `${s.height}px`);
      root.style.setProperty("--vv-top", `${s.top}px`);
      root.style.setProperty("--kb-height", `${s.keyboardHeight}px`);
      root.dataset.keyboard = s.keyboardOpen ? "open" : "closed";
      if (wantDebug) {
        setDebug(`${s.raw} → h ${s.height} top ${s.top} kb ${s.keyboardHeight}`);
      }
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    // focus changes flip `editableFocused` without any viewport event
    document.addEventListener("focusin", apply);
    document.addEventListener("focusout", apply);

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      document.removeEventListener("focusin", apply);
      document.removeEventListener("focusout", apply);
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--kb-height");
      delete root.dataset.keyboard;
    };
  }, []);

  if (!debug) return null;
  return (
    <div
      className="pointer-events-none fixed left-1 z-[300] rounded bg-black/75 px-1.5 py-1 font-mono text-[9px] leading-tight text-white"
      style={{ top: "calc(var(--vv-top, 0px) + env(safe-area-inset-top, 0px) + 2px)" }}
    >
      {debug}
    </div>
  );
}
