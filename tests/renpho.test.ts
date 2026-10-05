import { describe, expect, it } from "vitest";
import {
  type RenphoCandidateRow,
  decryptBody,
  encryptBody,
  isScaleReading,
  mapRenphoRecord,
  parseRenphoJson,
  planRenphoWrite,
} from "@/lib/renpho";
import { NEAR_KG, NEAR_MS } from "@/lib/vesync";

// A real record from the 2026-10-04 pull, identifiers replaced. The numbers
// are the ones on that day's PDF report, which is what makes the expectations
// below meaningful: the mapping is checked against the report, not against
// itself.
const REPORT = {
  id: "6087607455611716000",
  userId: "6071354294872801000",
  timeStamp: 1791125910,
  timeZone: "-5",
  deviceType: "00053",
  mac: "00:00:00:00:00:00",
  reportId: "P26100401",
  weight: 82.75,
  bmi: 26.1,
  bodyfat: 13.2,
  fatFreeWeight: 71.83,
  sinew: 67.03,
  sinewRatio: 81,
  muscle: 49.9,
  smmMass: 41.29,
  smi: 10.1,
  water: 63.6,
  protein: 17.4,
  bone: 4.8,
  visfat: 2,
  subfat: 9.5,
  bmr: 1921,
  bodyage: 29,
  whr: 0.7,
  laMuscleMass: 4.19, raMuscleMass: 4.16, tMuscleMass: 31.33,
  llMuscleMass: 11.86, rlMuscleMass: 11.85,
  laBodyFatMass: 0.43, raBodyFatMass: 0.44, tBodyFatMass: 5.49,
  llBodyFatMass: 1.78, rlBodyFatMass: 1.77,
  z20HandR: 269.7, z20HandL: 258.2, z20Body: 16.8, z20FootR: 213.8, z20FootL: 208.3,
  z100HandR: 236.5, z100HandL: 226.4, z100Body: 16.6, z100FootR: 175.4, z100FootL: 171.2,
  bfpMin: 10, bfpMax: 20, bfpStd: 15,
  bfmMin: 8.4, bfmMax: 16.8, bfmStd: 10.5,
  bmiMin: 25, bmiMax: 30, bmiStd: 22,
  bmrMin: 1484, bmrMax: 1813, bmrStd: 1649,
  smmMin: 29.9, smmMax: 36.5, smmStd: 33.2,
  weightMin: 59.2, weightMax: 80.2, weightStd: 69.7,
  boneMin: 3.4, boneMax: 4.2,
  muscleMassMin: 47.4, muscleMassMax: 59.1,
  proteinMassMin: 10.2, proteinMassMax: 12.7,
  waterMassMin: 37.3, waterMassMax: 46.4,
  laMuscleStd: 3.44, laBodyFatStd: 0.68,
  bodyScore: 92, bodyType: 6, weightTarget: 82.35, obesityDegree: 118,
  heartRate: 0,
};

// The weight typed in at account setup, four minutes before the first real
// weigh-in: no device, nothing but a number.
const SETUP_ENTRY = {
  id: "6071355276006752000",
  timeStamp: 1789188499,
  deviceType: "00000",
  weight: 86,
  bmi: 27.1,
  bodyfat: 0,
  fatFreeWeight: 0,
};

describe("wire encoding", () => {
  it("round-trips a body through AES-128-ECB", () => {
    const body = { pageNum: 1, userIds: ["6071354294872801152"] };
    expect(decryptBody(encryptBody(Buffer.from(JSON.stringify(body))))).toEqual(body);
  });

  it("encrypts an empty body to one padded block", () => {
    expect(Buffer.from(encryptBody(Buffer.alloc(0)), "base64")).toHaveLength(16);
  });
});

describe("parseRenphoJson", () => {
  it("keeps 19-digit ids exact instead of rounding them", () => {
    // The bug that made the first pull return zero rows.
    const naive = JSON.parse('{"id":6071354294872801152}') as { id: number };
    expect(String(naive.id)).not.toBe("6071354294872801152");

    expect(parseRenphoJson('{"id":6071354294872801152}')).toEqual({
      id: "6071354294872801152",
    });
  });

  it("quotes long ids inside arrays and nested objects", () => {
    expect(
      parseRenphoJson('{"scale":[{"userIds":[6071354294872801152, 12],"count":0}]}')
    ).toEqual({ scale: [{ userIds: ["6071354294872801152", 12], count: 0 }] });
  });

  it("leaves ordinary numbers as numbers", () => {
    expect(parseRenphoJson('{"weight":82.75,"timeStamp":1791125910,"n":-3,"e":1e21}')).toEqual({
      weight: 82.75,
      timeStamp: 1791125910,
      n: -3,
      e: 1e21,
    });
  });

  it("does not touch digits inside a string value", () => {
    const text = '{"note":"ids: 6071354294872801152, and \\"quoted\\"","id":6071354294872801152}';
    expect(parseRenphoJson(text)).toEqual({
      note: 'ids: 6071354294872801152, and "quoted"',
      id: "6071354294872801152",
    });
  });
});

