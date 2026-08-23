/**
 * A pen tracer for the real device.
 *
 * Four rounds of Pencil fixes were verified in a desktop browser and all four failed on the
 * iPad, because the thing that decides whether a pencil touch ever becomes a pointer event
 * lives in UIKit, not in the page. This records what actually arrives, so the next question
 * is answered with a measurement instead of a hypothesis.
 *
 * Off unless the URL carries ?pendebug=1 — zero cost otherwise.
 */

export type PenEventKind = "down" | "move" | "up" | "cancel" | "lostcapture";

export interface PenTraceRow {
  t: number;
  kind: PenEventKind;
  pointerType: string;
  pointerId: number;
  /** ms since the previous contact ended — the "lag between letters" number */
  sinceLastUp: number | null;
  /** ms from this contact's down to its first move — a delayed touch shows up here */
  downToFirstMove: number | null;
  coalesced: number;
  pressure: number;
  /** why the engine dropped this contact, if it did */
  dropped: string | null;
  points: number;
}

const MAX = 400;

class PenTrace {
  enabled = false;
  rows: PenTraceRow[] = [];
  counts = { down: 0, up: 0, cancel: 0, lostcapture: 0, committed: 0, dropped: 0 };
  private lastUpAt: number | null = null;
  private downAt = new Map<number, number>();
  private firstMoveSeen = new Set<number>();
  private listeners = new Set<() => void>();

  init() {
    if (typeof window === "undefined") return;
    this.enabled = new URLSearchParams(window.location.search).get("pendebug") === "1";
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit() { for (const fn of this.listeners) fn(); }

  record(kind: PenEventKind, e: { pointerType: string; pointerId: number; pressure?: number; timeStamp?: number }, extra?: { coalesced?: number; dropped?: string | null; points?: number }) {
    if (!this.enabled) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let sinceLastUp: number | null = null;
    let downToFirstMove: number | null = null;

    if (kind === "down") {
      sinceLastUp = this.lastUpAt === null ? null : Math.round(now - this.lastUpAt);
      this.downAt.set(e.pointerId, now);
      this.firstMoveSeen.delete(e.pointerId);
      this.counts.down++;
    } else if (kind === "move") {
      if (!this.firstMoveSeen.has(e.pointerId)) {
        this.firstMoveSeen.add(e.pointerId);
        const d = this.downAt.get(e.pointerId);
        downToFirstMove = d === undefined ? null : Math.round(now - d);
      } else {
        return; // only the first move of each contact is interesting
      }
    } else if (kind === "up") {
      this.lastUpAt = now;
      this.downAt.delete(e.pointerId);
      this.counts.up++;
    } else if (kind === "cancel") {
      this.lastUpAt = now;
      this.downAt.delete(e.pointerId);
      this.counts.cancel++;
    } else if (kind === "lostcapture") {
      this.counts.lostcapture++;
    }

    if (extra?.dropped) this.counts.dropped++;

    this.rows.push({
      t: Math.round(now),
      kind,
      pointerType: e.pointerType,
      pointerId: e.pointerId,
      sinceLastUp,
      downToFirstMove,
      coalesced: extra?.coalesced ?? 0,
      pressure: Math.round((e.pressure ?? 0) * 100) / 100,
      dropped: extra?.dropped ?? null,
      points: extra?.points ?? 0,
    });
    if (this.rows.length > MAX) this.rows.splice(0, this.rows.length - MAX);
    this.emit();
  }

  committed() {
    if (!this.enabled) return;
    this.counts.committed++;
    this.emit();
  }

  reset() {
    this.rows = [];
    this.counts = { down: 0, up: 0, cancel: 0, lostcapture: 0, committed: 0, dropped: 0 };
    this.lastUpAt = null;
    this.emit();
  }

  /** the one line that answers "is something stealing my pen?" */
  verdict(): string {
    const c = this.counts;
    if (c.down === 0) return "no pen contacts recorded yet";
    const penDowns = this.rows.filter((r) => r.kind === "down" && r.pointerType === "pen").length;
    const cancels = this.rows.filter((r) => r.kind === "cancel" && r.pointerType === "pen").length;
    const delays = this.rows.map((r) => r.downToFirstMove).filter((d): d is number => d !== null);
    const worstDelay = delays.length ? Math.max(...delays) : 0;
    const parts = [`${penDowns} pen contacts`, `${cancels} cancelled`, `${c.committed} strokes kept`];
    if (c.dropped) parts.push(`${c.dropped} DROPPED`);
    parts.push(`worst down→move ${worstDelay}ms`);
    return parts.join(" · ");
  }
}

export const penTrace = new PenTrace();
