import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// String and size bounds on the device intake routes (audit 2026-10, SEC-025,
// SEC-023). Every limit sits far above what the shipped apps send.

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});
vi.mock("@/lib/mobile-session", () => ({
  requireMobileSession: vi.fn(async () => ({ id: "sess-1", deviceType: "iphone" })),
}));
vi.mock("@/lib/notify", () => ({ recordSync: vi.fn() }));
vi.mock("@/lib/weigh-in-notice", () => ({ announceWeighIn: vi.fn() }));
vi.mock("@/lib/renpho-sync", () => ({ renphoSyncEnabled: () => false, runRenphoSync: vi.fn() }));

const { db } = vi.hoisted(() => ({
  db: {
    upserts: [] as Array<{ create: Record<string, unknown> }>,
    samplesSeen: 0,
    trailArgs: null as Record<string, unknown> | null,
  },
}));
vi.mock("@/lib/body-ingest", () => ({
  ingestBodySamples: vi.fn(async (samples: unknown[]) => {
    db.samplesSeen = samples.length;
    return { imported: 0, merged: 0, skipped: 0, invalid: samples.length, created: [] };
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyHealthSnapshot: {
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => {
        db.upserts.push(args);
        return { id: "snap-1", ...args.create };
      }),
    },
  },
}));
vi.mock("@/lib/trails", () => ({
  TrailInputError: class extends Error {},
  createOrLinkTrail: vi.fn(async (args: Record<string, unknown>) => {
    db.trailArgs = args;
    return { trail: { id: "t1" } };
  }),
  listTrails: vi.fn(async () => []),
}));
vi.mock("@/lib/openai", () => ({
  openai: { audio: { transcriptions: { create: vi.fn() } } },
  hasOpenAIKey: true,
  TRANSCRIBE_MODEL: "m",
  TRANSCRIBE_FALLBACK_MODEL: "f",
}));
vi.mock("@/lib/ai-usage", () => ({ recordAIUsage: vi.fn() }));
vi.mock("@/lib/user-exercises", () => ({ ensureUserExercisesLoaded: vi.fn(async () => {}) }));
vi.mock("@/lib/voice-audit", () => ({ readVoiceContext: () => ({}), recordVoiceClip: vi.fn() }));

import { POST as dailyPOST } from "@/app/api/mobile/health/daily/route";
import { POST as trailsPOST } from "@/app/api/mobile/trails/route";
import { POST as voicePOST } from "@/app/api/mobile/voice/workout-entry/route";
import { capString } from "@/lib/request-body";

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const day = (extra: Record<string, unknown> = {}) => ({ localDate: "2026-10-18", timeZone: "America/Bogota", steps: 9000, ...extra });

beforeEach(() => {
  db.upserts.length = 0;
  db.samplesSeen = 0;
  db.trailArgs = null;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/mobile/health/daily", () => {
  it("accepts what the companion sends — including a non-Latin digit locale and nested zones", async () => {
    expect((await dailyPOST(post("/api/mobile/health/daily", day()))).status).toBe(200);
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ localDate: "٢٠٢٦-١٠-١٨" })))).status).toBe(200);
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ timeZone: "America/Argentina/Buenos_Aires" })))).status).toBe(200);
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ timeZone: "Etc/GMT+5" })))).status).toBe(200);
  });
  it("refuses a malformed day key (they are the row's unique key, so they are checked, not trimmed)", async () => {
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ localDate: "18/10/2026" })))).status).toBe(400);
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ timeZone: "Bogota; DROP TABLE" })))).status).toBe(400);
    expect((await dailyPOST(post("/api/mobile/health/daily", day({ timeZone: "A".repeat(65) })))).status).toBe(400);
    expect(db.upserts).toHaveLength(0);
  });
  it("summarises an oversized diagnostic payload instead of storing it, and caps source", async () => {
    await dailyPOST(post("/api/mobile/health/daily", day({ rawData: { blob: "x".repeat(100_000) }, source: "s".repeat(500) })));
    const created = db.upserts[0].create as { rawData: { payload: unknown }; source: string };
    expect(created.rawData.payload).toMatchObject({ trimmed: true });
    expect(created.source).toHaveLength(40);
  });
  it("trims weigh-in samples to 500 and reports the rest, never refusing the day", async () => {
    const weightSamples = Array.from({ length: 700 }, (_, i) => ({ measuredAt: `2026-10-18T0${i % 9}:00:00Z`, weightKg: 110 }));
    const res = await dailyPOST(post("/api/mobile/health/daily", day({ weightSamples })));
    expect(res.status).toBe(200);
    expect(db.samplesSeen).toBe(500);
    expect((await res.json()).weightsTrimmed).toBe(200);
  });
  it("refuses a body over 1 MB before reading it", async () => {
    const res = await dailyPOST(post("/api/mobile/health/daily", day({ pad: "x".repeat(1_100_000) })));
    expect(res.status).toBe(413);
  });
});

describe("POST /api/mobile/trails", () => {
  it("caps the name and ids it passes on", async () => {
    await trailsPOST(post("/api/mobile/trails", { name: "N".repeat(1_000), workoutExternalId: "w".repeat(1_000) }));
    expect((db.trailArgs!.name as string).length).toBe(120);
    expect((db.trailArgs!.workoutExternalId as string).length).toBe(200);
  });
});

describe("POST /api/mobile/voice/workout-entry (SEC-023)", () => {
  it("refuses an oversized clip from its ENCODED length, without decoding it", async () => {
    const fromSpy = vi.spyOn(Buffer, "from");
    const res = await voicePOST(post("/api/mobile/voice/workout-entry", { entryId: "e1", audioBase64: "A".repeat(2_700_000), mime: "audio/m4a" }));
    expect(res.status).toBe(413);
    const decodedBig = fromSpy.mock.calls.some((call) => {
      const [arg, enc] = call as unknown as [unknown, unknown];
      return typeof arg === "string" && arg.length > 1_000_000 && enc === "base64";
    });
    expect(decodedBig).toBe(false);
    fromSpy.mockRestore();
  });
});

describe("capString", () => {
  it("trims, drops blanks and non-strings, and caps", () => {
    expect(capString("  ab  ", 5)).toBe("ab");
    expect(capString("   ", 5)).toBeNull();
    expect(capString(42, 5)).toBeNull();
    expect(capString("abcdefgh", 3)).toBe("abc");
  });
});
