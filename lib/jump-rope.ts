// Jump rope as a first-class workout type (2026-10-05). The wrist runs the
// interval clock and reports WHEN each work interval happened; everything
// here is the arithmetic the phone draws from that record plus the HR
// stream — per-round peaks and troughs, drift, work/rest averages, the
// protocol grouping and the PR candidates. Pure and client-safe: no Prisma.
//
// The record lives at workout_logs.metricsData.intervals. `marks` are on the
// same clock as metricsData.timeStream (elapsed seconds, pauses excluded),
// which is what lets the chart shade a round exactly where its HR sits.

export const JUMP_ROPE_TYPE = "jump_rope";
export const JUMP_ROPE_EXERCISE_ID = "jump-rope";
export const JUMP_ROPE_NAME = "Jump Rope";

/** Stored HR points for an interval session — ~1 per 3–5 s for an hour. */
export const INTERVAL_STREAM_POINTS = 600;

export interface IntervalJumps {
  total?: number;
  perRound?: number[];
  /** "manual" = he counted. "estimated" only after the wrist counter is validated. */
  source: "manual" | "estimated";
}

/** The wrist counter's own number, kept apart from `jumps` while it is on trial. */
export interface IntervalJumpEstimate {
  total: number;
  perRound?: number[];
  algo: string;
}

