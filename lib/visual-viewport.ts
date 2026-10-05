// The on-screen keyboard, as layout — not as a scroll hack.
//
// On iOS (Safari, the home-screen PWA, and the companion's WKWebView alike)
// the keyboard does NOT resize the layout viewport. `100vh`, `100dvh` and
// `position: fixed; bottom: 0` all keep describing the full screen, so
// anything pinned to "the bottom" ends up underneath the keys, and WebKit
// answers by panning the page to drag the focused field back into view.
//
// The one thing that does track the keyboard is the VISUAL viewport: its
// height shrinks to the strip above the keys, and its offsetTop says how far
// WebKit panned. So keyboard-aware surfaces are laid out against that
// rectangle instead: <ViewportVars /> publishes it as CSS variables and the
// `.vv-frame` class (globals.css) is a fixed box that covers it exactly.
// Anything anchored to the bottom of a .vv-frame sits directly above the
// keyboard, however WebKit chose to pan.

export interface ViewportMetrics {
  /**
   * layout viewport height — the LARGER of window.innerHeight and
   * documentElement.clientHeight. They are not the same thing on iOS 26
   * Safari: measured with the keyboard up, innerHeight read 714–745 while
   * the box `position: fixed` is laid out against (clientHeight) stayed 796.
   */
  layoutHeight: number;
  /** visualViewport.height (falls back to layoutHeight where unsupported) */
  visualHeight: number;
  /** visualViewport.offsetTop — how far the visual viewport is panned */
  offsetTop: number;
  /** visualViewport.scale — 1 unless the page is pinch-zoomed */
  scale: number;
  /** is a text field (input / textarea / contenteditable) focused? */
  editableFocused: boolean;
}

export interface ViewportState {
  /** height of the rectangle the user can actually see, in CSS px */
  height: number;
  /** its distance from the top of the layout viewport */
  top: number;
  /** how much of the layout viewport the keyboard is covering */
  keyboardHeight: number;
  keyboardOpen: boolean;
}

// Anything shorter than this is browser chrome breathing (Safari's toolbar
// collapsing is ~50–90 px), not a keyboard. The smallest real iOS keyboard —
// the floating iPad one aside — is well over 200 px.
export const KEYBOARD_MIN_PX = 120;

export function computeViewportState(m: ViewportMetrics): ViewportState {
  const layout = Math.max(0, m.layoutHeight);
  // A pinch-zoomed page reports a shrunken visual viewport too. That is not
  // a keyboard and the frame must not chase it.
  const zoomed = Math.abs((m.scale || 1) - 1) > 0.01;
  if (zoomed || !(m.visualHeight > 0)) {
    return { height: layout, top: 0, keyboardHeight: 0, keyboardOpen: false };
  }

  const height = Math.min(layout || m.visualHeight, m.visualHeight);
  const covered = Math.max(0, layout - m.visualHeight);
  const keyboardOpen = m.editableFocused && covered >= KEYBOARD_MIN_PX;

  return {
    height: Math.round(height),
    // Taken exactly as reported. An earlier cut zeroed this whenever the
    // visible height matched innerHeight ("nothing is covered, so nothing
    // can be panned") — and the simulator promptly showed a 713-high visual
    // viewport panned 82 px inside a 796-high layout viewport, which left
    // the sheet floating 82 px above where it belonged. Only a negative
    // value (overscroll bounce) is not a real position.
    top: Math.max(0, Math.round(m.offsetTop)),
    keyboardHeight: keyboardOpen ? Math.round(covered) : 0,
    keyboardOpen,
  };
}

export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // these never raise a keyboard
    return !["button", "checkbox", "radio", "file", "range", "submit", "color", "hidden"].includes(
      type
    );
  }
  return (el as HTMLElement).isContentEditable === true;
}
