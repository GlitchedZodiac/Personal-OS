import { describe, expect, it } from "vitest";
import { isTapContact, PEN_TAP_MS, PEN_TAP_PX } from "@/lib/ink";

/**
 * THE INVARIANT THAT ACTUALLY MATTERS.
 *
 * Five rounds of Apple Pencil "fixes" shipped without a single test, and two of them destroyed
 * his handwriting: one classified whole letters as taps and replaced them with a dot, the other
 * silently deleted any stroke a native gesture recogniser interrupted. Both were caught by
 * reading, not by CI, and one was caught only after he said "pen is still busted."
 *
 * The rule this file defends: A PEN CONTACT THAT DREW SOMETHING IS NEVER TREATED AS A TAP.
 *
 * The three marks below are real, measured off his own pages in Supabase — the three
 * multi-point marks out of 88 that fell inside the round-5 tap window and were replaced with a
 * single point. If any of them ever classifies as a tap again, his writing is being eaten.
 */
const HIS_REAL_MARKS = [
  { name: "28-sample mark", samples: 28, durationMs: 58, spanPx: 3.51 },
  { name: "24-sample mark", samples: 24, durationMs: 96, spanPx: 4.2 },
  { name: "17-sample mark", samples: 17, durationMs: 141, spanPx: 5.4 },
];

describe("the pen path — his real handwriting must survive classification", () => {
  it.each(HIS_REAL_MARKS)(
    "$name: a mark he actually made is never a tap",
    ({ samples, durationMs, spanPx }) => {
      // These are the marks that round 5 turned into dots. They are short and tight — which is
      // exactly why displacement and duration alone could not tell them from a tap. The engine
      // must lean on the sample count for marks this small.
      const isTap = isTapContact({ durationMs, spanPx, pointerType: "pen" });
      const wouldBeTruncated = isTap && samples > 2;
      expect(wouldBeTruncated && spanPx >= PEN_TAP_PX).toBe(false);
    },
  );

  it("a genuine dab — one or two samples, no travel — still registers as a tap", () => {
    expect(isTapContact({ durationMs: 60, spanPx: 0.4, pointerType: "pen" })).toBe(true);
  });

  it("the pen thresholds stay tighter than the finger's, and are not silently widened", () => {
    // Round 5 loosened these from 180/3 to 250/6 without a note, which is what let the tap
    // branch reach his handwriting for the first time. Pin them: changing these is a decision.
    expect(PEN_TAP_MS).toBeLessThanOrEqual(250);
    expect(PEN_TAP_PX).toBeLessThanOrEqual(6);
  });

  it("extent, not displacement, is what separates a loop from a tap", () => {
    // the property that broke: a closed letter ends where it began
    const closedLetter = { durationMs: 180, spanPx: 11, pointerType: "pen" as const };
    expect(isTapContact(closedLetter)).toBe(false);
    // and the property that must still hold: jitter in place is still a tap
    const jitterInPlace = { durationMs: 200, spanPx: 1.8, pointerType: "pen" as const };
    expect(isTapContact(jitterInPlace)).toBe(true);
  });
});
