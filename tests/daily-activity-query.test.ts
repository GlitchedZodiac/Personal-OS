import { describe, expect, it, vi } from "vitest";

// query_data daily_activity (2026-10-17) — how Claude reads his steps and
// calories by date range, over MCP and in the in-app chat alike. The column
// is "YYYY-MM-DD" text, so a range must compare text, not timestamps.

const findMany = vi.fn<(args: Record<string, unknown>) => Promise<Record<string, unknown>[]>>(async () => [
  { id: "a1", date: "2026-10-16", steps: 8123, activeEnergyKcal: 512.4 },
]);

vi.mock("@/lib/prisma", () => ({
  prisma: { dailyActivity: { findMany: (args: Record<string, unknown>) => findMany(args) } },
}));
vi.mock("@/lib/chat-tools", () => ({ executeGetHealthData: vi.fn() }));
vi.mock("@/lib/finance/reports", () => ({ getFinanceReportSummary: vi.fn() }));

const { executeAppData } = await import("@/lib/ai/data-access");
const ctx = { timeZone: "America/Chicago", todayStr: "2026-10-17" };

describe("query_data daily_activity", () => {
  it("filters by from/to on the day string", async () => {
    const out = (await executeAppData(
      { dataset: "daily_activity", from: "2026-10-01", to: "2026-10-16" },
      ctx
    )) as { dataset: string; count: number; rows: unknown[] };
    expect(out.dataset).toBe("daily_activity");
    expect(out.count).toBe(1);
    const args = findMany.mock.calls.at(-1)![0] as {
      where: unknown;
      select: Record<string, boolean>;
      orderBy: unknown;
    };
    expect(args.where).toEqual({ date: { gte: "2026-10-01", lte: "2026-10-16" } });
    expect(args.orderBy).toEqual({ date: "desc" });
    expect(Object.keys(args.select).sort()).toEqual(
      [
        "activeEnergyKcal", "date", "id", "receivedAt", "restingEnergyKcal",
        "source", "steps", "walkingRunningDistanceKm",
      ].sort()
    );
  });

  it("turns `days` into a trailing window ending today", async () => {
    await executeAppData({ dataset: "daily_activity", days: 7 }, ctx);
    const args = findMany.mock.calls.at(-1)![0] as { where: unknown; take: number };
    expect(args.where).toEqual({ date: { gte: "2026-10-11", lte: "2026-10-17" } });
    expect(args.take).toBe(31);
  });

  it("lets a six-month question fetch six months", async () => {
    await executeAppData({ dataset: "daily_activity", days: 183, limit: 400 }, ctx);
    const args = findMany.mock.calls.at(-1)![0] as { take: number };
    expect(args.take).toBe(400);
  });
});
