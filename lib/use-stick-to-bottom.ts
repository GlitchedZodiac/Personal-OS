"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  INITIAL_PIN,
  afterScroll,
  afterTouchEnd,
  afterTouchStart,
  afterWheel,
  distanceFromBottom,
  forcePinned,
  scrollTopAfterResize,
  shouldStick,
  type PinState,
} from "@/lib/chat-scroll";

// The DOM half of lib/chat-scroll.ts: binds the pin rules to a real scroller.
//
//   scrollerRef  the element that scrolls
//   contentRef   its single child — observed so ANY growth (a streamed token,
//                an image reporting its size, a card changing state, a font
//                swapping in) is followed while pinned
//
// Two triggers keep a pinned thread at the end, on purpose:
//   · useLayoutEffect on `watch` — synchronous, in the same frame as the
//     React commit, so a sent message is never painted below the fold first;
//   · ResizeObserver — for everything React did not cause (late images).
// Neither is a timer and neither waits on an animation frame.

interface Options {
  /** changes whenever React renders new thread content */
  watch: unknown;
}

export function useStickToBottom({ watch }: Options) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const state = useRef<PinState>(INITIAL_PIN);
  const tween = useRef(0);

  /** mirrors state.pinned, for rendering the "jump to latest" button */
  const [pinned, setPinned] = useState(true);
  /** new content arrived while he was reading history */
  const [unseen, setUnseen] = useState(false);

  const commit = useCallback((next: PinState) => {
    const was = state.current.pinned;
    state.current = next;
    if (next.pinned !== was) {
      setPinned(next.pinned);
      if (next.pinned) setUnseen(false);
    }
  }, []);

  const stick = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    state.current = { ...state.current, lastTop: el.scrollTop };
  }, []);

  // React-caused growth: follow in the same frame.
  useLayoutEffect(() => {
    if (shouldStick(state.current)) stick();
  }, [watch, stick]);

  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    let lastClient = el.clientHeight;
    let lastHeight = el.scrollHeight;

    const onResize = () => {
      const nextClient = el.clientHeight;
      const nextHeight = el.scrollHeight;
      if (shouldStick(state.current)) {
        stick();
      } else {
        if (nextClient !== lastClient && !state.current.pinned) {
          // keyboard up/down while reading history: keep the bottom line
          el.scrollTop = scrollTopAfterResize(el.scrollTop, lastClient, nextClient);
        }
        if (nextHeight > lastHeight + 1 && !state.current.pinned) setUnseen(true);
      }
      lastClient = nextClient;
      lastHeight = nextHeight;
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    observer.observe(content);

    const cancelTween = () => {
      if (tween.current) cancelAnimationFrame(tween.current);
      tween.current = 0;
    };
    const onScroll = () => commit(afterScroll(state.current, el));
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) cancelTween();
      commit(afterWheel(state.current, e.deltaY, el));
    };
    const onTouchStart = () => {
      cancelTween();
      commit(afterTouchStart(state.current));
    };
    const onTouchEnd = () => {
      commit(afterTouchEnd(state.current, el));
      if (shouldStick(state.current)) stick();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      observer.disconnect();
      cancelTween();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [commit, stick]);

  /** He sent something: follow from now on, starting this frame. */
  const pinNow = useCallback(() => {
    if (tween.current) cancelAnimationFrame(tween.current);
    tween.current = 0;
    commit(forcePinned(state.current));
    stick();
  }, [commit, stick]);

  /**
   * "Jump to latest". Eases to the end while re-reading where the end IS on
   * every frame — a reply that is still streaming keeps moving the target,
   * and a native smooth scroll would arrive short of it.
   */
  const jumpToLatest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (tween.current) cancelAnimationFrame(tween.current);

    const far = distanceFromBottom(el) > el.clientHeight * 3;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (far || reduced || document.hidden) {
      commit(forcePinned(state.current));
      stick();
      return;
    }

    const from = el.scrollTop;
    const started = performance.now();
    const duration = 320;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const target = el.scrollHeight - el.clientHeight;
      el.scrollTop = from + (target - from) * eased;
      if (t < 1) {
        tween.current = requestAnimationFrame(step);
      } else {
        tween.current = 0;
        commit(forcePinned(state.current));
        stick();
      }
    };
    tween.current = requestAnimationFrame(step);
  }, [commit, stick]);

  return { scrollerRef, contentRef, pinned, unseen, pinNow, jumpToLatest };
}
