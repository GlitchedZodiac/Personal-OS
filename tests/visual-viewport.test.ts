import { describe, expect, it } from "vitest";
import { KEYBOARD_MIN_PX, computeViewportState } from "@/lib/visual-viewport";

// Every figure below was read off the iPhone 17 Pro Max simulator (iOS 26.5,
// Safari) through the ?vvdebug=1 readout on 2026-10-04.

describe("computeViewportState", () => {
  it("at rest: the frame is the whole screen and the keyboard is closed", () => {
    expect(
      computeViewportState({
        layoutHeight: 796,
        visualHeight: 796,
        offsetTop: 0,
        scale: 1,
        editableFocused: false,
      })
    ).toEqual({ height: 796, top: 0, keyboardHeight: 0, keyboardOpen: false });
  });

  it("keyboard up: the frame is the strip above the keys, wherever WebKit panned", () => {
    // vv 449@347 inside a 796 layout viewport — 449 + 347 = 796.
    const state = computeViewportState({
      layoutHeight: 796,
      visualHeight: 449,
      offsetTop: 347,
      scale: 1,
      editableFocused: true,
    });
    expect(state.height).toBe(449);
    expect(state.top).toBe(347);
    expect(state.keyboardOpen).toBe(true);
    expect(state.keyboardHeight).toBe(347);
  });

  it("follows a pan even when almost nothing is covered (the 82 px regression)", () => {
    // Hardware keyboard: only the accessory bar is up. vv 713@82 in 796.
    const state = computeViewportState({
      layoutHeight: 796,
      visualHeight: 713,
      offsetTop: 82,
      scale: 1,
      editableFocused: true,
    });
    expect(state.top).toBe(82);
    expect(state.height).toBe(713);
    // 83 px covered is an accessory bar, not a keyboard — the tab bar stays.
    expect(state.keyboardOpen).toBe(false);
  });

  it("does not call Safari's collapsing toolbar a keyboard", () => {
    const state = computeViewportState({
      layoutHeight: 836,
      visualHeight: 836 - (KEYBOARD_MIN_PX - 30),
      offsetTop: 0,
      scale: 1,
      editableFocused: true,
    });
    expect(state.keyboardOpen).toBe(false);
  });

  it("needs a focused field as well as a short viewport", () => {
    const state = computeViewportState({
      layoutHeight: 796,
      visualHeight: 449,
      offsetTop: 347,
      scale: 1,
      editableFocused: false,
    });
    // the geometry still tracks what is visible…
    expect(state.height).toBe(449);
    // …but nothing is declared "typing".
    expect(state.keyboardOpen).toBe(false);
  });

  it("ignores a pinch-zoomed page entirely", () => {
    expect(
      computeViewportState({
        layoutHeight: 796,
        visualHeight: 398,
        offsetTop: 120,
        scale: 2,
        editableFocused: true,
      })
    ).toEqual({ height: 796, top: 0, keyboardHeight: 0, keyboardOpen: false });
  });

  it("clamps the negative offset an overscroll bounce can report", () => {
    const state = computeViewportState({
      layoutHeight: 796,
      visualHeight: 796,
      offsetTop: -14,
      scale: 1,
      editableFocused: false,
    });
    expect(state.top).toBe(0);
  });
});
