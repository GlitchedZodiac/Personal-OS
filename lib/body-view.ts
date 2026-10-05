// Pitaya Body — the pure half of the screen: constants lifted from the design
// (docs/design/pitaya-body/Pitaya Body.dc.html + Handoff Spec) and every
// calculation a card draws from. No React, no Prisma — the tests drive this
// file directly, and the page only lays out what these functions return.
//
// Days are local-calendar strings ("2026-10-05"); the API has already placed
// each reading on the right day for his time zone.

/** Fixed by Michael: "Start point is fixed: 117.3 kg on 2025-12-15. Every
 *  'since start' number derives from it." No scale reading exists for that
 *  day — the first one is 113.55 kg on Dec 24 — so this is a declared value,
 *  not a row. Composition metrics start from their first real reading. */
export const BODY_START = { day: "2025-12-15", weightKg: 117.3 } as const;

export type MetricKey =
  | "weight" | "fat" | "fatMass" | "skm" | "ffm" | "water"
  | "visceral" | "bmr" | "metAge" | "waist";

export interface MetricMeta {
  label: string;
  unit: string;
  decimals: 0 | 1;
  /** Which direction is "the good one" — the only thing that earns green. */
  down: boolean;
}

/** DC `SER`, verbatim. */
export const SER: Record<MetricKey, MetricMeta> = {
  weight: { label: "Weight", unit: "kg", decimals: 1, down: true },
  fat: { label: "Body fat", unit: "%", decimals: 1, down: true },
  fatMass: { label: "Fat mass", unit: "kg", decimals: 1, down: true },
  skm: { label: "Skeletal muscle", unit: "kg", decimals: 1, down: false },
  ffm: { label: "Fat-free mass", unit: "kg", decimals: 1, down: false },
  water: { label: "Water", unit: "kg", decimals: 1, down: false },
  visceral: { label: "Visceral fat", unit: "", decimals: 0, down: true },
  bmr: { label: "BMR", unit: "kcal", decimals: 0, down: false },
  metAge: { label: "Metabolic age", unit: "yr", decimals: 0, down: true },
  waist: { label: "Waist", unit: "cm", decimals: 1, down: true },
};

export interface CompSpec {
  key: MetricKey;
  band: [number, number];
  axis: [number, number];
  /** A bioimpedance estimate — wears the EST tag. */
  estimate: boolean;
  /** Shown in the composition overview (waist is detail-only). */
  main: boolean;
}

/** DC `COMP`, verbatim: population reference bands and bar axes. Five of the
 *  bands are the ones RENPHO sends with each reading; fat-free mass, visceral
 *  fat, BMR and metabolic age are the design's. Targets are not here — they
 *  come from his goals. */
export const COMP: readonly CompSpec[] = [
  { key: "weight", band: [59.2, 80.2], axis: [55, 120], estimate: false, main: true },
  { key: "fatMass", band: [8.4, 16.8], axis: [4, 45], estimate: true, main: true },
  { key: "fat", band: [10, 20], axis: [4, 40], estimate: true, main: true },
  { key: "skm", band: [29.9, 36.5], axis: [25, 46], estimate: true, main: true },
  { key: "ffm", band: [56, 74], axis: [50, 85], estimate: true, main: true },
  { key: "water", band: [37.3, 46.4], axis: [30, 60], estimate: true, main: true },
  { key: "visceral", band: [1, 9], axis: [0, 20], estimate: true, main: true },
  { key: "bmr", band: [1650, 1950], axis: [1500, 2400], estimate: true, main: true },
  { key: "metAge", band: [20, 32], axis: [18, 60], estimate: true, main: true },
  { key: "waist", band: [70, 94], axis: [60, 130], estimate: false, main: false },
];

export const TREND_METRICS: readonly MetricKey[] = ["weight", "fat", "skm", "water", "bmr", "waist"];

export type RangeKey = "7d" | "30d" | "90d" | "6mo" | "all" | "custom";
export const RANGES: readonly [RangeKey, string][] = [
  ["7d", "7d"], ["30d", "30d"], ["90d", "90d"], ["6mo", "6mo"], ["all", "Since start"], ["custom", "Custom"],
];
const RANGE_DAYS: Record<Exclude<RangeKey, "all" | "custom">, number> = {
  "7d": 7, "30d": 30, "90d": 90, "6mo": 183,
};

/** DC `TAPE`, verbatim order. `field` is the body_measurements column. */
export const TAPE_SITES = [
  { key: "waist", label: "Waist", field: "waistCm" },
  { key: "hips", label: "Hips", field: "hipsCm" },
  { key: "chest", label: "Chest", field: "chestCm" },
  { key: "neck", label: "Neck", field: "neckCm" },
  { key: "arms", label: "Arms", field: "armsCm" },
  { key: "forearms", label: "Forearms", field: "forearmsCm" },
  { key: "legs", label: "Legs", field: "legsCm" },
  { key: "calves", label: "Calves", field: "calvesCm" },
  { key: "shoulders", label: "Shoulders", field: "shouldersCm" },
] as const;
export type TapeSite = (typeof TAPE_SITES)[number]["key"];

export interface DayPoint {
  day: string;
  value: number;
}

