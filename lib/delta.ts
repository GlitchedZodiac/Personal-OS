// How a change is written and coloured, everywhere (lane C kit).
//
// The Body handoff's colour rule, made app-wide: green means "moved in the
// good direction"; anything else is the secondary ink — never red, never
// "HIGH". Signs use the true minus (U+2212) and a hair of space before the
// unit so tabular figures line up.

export type GoodDirection = "up" | "down" | "none";
export type DeltaTone = "good" | "neutral";

export interface DeltaParts {
  /** e.g. "−0.3", "+12", "0" */
  text: string;
  tone: DeltaTone;
  /** true when the value rounds to zero at the requested precision */
  flat: boolean;
}

const MINUS = "−";

export function formatDelta(value: number, decimals = 1, good: GoodDirection = "none"): DeltaParts {
  if (!Number.isFinite(value)) return { text: "—", tone: "neutral", flat: true };
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) return { text: "0", tone: "neutral", flat: true };
  const magnitude = Math.abs(rounded).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const text = `${rounded > 0 ? "+" : MINUS}${magnitude}`;
  const movedGood = (good === "up" && rounded > 0) || (good === "down" && rounded < 0);
  return { text, tone: movedGood ? "good" : "neutral", flat: false };
}
