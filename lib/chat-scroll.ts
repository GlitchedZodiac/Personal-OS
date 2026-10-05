// When does the chat follow the newest message, and when does it leave him
// alone? Pure decisions, kept apart from the DOM so they can be tested.
//
// BUG 2 (2026-10-04), for the record. The thread used to scroll the WINDOW:
//   bottomRef.scrollIntoView({ block: "end" })   // "go to the bottom"
//   pinned = scrollHeight - (scrollY + innerHeight) < 140
// Below that bottomRef sat the composer, the page's own bottom padding and
// the layout's. Measured on the live page (375×812): 325 px in all. So "the
// bottom" parked the newest message underneath the sticky composer — 132 px
// of it hidden — and left the page 326 px short of the true end, which the
// 140 px rule read as "he has scrolled up". The thread un-pinned itself with
// its own scroll, every time, and from then on nothing followed anything:
// not his message, not the reply.
//
// The thread is now its own scroller, so "the bottom" is one number
// (scrollHeight - clientHeight) with nothing overlapping it, and the rules
// below are the whole story.

/** Within this many px of the end counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 32;

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface PinState {
  /** follow new content? */
  pinned: boolean;
  /** scrollTop at the last scroll event — tells up from down */
  lastTop: number;
  /** a finger is on the thread right now */
  touching: boolean;
}

export const INITIAL_PIN: PinState = { pinned: true, lastTop: 0, touching: false };

export function distanceFromBottom(m: ScrollMetrics): number {
  return Math.max(0, m.scrollHeight - m.clientHeight - m.scrollTop);
}

/**
 * A scroll event. Only a move UP, away from the end, releases the pin —
 * growing content never fires a scroll event, and our own jump-to-bottom
 * lands at distance 0, so neither can be mistaken for him.
 */
export function afterScroll(state: PinState, m: ScrollMetrics): PinState {
  const dist = distanceFromBottom(m);
  const movedUp = m.scrollTop < state.lastTop - 1;
  let pinned = state.pinned;
  if (dist <= NEAR_BOTTOM_PX) pinned = true;
  else if (movedUp) pinned = false;
  return { ...state, pinned, lastTop: m.scrollTop };
}

/** Mouse wheel / trackpad: an upward flick is intent, even before it moves. */
export function afterWheel(state: PinState, deltaY: number, m: ScrollMetrics): PinState {
  if (deltaY < 0 && m.scrollTop > 0) return { ...state, pinned: false };
  return state;
}

export function afterTouchStart(state: PinState): PinState {
  return { ...state, touching: true };
}

/** Finger lifted: if he let go at the end, follow again. */
export function afterTouchEnd(state: PinState, m: ScrollMetrics): PinState {
  const pinned = distanceFromBottom(m) <= NEAR_BOTTOM_PX ? true : state.pinned;
  return { ...state, touching: false, pinned };
}

/** He sent something, or asked for the latest: follow, unconditionally. */
export function forcePinned(state: PinState): PinState {
  return { ...state, pinned: true };
}

/**
 * May we move the thread right now? Never while his finger is on it — a
 * reply streaming in must not drag the page out from under a thumb.
 */
export function shouldStick(state: PinState): boolean {
  return state.pinned && !state.touching;
}

/**
 * The thread's own height changed (keyboard up or down). When he is reading
 * history, keep the line at the BOTTOM edge where it was rather than the one
 * at the top: that is what "the list shrinks to fit" should feel like.
 */
export function scrollTopAfterResize(
  scrollTop: number,
  previousClientHeight: number,
  nextClientHeight: number
): number {
  return Math.max(0, scrollTop + (previousClientHeight - nextClientHeight));
}
