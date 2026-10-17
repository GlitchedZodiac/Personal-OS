import { after, NextRequest, NextResponse } from "next/server";
import { writeActivityDays } from "@/lib/activity-reports";
import { isIngestAuthorized, parseActivityPayload } from "@/lib/daily-activity";
import { recordSync } from "@/lib/notify";

// POST — his iPhone Shortcut's nightly Apple Health push (2026-10-17;
// SHORTCUT_SETUP.md). Self-authenticating: `Authorization: Bearer
// HEALTH_INGEST_TOKEN`, allowlisted by EXACT path in proxy.ts — a prefix
// entry would have opened /api/health/daily-log and /daily-brief too.
//
// Body: an array of days. Each day is upserted by date, so the Shortcut can
// re-send the last week every night (and its whole history once) without
// ever creating a duplicate. Days with nothing in them — the locked-phone
// run — are skipped, never written over good data. See lib/daily-activity.ts.

export const maxDuration = 30;

const SYNC_SOURCE = "health_shortcut";
const SYNC_LABEL = "Apple Health Shortcut";

export async function POST(request: NextRequest) {
  if (!isIngestAuthorized(request.headers.get("authorization"))) {
    if (!process.env.HEALTH_INGEST_TOKEN) {
      console.warn("[health/daily] HEALTH_INGEST_TOKEN is not set — every push is refused");
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parsed from text so a Shortcut that forgets the Content-Type still works.
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const parsed = parseActivityPayload(body);
  if (!parsed.ok) {
    after(() => recordSync(SYNC_SOURCE, { ok: false, label: SYNC_LABEL, heartbeat: true, error: parsed.error }));
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { days, empty, rejected } = parsed.value;
  if (days.length === 0 && rejected.length > 0) {
    const error = `No valid days: ${rejected[0].errors.join("; ")}`;
    after(() => recordSync(SYNC_SOURCE, { ok: false, label: SYNC_LABEL, heartbeat: true, error }));
    return NextResponse.json({ error, upserted: 0, rejected }, { status: 400 });
  }

  try {
    if (days.length > 0) {
      // A key the Shortcut left out is never written, so a history push of
      // one metric cannot wipe the others.
      await writeActivityDays(days);
      // Only a push that carried data counts as the pipeline being alive: a
      // locked-phone run that sent nothing must not keep the alert quiet.
      after(() => recordSync(SYNC_SOURCE, { ok: true, label: SYNC_LABEL, heartbeat: true }));
    }

    return NextResponse.json({
      upserted: days.length,
      dates: days.map((d) => d.date),
      skippedEmpty: empty,
      rejected,
      ...(days.length === 0
        ? { note: "Every day was empty — Health can't be read while the iPhone is locked." }
        : {}),
    });
  } catch (error) {
    console.error("[health/daily] upsert failed:", error);
    return NextResponse.json({ error: "Failed to store the days" }, { status: 500 });
  }
}
