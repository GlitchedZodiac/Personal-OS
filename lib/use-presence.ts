"use client";

import { useEffect, useState } from "react";

// Sheets, drawers and menus in this app used to unmount the instant they
// closed — they arrived with an animation and left with a jump cut.
// usePresence keeps a closing surface mounted for `exitMs` so it can play
// its way out:
//
//   const { mounted, closing } = usePresence(open, 240);
//   if (!mounted) return null;
//   <div className={closing ? "sheet-down" : "sheet-up"} />
//
// State is adjusted during render (React's "derive from a changing prop"
// pattern) rather than in an effect, so opening never costs an extra frame.

export function usePresence(open: boolean, exitMs = 220) {
  const [state, setState] = useState({ shown: open, closing: false });

  if (open && (!state.shown || state.closing)) {
    setState({ shown: true, closing: false });
  } else if (!open && state.shown && !state.closing) {
    setState({ shown: true, closing: true });
  }

  useEffect(() => {
    if (!state.closing) return;
    const timer = setTimeout(() => setState({ shown: false, closing: false }), exitMs);
    return () => clearTimeout(timer);
  }, [state.closing, exitMs]);

  return { mounted: state.shown, closing: state.closing };
}

// ————— Page freeze —————
// While a sheet or drawer is up, the page behind it must not move: a stray
// scroll is what let the capture sheet be dragged off-screen along with the
// dock (Bug 1, 2026-10-04).
//
// `overflow: hidden` on <html>/<body> is not enough on iOS — measured in the
// simulator, WebKit still scrolled the document 435 px to chase a focused
// field through it, and left the page there afterwards. Taking <body> out of
// flow (position: fixed, offset by the scroll it had) gives WebKit no
// document to scroll: it can only pan the visual viewport, which the
// .vv-frame follows, and on release the page is exactly where he left it.
// Counted, so two overlapping surfaces can each freeze and release.

export const SCROLL_RESTORED_EVENT = "pitaya:scroll-restored";

let locks = 0;
let saved: {
  scrollY: number;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
} | null = null;

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      const scrollY = window.scrollY;
      saved = {
        scrollY,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    locks += 1;
    return () => {
      locks -= 1;
      if (locks === 0 && saved) {
        const restore = saved;
        saved = null;
        body.style.position = restore.position;
        body.style.top = restore.top;
        body.style.left = restore.left;
        body.style.right = restore.right;
        body.style.width = restore.width;
        body.style.overflow = restore.overflow;
        // "instant": <html> carries scroll-behavior: smooth, and the page
        // must reappear where it was, not glide back to it.
        window.scrollTo({ top: restore.scrollY, behavior: "instant" });
        // Anything that reads scroll DELTAS (the dock's hide-on-scroll) would
        // see this as one enormous swipe down — tell it the jump was ours.
        window.dispatchEvent(new Event(SCROLL_RESTORED_EVENT));
      }
    };
  }, [active]);
}
