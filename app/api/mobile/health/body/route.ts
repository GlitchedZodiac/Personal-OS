import { NextRequest, NextResponse } from "next/server";
import { ingestBodySamples } from "@/lib/body-ingest";
import type { IncomingBodySample } from "@/lib/body-measurements";
import { requireMobileSession } from "@/lib/mobile-session";

// POST — weigh-ins only, at any date. This is the historical backfill path.
//
// WHY THIS IS NOT PART OF /api/mobile/health/daily:
// that route upserts a DailyHealthSnapshot keyed on (localDate, timeZone,
// source) with `steps: Math.max(0, int(body.steps) ?? 0)`. Posting a
// three-month-old weigh-in through it would either overwrite that day's real
// step count with 0, or lie about when the weigh-in happened by stamping it
// today. Neither is acceptable, so backfill gets its own door.
//
// /api/mobile/* is on the proxy.ts allowlist, so this route MUST verify its
// own bearer credential.

export const maxDuration = 60;

/** Batch cap. The companion pages its anchored query; this bounds one page. */
const MAX_SAMPLES = 500;

export async function POST(request: NextRequest) {
  try {
    const session = await requireMobileSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const samples: IncomingBodySample[] = Array.isArray(body.samples)
      ? body.samples
      : [];

    if (samples.length > MAX_SAMPLES) {
      return NextResponse.json(
        { error: `Too many samples; send at most ${MAX_SAMPLES} per request.` },
        { status: 413 }
      );
    }

    const source =
      typeof body.source === "string" && body.source.trim().length > 0
        ? body.source.trim()
        : "apple_health";

    const result = await ingestBodySamples(samples, { source });

    console.log(
      `[health/body] backfill: ${result.imported} new, ${result.merged} merged, ${result.skipped} duplicate, ${result.invalid} invalid (of ${samples.length} sent)`
    );

    return NextResponse.json({
      received: samples.length,
      imported: result.imported,
      merged: result.merged,
      skipped: result.skipped,
      invalid: result.invalid,
    });
  } catch (error) {
    console.error("Body sample sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync body samples" },
      { status: 500 }
    );
  }
}