export interface IntervalRecord {
  mode: "interval" | "continuous";
  workSeconds?: number;
  restSeconds?: number;
  plannedRounds?: number | null;
  roundsCompleted: number;
  /** Work actually done, summed over the marks (a cut-short last round counts for what it was). */
  jumpSeconds: number;
  restSecondsTotal: number;
  /** [start, end] of every work interval in elapsed seconds. Absent on declared sessions. */
  marks?: [number, number][];
  /** "measured" by the wrist engine; "declared" when the protocol was typed in afterwards. */
  source: "measured" | "declared";
  jumps?: IntervalJumps;
  jumpsEstimated?: IntervalJumpEstimate;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function readMarks(v: unknown): [number, number][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: [number, number][] = [];
  for (const m of v) {
    if (!Array.isArray(m) || m.length < 2) continue;
    const a = num(m[0]);
    const b = num(m[1]);
    if (a == null || b == null || b <= a || a < 0) continue;
    out.push([a, b]);
  }
  out.sort((x, y) => x[0] - y[0]);
  return out.length ? out : undefined;
}

function readCounts(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((x) => num(x)).filter((x): x is number => x != null && x >= 0);
  return out.length === v.length && out.length > 0 ? out.map(Math.round) : undefined;
}

/** Tolerant read of metricsData.intervals — bad shapes are null, never a throw. */
export function readIntervals(metricsData: unknown): IntervalRecord | null {
  if (!metricsData || typeof metricsData !== "object") return null;
  const raw = (metricsData as { intervals?: unknown }).intervals;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mode = r.mode === "continuous" ? "continuous" : r.mode === "interval" ? "interval" : null;
  if (!mode) return null;

  const marks = readMarks(r.marks);
  const fromMarks = marks ? marks.reduce((s, [a, b]) => s + (b - a), 0) : null;
  const jumpSeconds = Math.round(num(r.jumpSeconds) ?? fromMarks ?? 0);
  const rounds = Math.max(0, Math.round(num(r.roundsCompleted) ?? 0));

  const record: IntervalRecord = {
    mode,
    roundsCompleted: rounds,
    jumpSeconds,
    restSecondsTotal: Math.max(0, Math.round(num(r.restSecondsTotal) ?? 0)),
    source: r.source === "declared" ? "declared" : "measured",
  };
  const work = num(r.workSeconds);
  const rest = num(r.restSeconds);
  if (work != null && work > 0) record.workSeconds = Math.round(work);
  if (rest != null && rest >= 0) record.restSeconds = Math.round(rest);
  const planned = num(r.plannedRounds);
  if (planned != null && planned > 0) record.plannedRounds = Math.round(planned);
  if (marks) record.marks = marks;

  if (r.jumps && typeof r.jumps === "object") {
    const j = r.jumps as Record<string, unknown>;
    const total = num(j.total);
    const perRound = readCounts(j.perRound);
    if ((total != null && total > 0) || perRound) {
      record.jumps = {
        source: j.source === "estimated" ? "estimated" : "manual",
        ...(total != null && total > 0 ? { total: Math.round(total) } : {}),
        ...(perRound ? { perRound } : {}),
      };
    }
  }
  if (r.jumpsEstimated && typeof r.jumpsEstimated === "object") {
    const j = r.jumpsEstimated as Record<string, unknown>;
    const total = num(j.total);
    if (total != null && total >= 0) {
      const perRound = readCounts(j.perRound);
      record.jumpsEstimated = {
        total: Math.round(total),
        algo: typeof j.algo === "string" ? j.algo : "unknown",
        ...(perRound ? { perRound } : {}),
      };
    }
  }
  return record;
}

/** Sessions group by this — "30/30", "45/15", or "continuous". */
export function protocolKey(rec: Pick<IntervalRecord, "mode" | "workSeconds" | "restSeconds">): string {
  if (rec.mode === "continuous" || !rec.workSeconds) return "continuous";
  return `${rec.workSeconds}/${rec.restSeconds ?? 0}`;
}

/** Total jumps he can stand behind: his own count, or a validated estimate. */
export function jumpTotal(rec: IntervalRecord): number | null {
  const j = rec.jumps;
  if (!j) return null;
  if (j.total != null) return j.total;
  return j.perRound ? j.perRound.reduce((a, b) => a + b, 0) : null;
}

/**
 * The exercise row a jump rope session carries — his own shape from the
 * sessions he fixed by hand (sets = rounds, seconds = work per round), plus
 * the canonical id.
 */
export function jumpRopeExerciseRow(rec: IntervalRecord) {
  const continuous = rec.mode === "continuous" || !rec.workSeconds;
  return {
    name: JUMP_ROPE_NAME,
    exercise: JUMP_ROPE_EXERCISE_ID,
    sets: continuous ? 1 : Math.max(rec.roundsCompleted, 1),
    seconds: continuous ? Math.max(rec.jumpSeconds, 1) : (rec.workSeconds as number),
  };
}

// ── HR series helpers ───────────────────────────────────────────────────
// The series is treated as piecewise-linear between samples, so an interval
// that falls between two samples still gets an honest value instead of
// nothing. Stored resolution can be as coarse as ~9 s on old sessions.

interface Series {
  t: number[];
  hr: number[];
}

function cleanSeries(hr: unknown, time: unknown): Series | null {
  if (!Array.isArray(hr) || !Array.isArray(time)) return null;
  const n = Math.min(hr.length, time.length);
  const t: number[] = [];
  const h: number[] = [];
  for (let i = 0; i < n; i++) {
    const ti = num(time[i]);
    const hi = num(hr[i]);
    if (ti == null || hi == null || hi <= 0) continue;
    if (t.length && ti <= t[t.length - 1]) continue;
    t.push(ti);
    h.push(hi);
  }
  return t.length >= 2 ? { t, hr: h } : null;
}

function valueAt(s: Series, x: number): number {
  if (x <= s.t[0]) return s.hr[0];
  const last = s.t.length - 1;
  if (x >= s.t[last]) return s.hr[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - s.t[lo]) / (s.t[hi] - s.t[lo]);
  return s.hr[lo] + f * (s.hr[hi] - s.hr[lo]);
}

/** Knots of the series inside [a, b], with interpolated values at both ends. */
function knots(s: Series, a: number, b: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[a, valueAt(s, a)]];
  for (let i = 0; i < s.t.length; i++) {
    if (s.t[i] > a && s.t[i] < b) out.push([s.t[i], s.hr[i]]);
  }
  out.push([b, valueAt(s, b)]);
  return out;
}

function covered(s: Series, a: number, b: number): boolean {
  return b > a && a < s.t[s.t.length - 1] && b > s.t[0];
}

function meanOver(s: Series, a: number, b: number): number | null {
  if (!covered(s, a, b)) return null;
  const k = knots(s, a, b);
  let area = 0;
  for (let i = 0; i < k.length - 1; i++) {
    area += ((k[i][1] + k[i + 1][1]) / 2) * (k[i + 1][0] - k[i][0]);
  }
  return area / (b - a);
}

function maxOver(s: Series, a: number, b: number): number | null {
  if (!covered(s, a, b)) return null;
  return Math.max(...knots(s, a, b).map((p) => p[1]));
}

