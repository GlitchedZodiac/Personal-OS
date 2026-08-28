import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory prisma double for the planner brain: plannedWorkout + the name
// resolution reads (sequence, trail) + reminder creation.

type Plan = {
  id: string;
  localDate: string;
  title: string;
  notes: string | null;
  sequenceId: string | null;
  trailId: string | null;
  targetWeightKg: number | null;
  status: string;
  source: string;
  createdAt: Date;
};

const plans: Plan[] = [];
const reminders: Array<{ title: string; body: string; remindAt: Date; url: string }> = [];
let seq = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    plannedWorkout: {
      create: vi.fn(async ({ data }: { data: Partial<Plan> }) => {
        const row: Plan = {
          id: `p${++seq}`,
          localDate: data.localDate as string,
          title: data.title as string,
          notes: data.notes ?? null,
          sequenceId: data.sequenceId ?? null,
          trailId: data.trailId ?? null,
          targetWeightKg: data.targetWeightKg ?? null,
          status: "planned",
          source: (data.source as string) ?? "chat",
          createdAt: new Date(),
        };
        plans.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: { localDate?: unknown; status?: string } }) => {
        let rows = [...plans];
        if (typeof where?.localDate === "string") {
          rows = rows.filter((p) => p.localDate === where.localDate);
        } else if (where?.localDate && typeof where.localDate === "object") {
          const range = where.localDate as { gte?: string; lte?: string };
          rows = rows.filter(
            (p) =>
              (!range.gte || p.localDate >= range.gte) &&
              (!range.lte || p.localDate <= range.lte)
          );
        }
        if (where?.status) rows = rows.filter((p) => p.status === where.status);
        return rows;
      }),
      deleteMany: vi.fn(
        async ({ where }: { where: { status: string; localDate: { gte: string; lte: string } } }) => {
          const survivors = plans.filter(
            (p) =>
              !(
                p.status === where.status &&
                p.localDate >= where.localDate.gte &&
                p.localDate <= where.localDate.lte
              )
          );
          const removed = plans.length - survivors.length;
          plans.length = 0;
          plans.push(...survivors);
          return { count: removed };
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Plan> }) => {
        const row = plans.find((p) => p.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      }),
    },
    sequence: {
      findMany: vi.fn(async () => [
        { id: "seq-armor", name: "Armor Builder" },
        { id: "seq-legs", name: "Leg Day (sample)" },
      ]),
    },
    trail: {
      findMany: vi.fn(async () => [
        { id: "trail-cruces", name: "El Cerro de las Tres Cruces", aliases: ["tres cruces"] },
      ]),
    },
    reminder: {
      create: vi.fn(async ({ data }: { data: (typeof reminders)[number] }) => {
        reminders.push(data);
        return data;
      }),
    },
  },
}));

import { markPlannedDone, parseLocalStamp, planWeek } from "@/lib/planner";

const TZ = "America/Bogota"; // UTC-5, no DST

beforeEach(() => {
  plans.length = 0;
  reminders.length = 0;
  seq = 0;
});

describe("planWeek", () => {
  it("resolves routine and trail names, creates timed reminders in his zone", async () => {
    const result = await planWeek({
      timeZone: TZ,
      days: [
        {
          date: "2026-08-31",
          title: "Armor Builder",
          routineName: "armor builder",
          reminders: [{ atLocal: "2026-08-31 16:00", title: "Stretch first" }],
        },
        { date: "2026-09-03", title: "Climb Tres Cruces", trailName: "tres cruces" },
        { date: "bad-date", title: "dropped" },
      ],
    });
    expect(result.created).toBe(2);
    expect(result.remindersCreated).toBe(1);
    expect(plans[0].sequenceId).toBe("seq-armor");
    expect(plans[1].trailId).toBe("trail-cruces");
    // 16:00 Bogotá = 21:00 UTC.
    expect(reminders[0].remindAt.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(reminders[0].url).toBe("/health/workouts");
  });

  it("replaceWeek clears only still-planned days of the touched week", async () => {
    await planWeek({
      timeZone: TZ,
      days: [
        { date: "2026-08-31", title: "Old plan" },
        { date: "2026-09-01", title: "Done already" },
      ],
    });
    plans[1].status = "done";
    const result = await planWeek({
      timeZone: TZ,
      replaceWeek: true,
      days: [{ date: "2026-09-02", title: "New plan" }],
    });
    expect(result.created).toBe(1);
    const titles = plans.map((p) => p.title).sort();
    expect(titles).toEqual(["Done already", "New plan"]); // "Old plan" cleared
  });
});

describe("markPlannedDone", () => {
  it("an exact sequence match wins; the day's loose plan catches the rest", async () => {
    await planWeek({
      timeZone: TZ,
      days: [
        { date: "2026-08-31", title: "Armor Builder", routineName: "Armor Builder" },
        { date: "2026-08-31", title: "Back day" },
      ],
    });
    // 20:00 Bogotá on the 31st.
    const startedAt = new Date("2026-09-01T01:00:00.000Z");
    const first = await markPlannedDone({ startedAt, timeZone: TZ, sequenceId: "seq-armor" });
    expect(plans.find((p) => p.id === first)?.title).toBe("Armor Builder");
    const second = await markPlannedDone({ startedAt, timeZone: TZ, sequenceId: null });
    expect(plans.find((p) => p.id === second)?.title).toBe("Back day");
    // Nothing left planned that day.
    expect(await markPlannedDone({ startedAt, timeZone: TZ })).toBeNull();
  });

  it("does nothing on unplanned days", async () => {
    expect(
      await markPlannedDone({ startedAt: new Date(), timeZone: TZ })
    ).toBeNull();
  });
});

describe("parseLocalStamp", () => {
  it("parses his wall clock into UTC and rejects junk", () => {
    expect(parseLocalStamp("2026-08-31 16:00", TZ)?.toISOString()).toBe(
      "2026-08-31T21:00:00.000Z"
    );
    expect(parseLocalStamp("2026-08-31T07:30", TZ)?.toISOString()).toBe(
      "2026-08-31T12:30:00.000Z"
    );
    expect(parseLocalStamp("4pm Wednesday", TZ)).toBeNull();
    expect(parseLocalStamp("2026-08-31 25:00", TZ)).toBeNull();
  });
});