// ——— dates ————————————————————————————————————————————————————————————————

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayNum = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);
export function addDays(day: string, n: number): string {
  return new Date((dayNum(day) + n) * 86_400_000).toISOString().slice(0, 10);
}
/** "Oct 4" */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MON[m - 1]} ${d}`;
}

// ——— formatting (DC fmtV / sgn) ————————————————————————————————————————————

export function fmtValue(key: MetricKey, v: number): string {
  return SER[key].decimals ? v.toFixed(1) : Math.round(v).toLocaleString("en-US");
}
/** Signed with a true minus, DC `sgn`. */
export const signed = (delta: number, text: string) => (delta > 0 ? "+" : "−") + text;

/** "−2.1" / "±0" for a metric delta, with the flat threshold the DC uses. */
export function fmtDelta(key: MetricKey, delta: number): { text: string; flat: boolean } {
  const flat = Math.abs(delta) < (SER[key].decimals ? 0.05 : 0.5);
  return { text: flat ? "±0" : signed(delta, fmtValue(key, Math.abs(delta))), flat };
}

// ——— series helpers ———————————————————————————————————————————————————————

/** Value on `day`: the reading that day, else a straight line between its
 *  neighbours, else the nearest end. He does not weigh in every day (three
 *  readings in all of September), and the design's maths assumes he does. */
export function valueOn(points: readonly DayPoint[], day: string): number | null {
  if (points.length === 0) return null;
  const t = dayNum(day);
  let before: DayPoint | null = null;
  let after: DayPoint | null = null;
  for (const p of points) {
    const n = dayNum(p.day);
    if (n === t) return p.value;
    if (n < t) before = p;
    else if (after === null) after = p;
  }
  if (before && after) {
    const a = dayNum(before.day);
    const b = dayNum(after.day);
    return before.value + ((after.value - before.value) * (t - a)) / (b - a);
  }
  return (before ?? after)!.value;
}

/** The actual reading closest in time to `day`. Used for "vs 30 days ago":
 *  across a six-week gap a straight line would invent a number — and when the
 *  gap spans the change of scale, an invented improvement. A real reading a
 *  few days off is the honest comparison. */
export function nearestValue(points: readonly DayPoint[], day: string): number | null {
  if (points.length === 0) return null;
  const t = dayNum(day);
  let best = points[0];
  for (const p of points) {
    if (Math.abs(dayNum(p.day) - t) < Math.abs(dayNum(best.day) - t)) best = p;
  }
  return best.value;
}

/** Centred 7-day mean on `day` (±3 days) over the interpolated daily line,
 *  clamped to the ends of the data — the DC's `sm`. */
export function smoothedOn(points: readonly DayPoint[], day: string): number | null {
  if (points.length === 0) return null;
  const first = points[0].day;
  const last = points[points.length - 1].day;
  let sum = 0;
  for (let k = -3; k <= 3; k++) {
    let d = addDays(day, k);
    if (dayNum(d) < dayNum(first)) d = first;
    if (dayNum(d) > dayNum(last)) d = last;
    sum += valueOn(points, d) as number;
  }
  return sum / 7;
}

export function pointsInRange(
  points: readonly DayPoint[],
  range: RangeKey,
  today: string,
  custom?: { from: string; to: string }
): DayPoint[] {
  if (range === "all") return [...points];
  const from = range === "custom" ? (custom?.from ?? addDays(today, -120)) : addDays(today, -RANGE_DAYS[range]);
  const to = range === "custom" ? (custom?.to ?? today) : today;
  return points.filter((p) => dayNum(p.day) >= dayNum(from) && dayNum(p.day) <= dayNum(to));
}

// ——— range bar (Spec §3) ——————————————————————————————————————————————————

export interface RangeBarGeometry {
  bandL: number; bandW: number;
  histL: number; histW: number;
  startX: number; nowX: number;
  targetX: number | null;
}

/** Percent positions along the track; everything clamps to the axis. */
export function rangeBar(input: {
  value: number; start: number; axis: readonly [number, number];
  band: readonly [number, number]; target?: number | null;
}): RangeBarGeometry {
  const [a0, a1] = input.axis;
  const P = (x: number) => Math.max(0, Math.min(1, (x - a0) / (a1 - a0))) * 100;
  const start = P(input.start);
  const now = P(input.value);
  return {
    bandL: P(input.band[0]),
    bandW: P(input.band[1]) - P(input.band[0]),
    histL: Math.min(start, now),
    histW: Math.abs(start - now),
    startX: start,
    nowX: now,
    targetX: input.target != null ? P(input.target) : null,
  };
}

export interface CompRow extends RangeBarGeometry {
  key: MetricKey;
  label: string;
  unit: string;
  estimate: boolean;
  value: number;
  valueText: string;
  d30Text: string;
  good: boolean;
  inBand: boolean;
  /** |Δ30d| as a share of the axis — the "Most changed" sort key. */
  change: number;
  axisLo: string; axisHi: string; bandText: string;
  band: [number, number];
  start: number;
  target: number | null;
}

export function buildCompRow(
  spec: CompSpec,
  points: readonly DayPoint[],
  today: string,
  opts: { start?: number; target?: number | null } = {}
): CompRow | null {
  if (points.length === 0) return null;
  const meta = SER[spec.key];
  const value = points[points.length - 1].value;
  const start = opts.start ?? points[0].value;
  const v30 = nearestValue(points, addDays(today, -30)) as number;
  const d = value - v30;
  const delta = fmtDelta(spec.key, d);
  const good = !delta.flat && (meta.down ? d < 0 : d > 0);
  const target = opts.target ?? null;
  return {
    key: spec.key,
    label: meta.label,
    unit: meta.unit,
    estimate: spec.estimate,
    value,
    valueText: fmtValue(spec.key, value),
    d30Text: delta.text,
    good,
    inBand: value >= spec.band[0] && value <= spec.band[1],
    change: Math.abs(d) / (spec.axis[1] - spec.axis[0]),
    axisLo: fmtValue(spec.key, spec.axis[0]),
    axisHi: fmtValue(spec.key, spec.axis[1]),
    bandText:
      `${fmtValue(spec.key, spec.band[0])}–${fmtValue(spec.key, spec.band[1])}` +
      (meta.unit ? ` ${meta.unit}` : ""),
    band: [...spec.band] as [number, number],
    start,
    target,
    ...rangeBar({ value, start, axis: spec.axis, band: spec.band, target }),
  };
}

export const COMP_SORTS = ["Default", "Most changed", "Outside band"] as const;
export function sortCompRows(rows: readonly CompRow[], mode: number): CompRow[] {
  const out = [...rows];
  if (mode === 1) out.sort((a, b) => b.change - a.change);
  else if (mode === 2) out.sort((a, b) => (a.inBand ? 1 : 0) - (b.inBand ? 1 : 0));
  return out;
}

// ——— copy that depends on his numbers ——————————————————————————————————————
//
// The design's BANDNOTE and NOTE tables were written around the readings of
// one morning ("0.2 from your target", "at 2 there is nothing here to chase",
// "pants at 32"). Shipped verbatim they would be false by the next weigh-in —
// the same thing the first metric page ran into. The explanation in each
// sentence is the design's; the position and the numbers are computed.

export interface NoteContext {
  value: number;
  band: readonly [number, number];
  start: number;
  target?: number | null;
  skeletalMuscleKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  startWeightKg?: number;
}

const position = (v: number, [lo, hi]: readonly [number, number]) =>
  v < lo ? "Below" : v > hi ? "Above" : "Inside";

export function bandNote(key: MetricKey, c: NoteContext): string {
  const pos = position(c.value, c.band);
  switch (key) {
    case "weight": {
      const who = c.heightCm ? ` for ${Math.round(c.heightCm)} cm` : "";
      const trail = `The band is context; the trail from ${(c.startWeightKg ?? BODY_START.weightKg).toFixed(1)} is the measure.`;
      if (pos === "Above" && c.skeletalMuscleKg) {
        return `Above the population band${who}, and that is expected at ${Math.round(c.skeletalMuscleKg)} kg of skeletal muscle. ${trail}`;
      }
      return `${pos} the population band${who}. ${trail}`;
    }
    case "fatMass":
      return `${pos} the band. Fat mass inherits the scale’s wobble twice (weight × fat %), so read it monthly.`;
    case "fat": {
      let toTarget = "";
      if (c.target != null) {
        const gap = c.value - c.target;
        toTarget = gap > 0.05 ? ` and ${gap.toFixed(1)} from your target` : " and at your target";
      }
      return `${pos} the band${toTarget}. Single readings swing a point either way; the slope is what counts.`;
    }
    case "skm":
      return pos === "Above"
        ? "Above the band — more skeletal muscle than the reference, which is the point of eating protein in a deficit."
        : `${pos} the band. Holding it while the scale drops is the point of eating protein in a deficit.`;
    case "ffm":
      return "Everything that isn’t fat: muscle, bone, water, organs. Holding this while the scale drops means the loss is fat.";
    case "water":
      return pos === "Above"
        ? "Above the band because lean mass carries water. Swings with salt, carbs and training — context, not a target."
        : `${pos} the band. Swings with salt, carbs and training — context, not a target.`;
    case "visceral":
      if (pos === "Above") return "Above the band. Under 10 is the healthy range.";
      return c.value <= 4
        ? `Well inside the band. Under 10 is the healthy range; at ${Math.round(c.value)} there is nothing here to chase.`
        : "Inside the band. Under 10 is the healthy range.";
    case "bmr":
      return `${pos} the band. Katch-McArdle from your lean mass, so it moves with muscle, not with the scale.`;
    case "metAge": {
      const tail = "A scale summary score, not a clinical one — the gap widening is the trend.";
      if (c.age == null) return tail;
      const gap = Math.round(c.age - c.value);
      const lead =
        gap > 0 ? `${numberWord(gap)} year${gap === 1 ? "" : "s"} under your actual age.`
        : gap < 0 ? `${numberWord(-gap)} year${gap === -1 ? "" : "s"} over your actual age.`
        : "Level with your actual age.";
      return `${lead} ${tail}`;
    }
    case "waist":
      return c.value <= c.band[1]
        ? `Inside the band (under ${c.band[1]} cm). The only measurement the scale cannot estimate.`
        : `Above the band (${c.band[1]} cm). The only measurement the scale cannot estimate.`;
  }
}

function numberWord(n: number): string {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return words[n] ?? String(n);
}

/** "WHAT IT MEANS". Verbatim from the DC except the two sentences that quote
 *  his numbers, which are filled from the series. */
export function meaningNote(key: MetricKey, c: { value: number; start: number }): string {
  switch (key) {
    case "weight":
      return "The weekly wobble is water and glycogen; the slope is the truth. Around 0.25–0.5 kg a week is the band where fat goes and strength stays. Weigh in every morning and let the average do the judging.";
    case "fat":
      return "Estimated by bioimpedance, so single readings wobble — the trend is what counts. Morning weigh-ins, after the bathroom and before coffee, keep the readings comparable. Judge the slope over weeks, never one number.";
    case "fatMass":
      return `Weight × body fat %, so it inherits the scale’s wobble twice over. Watch it monthly. ${c.value.toFixed(1)} kg today against ${c.start.toFixed(1)} at the start is the whole story of the year in one number.`;
    case "skm":
      return "Holding or gaining muscle while the scale drops is the whole point of eating protein in a deficit. Flat or dipping weeks after hard sessions are usually water shifts, not lost muscle — judge it month to month.";
    case "ffm":
      return "Everything that isn’t fat. If this holds while weight falls, the loss is fat. If it slides for weeks, that is the cue to check protein and training volume before anything else.";
    case "water":
      return "Body water swings with salt, carbs, heat and training. Read it as context for the other estimates, not as a target — a high reading after a big session is normal.";
    case "visceral": {
      const base = "The fat around the organs, scored 1–59 by the scale. Under 10 is the healthy band.";
      return c.start - c.value >= 1
        ? `${base} Yours fell from ${Math.round(c.start)} to ${Math.round(c.value)} with the weight${c.value < 10 ? "; there is nothing left to chase here" : ""}.`
        : base;
    }
    case "bmr":
      return "Your resting burn, recalculated from lean mass each weigh-in. Losing weight without BMR falling is the game: it means the loss is fat, not the engine.";
    case "metAge":
      return "A scale’s summary of the other estimates, not a clinical age. Below your actual age is the point; the gap widening is the trend worth noticing.";
    case "waist":
      return "Tape at the navel, relaxed, after breathing out. The pants know first — the tape is confirmation, and the only measurement the scale cannot estimate.";
  }
}

// ——— trend chart (Spec §6, DC `_chart`) ————————————————————————————————————

export interface TrendGeometry {
  n: number;
  raw: { x: number; y: number }[];
  line: string;
  area: string;
  dotR: number;
  dotO: number;
  x0: string; x1: string;
  lo: string; hi: string;
  smText: string;
  delta: string;
  /** Tooltip for point `i`. */
  tip(i: number): { x: number; y: number; left: number; top: number; text: string };
  /** Index of the real point nearest to viewBox x. */
  indexAt(x: number): number;
}

export function trendChart(
  key: MetricKey,
  points: readonly DayPoint[],
  rangeLabel: string
): TrendGeometry | null {
  const n = points.length;
  if (n === 0) return null;
  const meta = SER[key];
  // n < 12 (tape): the line passes through the raw points.
  const sm =
    n >= 12 ? points.map((p) => smoothedOn(points, p.day) as number) : points.map((p) => p.value);
  const vals = points.map((p) => p.value);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const span = mx - mn || 1;
  // Time-proportional x: a three-week gap reads as a gap, not as one step.
  const t0 = dayNum(points[0].day);
  const tSpan = dayNum(points[n - 1].day) - t0 || 1;
  const X = (i: number) => (n === 1 ? 180 : 6 + ((dayNum(points[i].day) - t0) / tSpan) * 348);
  const Y = (v: number) => 14 + (1 - (v - mn) / span) * 132;
  const line = sm.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const d = sm[n - 1] - sm[0];
  const delta = fmtDelta(key, d);
  const unit = meta.unit ? ` ${meta.unit}` : "";
  return {
    n,
    raw: points.map((p, i) => ({ x: +X(i).toFixed(1), y: +Y(p.value).toFixed(1) })),
    line,
    area: `${line} L${X(n - 1).toFixed(1)},146 L${X(0).toFixed(1)},146 Z`,
    dotR: n > 60 ? 1.4 : n > 20 ? 2.2 : 3.2,
    dotO: n > 60 ? 0.28 : 0.45,
    x0: dayLabel(points[0].day).toUpperCase(),
    x1: dayLabel(points[n - 1].day).toUpperCase(),
    lo: fmtValue(key, mn),
    hi: fmtValue(key, mx),
    smText: n >= 12 ? "7-day trend over daily points" : "tape points",
    delta: `${delta.text}${unit} · ${rangeLabel.toLowerCase()}`,
    tip(i) {
      const k = Math.max(0, Math.min(n - 1, i));
      const x = X(k);
      const y = Y(points[k].value);
      return {
        x: +x.toFixed(1),
        y: +y.toFixed(1),
        left: Math.max(0, Math.min(228, x - 66)),
        top: Math.max(0, y - 40),
        text: `${fmtValue(key, points[k].value)}${unit} · ${dayLabel(points[k].day).toUpperCase()}`,
      };
    },
    indexAt(x) {
      let best = 0;
      let dist = Infinity;
      for (let i = 0; i < n; i++) {
        const gap = Math.abs(X(i) - x);
        if (gap < dist) { dist = gap; best = i; }
      }
      return best;
    },
  };
}

// ——— pace & forecast (Spec §2, DC renderVals) ——————————————————————————————

export interface Pace {
  toGo: number;
  daysTo: number;
  /** kg/week needed to land on the date. */
  needed: number;
  /** kg/week he is losing on the trailing 30 days (positive = losing). */
  rate: number;
  /** Days until the target at this rate; Infinity when not moving. */
  arrivalDays: number;
  arrivalDay: string | null;
  /** Positive = early. */
  daysEarly: number | null;
  sentence: string;
  chart: {
    neededPath: string; onPath: string;
    goalX: number; arrivalX: number; arrivalY: number;
    arrivalVisible: boolean;
  };
}

export function pace(
  weight: readonly DayPoint[],
  today: string,
  goal: { weightKg: number; byDate: string }
): Pace | null {
  if (weight.length === 0) return null;
  const now = weight[weight.length - 1].value;
  const sm = (offset: number) => smoothedOn(weight, addDays(today, offset)) as number;
  const rate = ((sm(-33) - sm(-3)) / 30) * 7;
  const toGo = now - goal.weightKg;
  const daysTo = Math.max(1, daysBetween(today, goal.byDate));
  const needed = toGo / (daysTo / 7);
  const arrivalDays = rate > 0.02 && toGo > 0 ? toGo / (rate / 7) : Infinity;
  const finite = Number.isFinite(arrivalDays);
  const span = Math.max(daysTo, Math.min(finite ? arrivalDays : daysTo, daysTo * 1.6)) * 1.06;
  const PX = (d: number) => 16 + Math.min(1, d / span) * 288;
  const PY = (w: number) => 14 + Math.max(0, Math.min(1, (now - w) / (toGo || 1))) * 60;
  const arrivalVisible = finite && arrivalDays <= span;
  const arrivalX = arrivalVisible ? PX(arrivalDays) : 304;
  const endWeight = now - (rate * span) / 7;
  const arrivalY = arrivalVisible ? 74 : PY(endWeight);
  const arrivalDay = finite ? addDays(today, Math.round(arrivalDays)) : null;
  const daysEarly = finite ? daysTo - Math.round(arrivalDays) : null;
  const byLabel = dayLabel(goal.byDate);

  let sentence: string;
  if (toGo <= 0) {
    sentence = `You’re already at or under ${goal.weightKg} kg. Hold it, or set a new line.`;
  } else if (!finite) {
    sentence = `Weight isn’t moving at the moment, so there is no arrival date yet. The target needs ${needed.toFixed(2)} kg a week from here.`;
  } else {
    const early = daysEarly as number;
    sentence =
      `You need ${needed.toFixed(2)} kg a week to make ${goal.weightKg} kg by ${byLabel}. ` +
      `On your 30-day pace of ${rate.toFixed(2)} you arrive around ${dayLabel(arrivalDay as string)} — ` +
      `${Math.abs(early)} days ${early >= 0 ? "early" : "late"}.`;
  }

  return {
    toGo, daysTo, needed, rate, arrivalDays, arrivalDay, daysEarly, sentence,
    chart: {
      neededPath: `M16,14 L${PX(daysTo).toFixed(1)},74`,
      onPath: arrivalVisible
        ? `M16,14 L${arrivalX.toFixed(1)},74 L304,74`
        : `M16,14 L304,${arrivalY.toFixed(1)}`,
      goalX: +PX(daysTo).toFixed(1),
      arrivalX: +arrivalX.toFixed(1),
      arrivalY: +arrivalY.toFixed(1),
      arrivalVisible,
    },
  };
}

/** Progress from the fixed start to the weight target, 0–100. */
export function goalProgress(nowKg: number, goalKg: number, startKg: number = BODY_START.weightKg): number {
  if (startKg === goalKg) return 100;
  return Math.max(0, Math.min(100, ((startKg - nowKg) / (startKg - goalKg)) * 100));
}

/** Spec §2: what body fat would read at the target weight with today's lean
 *  mass — and the note when that disagrees with the fat target by > 1 pt. */
export function goalsNote(goal: { weightKg: number; bodyFatPct: number }, fatFreeKg: number | null): string | null {
  if (fatFreeKg == null) return null;
  const bfAtGoal = ((goal.weightKg - fatFreeKg) / goal.weightKg) * 100;
  return bfAtGoal < goal.bodyFatPct - 1
    ? `At ${goal.weightKg} kg with today’s lean mass you’d read about ${bfAtGoal.toFixed(0)}% fat. The two targets meet somewhere between; Pitaya will say which arrives first.`
    : "The two targets agree at today’s lean mass.";
}

// ——— body-type matrix (Spec §5) ————————————————————————————————————————————

// Top-left reads SOLID, as the DC draws it. The spec's prose calls that cell
// "HEAVY · LEAN", which is too wide for the 55px column and runs into the BMI
// axis label; the DC is the behaviour truth, and its word fits.
const CELL_NAMES = [
  ["SOLID", "BUILT", "CARRYING FAT"],
  ["DENSE", "ATHLETIC", "OVER-FAT"],
  ["VERY LEAN", "FIT", "LIGHT · SOFT"],
] as const;

export const matrixX = (bf: number) => 36 + ((Math.max(5, Math.min(40, bf)) - 5) / 35) * 274;
export const matrixY = (bmi: number) => 200 - ((Math.max(18.5, Math.min(40, bmi)) - 18.5) / 21.5) * 190;

export interface MatrixView {
  cell: { row: number; col: number; name: string; x: number; y: number; w: number; h: number };
  captions: { text: string; x: number; y: number; current: boolean }[];
  now: { x: number; y: number; bmi: number; bf: number };
  trail: { x: number; y: number; label: string; opacity: number }[];
  polyline: string;
  length: number;
}

/** One point per calendar month (mean BMI × mean body fat), newest = now. */
export function monthlyTrail(bmi: readonly DayPoint[], fat: readonly DayPoint[]): { month: string; bmi: number; bf: number }[] {
  const byMonth = new Map<string, { b: number[]; f: number[] }>();
  const bucket = (day: string) => {
    const k = day.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, { b: [], f: [] });
    return byMonth.get(k)!;
  };
  for (const p of bmi) bucket(p.day).b.push(p.value);
  for (const p of fat) bucket(p.day).f.push(p.value);
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  return [...byMonth.entries()]
    .filter(([, v]) => v.b.length > 0 && v.f.length > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({ month, bmi: mean(v.b), bf: mean(v.f) }));
}

export function bodyTypeMatrix(
  current: { bmi: number; bf: number },
  trail: readonly { month: string; bmi: number; bf: number }[]
): MatrixView {
  const cols = [36, 90.8, 153.4, 310]; // BF 5 · 12 · 20 · 40
  const rows = [10, 96.4, 139.5, 200]; // BMI 40 · 30 · 25 · 18.5
  const col = current.bf < 12 ? 0 : current.bf <= 20 ? 1 : 2;
  const row = current.bmi >= 30 ? 0 : current.bmi >= 25 ? 1 : 2;
  const captions = CELL_NAMES.flatMap((names, r) =>
    names.map((text, c) => ({
      text,
      x: cols[c + 1] - 5,
      y: rows[r] + 11,
      current: r === row && c === col,
    }))
  );
  const pts = [...trail.map((t) => ({ ...t })), { month: "now", bmi: current.bmi, bf: current.bf }].map((p) => ({
    ...p,
    x: matrixX(p.bf),
    y: matrixY(p.bmi),
  }));
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);

  // A label for every month would pile up where he has been steady; keep one
  // only when its dot sits clear of the last labelled one and of "now".
  const history = pts.slice(0, -1);
  const nowPt = pts[pts.length - 1];
  let lastLabelled: { x: number; y: number } | null = null;
  const trailOut = history.map((p, i) => {
    const clear =
      (lastLabelled === null || Math.hypot(p.x - lastLabelled.x, p.y - lastLabelled.y) >= 22) &&
      Math.hypot(p.x - nowPt.x, p.y - nowPt.y) >= 16;
    const label = i > 0 && clear ? MON[Number(p.month.slice(5, 7)) - 1].toUpperCase() : "";
    if (label) lastLabelled = p;
    return {
      x: +p.x.toFixed(1),
      y: +p.y.toFixed(1),
      label,
      opacity: +Math.min(0.85, 0.35 + (i * 0.5) / Math.max(1, history.length - 1)).toFixed(2),
    };
  });

  return {
    cell: {
      row, col, name: CELL_NAMES[row][col],
      x: cols[col], y: rows[row], w: cols[col + 1] - cols[col], h: rows[row + 1] - rows[row],
    },
    captions,
    now: { x: +nowPt.x.toFixed(1), y: +nowPt.y.toFixed(1), bmi: current.bmi, bf: current.bf },
    trail: trailOut,
    polyline: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    length: Math.round(length),
  };
}

/** "Athletic" from "ATHLETIC", "Heavy · lean" from "HEAVY · LEAN". */
export const cellTitle = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();

// ——— body map (Spec §4) ————————————————————————————————————————————————————

export type SegmentKey = "armLeft" | "armRight" | "trunk" | "legLeft" | "legRight";
export interface SegmentReading {
  muscleKg: number | null; fatKg: number | null;
  /** Percent of the scale's standard for this segment. */
  musclePct: number | null; fatPct: number | null;
}
export type Segments = Record<SegmentKey, SegmentReading>;

/** SVG group id for each BIA segment, and the stagger order from the spec:
 *  right arm → left arm → trunk → right leg → left leg. */
export const SEGMENT_GROUPS: Record<SegmentKey, { id: string; delay: number; label: string }> = {
  armRight: { id: "arm-right", delay: 0, label: "Right arm" },
  armLeft: { id: "arm-left", delay: 0.05, label: "Left arm" },
  trunk: { id: "trunk", delay: 0.1, label: "Trunk" },
  legRight: { id: "leg-right", delay: 0.15, label: "Right leg" },
  legLeft: { id: "leg-left", delay: 0.2, label: "Left leg" },
};

export function segmentOpacity(mode: "muscle" | "fat", pct: number | null): number {
  if (pct == null) return 1;
  return mode === "muscle"
    ? Math.max(0.4, Math.min(0.95, 0.5 + (pct - 100) / 45))
    : Math.max(0.3, Math.min(0.95, 0.32 + (pct - 50) / 100));
}

export interface Balance {
  /** Dot offset from centre in px: 1% imbalance = 12px, left of subject = +. */
  offsetPx: number;
  text: string;
  leftShare: number;
}
export function balance(left: number, right: number): Balance {
  const share = left / (left + right);
  return {
    offsetPx: +((share - 0.5) * 100 * 12).toFixed(1),
    text: `L ${(share * 100).toFixed(1)} · R ${((1 - share) * 100).toFixed(1)}`,
    leftShare: share,
  };
}

/** Green "Balanced · within 1%" when both pairs are; otherwise the larger
 *  imbalance in grey. Never a warning. */
export function balanceVerdict(arms: Balance | null, legs: Balance | null): { text: string; balanced: boolean } | null {
  const pairs = [
    arms && { name: "arm", b: arms },
    legs && { name: "leg", b: legs },
  ].filter((p): p is { name: string; b: Balance } => Boolean(p));
  if (pairs.length === 0) return null;
  const off = (b: Balance) => Math.abs(b.leftShare - 0.5) * 200; // % difference between sides
  if (pairs.every((p) => off(p.b) <= 1)) return { text: "Balanced · within 1%", balanced: true };
  const worst = pairs.sort((a, b) => off(b.b) - off(a.b))[0];
  const side = worst.b.leftShare > 0.5 ? "Left" : "Right";
  return { text: `${side} ${worst.name} +${off(worst.b).toFixed(1)}%`, balanced: false };
}

/** "arm-left-forearm-flexors" → { segment, name: "Left forearm flexors" }. */
export function describeMuscle(id: string): { segment: SegmentKey; name: string } | null {
  const sides: [string, SegmentKey, string][] = [
    ["arm-left-", "armLeft", "Left"], ["arm-right-", "armRight", "Right"],
    ["leg-left-", "legLeft", "Left"], ["leg-right-", "legRight", "Right"],
  ];
  for (const [prefix, segment, side] of sides) {
    if (id.startsWith(prefix)) {
      return { segment, name: `${side} ${id.slice(prefix.length).replace(/-/g, " ")}` };
    }
  }
  if (id.startsWith("trunk-")) {
    const rest = id.slice(6);
    const m = rest.match(/^(.*)-(left|right)$/);
    const words = (m ? m[1] : rest).replace(/-/g, " ");
    return { segment: "trunk", name: m ? `${m[2] === "left" ? "Left" : "Right"} ${words}` : words };
  }
  return null;
}

// ——— tape (Spec §7) ————————————————————————————————————————————————————————

export interface TapeRow {
  key: TapeSite;
  label: string;
  valueText: string;
  deltaText: string;
  good: boolean;
  absDelta: number;
  lastDay: string;
  when: string;
  spark: string;
  sparkX: string;
  sparkY: string;
}

const TAPE_GOOD_DOWN = new Set<TapeSite>(["waist", "hips", "neck"]);

/** A jump of more than a fifth between two consecutive tapes is a changed
 *  measuring method, not a changed body — his shoulders read 118.5 cm around
 *  and then 50.9 cm across. Same threshold as lib/body-measurements.ts. */
const IMPLAUSIBLE_TAPE_STEP = 0.2;

export function buildTapeRow(site: (typeof TAPE_SITES)[number], points: readonly DayPoint[], today: string): TapeRow | null {
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const vals = points.map((p) => p.value);
  const mn = Math.min(...vals);
  const span = Math.max(...vals) - mn || 1;
  const px = (i: number) => (2 + i * (56 / Math.max(1, points.length - 1))).toFixed(1);
  const py = (v: number) => (3 + (1 - (v - mn) / span) * 14).toFixed(1);
  const d = last.value - first.value;
  const methodChanged = points.some(
    (p, i) => i > 0 && Math.abs(p.value - points[i - 1].value) / points[i - 1].value > IMPLAUSIBLE_TAPE_STEP
  );
  const noDelta = points.length < 2 || Math.abs(d) < 0.05 || methodChanged;
  return {
    key: site.key,
    label: site.label,
    valueText: last.value.toFixed(1),
    deltaText: noDelta ? "—" : signed(d, Math.abs(d).toFixed(1)),
    good: !noDelta && d < 0 && TAPE_GOOD_DOWN.has(site.key),
    absDelta: noDelta ? 0 : Math.abs(d),
    lastDay: last.day,
    when: last.day === today ? "today" : dayLabel(last.day),
    spark: points.map((p, i) => `${px(i)},${py(p.value)}`).join(" "),
    sparkX: px(points.length - 1),
    sparkY: py(last.value),
  };
}

export const TAPE_SORTS = ["Site order", "Most changed", "Oldest tape"] as const;
export function sortTapeRows(rows: readonly TapeRow[], mode: number): TapeRow[] {
  const out = [...rows];
  if (mode === 1) out.sort((a, b) => b.absDelta - a.absDelta);
  else if (mode === 2) out.sort((a, b) => (a.lastDay < b.lastDay ? -1 : a.lastDay > b.lastDay ? 1 : 0));
  return out;
}

/** A tape reading is 10–200 cm, exclusive — the keypad's rule. */
export const validTape = (cm: number) => Number.isFinite(cm) && cm > 10 && cm < 200;

// Site words he might say, English and Spanish — he dictates in both.
const SITE_WORDS: [TapeSite, string][] = [
  ["forearms", "forearms?|antebrazos?"],
  ["shoulders", "shoulders?|hombros?"],
  ["waist", "waist|belly|cintura"],
  ["hips", "hips?|caderas?"],
  ["chest", "chest|pecho"],
  ["neck", "neck|cuello"],
  ["arms", "arms?|biceps?|bíceps|brazos?"],
  ["legs", "legs?|thighs?|piernas?|muslos?"],
  ["calves", "calf|calves|pantorrillas?|gemelos?"],
];

export interface ParsedTape {
  site: TapeSite;
  value: number;
}

/**
 * "waist 86.5 and hips 96" → two readings. A site word followed (within a few
 * filler words) by a number with an optional single decimal; "and" and commas
 * between sites are just separators. Out-of-range numbers are dropped rather
 * than guessed at. A site said twice keeps the last value.
 */
export function parseTapeUtterance(text: string): ParsedTape[] {
  const cleaned = text.toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
  const alternation = SITE_WORDS.map(([site, words]) => `(?<${site}>${words})`).join("|");
  const pattern = new RegExp(`\\b(?:${alternation})\\b[^\\d]{0,24}?(\\d{1,3}(?:\\.\\d+)?)`, "gu");
  const found = new Map<TapeSite, number>();
  for (const match of cleaned.matchAll(pattern)) {
    const site = SITE_WORDS.map(([s]) => s).find((s) => match.groups?.[s]);
    const value = Math.round(parseFloat(match[match.length - 1]) * 10) / 10;
    if (site && validTape(value)) {
      found.delete(site);
      found.set(site, value);
    }
  }
  return [...found.entries()].map(([site, value]) => ({ site, value }));
}

/** Keypad rule from the DC: max 5 chars, one decimal place, no leading dot. */
export function keypadPress(current: string, key: string): string {
  if (key === "⌫") return current.slice(0, -1);
  if (key === ".") return !current.includes(".") && current.length ? current + "." : current;
  if (current.length >= 5) return current;
  if (current.includes(".") && current.split(".")[1].length >= 1) return current;
  return current + key;
}

// ——— milestones (Spec §8) ——————————————————————————————————————————————————

export interface Milestone {
  day: string;
  title: string;
  note?: string;
  weightKg: number | null;
  kind: "auto" | "logged";
}

/**
 * The automatic entries: started, first 10 kg, under 100, 30 kg gone, BMI
 * under 30 and 27, body fat under 15%, and today. Each is dated to the first
 * reading that crossed the line.
 */
export function autoMilestones(input: {
  weight: readonly DayPoint[];
  bmi: readonly DayPoint[];
  fat: readonly DayPoint[];
  today: string;
}): Milestone[] {
  const start = BODY_START;
  const out: Milestone[] = [{ day: start.day, title: "Started", weightKg: start.weightKg, kind: "auto" }];
  const firstAtOrBelow = (points: readonly DayPoint[], line: number, strict = false) =>
    points.find((p) => dayNum(p.day) >= dayNum(start.day) && (strict ? p.value < line : p.value <= line));
  const weightOn = (day: string) => valueOn(input.weight, day);

  const crossings: [string, DayPoint | undefined][] = [
    ["First 10 kg gone", firstAtOrBelow(input.weight, start.weightKg - 10)],
    ["Under 100", firstAtOrBelow(input.weight, 100, true)],
    ["30 kg gone", firstAtOrBelow(input.weight, start.weightKg - 30)],
    ["BMI under 30", firstAtOrBelow(input.bmi, 30, true)],
    ["BMI under 27", firstAtOrBelow(input.bmi, 27, true)],
    ["Body fat under 15%", firstAtOrBelow(input.fat, 15, true)],
  ];
  for (const [title, hit] of crossings) {
    if (hit) out.push({ day: hit.day, title, weightKg: weightOn(hit.day), kind: "auto" });
  }

  const latest = input.weight[input.weight.length - 1];
  if (latest) {
    const lost = start.weightKg - latest.value;
    const weeks = Math.round(daysBetween(start.day, input.today) / 7);
    out.push({
      day: input.today,
      title: "Today",
      note: `${signed(-lost, Math.abs(lost).toFixed(1))} kg · ${weeks} weeks`,
      weightKg: latest.value,
      kind: "auto",
    });
  }
  return out;
}

/** Auto and logged entries on one timeline, oldest first; "Today" stays last. */
export function mergeMilestones(auto: readonly Milestone[], logged: readonly Milestone[]): Milestone[] {
  const today = auto.find((m) => m.title === "Today");
  const rest = [...auto.filter((m) => m !== today), ...logged].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0
  );
  return today ? [...rest, today] : rest;
}

// ——— small text helpers the cards share ————————————————————————————————————

/**
 * The sentence owed wherever an estimate is drawn across a change of scale.
 * Null when the points sit entirely on one side of it. Weight and tape are
 * measured, not estimated, and never need it.
 */
export function scaleChangeNote(
  key: MetricKey,
  points: readonly DayPoint[],
  changedOn: string | null
): string | null {
  const spec = COMP.find((c) => c.key === key);
  if (!changedOn || !spec?.estimate || points.length < 2) return null;
  const spans = points[0].day < changedOn && points[points.length - 1].day >= changedOn;
  return spans
    ? `Readings before ${dayLabel(changedOn)} are from your previous scale. The step there is the two scales disagreeing, not your body.`
    : null;
}

/** "Synced 12 min ago" from how long ago the newest reading arrived. */
export function agoText(fromMs: number, nowMs: number): string {
  const min = Math.max(0, Math.round((nowMs - fromMs) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Where a reading came from, in the two lines the weigh-in card shows. */
export function sourceLines(row: { source: string | null; externalId?: string | null; fieldSources?: Record<string, string> }): { device: string; via: string } {
  const sources = new Set(Object.values(row.fieldSources ?? {}));
  if (row.source) sources.add(row.source);
  const fromRenpho =
    sources.has("renpho_api") || sources.has("renpho_report") || Boolean(row.externalId?.startsWith("renpho:"));
  const via: Record<string, string> = {
    apple_health: "via Apple Health",
    renpho_api: "via RENPHO cloud",
    renpho_report: "from its report",
    mcp: "logged through Claude",
    manual: "typed in",
    vesync: "VeSync import",
    import: "imported",
  };
  return {
    device: fromRenpho ? "RENPHO scale" : row.source === "vesync" ? "Etekcity scale" : "Scale",
    via: via[row.source ?? ""] ?? "source unknown",
  };
}
