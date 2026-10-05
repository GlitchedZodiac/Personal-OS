import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFS,
  sanitizeNotificationPrefs,
} from "@/lib/notification-prefs";
import {
  clockToMinutes,
  isFreshWeighIn,
  isQuiet,
  quietEndsAt,
  syncAlertFor,
  weighInSummary,
  type SyncState,
} from "@/lib/quiet-hours";

const NIGHT = { enabled: true, start: "22:00", end: "07:00" };
const BOGOTA = "America/Bogota"; // UTC−5, no DST
const HOUSTON = "America/Chicago"; // UTC−6 / −5 with DST

describe("quiet hours — the default 10pm–7am", () => {
  it("is quiet from 22:00 and no longer quiet at 07:00 exactly", () => {
    expect(isQuiet(new Date("2026-10-05T02:59:00Z"), BOGOTA, NIGHT)).toBe(false); // 21:59
    expect(isQuiet(new Date("2026-10-05T03:00:00Z"), BOGOTA, NIGHT)).toBe(true); // 22:00
    expect(isQuiet(new Date("2026-10-05T08:30:00Z"), BOGOTA, NIGHT)).toBe(true); // 03:30
    expect(isQuiet(new Date("2026-10-05T11:59:00Z"), BOGOTA, NIGHT)).toBe(true); // 06:59
    expect(isQuiet(new Date("2026-10-05T12:00:00Z"), BOGOTA, NIGHT)).toBe(false); // 07:00
  });

  it("follows the device: the same instant is quiet in Houston, not in Bogotá", () => {
    // The 7am training nudge fires at 12:00 UTC. In Bogotá that IS 7am.
    // In Houston in winter (UTC−6) it is 6am — still quiet, so it is held.
    const nudge = new Date("2026-12-10T12:00:00Z");
    expect(isQuiet(nudge, BOGOTA, NIGHT)).toBe(false);
    expect(isQuiet(nudge, HOUSTON, NIGHT)).toBe(true);
  });

  it("can be switched off, and an empty window is never quiet", () => {
    const threeAm = new Date("2026-10-05T08:00:00Z");
    expect(isQuiet(threeAm, BOGOTA, { ...NIGHT, enabled: false })).toBe(false);
    expect(isQuiet(threeAm, BOGOTA, { enabled: true, start: "07:00", end: "07:00" })).toBe(false);
  });

  it("handles a same-day window (a siesta)", () => {
    const nap = { enabled: true, start: "13:00", end: "15:00" };
    expect(isQuiet(new Date("2026-10-05T18:30:00Z"), BOGOTA, nap)).toBe(true); // 13:30
    expect(isQuiet(new Date("2026-10-05T20:00:00Z"), BOGOTA, nap)).toBe(false); // 15:00
  });

  it("ignores an unreadable clock rather than going silent forever", () => {
    expect(clockToMinutes("25:00")).toBeNull();
    expect(isQuiet(new Date(), BOGOTA, { enabled: true, start: "late", end: "07:00" })).toBe(false);
  });
});

