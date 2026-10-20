// Bounded request bodies (audit 2026-10, SEC-024/025). `request.json()`
// buffers whatever arrives. This reads the stream and stops at the cap, so a
// route decides how much it is willing to hold in memory — on Vercel the
// platform's own ~4.5 MB limit applies first; locally and on any other host
// this is the only bound.

export type CappedJson =
  | { ok: true; value: unknown; bytes: number }
  | { ok: false; status: 400 | 413; error: string };

export async function readJsonCapped(request: Request, maxBytes: number): Promise<CappedJson> {
  const tooLarge = { ok: false as const, status: 413 as const, error: `Request body too large (max ${maxBytes} bytes)` };
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;
  if (!request.body) return { ok: false, status: 400, error: "A JSON body is required" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return tooLarge;
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text), bytes: total };
  } catch {
    return { ok: false, status: 400, error: "Body is not valid JSON" };
  }
}

/** Clamp a string field; returns null for non-strings and blanks. */
export function capString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * An integer query parameter, clamped (audit 2026-10, SEC-053). A missing or
 * unreadable value falls back; it never reaches Prisma as NaN (`take: NaN`
 * threw and answered 500).
 */
export function clampInt(value: string | null | undefined, opts: { fallback: number; min: number; max: number }): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.min(opts.max, Math.max(opts.min, n));
}