describe("isScaleReading", () => {
  it("accepts a record a scale produced", () => {
    expect(isScaleReading(REPORT)).toBe(true);
  });

  it("rejects the weight typed in at account setup", () => {
    expect(isScaleReading(SETUP_ENTRY)).toBe(false);
  });

  it("rejects a record with no device type at all", () => {
    expect(isScaleReading({ weight: 80 })).toBe(false);
  });
});

describe("mapRenphoRecord", () => {
  const mapped = mapRenphoRecord(REPORT)!;

  it("namespaces the id and reads the timestamp as UTC seconds", () => {
    expect(mapped.externalId).toBe("renpho:6087607455611716000");
    expect(mapped.measuredAt.toISOString()).toBe("2026-10-04T14:58:30.000Z");
    expect(mapped.weightKg).toBe(82.75);
  });

  it("maps every whole-body value to the number on the report", () => {
    expect(mapped.fields).toMatchObject({
      bodyFatPct: 13.2,
      bmi: 26.1,
      fatFreeWeightKg: 71.83,
      muscleMassKg: 67.03,
      muscleMassPct: 81,
      skeletalMusclePct: 49.9,
      skeletalMuscleKg: 41.29,
      smi: 10.1,
      bodyWaterPct: 63.6,
      proteinPct: 17.4,
      boneMassKg: 4.8,
      visceralFat: 2,
      subcutaneousFatPct: 9.5,
      bmrKcal: 1921,
      metabolicAge: 29,
      whrEstimate: 0.7,
    });
  });

  it("derives the three kg values the report prints but the API omits", () => {
    expect(mapped.fields.fatMassKg).toBe(10.92);
    expect(mapped.fields.bodyWaterKg).toBe(52.63);
    expect(mapped.fields.proteinKg).toBe(14.4);
  });

  it("maps segmental muscle and fat to left/right/trunk columns", () => {
    expect(mapped.fields).toMatchObject({
      muscleLeftArmKg: 4.19, muscleRightArmKg: 4.16, muscleTrunkKg: 31.33,
      muscleLeftLegKg: 11.86, muscleRightLegKg: 11.85,
      fatLeftArmKg: 0.43, fatRightArmKg: 0.44, fatTrunkKg: 5.49,
      fatLeftLegKg: 1.78, fatRightLegKg: 1.77,
    });
  });

  it("maps impedance by segment at both frequencies", () => {
    expect(mapped.impedance).toEqual({
      z20: { rightArm: 269.7, leftArm: 258.2, trunk: 16.8, rightLeg: 213.8, leftLeg: 208.3 },
      z100: { rightArm: 236.5, leftArm: 226.4, trunk: 16.6, rightLeg: 175.4, leftLeg: 171.2 },
    });
  });

  it("keys reference ranges by our column names", () => {
    expect(mapped.referenceRanges).toMatchObject({
      bodyFatPct: { min: 10, max: 20, std: 15 },
      fatMassKg: { min: 8.4, max: 16.8, std: 10.5 },
      skeletalMuscleKg: { min: 29.9, max: 36.5, std: 33.2 },
      boneMassKg: { min: 3.4, max: 4.2 },
      muscleLeftArmKg: { std: 3.44 },
      fatLeftArmKg: { std: 0.68 },
    });
  });

  it("leaves BMI's range out, because its meaning is unconfirmed", () => {
    expect(mapped.referenceRanges).not.toHaveProperty("bmi");
  });

  it("never stores RENPHO's zero as a reading", () => {
    // heartRate: 0 on the record means "not measured".
    expect(mapped.fields).not.toHaveProperty("heartRateBpm");
    const bare = mapRenphoRecord({ ...SETUP_ENTRY, deviceType: "00053" })!;
    expect(bare.fields).toEqual({ bmi: 27.1 });
    expect(bare.impedance).toBeNull();
  });

  it("keeps the untouched record", () => {
    expect(mapped.raw).toBe(REPORT);
    expect(mapped.raw.bodyScore).toBe(92);
  });

  it("rejects a record with no weight or no timestamp", () => {
    expect(mapRenphoRecord({ ...REPORT, weight: 0 })).toBeNull();
    expect(mapRenphoRecord({ ...REPORT, timeStamp: undefined })).toBeNull();
  });
});