function minOver(s: Series, a: number, b: number): number | null {
  if (!covered(s, a, b)) return null;
  return Math.min(...knots(s, a, b).map((p) => p[1]));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const round0 = (v: number | null) => (v == null ? null : Math.round(v));

// HR keeps climbing for a few seconds after the rope stops, and keeps
// falling for a few seconds after it starts again — so a round's peak is
// looked for slightly past the end of its work, and its trough slightly
// into the next round. Both windows are capped so they never reach the
// middle of a neighbour.
const PEAK_LAG_SECONDS = 15;
const TROUGH_LAG_SECONDS = 10;

export interface RoundStat {
  round: number;
  start: number;
  end: number;
  /** Start of the next work interval, or null after the last round. */
  nextStart: number | null;
  peak: number | null;
  trough: number | null;
  /** Peak minus trough — how far HR came down in this rest. */
  drop: number | null;
  avgWork: number | null;
  avgRest: number | null;
}

export interface IntervalAnalysis {
  protocol: string;
  mode: IntervalRecord["mode"];
  source: IntervalRecord["source"];
  workSeconds: number | null;
  restSeconds: number | null;
  roundsCompleted: number;
  plannedRounds: number | null;
  jumpSeconds: number;
  restSecondsTotal: number;
  sessionSeconds: number;
  /** Share of the session spent jumping, 0–100. */
  jumpPct: number | null;
  kcalPerJumpMinute: number | null;
  avgWorkHr: number | null;
  avgRestHr: number | null;
  rounds: RoundStat[];
  /** Mean work-interval HR, first third of the session vs the last third. */
  drift: { first: number; last: number; delta: number; pct: number } | null;
  /** Are the troughs climbing — i.e. is he recovering less each round? */
  troughTrend: { first: number; last: number; perRound: number; rising: boolean } | null;
  avgDrop: number | null;
  longestJumpSeconds: number;
  /** Median gap between HR samples. Above ~8 s the per-round numbers are coarse. */
  hrResolutionSeconds: number | null;
  jumps: number | null;
  jumpsSource: IntervalJumps["source"] | null;
  jumpsPerMinute: number | null;
  jumpsEstimated: number | null;
}

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let numr = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    numr += (i - mx) * (values[i] - my);
    den += (i - mx) * (i - mx);
  }
  return den ? numr / den : 0;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** First third and last third of a list (at least one element each). */
function thirds<T>(items: T[]): [T[], T[]] {
  const k = Math.max(1, Math.floor(items.length / 3));
  return [items.slice(0, k), items.slice(items.length - k)];
}

