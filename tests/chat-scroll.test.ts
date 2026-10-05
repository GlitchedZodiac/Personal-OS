import { describe, expect, it } from "vitest";
import {
  INITIAL_PIN,
  NEAR_BOTTOM_PX,
  afterScroll,
  afterTouchEnd,
  afterTouchStart,
  afterWheel,
  distanceFromBottom,
  forcePinned,
  scrollTopAfterResize,
  shouldStick,
  type PinState,
  type ScrollMetrics,
} from "@/lib/chat-scroll";

// A thread 2000 px tall in a 600 px window: the end is scrollTop 1400.
const at = (scrollTop: number, scrollHeight = 2000, clientHeight = 600): ScrollMetrics => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("distanceFromBottom", () => {
  it("is zero at the end and never negative during an overscroll bounce", () => {
    expect(distanceFromBottom(at(1400))).toBe(0);
    expect(distanceFromBottom(at(1420))).toBe(0);
    expect(distanceFromBottom(at(1000))).toBe(400);
  });
});

describe("the pin", () => {
  it("starts pinned — a thread opens on its newest message", () => {
    expect(shouldStick(INITIAL_PIN)).toBe(true);
  });

  it("survives our own jump to the end (the bug: it used to un-pin itself)", () => {
    // The old page's "scroll to bottom" stopped 326 px short and then asked
    // whether it was within 140 px. Here the jump lands AT the end.
    const state = afterScroll({ ...INITIAL_PIN, lastTop: 900 }, at(1400));
    expect(state.pinned).toBe(true);
  });

  it("is NOT released by content growing underneath it", () => {
    // A reply streams in: scrollHeight grows, scrollTop does not move, and no
    // scroll event fires at all — so the state is simply untouched until the
    // thread is moved back to the end.
    const pinned: PinState = { pinned: true, lastTop: 1400, touching: false };
    expect(shouldStick(pinned)).toBe(true);
    const followed = afterScroll(pinned, at(1700, 2300));
    expect(followed.pinned).toBe(true);
  });

  it("releases when he scrolls UP to read history", () => {
    const state = afterScroll({ pinned: true, lastTop: 1400, touching: false }, at(1100));
    expect(state.pinned).toBe(false);
    expect(shouldStick(state)).toBe(false);
  });

  it("stays released while he scrolls back down but is not at the end yet", () => {
    let state: PinState = { pinned: false, lastTop: 600, touching: false };
    state = afterScroll(state, at(900));
    expect(state.pinned).toBe(false);
  });

  it("re-pins the moment he is back within reach of the end", () => {
    let state: PinState = { pinned: false, lastTop: 900, touching: false };
    state = afterScroll(state, at(1400 - NEAR_BOTTOM_PX));
    expect(state.pinned).toBe(true);
  });

  it("ignores a one-pixel wobble (sub-pixel layout, rubber-banding)", () => {
    const state = afterScroll({ pinned: true, lastTop: 1000, touching: false }, at(999.4));
    expect(state.pinned).toBe(true);
  });

  it("an upward wheel flick is intent, before the thread has even moved", () => {
    const state = afterWheel({ pinned: true, lastTop: 1400, touching: false }, -40, at(1400));
    expect(state.pinned).toBe(false);
  });

  it("a wheel flick DOWN, or up with nowhere to go, changes nothing", () => {
    const pinned: PinState = { pinned: true, lastTop: 1400, touching: false };
    expect(afterWheel(pinned, 40, at(1400)).pinned).toBe(true);
    expect(afterWheel({ ...pinned, lastTop: 0 }, -40, at(0, 400, 600)).pinned).toBe(true);
  });
});

describe("a finger on the thread", () => {
  it("suspends following without releasing the pin", () => {
    const state = afterTouchStart({ pinned: true, lastTop: 1400, touching: false });
    expect(state.pinned).toBe(true);
    expect(shouldStick(state)).toBe(false); // a streaming reply must not drag under a thumb
  });

  it("resumes following when he lets go at the end", () => {
    const touching: PinState = { pinned: true, lastTop: 1390, touching: true };
    const state = afterTouchEnd(touching, at(1390));
    expect(shouldStick(state)).toBe(true);
  });

  it("stays released when he lets go mid-history", () => {
    let state: PinState = { pinned: true, lastTop: 1400, touching: true };
    state = afterScroll(state, at(1000));
    state = afterTouchEnd(state, at(1000));
    expect(shouldStick(state)).toBe(false);
  });
});

describe("sending", () => {
  it("always follows, even if he was reading history a moment ago", () => {
    const reading: PinState = { pinned: false, lastTop: 300, touching: false };
    expect(shouldStick(forcePinned(reading))).toBe(true);
  });
});

describe("scrollTopAfterResize", () => {
  it("keeps the bottom line in place when the keyboard takes 300 px", () => {
    // 600 → 300 tall: what was at the bottom edge was content y = 1000 + 600.
    expect(scrollTopAfterResize(1000, 600, 300)).toBe(1300);
  });

  it("gives the space back when the keyboard goes away", () => {
    expect(scrollTopAfterResize(1300, 300, 600)).toBe(1000);
  });

  it("never goes negative", () => {
    expect(scrollTopAfterResize(100, 300, 600)).toBe(0);
  });
});
