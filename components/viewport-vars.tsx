"use client";

import { useEffect, useState } from "react";
import { computeViewportState, type ViewportState } from "@/lib/visual-viewport";

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
// `?vvdebug=1` (sticky for the tab; `?vvdebug=0` turns it off) pins a small
// live readout to the screen — the same idea as the desk's ?pendebug=1: a
// real-device check should be able to SHOW what the viewport reported and
// what the last few touches reached, not have it inferred afterwards. Both
// of this round's keyboard corrections came off this readout.

function read(): ViewportState & { raw: string } {
  const vv = window.visualViewport;
  const state = computeViewportState({
    layoutHeight: Math.max(window.innerHeight, document.documentElement.clientHeight),
    visualHeight: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    scale: vv?.scale ?? 1,
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
      const flag = new URLSearchParams(window.location.search).get("vvdebug");
      if (flag === "1") sessionStorage.setItem("pitaya:vvdebug", "1");
      if (flag === "0") sessionStorage.removeItem("pitaya:vvdebug");
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
        const line = `${s.raw} → h ${s.height} top ${s.top} kb ${s.keyboardHeight}`;
        setDebug((prev) => {
          const tail = prev?.split("\n")[1];
          return tail ? `${line}\n${tail}` : line;
        });
      }
    };

    // Debug only: what did the last few touches actually reach? A tap that
    // "does nothing" is either a tap that landed on something else or a
    // click that was never delivered, and the two look identical from
    // outside. Capture phase, so nothing on the page can hide an event.
    const trail: string[] = [];
    const name = (target: EventTarget | null) => {
      const el = target as Element | null;
      if (!el || !el.tagName) return "?";
      const label = el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 14);
      return `${el.tagName.toLowerCase()}${label ? `"${label}"` : ""}`;
    };
    const note = (kind: string) => (event: Event) => {
      trail.push(`${kind}:${name(event.target)}`);
      if (trail.length > 7) trail.shift();
      setDebug((prev) => (prev ? `${prev.split("\n")[0]}\n${trail.join(" › ")}` : prev));
    };
    const traced: Array<[string, (event: Event) => void]> = wantDebug
      ? [
          ["touchstart", note("ts")],
          ["touchend", note("te")],
          ["mousedown", note("md")],
          ["click", note("click")],
          ["focusout", note("blur")],
        ]
      : [];
    for (const [type, handler] of traced) document.addEventListener(type, handler, true);

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    // No focus listeners, on purpose: see computeViewportState — the state
    // must not move in the gap between a touch-down and its click.

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      for (const [type, handler] of traced) document.removeEventListener(type, handler, true);
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--kb-height");
      delete root.dataset.keyboard;
    };
  }, []);

  if (!debug) return null;
  return (
    <div
      className="pointer-events-none fixed left-1 right-1 z-[300] whitespace-pre-wrap break-words rounded bg-black/75 px-1.5 py-1 font-mono text-[9px] leading-tight text-white"
      style={{ top: "calc(var(--vv-top, 0px) + env(safe-area-inset-top, 0px) + 2px)" }}
    >
      {debug}
    </div>
  );
}