export function analyzeIntervals(input: {
  intervals: IntervalRecord;
  hrStream?: unknown;
  timeStream?: unknown;
  durationSeconds: number;
  caloriesBurned?: number | null;
}): IntervalAnalysis {
  const rec = input.intervals;
  const series = cleanSeries(input.hrStream, input.timeStream);
  const marks = rec.marks ?? [];
  const sessionEnd = Math.max(
    input.durationSeconds,
    marks.length ? marks[marks.length - 1][1] : 0
  );

  const rounds: RoundStat[] = marks.map(([start, end], i) => {
    const nextStart = i + 1 < marks.length ? marks[i + 1][0] : null;
    const nextEnd = i + 1 < marks.length ? marks[i + 1][1] : null;
    // After the last round the "rest" is whatever was recorded before End,
    // no longer than one protocol rest.
    const restEnd =
      nextStart ?? Math.min(sessionEnd, end + (rec.restSeconds ?? 0));
    let peak: number | null = null;
    let trough: number | null = null;
    let avgWork: number | null = null;
    let avgRest: number | null = null;
    if (series) {
      const peakTo = Math.min(end + PEAK_LAG_SECONDS, nextStart ?? sessionEnd);
      peak = maxOver(series, start, Math.max(peakTo, end));
      avgWork = meanOver(series, start, end);
      if (restEnd > end) {
        const troughTo =
          nextStart != null
            ? Math.min(nextStart + TROUGH_LAG_SECONDS, nextEnd ?? nextStart)
            : restEnd;
        trough = minOver(series, end, troughTo);
        avgRest = meanOver(series, end, restEnd);
      }
    }
    return {
      round: i + 1,
      start,
      end,
      nextStart,
      peak: round0(peak),
      trough: round0(trough),
      drop: peak != null && trough != null ? Math.round(peak - trough) : null,
      avgWork: round0(avgWork),
      avgRest: round0(avgRest),
    };
  });

  // Session-level work/rest means are time-weighted over the raw windows,
  // not averaged from the rounded per-round numbers.
  let workArea = 0;
  let workTime = 0;
  let restArea = 0;
  let restTime = 0;
  if (series) {
    for (const r of rounds) {
      const w = meanOver(series, r.start, r.end);
      if (w != null) {
        workArea += w * (r.end - r.start);
        workTime += r.end - r.start;
      }
      if (r.nextStart != null && r.nextStart > r.end) {
        const q = meanOver(series, r.end, r.nextStart);
        if (q != null) {
          restArea += q * (r.nextStart - r.end);
          restTime += r.nextStart - r.end;
        }
      }
    }
  }

  let drift: IntervalAnalysis["drift"] = null;
  if (series) {
    let first: number | null = null;
    let last: number | null = null;
    const withWork = rounds.filter((r) => r.avgWork != null);
    if (withWork.length >= 3) {
      const [a, b] = thirds(withWork);
      first = mean(a.map((r) => r.avgWork as number));
      last = mean(b.map((r) => r.avgWork as number));
    } else if (marks.length === 1 && marks[0][1] - marks[0][0] >= 180) {
      // Continuous: the one long interval, split by time.
      const [s, e] = marks[0];
      const third = (e - s) / 3;
      first = meanOver(series, s, s + third);
      last = meanOver(series, e - third, e);
    }
    if (first != null && last != null && first > 0) {
      drift = {
        first: Math.round(first),
        last: Math.round(last),
        delta: Math.round(last - first),
        pct: Math.round(((last - first) / first) * 1000) / 10,
      };
    }
  }

  let troughTrend: IntervalAnalysis["troughTrend"] = null;
  const troughs = rounds
    .filter((r) => r.nextStart != null && r.trough != null)
    .map((r) => r.trough as number);
  if (troughs.length >= 4) {
    const [a, b] = thirds(troughs);
    const first = mean(a);
    const last = mean(b);
    const perRound = slope(troughs);
    troughTrend = {
      first: Math.round(first),
      last: Math.round(last),
      perRound: Math.round(perRound * 100) / 100,
      rising: last - first >= 3 && perRound > 0,
    };
  }

  const drops = rounds.map((r) => r.drop).filter((d): d is number => d != null);
  const gaps: number[] = [];
  if (series) {
    for (let i = 1; i < series.t.length; i++) gaps.push(series.t[i] - series.t[i - 1]);
  }
  const jumps = jumpTotal(rec);
  const jumpMinutes = rec.jumpSeconds / 60;
  const kcal = input.caloriesBurned ?? null;

  return {
    protocol: protocolKey(rec),
    mode: rec.mode,
    source: rec.source,
    workSeconds: rec.workSeconds ?? null,
    restSeconds: rec.restSeconds ?? null,
    roundsCompleted: rec.roundsCompleted,
    plannedRounds: rec.plannedRounds ?? null,
    jumpSeconds: rec.jumpSeconds,
    restSecondsTotal: rec.restSecondsTotal,
    sessionSeconds: Math.round(input.durationSeconds),
    jumpPct:
      input.durationSeconds > 0
        ? Math.min(100, Math.round((rec.jumpSeconds / input.durationSeconds) * 100))
        : null,
    // Calories are the whole session's burn divided by the minutes actually
    // spent jumping — "what a minute of rope costs", rest included in the bill.
    kcalPerJumpMinute:
      kcal != null && kcal > 0 && jumpMinutes > 0 ? round1(kcal / jumpMinutes) : null,
    avgWorkHr: workTime > 0 ? Math.round(workArea / workTime) : null,
    avgRestHr: restTime > 0 ? Math.round(restArea / restTime) : null,
    rounds,
    drift,
    troughTrend,
    avgDrop: drops.length ? Math.round(mean(drops)) : null,
    longestJumpSeconds: marks.length
      ? Math.round(Math.max(...marks.map(([a, b]) => b - a)))
      : rec.mode === "continuous"
        ? rec.jumpSeconds
        : (rec.workSeconds ?? 0),
    hrResolutionSeconds: round1(median(gaps)),
    jumps,
    jumpsSource: jumps != null ? (rec.jumps?.source ?? null) : null,
    jumpsPerMinute: jumps != null && jumpMinutes > 0 ? Math.round(jumps / jumpMinutes) : null,
    jumpsEstimated: rec.jumpsEstimated?.total ?? null,
  };
}

// ── PRs ─────────────────────────────────────────────────────────────────
// Jump rope has no kilograms, so it gets its own record kinds. They share
// the personal_records table with weight/volume (kind is a free string and
// the unique key is (exercise, kind)); the rounds record is per protocol,
// which is why its exercise key carries the protocol.

export type JumpRopePRKind = "rounds" | "duration" | "jumps" | "jumps_round";

export interface JumpRopePRCandidate {
  exercise: string;
  exerciseName: string;
  kind: JumpRopePRKind;
  value: number;
  unit: string;
}