describe("quietEndsAt — when a held notification goes out", () => {
  it("from the evening half: tomorrow at 07:00 local", () => {
    // 23:15 on Oct 4 in Bogotá
    const end = quietEndsAt(new Date("2026-10-05T04:15:00Z"), BOGOTA, NIGHT);
    expect(end.toISOString()).toBe("2026-10-05T12:00:00.000Z"); // 07:00 Oct 5
  });

  it("from the morning half: today at 07:00 local", () => {
    // 03:30 on Oct 5 in Bogotá
    const end = quietEndsAt(new Date("2026-10-05T08:30:00Z"), BOGOTA, NIGHT);
    expect(end.toISOString()).toBe("2026-10-05T12:00:00.000Z");
  });

  it("is 07:00 on the wall clock in Houston, across the DST change", () => {
    // Summer (CDT, UTC−5): 07:00 = 12:00Z. Winter (CST, UTC−6): 07:00 = 13:00Z.
    expect(quietEndsAt(new Date("2026-07-10T08:00:00Z"), HOUSTON, NIGHT).toISOString()).toBe(
      "2026-07-10T12:00:00.000Z"
    );
    expect(quietEndsAt(new Date("2026-12-10T08:00:00Z"), HOUSTON, NIGHT).toISOString()).toBe(
      "2026-12-10T13:00:00.000Z"
    );
  });

  it("always lands outside the window it ends", () => {
    for (const iso of ["2026-10-05T04:15:00Z", "2026-10-05T08:30:00Z", "2026-12-10T05:00:00Z"]) {
      for (const zone of [BOGOTA, HOUSTON]) {
        const now = new Date(iso);
        if (!isQuiet(now, zone, NIGHT)) continue;
        const end = quietEndsAt(now, zone, NIGHT);
        expect(end.getTime()).toBeGreaterThan(now.getTime());
        expect(isQuiet(end, zone, NIGHT)).toBe(false);
      }
    }
  });
});

describe("syncAlertFor — 'sync failed for 2 days'", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  const base: SyncState = {
    source: "renpho",
    label: "Body composition",
    heartbeat: false,
    lastSuccessAt: new Date("2026-10-01T10:00:00Z"),
    lastError: null,
    failingSince: null,
  };

  it("says nothing while a pipeline is healthy", () => {
    expect(syncAlertFor(base, now)).toBeNull();
  });

  it("says nothing on the first day of trouble", () => {
    const state = { ...base, failingSince: new Date("2026-10-04T16:00:00Z") };
    expect(syncAlertFor(state, now)).toBeNull();
  });

  it("alerts once it has been failing for two days, with the last error", () => {
    const alert = syncAlertFor(
      { ...base, failingSince: new Date("2026-10-03T14:00:00Z"), lastError: "401 from cloud" },
      now
    );
    expect(alert?.title).toBe("Body composition sync is failing");
    expect(alert?.body).toBe("No successful sync for 2 days. Last error: 401 from cloud");
  });

  it("alerts once per three-day window, not once per check", () => {
    const failingSince = new Date("2026-10-03T14:00:00Z");
    const key = (iso: string) =>
      syncAlertFor({ ...base, failingSince }, new Date(iso))?.dedupeKey;
    // the hourly sweep on days 2, 3 and 4 → one notification
    expect(key("2026-10-05T15:00:00Z")).toBe(key("2026-10-06T09:00:00Z"));
    expect(key("2026-10-05T15:00:00Z")).toBe(key("2026-10-07T23:00:00Z"));
    // day 5 → it says so again
    expect(key("2026-10-08T15:00:00Z")).not.toBe(key("2026-10-05T15:00:00Z"));
  });

  it("treats silence from a heartbeat source as the failure", () => {
    // The companion posts every day whether or not he weighed in; two days
    // of nothing means the phone app is not syncing at all.
    const alert = syncAlertFor(
      {
        ...base,
        source: "apple_health",
        label: "Apple Health",
        heartbeat: true,
        lastSuccessAt: new Date("2026-10-02T20:00:00Z"),
      },
      now
    );
    expect(alert?.title).toBe("Apple Health hasn't synced");
    expect(alert?.body).toContain("2 days");
  });

  it("does not mistake a quiet non-heartbeat source for a broken one", () => {
    const old = { ...base, lastSuccessAt: new Date("2026-08-01T00:00:00Z") };
    expect(syncAlertFor(old, now)).toBeNull();
  });

  it("stays silent about a pipeline that has never worked — that is setup, not breakage", () => {
    expect(syncAlertFor({ ...base, heartbeat: true, lastSuccessAt: null }, now)).toBeNull();
  });
});