describe("planRenphoWrite", () => {
  const mapped = mapRenphoRecord(REPORT)!;
  const at = mapped.measuredAt.getTime();

  const row = (over: Partial<RenphoCandidateRow> & { values?: Record<string, number | null> }) =>
    ({
      id: "row",
      measuredAt: new Date(at),
      externalId: null,
      impedance: null,
      referenceRanges: null,
      ...over,
      values: over.values ?? {},
    }) satisfies RenphoCandidateRow;

  const plan = (rows: RenphoCandidateRow[]) =>
    planRenphoWrite(mapped, rows, NEAR_MS, NEAR_KG);

  it("creates when nothing is near", () => {
    expect(plan([])).toEqual({ action: "create" });
    expect(
      plan([row({ measuredAt: new Date(at - 24 * 3600_000), values: { weightKg: 82.75 } })])
    ).toEqual({ action: "create" });
  });

  it("adopts the Apple Health row stamped five seconds earlier", () => {
    const result = plan([
      row({ id: "ah", measuredAt: new Date(at - 5000), values: { weightKg: 82.75 } }),
    ]);
    expect(result.action).toBe("link");
    if (result.action !== "link") return;
    expect(result.rowId).toBe("ah");
    // Weight already matches, so it is not rewritten; composition is added.
    expect(result.patch).not.toHaveProperty("weightKg");
    expect(result.patch.bodyFatPct).toBe(13.2);
    expect(result.patch.muscleTrunkKg).toBe(31.33);
  });

  it("overwrites a hand-typed value that disagrees with the scale", () => {
    const result = plan([
      row({ id: "typed", values: { weightKg: 82.75, bodyFatPct: 14 } }),
    ]);
    expect(result.action).toBe("link");
    if (result.action !== "link") return;
    expect(result.patch.bodyFatPct).toBe(13.2);
  });

  it("never touches a column the scale does not carry", () => {
    const result = plan([row({ id: "tape", values: { weightKg: 82.75, waistCm: 84 } })]);
    if (result.action !== "link") throw new Error("expected link");
    expect(result.patch).not.toHaveProperty("waistCm");
  });

  it("does not adopt a row already claimed by a different record", () => {
    expect(
      plan([row({ externalId: "renpho:1", values: { weightKg: 82.75 } })])
    ).toEqual({ action: "create" });
  });

  it("does not adopt a row whose weight is too far off", () => {
    expect(plan([row({ values: { weightKg: 83.5 } })])).toEqual({ action: "create" });
  });

  it("adopts the nearest of two unclaimed rows", () => {
    const result = plan([
      row({ id: "far", measuredAt: new Date(at - 8 * 60_000), values: { weightKg: 82.7 } }),
      row({ id: "near", measuredAt: new Date(at - 5000), values: { weightKg: 82.75 } }),
    ]);
    expect(result).toMatchObject({ action: "link", rowId: "near" });
  });

  const imported = () =>
    row({
      id: "done",
      externalId: mapped.externalId,
      values: { weightKg: mapped.weightKg, ...mapped.fields },
      impedance: mapped.impedance,
      referenceRanges: mapped.referenceRanges,
    });

  it("is idempotent: an already-imported record changes nothing", () => {
    expect(plan([imported()])).toEqual({ action: "unchanged", rowId: "done" });
  });

  it("stays idempotent when the database returns JSON keys in another order", () => {
    // Postgres JSONB reorders keys. Found by the real backfill: the second
    // pass reported 5 merged instead of 5 unchanged.
    const reordered = imported();
    reordered.impedance = {
      z100: { trunk: 16.6, leftLeg: 171.2, rightLeg: 175.4, leftArm: 226.4, rightArm: 236.5 },
      z20: { trunk: 16.8, leftLeg: 208.3, rightLeg: 213.8, leftArm: 258.2, rightArm: 269.7 },
    };
    expect(plan([reordered])).toEqual({ action: "unchanged", rowId: "done" });
  });

  it("prefers the already-imported row over a nearer unclaimed one", () => {
    const result = plan([
      row({ id: "other", values: { weightKg: 82.75 } }),
      imported(),
    ]);
    expect(result).toEqual({ action: "unchanged", rowId: "done" });
  });

  it("refreshes an imported row whose stored value has drifted", () => {
    const drifted = imported();
    drifted.values.bodyFatPct = 99;
    expect(plan([drifted])).toEqual({
      action: "refresh",
      rowId: "done",
      patch: { bodyFatPct: 13.2 },
    });
  });

  it("refreshes when only the impedance is missing", () => {
    const partial = imported();
    partial.impedance = null;
    expect(plan([partial])).toEqual({ action: "refresh", rowId: "done", patch: {} });
  });
});