export function jumpRopePRCandidates(metricsData: unknown): JumpRopePRCandidate[] {
  const rec = readIntervals(metricsData);
  if (!rec) return [];
  const out: JumpRopePRCandidate[] = [];

  if (rec.mode === "interval" && rec.workSeconds && rec.roundsCompleted > 0) {
    const key = protocolKey(rec);
    out.push({
      exercise: `${JUMP_ROPE_EXERCISE_ID}@${key.replace("/", "-")}`,
      exerciseName: `${JUMP_ROPE_NAME} · ${key}`,
      kind: "rounds",
      value: rec.roundsCompleted,
      unit: "rounds",
    });
  }

  const longest = rec.marks?.length
    ? Math.max(...rec.marks.map(([a, b]) => b - a))
    : rec.mode === "continuous"
      ? rec.jumpSeconds
      : rec.roundsCompleted > 0
        ? (rec.workSeconds ?? 0)
        : 0;
  if (longest > 0) {
    out.push({
      exercise: JUMP_ROPE_EXERCISE_ID,
      exerciseName: JUMP_ROPE_NAME,
      kind: "duration",
      value: Math.round(longest),
      unit: "s",
    });
  }

  // Jump records come only from a count he can stand behind — his own, or
  // an estimate that has been validated and promoted into `jumps`.
  const total = jumpTotal(rec);
  if (total != null && total > 0) {
    out.push({
      exercise: JUMP_ROPE_EXERCISE_ID,
      exerciseName: JUMP_ROPE_NAME,
      kind: "jumps",
      value: total,
      unit: "jumps",
    });
  }
  const best = rec.jumps?.perRound?.length ? Math.max(...rec.jumps.perRound) : 0;
  if (best > 0) {
    out.push({
      exercise: JUMP_ROPE_EXERCISE_ID,
      exerciseName: JUMP_ROPE_NAME,
      kind: "jumps_round",
      value: best,
      unit: "jumps",
    });
  }
  return out;
}

/** "12 rounds", "4:30", "1,240 jumps" — one formatter so every surface agrees. */
export function formatJumpRopePR(kind: string, value: number): string {
  if (kind === "rounds") return `${Math.round(value)} rounds`;
  if (kind === "duration") return formatClock(value);
  return `${Math.round(value).toLocaleString("en-US")} jumps`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// ── Progression across sessions ─────────────────────────────────────────

export interface ProtocolSession {
  id: string;
  startedAt: string;
  roundsCompleted: number;
  jumpSeconds: number;
  avgWorkHr: number | null;
  avgDrop: number | null;
  jumps: number | null;
}

export interface ProtocolGroup {
  protocol: string;
  sessions: ProtocolSession[];
  bestRounds: number;
  longestJumpSeconds: number;
}

/**
 * Group jump rope sessions by protocol, oldest first inside each group —
 * "all my 30/30 sessions" is the only comparison that means anything.
 */
export function groupByProtocol(
  rows: Array<{
    id: string;
    startedAt: Date | string;
    durationMinutes: number;
    caloriesBurned?: number | null;
    metricsData: unknown;
  }>
): ProtocolGroup[] {
  const groups = new Map<string, ProtocolGroup>();
  const ordered = [...rows].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  for (const row of ordered) {
    const rec = readIntervals(row.metricsData);
    if (!rec) continue;
    const m = row.metricsData as { hrStream?: unknown; timeStream?: unknown };
    const a = analyzeIntervals({
      intervals: rec,
      hrStream: m.hrStream,
      timeStream: m.timeStream,
      durationSeconds: row.durationMinutes * 60,
      caloriesBurned: row.caloriesBurned ?? null,
    });
    const key = a.protocol;
    const group =
      groups.get(key) ?? { protocol: key, sessions: [], bestRounds: 0, longestJumpSeconds: 0 };
    group.sessions.push({
      id: row.id,
      startedAt: new Date(row.startedAt).toISOString(),
      roundsCompleted: a.roundsCompleted,
      jumpSeconds: a.jumpSeconds,
      avgWorkHr: a.avgWorkHr,
      avgDrop: a.avgDrop,
      jumps: a.jumps,
    });
    group.bestRounds = Math.max(group.bestRounds, a.roundsCompleted);
    group.longestJumpSeconds = Math.max(group.longestJumpSeconds, a.longestJumpSeconds);
    groups.set(key, group);
  }
  // Most-used protocol first.
  return [...groups.values()].sort((a, b) => b.sessions.length - a.sessions.length);
}

/** Seconds of actual jumping in a workout row; 0 for anything that is not jump rope. */
export function jumpSecondsOf(row: { workoutType: string; metricsData: unknown }): number {
  if (row.workoutType !== JUMP_ROPE_TYPE) return 0;
  return readIntervals(row.metricsData)?.jumpSeconds ?? 0;
}