describe("weighInSummary — the one line under 'Weigh-in synced'", () => {
  const measuredAt = new Date("2026-10-04T12:30:00Z"); // Sun 7:30am Bogotá

  it("gives the number, body fat and the change since the last weigh-in", () => {
    expect(
      weighInSummary({
        weightKg: 82.75,
        bodyFatPct: 13.2,
        previousWeightKg: 83.65,
        previousAt: new Date("2026-10-03T12:10:00Z"),
        measuredAt,
        timeZone: BOGOTA,
      })
    ).toBe("82.8 kg · 13.2% body fat · −0.9 kg since yesterday");
  });

  it("names the day when the last weigh-in was earlier in the week", () => {
    expect(
      weighInSummary({
        weightKg: 83.4,
        previousWeightKg: 82.9,
        previousAt: new Date("2026-09-30T12:00:00Z"),
        measuredAt,
        timeZone: BOGOTA,
      })
    ).toBe("83.4 kg · +0.5 kg since Wed");
  });

  it("uses a date once it is more than a week back", () => {
    expect(
      weighInSummary({
        weightKg: 83.4,
        previousWeightKg: 84.4,
        previousAt: new Date("2026-09-12T12:00:00Z"),
        measuredAt,
        timeZone: BOGOTA,
      })
    ).toBe("83.4 kg · −1.0 kg since Sep 12");
  });

  it("does not invent a change from a first-ever weigh-in, or from noise", () => {
    expect(weighInSummary({ weightKg: 82.8, measuredAt, timeZone: BOGOTA })).toBe("82.8 kg");
    expect(
      weighInSummary({
        weightKg: 82.8,
        previousWeightKg: 82.82,
        previousAt: new Date("2026-10-03T12:10:00Z"),
        measuredAt,
        timeZone: BOGOTA,
      })
    ).toBe("82.8 kg · same as yesterday");
  });

  it("speaks pounds when his units are imperial", () => {
    expect(
      weighInSummary({
        weightKg: 82.75,
        previousWeightKg: 83.65,
        previousAt: new Date("2026-10-03T12:10:00Z"),
        measuredAt,
        units: "imperial",
        timeZone: BOGOTA,
      })
    ).toBe("182.4 lb · −2.0 lb since yesterday");
  });
});

describe("isFreshWeighIn — a backfill is not news", () => {
  const now = new Date("2026-10-05T15:00:00Z");
  it("announces this morning's reading and not last month's", () => {
    expect(isFreshWeighIn(new Date("2026-10-05T12:00:00Z"), now)).toBe(true);
    expect(isFreshWeighIn(new Date("2026-10-04T04:00:00Z"), now)).toBe(true); // 35 h
    expect(isFreshWeighIn(new Date("2026-10-03T12:00:00Z"), now)).toBe(false);
    expect(isFreshWeighIn(new Date("2026-09-01T12:00:00Z"), now)).toBe(false);
  });
});

describe("sanitizeNotificationPrefs", () => {
  it("defaults: everything on, quiet 22:00–07:00, his own reminders get through", () => {
    expect(DEFAULT_NOTIFICATION_PREFS).toMatchObject({
      dueReminders: true,
      plannedWorkout: true,
      weighIn: true,
      systemAlerts: true,
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "07:00",
      remindersBreakQuiet: true,
      timeZone: null,
    });
  });

  it("keeps what is well-formed and drops the rest", () => {
    expect(
      sanitizeNotificationPrefs({
        weighIn: false,
        systemAlerts: "yes",
        quietStart: "23:30",
        quietEnd: "7am",
        timeZone: "America/Chicago",
        somethingElse: true,
      })
    ).toEqual({ weighIn: false, quietStart: "23:30", timeZone: "America/Chicago" });
  });

  it("refuses a timezone that does not exist", () => {
    expect(sanitizeNotificationPrefs({ timeZone: "Mars/Olympus" })).toEqual({});
    expect(sanitizeNotificationPrefs(null)).toEqual({});
  });
});
