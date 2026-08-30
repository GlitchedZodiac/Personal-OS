"use client";

/**
 * The ink outbox — a durable write-ahead log for everything he draws.
 *
 * WHY THIS EXISTS: on 2026-08-30 Michael lost a paragraph of handwriting. Unsaved work lived
 * only in a `useRef` inside the pane: strokes waited 1.2 s on a debounce, and when a PATCH
 * failed the deltas were put BACK into that same in-memory ref with no retry timer — so an
 * offline stretch followed by the app being killed lost everything buffered, silently.
 *
 * The rule now: a stroke is written to IndexedDB the moment it exists, BEFORE any network
 * attempt, and is deleted from the log only once the server has confirmed it. Anything the
 * log still holds at boot is replayed. The network becomes an optimisation rather than the
 * only copy.
 *
 * Replay is safe to run twice: the server merges `appendStrokes` by id (an append whose id is
 * already present is skipped) and applies `removeStrokeIds` first, so re-sending an entry that
 * did land is a no-op. Entries are replayed one PATCH each, oldest first — deliberately NOT
 * merged, because merging an append of X with a later removal of X would invert their order
 * and resurrect a stroke he erased.
 */

import type { PageObject, Stroke } from "@/lib/ink";

export interface OutboxDelta {
  pageId: string;
  append?: Stroke[];
  remove?: string[];
  /** objects are a whole-array replace, so only the LATEST entry for a page matters */
  objects?: PageObject[];
}
interface OutboxRow extends OutboxDelta {
  seq: number;
  t: number;
}

const DB_NAME = "pitaya-ink";
const STORE = "outbox";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * Ask the browser not to evict this origin's storage. Safari grants it for installed
 * (home-screen) web apps and can otherwise clear IndexedDB after a stretch of not visiting —
 * which would throw away the very log that is holding his unsent handwriting. Best effort:
 * a refusal changes nothing, it just means the log is as evictable as it was before.
 */
let persistAsked = false;
export function keepStorage() {
  if (persistAsked) return;
  persistAsked = true;
  try { void navigator.storage?.persist?.(); } catch { /* not supported — carry on */ }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
        store.createIndex("pageId", "pageId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    // Private browsing, a full disk, or a blocked upgrade all land here. The app keeps working
    // exactly as it did before the outbox existed — never worse.
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let t: IDBTransaction;
      try { t = db.transaction(STORE, mode); } catch { resolve(null); return; }
      const req = run(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    });
  });
}

/** Record a delta durably. Await it before you rely on it having landed. */
export function queueDelta(delta: OutboxDelta): Promise<number | null> {
  if (!delta.append?.length && !delta.remove?.length && !delta.objects) return Promise.resolve(null);
  return tx<number>("readwrite", (s) => s.add({ ...delta, t: Date.now() } as OutboxRow) as IDBRequest<number>);
}

/** Everything still unconfirmed, oldest first. */
export async function listOutbox(pageId?: string): Promise<OutboxRow[]> {
  const rows = (await tx<OutboxRow[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxRow[]>)) ?? [];
  const sorted = rows.sort((a, b) => a.seq - b.seq);
  return pageId ? sorted.filter((r) => r.pageId === pageId) : sorted;
}

export async function deleteSeqs(seqs: number[]): Promise<void> {
  if (!seqs.length) return;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let t: IDBTransaction;
    try { t = db.transaction(STORE, "readwrite"); } catch { resolve(); return; }
    const store = t.objectStore(STORE);
    for (const seq of seqs) store.delete(seq);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  });
}

export interface FlushResult { sent: number; failed: number; remaining: number }

/**
 * Replay the log to the server, oldest first, deleting each entry the server confirms.
 *
 * Stops at the first network failure so ordering is never broken by skipping ahead. A 404 —
 * the page was deleted — drops the entry instead of retrying it forever.
 */
/**
 * Four things trigger a drain — boot, the `online` event, the 20 s heartbeat, and every
 * successful save. Two of them running at once would each read the same rows, PATCH them
 * twice, and race on `deleteSeqs`. Single-flight: a concurrent caller joins the run in
 * progress instead of starting a second one.
 */
let inFlight: Promise<FlushResult> | null = null;

export function flushOutbox(): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = drain().finally(() => { inFlight = null; });
  return inFlight;
}

async function drain(): Promise<FlushResult> {
  const rows = await listOutbox();
  let sent = 0;
  let failed = 0;
  const done: number[] = [];
  for (const row of rows) {
    const body: Record<string, unknown> = {};
    if (row.append?.length) body.appendStrokes = row.append;
    if (row.remove?.length) body.removeStrokeIds = row.remove;
    if (row.objects) body.objects = row.objects;
    try {
      const r = await fetch(`/api/spirit/ink/${row.pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) { done.push(row.seq); sent++; continue; }
      if (r.status === 404 || r.status === 410) { done.push(row.seq); continue; } // the page is gone
      failed++;
      break;
    } catch {
      failed++;
      break; // offline — keep the rest for the next attempt, in order
    }
  }
  await deleteSeqs(done);
  const remaining = (await listOutbox()).length;
  return { sent, failed, remaining };
}

/** Fold the log's unconfirmed deltas over what the server returned, so a recovered page shows his work. */
export function applyOutbox(strokes: Stroke[], objects: PageObject[], rows: OutboxRow[]): { strokes: Stroke[]; objects: PageObject[] } {
  let s = strokes.slice();
  let o = objects;
  for (const row of rows) {
    if (row.remove?.length) { const rm = new Set(row.remove); s = s.filter((x) => !rm.has(x.id)); }
    if (row.append?.length) { const have = new Set(s.map((x) => x.id)); for (const x of row.append) if (!have.has(x.id)) s.push(x); }
    if (row.objects) o = row.objects; // whole-array replace, latest wins
  }
  return { strokes: s, objects: o };
}
