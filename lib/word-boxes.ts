// V3 §1 — measure the words of a rendered verse, without changing how verses
// render. Anchors are word-ranges, never pixels; this is where the words get
// their boxes. Walks the verse element's text nodes (skipping <sup> markers
// and buttons), tokenizes on whitespace, and measures each word with a Range —
// no per-word <span>s, so the reader's markup and everything anchored to it
// stay untouched.

import type { WordBox } from "./mark-detect";

/** boxes in the coordinate space of `container` (the ink page space when container is the content div) */
export function wordBoxesIn(verseEl: HTMLElement, container: HTMLElement): WordBox[] {
  const cRect = container.getBoundingClientRect();
  const boxes: WordBox[] = [];
  let wi = 0;
  const walker = document.createTreeWalker(verseEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // crossref/footnote sups and any buttons are chrome, not scripture
      if (parent.closest("sup, button, [data-verse-number]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        boxes.push({ wi, text: m[0], left: r.left - cRect.left, top: r.top - cRect.top, width: r.width, height: r.height });
      }
      wi++;
    }
  }
  return boxes;
}

/** the marked words as printed — stored on the comment so another translation can re-find them */
export function anchorTextOf(boxes: WordBox[], wordStart: number, wordEnd: number): string {
  return boxes.filter((b) => b.wi >= wordStart && b.wi <= wordEnd).map((b) => b.text).join(" ");
}

/**
 * Re-find a word range by its text in a (possibly different) translation's boxes.
 * Exact token-sequence match, punctuation-insensitive; null when the words are
 * not there — the caller then falls back to a verse-level anchor, honestly.
 */
export function findAnchorRange(boxes: WordBox[], anchorText: string): { wordStart: number; wordEnd: number } | null {
  const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const want = anchorText.split(/\s+/).map(clean).filter(Boolean);
  if (!want.length) return null;
  const have = boxes.map((b) => clean(b.text));
  outer: for (let i = 0; i + want.length <= have.length; i++) {
    for (let j = 0; j < want.length; j++) {
      if (have[i + j] !== want[j]) continue outer;
    }
    return { wordStart: boxes[i].wi, wordEnd: boxes[i + want.length - 1].wi };
  }
  return null;
}
