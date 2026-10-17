import { beforeEach, describe, expect, it, vi } from "vitest";

// When the two activity pushes go out (2026-10-17): the first hourly sweep
// after 07:00 Central for yesterday, the first after 19:00 Sunday for the
// week — once each, and only with data to report.

const notify = vi.fn<(input: Record<string, unknown>) => Promise<{ status: string; sent: number; failed: number }>>(
  async () => ({ status: "sent", sent: 1, failed: 0 })
);
vi.mock("@/lib/notify", () => ({ notify: (input: Record<string, unknown>) => notify(input) }));

let prefs = { activityReports: true };
vi.mock("@/lib/notification-prefs", () => ({ getNotificationPrefs: vi.fn(async () => prefs) }));

let rows: { date: string; steps: number }[] = [];
let snapshots: {
  localDate: string;
  steps: number;
  activeEnergyKcal: number | null;
  walkingRunningDistanceMeters: number | null;
}[] = [];
const sentKeys = new Set<string>();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyActivity: {
      findMany: vi.fn(async ({ where }: { where: { date: { gte: string; lte: string } } }) =>
        rows
          .filter((r) => r.date >= where.date.gte && r.date <= where.date.lte)
          .map((r) => ({
            ...r,
            activeEnergyKcal: 400,
            restingEnergyKcal: 1800,
            walkingRunningDistanceKm: 5,
            source: "mixed",
            receivedAt: new Date(),
          }))
      ),
    },
    // The iPhone app's own push fills days the Shortcut has not sent; none here.
    dailyHealthSnapshot: { findMany: vi.fn(async () => snapshots) },
    notificationLog: {
      findUnique: vi.fn(async ({ where }: { where: { dedupeKey: string } }) =>
        sentKeys.has(where.dedupeKey) ? { id: "n1" } : null
      ),
    },
  },
}));

const { sendActivityReports } = await import("@/lib/activity-reports");

/** A wall-clock moment in Chicago (CDT = UTC−5 in October 2026). */
const central = (date: string, hour: number, minute = 10) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour + 5, minute));
};

beforeEach(() => {
  notify.mockClear();
  sentKeys.clear();
  prefs = { activityReports: true };
  snapshots = [];
  rows = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-10-${String(5 + i).padStart(2, "0")}`, // Mon 5 … Sun 18 Oct
    steps: 7000 + i * 100,
  }));
});

describe("morning report", () => {
  it("goes out after 7 am Central for yesterday", async () => {
    const out = await sendActivityReports(central("2026-10-17", 7)); // Saturday
    expect(out.morning).toBe("sent");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      category: "activityReport",
      dedupeKey: "activity-morning:2026-10-16",
      url: "/health/activity?date=2026-10-16",
    });
    expect(notify.mock.calls[0][0].title).toBe("Yesterday · 8,100 steps");
  });

  it("not before 7 am, and not after noon", async () => {
    expect((await sendActivityReports(central("2026-10-17", 6, 55))).morning).toBe("outside window");
    expect((await sendActivityReports(central("2026-10-17", 12, 5))).morning).toBe("outside window");
    expect(notify).not.toHaveBeenCalled();
  });

  it("follows Central time across the DST change", async () => {
    // 9 Nov 2026 is CST (UTC−6): 13:10 UTC is 07:10 Central.
    rows.push({ date: "2026-11-08", steps: 5000 });
    const out = await sendActivityReports(new Date("2026-11-09T13:10:00Z"));
    expect(out.morning).toBe("sent");
    expect(notify.mock.calls[0][0].dedupeKey).toBe("activity-morning:2026-11-08");
  });

  it("waits (and keeps looking until noon) when yesterday has not arrived", async () => {
    rows = rows.filter((r) => r.date !== "2026-10-16");
    const out = await sendActivityReports(central("2026-10-17", 8));
    expect(out.morning).toBe("no data for 2026-10-16 yet");
    expect(notify).not.toHaveBeenCalled();
  });

  it("uses the iPhone app's own sync when the Shortcut has not sent the day", async () => {
    rows = rows.filter((r) => r.date !== "2026-10-16");
    snapshots = [
      { localDate: "2026-10-16", steps: 4321, activeEnergyKcal: 210, walkingRunningDistanceMeters: 3100 },
    ];
    const out = await sendActivityReports(central("2026-10-17", 7));
    expect(out.morning).toBe("sent");
    expect(notify.mock.calls[0][0].title).toBe("Yesterday · 4,321 steps");
  });

  it("is sent once", async () => {
    sentKeys.add("activity-morning:2026-10-16");
    expect((await sendActivityReports(central("2026-10-17", 9))).morning).toBe("already sent");
    expect(notify).not.toHaveBeenCalled();
  });

  it("respects the Settings switch", async () => {
    prefs = { activityReports: false };
    expect(await sendActivityReports(central("2026-10-17", 7))).toEqual({ morning: "muted", weekly: "muted" });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("weekly report", () => {
  it("goes out Sunday evening for the week ending that day", async () => {
    const out = await sendActivityReports(central("2026-10-18", 19)); // Sunday
    expect(out.weekly).toBe("sent");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({
      dedupeKey: "activity-weekly:2026-10-12",
      url: "/health/activity?week=2026-10-12",
    });
    expect(notify.mock.calls[0][0].title).toBe("Your week · 56,000 steps") // 7,700 … 8,300;
  });

  it("not Sunday afternoon", async () => {
    expect((await sendActivityReports(central("2026-10-18", 15))).weekly).toBe("outside window");
  });

  it("catches up Monday morning for the week that just ended", async () => {
    const out = await sendActivityReports(central("2026-10-19", 8)); // Monday
    expect(out.weekly).toBe("sent");
    expect(out.morning).toBe("sent"); // Sunday's own morning report
    const keys = notify.mock.calls.map((c) => c[0].dedupeKey);
    expect(keys).toEqual(["activity-morning:2026-10-18", "activity-weekly:2026-10-12"]);
  });

  it("is sent once", async () => {
    sentKeys.add("activity-weekly:2026-10-12");
    expect((await sendActivityReports(central("2026-10-18", 21))).weekly).toBe("already sent");
  });
});
