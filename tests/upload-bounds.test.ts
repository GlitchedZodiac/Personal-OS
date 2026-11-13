import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Uploads and query bounds (audit 2026-10, phase 3d): SEC-028, SEC-029,
// SEC-030, SEC-032, SEC-034, SEC-053, SEC-055. One test per finding.

const { db } = vi.hoisted(() => ({
  db: {
    lastFindMany: null as Record<string, unknown> | null,
    created: [] as Record<string, unknown>[],
    segments: [] as Record<string, unknown>[],
    storedSegment: null as Record<string, unknown> | null,
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    progressPhoto: {
      findMany: vi.fn(async (args: Record<string, unknown>) => { db.lastFindMany = args; return []; }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.created.push(data); return { id: "p1", ...data }; }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", takenAt: new Date(), ...data })),
    },
    recording: {
      findUnique: vi.fn(async () => ({ id: "rec-1", status: "recording" })),
      update: vi.fn(async () => ({ durationSec: 120 })),
    },
    recordingSegment: {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => { db.segments.push(create); return create; }),
      findMany: vi.fn(async () => [{ startSec: 0, durationSec: 120 }]),
      findUnique: vi.fn(async () => db.storedSegment),
    },
    financeDocument: { findMany: vi.fn(async (args: Record<string, unknown>) => { db.lastFindMany = args; return []; }) },
    favoriteFoods: { findMany: vi.fn(async (args: Record<string, unknown>) => { db.lastFindMany = args; return []; }) },
  },
}));
vi.mock("@/lib/prisma-request", () => ({ withRequestPrisma: vi.fn() }));

import { GET as photosGET, POST as photosPOST } from "@/app/api/health/progress-photos/route";
import { POST as segmentPOST } from "@/app/api/spirit/recordings/[id]/segments/route";
import { GET as segmentGET } from "@/app/api/spirit/recordings/[id]/segments/[index]/route";
import { POST as healthImportPOST } from "@/app/api/health/import/route";
import { POST as vesyncPOST } from "@/app/api/health/import/vesync/route";
import { GET as documentsGET } from "@/app/api/finance/documents/route";
import { POST as transcribePOST } from "@/app/api/ai/transcribe/route";
import { clampInt } from "@/lib/request-body";
import { executeAppData } from "@/lib/ai/data-access";

const json = (path: string, body: unknown, method = "POST") =>
  new NextRequest(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";

beforeEach(() => {
  db.lastFindMany = null;
  db.created.length = 0;
  db.segments.length = 0;
  db.storedSegment = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("SEC-028 progress photos", () => {
  it("accepts an image data URL, refuses anything else, an oversize photo and a novel-length note", async () => {
    expect((await photosPOST(json("/api/health/progress-photos", { imageData: jpeg }))).status).toBe(200);
    expect((await photosPOST(json("/api/health/progress-photos", { imageData: "not-an-image-at-all" }))).status).toBe(400);
    expect((await photosPOST(json("/api/health/progress-photos", { imageData: "data:text/html;base64,PGh0bWw+" }))).status).toBe(400);
    expect((await photosPOST(json("/api/health/progress-photos", { imageData: jpeg + "A".repeat(4_000_000) }))).status).toBe(413);
    expect((await photosPOST(json("/api/health/progress-photos", { imageData: jpeg, journalNote: "n".repeat(2_001) }))).status).toBe(400);
    expect(db.created).toHaveLength(1);
  });
});

describe("SEC-053 clamped page sizes", () => {
  it("a non-numeric or huge limit never reaches Prisma as NaN or unbounded", async () => {
    await photosGET(new NextRequest("http://localhost/api/health/progress-photos?limit=abc"));
    expect(db.lastFindMany!.take).toBe(50);
    await photosGET(new NextRequest("http://localhost/api/health/progress-photos?limit=999999"));
    expect(db.lastFindMany!.take).toBe(100);
    expect(clampInt("-5", { fallback: 1, min: 0, max: 10 })).toBe(0);
    expect(clampInt(null, { fallback: 7, min: 0, max: 10 })).toBe(7);
  });
});

describe("SEC-030 recording segments", () => {
  const seg = (type: string, headers: Record<string, string> = {}) =>
    new NextRequest("http://localhost/api/spirit/recordings/rec-1/segments", {
      method: "POST",
      headers: { "content-type": type, "x-seg-index": "0", "x-seg-start": "0", "x-seg-duration": "120", ...headers },
      body: new Uint8Array(1_000),
    });
  const params = { params: Promise.resolve({ id: "rec-1" }) };
  it("stores audio, refuses html, refuses a nonsense position", async () => {
    expect((await segmentPOST(seg("audio/webm;codecs=opus"), params)).status).toBe(200);
    expect((await segmentPOST(seg("text/html"), params)).status).toBe(415);
    expect((await segmentPOST(seg("audio/mp4", { "x-seg-index": "abc" }), params)).status).toBe(400);
    expect(db.segments).toHaveLength(1);
  });
  it("serves an old non-audio row as audio, with nosniff", async () => {
    db.storedSegment = { mimeType: "text/html", bytes: new Uint8Array([60, 104, 49, 62]) };
    const res = await segmentGET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id: "rec-1", index: "0" }) });
    expect(res.headers.get("content-type")).toBe("audio/mp4");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("SEC-032 imports are bounded", () => {
  it("a health import over 20,000 rows in a section is refused with a clear message", async () => {
    const res = await healthImportPOST(json("/api/health/import", { waterLogs: Array.from({ length: 20_001 }, () => ({ amountMl: 250 })) }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/at most 20000 per import/);
  });
  it("a VeSync CSV over 5 MB is refused before parsing", async () => {
    const res = await vesyncPOST(json("/api/health/import/vesync", { csvText: "x".repeat(5_000_001) }));
    expect(res.status).toBe(413);
  });
});

describe("SEC-034 the finance documents list carries no full text", () => {
  it("omits contentText and extractedData", async () => {
    await documentsGET(new NextRequest("http://localhost/api/finance/documents"));
    expect(db.lastFindMany!.omit).toEqual({ contentText: true, extractedData: true });
  });
});

describe("SEC-055 search strings are bounded", () => {
  it("a 5,000-character q reaches the database as 200 characters", async () => {
    await executeAppData({ dataset: "favorite_foods", q: "q".repeat(5_000) } as never, { timeZone: "UTC", todayStr: "2026-10-20" });
    const where = JSON.stringify(db.lastFindMany!.where);
    const contains = /"contains":"(q+)"/.exec(where)?.[1] ?? "";
    expect(contains.length).toBe(200);
  });
});

describe("SEC-029 dictation uploads are bounded", () => {
  it("a recording over 25 MB is refused before it is read", async () => {
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(25_000_001)], "big.webm", { type: "audio/webm" }));
    const res = await transcribePOST(new NextRequest("http://localhost/api/ai/transcribe", { method: "POST", body: form }));
    expect(res.status).toBe(413);
  });
});
