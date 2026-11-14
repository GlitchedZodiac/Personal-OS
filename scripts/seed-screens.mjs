#!/usr/bin/env node
// Synthetic seed for the screen audit (lane C, 2026-10-17).
//
// Fills a THROWAWAY database with invented-but-realistic data for every
// surface — health, food, body, train, today, report, spirit, finance,
// todos, journal, chat — so the screenshots committed under
// docs/design/screen-audit/ never show Michael's real numbers (the repo is
// public). Deterministic: the same seed produces the same rows, including
// stable ids (the audit links to a workout detail and an ink page by id).
//
//   createdb pitaya_lane_c_demo
//   DATABASE_URL="postgresql://…/pitaya_lane_c_demo?sslmode=disable" \
//   DIRECT_URL="postgresql://…/pitaya_lane_c_demo?sslmode=disable" \
//     npx prisma migrate deploy
//   DATABASE_URL="postgresql://…/pitaya_lane_c_demo?sslmode=disable" \
//     node scripts/seed-screens.mjs
//
// SAFETY: refuses to run unless the connection string — as pg itself parses
// it, so `?host=` cannot redirect it — names a LOCAL host (localhost,
// 127.0.0.1, ::1) AND a database whose name ends in `_demo`, with no query
// parameter other than sslmode. It TRUNCATES every public table first — a
// wipe-and-fill for a disposable database, never a migration. It writes a
// marker (`user_settings.data.screenSeed`) that scripts/screenshot-screens.mjs
// requires before it will write anything under docs/. SEED_TODAY=YYYY-MM-DD
// pins "today" (default: today in America/Bogota).
//
// Every profile value here is INVENTED (birth year, height, reference
// ranges, start weight, trails). The one real number that shows in captures
// is the Body screen's start point, hard-coded in app logic
// (lib/body-view.ts BODY_START) and already public in the repository.

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { parse as parseConnection } from "pg-connection-string";
import { seedRefusal } from "./screens-guards.mjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─── connection + guard ─────────────────────────────────────────────────────

const rawUrl = (process.env.DATABASE_URL ?? "").trim();
if (!rawUrl) {
  console.error("DATABASE_URL is required (point it at a *_demo database).");
  process.exit(1);
}
const refusal = seedRefusal(rawUrl);
if (refusal) {
  console.error(`Refusing to seed: ${refusal}. The seed wipes the database and only runs against a local *_demo database.`);
  process.exit(1);
}
const url = new URL(rawUrl);
const dbName = parseConnection(rawUrl).database;
const sslmode = url.searchParams.get("sslmode");
for (const p of ["pgbouncer", "connection_limit", "pool_timeout", "sslmode"]) url.searchParams.delete(p);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url.toString(),
    ssl: sslmode === "disable" ? undefined : { rejectUnauthorized: false },
    max: 2,
  }),
});

// ─── determinism helpers ────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261017);
const rnd = (lo, hi) => lo + rand() * (hi - lo);
const rint = (lo, hi) => Math.floor(rnd(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** Stable uuid from a label — the audit links to rows by id. */
function uid(label) {
  const h = createHash("sha1").update(`pitaya-demo:${label}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ─── calendar (America/Bogota is UTC-5 all year) ────────────────────────────

const TZ_OFFSET_H = 5;
const todayStr = process.env.SEED_TODAY ?? bogotaDay(new Date());
const [TY, TM, TD] = todayStr.split("-").map(Number);

function bogotaDay(date) {
  const shifted = new Date(date.getTime() - TZ_OFFSET_H * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
/** Local Bogotá time on (today − daysAgo) as a Date. */
function at(daysAgo, hour = 12, minute = 0) {
  return new Date(Date.UTC(TY, TM - 1, TD - daysAgo, hour + TZ_OFFSET_H, minute));
}
function dayStr(daysAgo) {
  return bogotaDay(at(daysAgo, 12));
}
function isoWeekMonday(daysAgo) {
  const d = at(daysAgo, 12);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return bogotaDay(new Date(d.getTime() - dow * 86400_000));
}

// ─── tiny PNG (progress photos, journal photo, label photo) ────────────────

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** A soft two-tone PNG with a diagonal — reads as "a photo", carries nothing. */
function pngDataUrl(w, h, [r1, g1, b1], [r2, g2, b2]) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    row[0] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2;
      row[1 + x * 3] = Math.round(r1 + (r2 - r1) * t);
      row[2 + x * 3] = Math.round(g1 + (g2 - g1) * t);
      row[3 + x * 3] = Math.round(b1 + (b2 - b1) * t);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ─── polyline (Google encoding, 1e5 — matches lib/polyline.ts) ─────────────

function encodePolyline(points) {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const enc = (v) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = "";
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}

/** A gentle loop in the hills north of an invented trailhead. */
function loopRoute(startLat, startLng, km, n = 60) {
  const pts = [];
  const rad = (km / 2 / 111) * 0.5; // rough degrees for a loop of ~km
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wobble = 1 + 0.08 * Math.sin(a * 5);
    pts.push([
      round(startLat + Math.sin(a) * rad * wobble, 6),
      round(startLng + (Math.cos(a) - 1) * rad * 1.3 * wobble, 6),
    ]);
  }
  return pts;
}

// ─── wipe ───────────────────────────────────────────────────────────────────

async function wipe() {
  const rows = await prisma.$queryRawUnsafe(
    `select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`
  );
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`truncate ${names} restart identity cascade`);
}

// ─── settings ───────────────────────────────────────────────────────────────

async function seedSettings() {
  await prisma.userSettings.create({
    data: {
      id: "default",
      data: {
        calorieTarget: 2300,
        proteinPct: 32,
        carbsPct: 38,
        fatPct: 30,
        units: "metric",
        theme: "light",
        gender: "male",
        birthYear: 1985,
        aiLanguage: "english",
        timeZone: "America/Bogota",
        bodyGoals: { goalWeightKg: 84, goalWaistCm: 88 },
        healthGoals: { weightKg: 84, bodyFatPct: 16, byDate: `${TY + 1}-04-30` },
        // The marker scripts/screenshot-screens.mjs requires before writing
        // under docs/ — a production database never carries it.
        screenSeed: new Date().toISOString(),
        aiInstructions: { health: "", todos: "", social: "", finance: "" },
        workoutGoals: {
          goal: "build_muscle",
          fitnessLevel: "intermediate",
          daysPerWeek: 4,
          sessionMinutes: 45,
          equipment: ["kettlebells", "full_gym"],
          focusAreas: ["full_body"],
          injuries: "",
        },
        hrZoneTops: [120, 150, 165, 180],
        chatNewChatGapHours: 6,
        finance: {
          defaultCurrency: "COP",
          syncIntervalMinutes: 15,
          gmailLookbackMonths: 12,
          gmailCuratedSyncOnly: true,
          autoReviewThreshold: 0.75,
          receiptRequireReview: true,
        },
        notificationPrefs: {
          weighIn: true,
          weeklyReport: true,
          prCelebration: true,
          plannedWorkout: true,
          dueReminders: true,
          systemAlerts: false,
          spiritHomework: true,
          activityReports: true,
          quietHoursEnabled: true,
          quietStart: "22:00",
          quietEnd: "07:00",
          remindersBreakQuiet: true,
          timeZone: "America/Bogota",
        },
      },
    },
  });
}

// ─── food ───────────────────────────────────────────────────────────────────

const MEALS = {
  breakfast: [
    ["Greek yogurt, berries, granola", 410, 28, 48, 11],
    ["3-egg omelette with spinach and feta", 390, 27, 6, 28],
    ["Oats with whey, banana and peanut butter", 520, 36, 62, 14],
    ["Arepa with scrambled eggs and avocado", 470, 20, 44, 24],
  ],
  lunch: [
    ["Chicken bowl: rice, black beans, pico, lime", 680, 52, 74, 16],
    ["Salmon plate with sweet potato and greens", 640, 44, 42, 28],
    ["Turkey wrap with hummus and crunchy veg", 560, 38, 52, 20],
    ["Lentil soup, two slices of sourdough", 540, 26, 78, 12],
    ["Bandeja mini: beans, rice, egg, plantain", 760, 32, 96, 24],
  ],
  dinner: [
    ["Grilled steak, roast potatoes, broccoli", 720, 54, 46, 32],
    ["Pan-seared tilapia, quinoa, asparagus", 580, 48, 44, 18],
    ["Chicken thighs, rice, cucumber salad", 690, 50, 58, 26],
    ["Beef and vegetable stir-fry on rice", 650, 42, 64, 22],
    ["Double shake: whey, oats, banana, cocoa", 480, 52, 50, 8],
  ],
  snack: [
    ["Protein bar", 210, 20, 22, 7],
    ["Apple with peanut butter", 260, 7, 30, 14],
    ["Cottage cheese and pineapple", 190, 22, 16, 4],
    ["Handful of almonds", 170, 6, 6, 15],
    ["Casein shake", 130, 24, 4, 1],
  ],
};
const MEAL_HOURS = { breakfast: [7, 30], lunch: [12, 45], dinner: [19, 15], snack: [16, 10] };

async function seedFood() {
  const rows = [];
  for (let d = 0; d < 75; d++) {
    // the odd unlogged day — the report's "logged days" count stays honest
    if (d > 2 && rand() < 0.14) continue;
    const meals = d % 5 === 0 ? ["breakfast", "lunch", "dinner"] : ["breakfast", "lunch", "snack", "dinner"];
    for (const meal of meals) {
      // Today is early: breakfast only, nothing to drink logged yet — so the
      // readiness screen shows its red, recovery-focus state.
      if (d === 0 && meal !== "breakfast") continue;
      const [desc, kcal, p, c, f] = pick(MEALS[meal]);
      const [h, m] = MEAL_HOURS[meal];
      rows.push({
        id: uid(`food-${d}-${meal}`),
        loggedAt: at(d, h, m + rint(-20, 20)),
        mealType: meal,
        foodDescription: desc,
        calories: kcal,
        proteinG: p,
        carbsG: c,
        fatG: f,
        source: pick(["voice", "voice", "voice", "photo", "manual"]),
        notes: null,
      });
    }
  }
  await prisma.foodLog.createMany({ data: rows });

  await prisma.favoriteFoods.createMany({
    data: [
      { foodDescription: "Chicken bowl", mealType: "lunch", calories: 680, proteinG: 52, carbsG: 74, fatG: 16, usageCount: 23, kind: "meal" },
      { foodDescription: "Salmon plate", mealType: "dinner", calories: 640, proteinG: 44, carbsG: 42, fatG: 28, usageCount: 11, kind: "meal" },
      { foodDescription: "Double shake", mealType: "snack", calories: 480, proteinG: 52, carbsG: 50, fatG: 8, usageCount: 31, kind: "meal" },
      { foodDescription: "PB toast", mealType: "breakfast", calories: 340, proteinG: 12, carbsG: 36, fatG: 17, usageCount: 9, kind: "meal" },
      { foodDescription: "Whey isolate, vanilla", mealType: "snack", calories: 120, proteinG: 25, carbsG: 2, fatG: 1, usageCount: 40, kind: "product", servingLabel: "1 scoop (31 g)" },
      { foodDescription: "Greek yogurt, plain 2%", mealType: "breakfast", calories: 130, proteinG: 17, carbsG: 7, fatG: 3.5, usageCount: 14, kind: "product", servingLabel: "1 cup (200 g)", photoData: pngDataUrl(48, 64, [240, 232, 236], [166, 61, 99]) },
      { foodDescription: "Oat granola", mealType: "breakfast", calories: 210, proteinG: 5, carbsG: 32, fatG: 7, usageCount: 6, kind: "product", servingLabel: "½ cup (50 g)" },
    ],
  });

  const water = [];
  for (let d = 1; d < 14; d++) {
    const glasses = rint(4, 9);
    for (let g = 0; g < glasses; g++) {
      water.push({ loggedAt: at(d, 7 + Math.floor((g * 13) / glasses), rint(0, 59)), amountMl: pick([250, 250, 330, 500]) });
    }
  }
  await prisma.waterLog.createMany({ data: water });

  const habits = [];
  const names = ["creatine", "magnesium", "complex-b", "journal", "mobility", "10k steps"];
  for (let d = 0; d < 40; d++) {
    for (const name of names) {
      const p = name === "creatine" ? 0.9 : name === "mobility" ? 0.45 : 0.65;
      if (d === 0 ? ["creatine", "magnesium"].includes(name) : rand() < p) {
        habits.push({ name, localDate: dayStr(d), createdAt: at(d, 8, 5) });
      }
    }
  }
  await prisma.habitCheck.createMany({ data: habits, skipDuplicates: true });
}

// ─── body ───────────────────────────────────────────────────────────────────

// Invented: a 1.76 m profile (BMI 18.5–25 = 57.3–77.4 kg).
const REFERENCE = {
  bmrKcal: { min: 1540, max: 1880, std: 1710 },
  weightKg: { min: 57.3, max: 77.4, std: 67.4 },
  fatMassKg: { min: 7.9, max: 15.8, std: 10.1 },
  bodyFatPct: { min: 11, max: 21, std: 16 },
  bodyWaterKg: { min: 36.2, max: 44.8 },
  muscleMassKg: { min: 46.3, max: 57.9 },
  skeletalMuscleKg: { min: 27.1, max: 33.4 },
  visceralFat: { min: 1, max: 9 },
  boneMassKg: { min: 3.1, max: 3.9 },
  proteinKg: { min: 9.9, max: 12.4 },
  bmi: { min: 18.5, max: 25, std: 21.7 },
};

async function seedBody() {
  const HEIGHT_M = 1.76;
  const startDay = 280; // ~9 months ago
  const rows = [];
  let w = 104.6;
  for (let d = startDay; d >= 0; d--) {
    // steady loss with noise and a two-week plateau in the middle
    const slope = d > 150 && d < 165 ? 0.0 : 0.047;
    w = w - slope + rnd(-0.45, 0.45) * 0.6;
    if (d % 7 === 3 && rand() < 0.3) continue; // missed weigh-in
    const weightKg = round(w, 2);
    const recent = d < 36; // the 8-electrode scale arrived five weeks ago
    const fatPct = round(31 - (startDay - d) * 0.043 + rnd(-0.4, 0.4), 1);
    const base = {
      id: uid(`weigh-${d}`),
      measuredAt: at(d, 6, 40 + rint(0, 15)),
      weightKg,
      source: recent ? "renpho_api" : d < 120 ? "vesync" : "apple_health",
    };
    if (recent) {
      const fatMassKg = round((weightKg * fatPct) / 100, 2);
      const ffm = round(weightKg - fatMassKg, 2);
      Object.assign(base, {
        bodyFatPct: fatPct,
        bmi: round(weightKg / (HEIGHT_M * HEIGHT_M), 1),
        fatFreeWeightKg: ffm,
        fatMassKg,
        skeletalMuscleKg: round(ffm * 0.49, 2),
        skeletalMusclePct: round((ffm * 0.49 * 100) / weightKg, 1),
        muscleMassKg: round(ffm * 0.93, 2),
        muscleMassPct: round((ffm * 0.93 * 100) / weightKg, 1),
        bodyWaterKg: round(ffm * 0.72, 2),
        bodyWaterPct: round((ffm * 0.72 * 100) / weightKg, 1),
        proteinKg: round(ffm * 0.19, 2),
        proteinPct: round((ffm * 0.19 * 100) / weightKg, 1),
        boneMassKg: round(ffm * 0.055, 2),
        visceralFat: Math.max(3, Math.round(fatPct / 2.6)),
        bmrKcal: Math.round(370 + 21.6 * ffm),
        metabolicAge: Math.round(30 + (fatPct - 15) * 0.6),
        smi: round((ffm * 0.49) / (HEIGHT_M * HEIGHT_M), 2),
        subcutaneousFatPct: round(fatPct * 0.9, 1),
        heartRateBpm: rint(54, 62),
        muscleLeftArmKg: round(ffm * 0.055, 2),
        muscleRightArmKg: round(ffm * 0.057, 2),
        muscleTrunkKg: round(ffm * 0.46, 2),
        muscleLeftLegKg: round(ffm * 0.165, 2),
        muscleRightLegKg: round(ffm * 0.168, 2),
        fatLeftArmKg: round(fatMassKg * 0.06, 2),
        fatRightArmKg: round(fatMassKg * 0.06, 2),
        fatTrunkKg: round(fatMassKg * 0.52, 2),
        fatLeftLegKg: round(fatMassKg * 0.16, 2),
        fatRightLegKg: round(fatMassKg * 0.16, 2),
        referenceRanges: REFERENCE,
        fieldSources: { weightKg: "renpho_api", bodyFatPct: "renpho_api" },
        externalId: `renpho:demo-${d}`,
      });
    } else if (d < 120) {
      Object.assign(base, { bodyFatPct: fatPct, bmi: round(weightKg / (HEIGHT_M * HEIGHT_M), 1), bmrKcal: Math.round(370 + 21.6 * weightKg * (1 - fatPct / 100)) });
    }
    rows.push(base);
  }
  // tape, roughly monthly
  const tape = [];
  for (let k = 0; k < 9; k++) {
    const d = 4 + k * 34;
    tape.push({
      id: uid(`tape-${k}`),
      measuredAt: at(d, 7, 10),
      source: "manual",
      waistCm: round(84 + k * 2.6, 1),
      chestCm: round(104 - k * 0.6, 1),
      hipsCm: round(98 + k * 1.4, 1),
      neckCm: round(39.5 + k * 0.4, 1),
      armsCm: round(36.5 - k * 0.2, 1),
      forearmsCm: round(30 - k * 0.1, 1),
      legsCm: round(60 + k * 0.5, 1),
      calvesCm: round(39 + k * 0.1, 1),
      shouldersCm: round(118 - k * 0.3, 1),
    });
  }
  await prisma.bodyMeasurement.createMany({ data: [...rows, ...tape] });

  await prisma.bodyMilestone.createMany({
    data: [
      { day: dayStr(176), title: "First 5 kg gone", note: "automatic", weightKg: 99.6 },
      { day: dayStr(118), title: "Under 97", note: "the scale said 96.9", weightKg: 96.9 },
      { day: dayStr(96), title: "34-inch jeans", note: "logged", weightKg: 95.8 },
      { day: dayStr(41), title: "The climb — Cerro del Viento", note: "logged", weightKg: 93.4 },
      { day: dayStr(19), title: "BMI under 30", weightKg: 92.8 },
    ],
  });
}

// ─── daily health + activity ────────────────────────────────────────────────

async function seedDaily() {
  const snaps = [];
  const acts = [];
  for (let d = 0; d < 70; d++) {
    const weekend = [0, 6].includes(at(d).getUTCDay());
    const steps = Math.round((weekend ? 11800 : 8200) + rnd(-2800, 3200));
    const active = Math.round(380 + steps * 0.028 + rnd(-60, 90));
    snaps.push({
      localDate: dayStr(d),
      timeZone: "America/Bogota",
      steps,
      restingHeartRateBpm: rint(52, 60),
      activeEnergyKcal: active,
      walkingRunningDistanceMeters: Math.round(steps * 0.78),
      sleepMinutes: d % 9 === 4 ? null : rint(370, 480),
      sleepDeepMinutes: rint(55, 95),
      sleepRemMinutes: rint(70, 120),
      hrvMs: round(rnd(38, 64), 1),
      respiratoryRateBrpm: round(rnd(13.5, 15.5), 1),
      wristTempC: round(rnd(-0.4, 0.5), 2),
      vo2Max: d % 14 === 0 ? round(rnd(41, 44), 1) : null,
      spo2Pct: round(rnd(95.5, 98.5), 1),
      source: "apple_health",
    });
    acts.push({
      date: dayStr(d),
      steps,
      activeEnergyKcal: active,
      restingEnergyKcal: Math.round(1790 + rnd(-30, 30)),
      walkingRunningDistanceKm: round(steps * 0.00078, 2),
      source: "mixed",
    });
  }
  await prisma.dailyHealthSnapshot.createMany({ data: snaps });
  await prisma.dailyActivity.createMany({ data: acts });
}

// ─── train ──────────────────────────────────────────────────────────────────

const KB = [
  ["kb-swing", "Kettlebell Swing", 24, [15, 20]],
  ["kb-goblet-squat", "Goblet Squat", 20, [8, 12]],
  ["kb-clean-and-press", "Clean and Press", 16, [5, 8]],
  ["kb-snatch", "Kettlebell Snatch", 16, [8, 10]],
  ["kb-row", "Kettlebell Row", 20, [8, 12]],
  ["kb-press", "Kettlebell Press", 16, [5, 8]],
  ["kb-turkish-get-up", "Turkish Get-Up", 12, [1, 3]],
  ["kb-front-squat", "Front Squat", 20, [6, 10]],
  ["kb-farmer-carry", "Farmer Carry", 24, [1, 1]],
];
const GYM = [
  ["dumbbell-bench-press", "Dumbbell Bench Press", 22, [6, 10], 2],
  ["machine-shoulder-press", "Machine Shoulder Press", 36, [6, 10], 1],
  ["rear-delt-fly", "Rear Delt Fly", 25, [10, 12], 1],
  ["leg-press", "Leg Press", 110, [8, 12], 1],
  ["lat-pulldown", "Lat Pulldown", 55, [8, 12], 1],
  ["tricep-pushdown", "Tricep Pushdown", 25, [10, 12], 1],
];

function zones(totalSeconds, profile) {
  const pct = profile === "hard" ? [8, 22, 38, 26, 6] : profile === "walk" ? [74, 20, 5, 1, 0] : [30, 42, 20, 7, 1];
  const seconds = pct.map((p) => Math.round((totalSeconds * p) / 100));
  return { pct, seconds, totalSeconds };
}
function hrStream(n, lo, hi) {
  const hr = [];
  const time = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    hr.push(Math.round(lo + (hi - lo) * Math.min(1, t * 1.8) * (0.85 + 0.15 * Math.sin(t * 14)) + rnd(-3, 3)));
    time.push(i * 10);
  }
  return { hr, time };
}

async function seedTrain() {
  const trailA = {
    id: uid("trail-a"),
    name: "Cerro del Viento loop",
    aliases: ["the loop"],
    distanceMeters: 5200,
    elevationGainM: 248,
    startLat: 4.7331,
    startLng: -74.0212,
    endLat: 4.7331,
    endLng: -74.0212,
    summaryPolyline: encodePolyline(loopRoute(4.7331, -74.0212, 5.2)),
  };
  const trailB = {
    id: uid("trail-b"),
    name: "Quebrada ridge out-and-back",
    aliases: [],
    distanceMeters: 8300,
    elevationGainM: 465,
    startLat: 4.7612,
    startLng: -74.0309,
    endLat: 4.7612,
    endLng: -74.0309,
    summaryPolyline: encodePolyline(loopRoute(4.7612, -74.0309, 8.3, 80)),
  };
  await prisma.trail.createMany({ data: [trailA, trailB] });

  const workouts = [];
  const prs = new Map();
  const bumpPR = (exercise, name, kind, value, unit, when, wid) => {
    const key = `${exercise}:${kind}`;
    const cur = prs.get(key);
    if (!cur || value > cur.value) prs.set(key, { exercise, exerciseName: name, kind, value, unit, previousValue: cur?.value ?? null, achievedAt: when, workoutLogId: wid });
  };

  for (let d = 150; d >= 0; d--) {
    const dow = at(d).getUTCDay(); // 0 Sun … 6 Sat
    const progress = (150 - d) / 150;
    if ([1, 3, 5].includes(dow)) {
      // kettlebell day (Mon/Wed/Fri)
      if (rand() < 0.12) continue;
      const id = uid(`kb-${d}`);
      const started = at(d, 6, 45);
      const picks = [KB[0], ...KB.slice(1).filter(() => rand() < 0.55)].slice(0, 5);
      const exercises = picks.map(([ex, name, bell, reps]) => {
        const weightKg = bell + (progress > 0.6 ? 4 : progress > 0.3 ? 2 : 0) * (rand() < 0.6 ? 1 : 0);
        const r = rint(reps[0], reps[1]);
        const sets = ex === "kb-farmer-carry" ? 3 : rint(3, 5);
        bumpPR(ex, name, "weight", weightKg, "kg", started, id);
        bumpPR(ex, name, "volume", weightKg * r * sets, "kg-reps", started, id);
        return { name, exercise: ex, sets, reps: r, weightKg };
      });
      const dur = rint(32, 48);
      const { hr, time } = hrStream(120, 98, 168);
      workouts.push({
        id,
        startedAt: started,
        endedAt: new Date(started.getTime() + dur * 60_000),
        durationMinutes: dur,
        workoutType: "strength",
        description: "Kettlebell block",
        caloriesBurned: Math.round(dur * 8.2 + rnd(-20, 30)),
        avgHeartRateBpm: 138,
        maxHeartRateBpm: 172,
        exercises,
        metricsData: { timeInZones: zones(dur * 60, "mid"), hrStream: hr, timeStream: time, loadScore: rint(55, 90), relativeEffort: rint(55, 90) },
        source: "mobile",
        externalSource: "app_watch",
        externalId: `demo-kb-${d}`,
        deviceType: "watch",
      });
    } else if (dow === 2 || dow === 4) {
      // gym (freestyle, voice-logged) on Tue, walk on Thu
      if (dow === 2 && rand() < 0.5) {
        const id = uid(`gym-${d}`);
        const started = at(d, 17, 30);
        const exercises = GYM.filter(() => rand() < 0.7).map(([ex, name, kg, reps, impl]) => ({
          name,
          exercise: ex,
          sets: 3,
          reps: rint(reps[0], reps[1]),
          weightKg: round(kg * (1 + progress * 0.18), 1),
          ...(impl === 2 ? { implements: 2 } : {}),
        }));
        const dur = rint(40, 58);
        const { hr, time } = hrStream(140, 92, 152);
        workouts.push({
          id,
          startedAt: started,
          endedAt: new Date(started.getTime() + dur * 60_000),
          durationMinutes: dur,
          workoutType: "freestyle",
          description: "Upper body — gym",
          caloriesBurned: Math.round(dur * 6.1),
          avgHeartRateBpm: 121,
          maxHeartRateBpm: 151,
          exercises,
          metricsData: { timeInZones: zones(dur * 60, "mid"), hrStream: hr, timeStream: time, loadScore: rint(40, 70), relativeEffort: rint(40, 70) },
          source: "mobile",
          externalSource: "app_watch",
          externalId: `demo-gym-${d}`,
          deviceType: "watch",
        });
      } else if (dow === 4 || rand() < 0.4) {
        const id = uid(`walk-${d}`);
        const started = at(d, 18, 10);
        const km = round(rnd(3.6, 5.4), 2);
        const dur = Math.round(km * 11.2 + rnd(-3, 4));
        const pts = loopRoute(4.7102 + rnd(-0.01, 0.01), -74.0448, km, 50);
        const { hr, time } = hrStream(dur * 6, 88, 128);
        workouts.push({
          id,
          startedAt: started,
          endedAt: new Date(started.getTime() + dur * 60_000),
          durationMinutes: dur,
          workoutType: "walk",
          caloriesBurned: Math.round(km * 62),
          distanceMeters: Math.round(km * 1000),
          stepCount: Math.round(km * 1270),
          elevationGainM: round(rnd(18, 60), 1),
          avgHeartRateBpm: 112,
          maxHeartRateBpm: 131,
          routeData: { source: "apple_watch_gps", points: pts.map(([lat, lng], i) => ({ lat, lng, t: i * Math.round((dur * 60) / 50), alt: 2580 + Math.sin(i / 8) * 14 })), summaryPolyline: encodePolyline(pts) },
          metricsData: {
            timeInZones: zones(dur * 60, "walk"),
            hrStream: hr,
            timeStream: time,
            splits: Array.from({ length: Math.floor(km) }, () => Math.round(rnd(640, 720))),
            avgCadenceSpm: rint(108, 118),
            loadScore: rint(18, 32),
            relativeEffort: rint(18, 32),
          },
          source: "mobile",
          externalSource: "app_watch",
          externalId: `demo-walk-${d}`,
          deviceType: "watch",
        });
      }
    } else if (dow === 0 && d % 14 < 7) {
      // alternate Sundays: a hike on a named trail
      const trail = d % 28 < 14 ? trailA : trailB;
      const id = uid(`hike-${d}`);
      const started = at(d, 7, 5);
      const km = trail.distanceMeters / 1000;
      const dur = Math.round(km * 16.5 + rnd(-8, 10));
      const pts = loopRoute(trail.startLat, trail.startLng, km, 70);
      const { hr, time } = hrStream(dur * 6, 96, 158);
      workouts.push({
        id,
        startedAt: started,
        endedAt: new Date(started.getTime() + dur * 60_000),
        durationMinutes: dur,
        workoutType: "hike",
        caloriesBurned: Math.round(km * 92),
        distanceMeters: Math.round(km * 1000 + rnd(-120, 120)),
        stepCount: Math.round(km * 1310),
        elevationGainM: round(trail.elevationGainM + rnd(-12, 12), 1),
        packKg: 6,
        avgHeartRateBpm: 134,
        maxHeartRateBpm: 166,
        trailId: trail.id,
        routeData: { source: "apple_watch_gps", points: pts.map(([lat, lng], i) => ({ lat, lng, t: i * Math.round((dur * 60) / 70), alt: 2650 + Math.sin(i / 12) * 140 })), summaryPolyline: encodePolyline(pts) },
        metricsData: {
          timeInZones: zones(dur * 60, "mid"),
          hrStream: hr,
          timeStream: time,
          splits: Array.from({ length: Math.floor(km) }, () => Math.round(rnd(880, 1140))),
          loadScore: rint(45, 75),
          relativeEffort: rint(45, 75),
          hrrDelta: 29,
          hrrSeconds: 60,
        },
        source: "mobile",
        externalSource: "app_watch",
        externalId: `demo-hike-${d}`,
        deviceType: "watch",
      });
    } else if (dow === 6 && rand() < 0.75) {
      // Saturday jump rope — 90/40 intervals most weeks, a 30/30 block lately
      const id = uid(`rope-${d}`);
      const started = at(d, 9, 20);
      const [work, rest] = d < 30 ? [30, 30] : [90, 40];
      const rounds = d < 30 ? rint(14, 20) : rint(5, 8);
      const marks = Array.from({ length: rounds }, (_, i) => [i * (work + rest), i * (work + rest) + work]);
      const jumpSeconds = rounds * work;
      const restTotal = (rounds - 1) * rest;
      const minutes = Math.round((jumpSeconds + restTotal) / 60);
      const { hr, time } = hrStream(minutes * 6, 110, 170);
      workouts.push({
        id,
        startedAt: started,
        endedAt: new Date(started.getTime() + minutes * 60_000),
        durationMinutes: minutes,
        workoutType: "jump_rope",
        caloriesBurned: Math.round(minutes * 11.5),
        avgHeartRateBpm: 149,
        maxHeartRateBpm: 171,
        exercises: [{ name: "Jump rope", exercise: "jump-rope", sets: rounds, seconds: jumpSeconds }],
        metricsData: {
          timeInZones: zones(minutes * 60, "hard"),
          hrStream: hr,
          timeStream: time,
          intervals: {
            mode: "interval",
            workSeconds: work,
            restSeconds: rest,
            plannedRounds: rounds,
            roundsCompleted: rounds,
            jumpSeconds,
            restSecondsTotal: restTotal,
            marks,
            source: "measured",
            jumps: { total: Math.round(jumpSeconds * 2.1) + rint(-40, 40), source: "manual" },
          },
          loadScore: rint(30, 48),
          relativeEffort: rint(30, 48),
        },
        source: "mobile",
        externalSource: "app_watch",
        externalId: `demo-rope-${d}`,
        deviceType: "watch",
      });
    }
  }
  // one treadmill walk and one manual entry for variety
  workouts.push({
    id: uid("treadmill"),
    startedAt: at(9, 6, 50),
    endedAt: at(9, 7, 25),
    durationMinutes: 35,
    workoutType: "treadmill_walk",
    caloriesBurned: 196,
    distanceMeters: 3200,
    stepCount: 4100,
    avgHeartRateBpm: 116,
    maxHeartRateBpm: 128,
    metricsData: { timeInZones: zones(2100, "walk") },
    source: "mobile",
    externalSource: "app_watch",
    externalId: "demo-treadmill",
    deviceType: "watch",
  });
  workouts.push({
    id: uid("manual-core"),
    startedAt: at(11, 20, 0),
    durationMinutes: 18,
    workoutType: "strength",
    description: "Core finisher",
    caloriesBurned: 110,
    exercises: [
      { name: "Plank", exercise: "plank", sets: 3, seconds: 45 },
      { name: "Hanging leg raise", exercise: "hanging-leg-raise", sets: 3, reps: 10 },
    ],
    source: "manual",
  });
  for (const w of workouts) await prisma.workoutLog.create({ data: w });

  // His wall has ~50 movements with a heaviest-ever; the sessions above make
  // ~15, so the rest are standalone records spread over five months (four
  // of them this week, so "moved this week" has something to show).
  const MORE = [
    ["kb-one-arm-swing", "One-Arm Swing", 20], ["kb-clean", "Kettlebell Clean", 20], ["kb-deadlift", "Kettlebell Deadlift", 32],
    ["kb-lunge", "Kettlebell Lunge", 16], ["kb-halo", "Kettlebell Halo", 12], ["kb-windmill", "Kettlebell Windmill", 12],
    ["kb-push-press", "Kettlebell Push Press", 20], ["kb-high-pull", "Kettlebell High Pull", 20], ["kb-thruster", "Kettlebell Thruster", 16],
    ["kb-half-snatch", "Half Snatch", 16], ["bench-press", "Bench Press", 70], ["incline-press", "Incline Press", 55],
    ["back-squat", "Back Squat", 90], ["front-squat", "Front Squat", 70], ["deadlift", "Deadlift", 120],
    ["romanian-deadlift", "Romanian Deadlift", 80], ["overhead-press", "Overhead Press", 45], ["barbell-row", "Barbell Row", 65],
    ["hip-thrust", "Hip Thrust", 100], ["bicep-curl", "Bicep Curl", 16], ["hammer-curl", "Hammer Curl", 16],
    ["lateral-raise", "Lateral Raise", 10], ["tricep-extension", "Tricep Extension", 18], ["dumbbell-fly", "Dumbbell Fly", 14],
    ["seated-row", "Seated Row", 60], ["leg-curl", "Leg Curl", 50], ["leg-extension", "Leg Extension", 60],
    ["calf-raise", "Calf Raise", 80], ["cable-fly", "Cable Fly", 20], ["face-pull", "Face Pull", 25],
    ["incline-dumbbell-bench-press", "Incline Dumbbell Bench Press", 24], ["machine-chest-press", "Machine Chest Press", 55],
    ["pec-deck", "Pec Deck", 50], ["hack-squat", "Hack Squat", 100], ["hip-abduction", "Hip Abduction", 70],
    ["hip-adduction", "Hip Adduction", 70],
  ];
  MORE.forEach(([exercise, exerciseName, value], i) => {
    if (prs.has(`${exercise}:weight`)) return;
    const daysAgo = i < 4 ? i + 1 : 8 + ((i * 37) % 140);
    prs.set(`${exercise}:weight`, {
      exercise,
      exerciseName,
      kind: "weight",
      value,
      unit: "kg",
      previousValue: i % 3 === 0 ? null : Math.round(value * 0.88 * 2) / 2,
      achievedAt: at(daysAgo, 18, 0),
      workoutLogId: null,
    });
  });
  // Rope bests (lib/jump-rope.ts record kinds)
  for (const [kind, value, unit, daysAgo] of [
    ["rounds", 20, "rounds", 3],
    ["duration", 600, "s", 3],
    ["jumps", 1310, "jumps", 10],
    ["jumps_round", 196, "jumps", 24],
  ]) {
    prs.set(`jump-rope:${kind}`, { exercise: "jump-rope", exerciseName: "Jump rope", kind, value, unit, previousValue: null, achievedAt: at(daysAgo, 9, 40), workoutLogId: null });
  }
  await prisma.personalRecord.createMany({ data: [...prs.values()] });

  await prisma.userExercise.createMany({
    data: [
      { slug: "hanging-leg-raise", name: "Hanging leg raise", category: "bodyweight", aliases: ["leg raises"] },
      { slug: "kb-suitcase-side-bend", name: "KB suitcase side bend", category: "kettlebell", aliases: [] },
      { slug: "ankle-weighted-reverse-crunch", name: "Ankle-weighted reverse crunch", category: "bodyweight", aliases: [] },
    ],
  });

  await prisma.sequence.createMany({
    data: [
      {
        id: uid("seq-a"),
        name: "KB Block A — swings, squats, presses",
        kind: "straight",
        restSecondsDefault: 60,
        steps: [
          { exercise: "kb-swing", exerciseName: "Kettlebell Swing", sets: 5, reps: 15, weightKg: 24 },
          { exercise: "kb-goblet-squat", exerciseName: "Goblet Squat", sets: 4, reps: 10, weightKg: 20 },
          { exercise: "kb-clean-and-press", exerciseName: "Clean and Press", sets: 4, reps: 5, weightKg: 16 },
          { exercise: "kb-row", exerciseName: "Kettlebell Row", sets: 3, reps: 10, weightKg: 20 },
        ],
        progression: { lastRaiseAt: at(21).toISOString() },
      },
      {
        id: uid("seq-b"),
        name: "KB Block B — snatch day",
        kind: "straight",
        restSecondsDefault: 75,
        steps: [
          { exercise: "kb-snatch", exerciseName: "Kettlebell Snatch", sets: 5, reps: 8, weightKg: 16 },
          { exercise: "kb-front-squat", exerciseName: "Front Squat", sets: 4, reps: 8, weightKg: 20 },
          { exercise: "kb-turkish-get-up", exerciseName: "Turkish Get-Up", sets: 3, reps: 2, weightKg: 12 },
        ],
      },
      {
        id: uid("seq-emom"),
        name: "EMOM 20 — swings and squats",
        kind: "emom",
        durationMinutes: 20,
        steps: [
          { exercise: "kb-swing", exerciseName: "Kettlebell Swing", reps: 12, weightKg: 24 },
          { exercise: "kb-goblet-squat", exerciseName: "Goblet Squat", reps: 8, weightKg: 20 },
        ],
      },
      {
        id: uid("seq-circuit"),
        name: "Armor builder circuit",
        kind: "circuit",
        rounds: 3,
        restSecondsDefault: 15,
        steps: [
          { exercise: "kb-swing", exerciseName: "Kettlebell Swing", reps: 15, weightKg: 20 },
          { exercise: "kb-goblet-squat", exerciseName: "Goblet Squat", reps: 10, weightKg: 20 },
          { exercise: "kb-clean-and-press", exerciseName: "Clean and Press", reps: 5, weightKg: 16 },
          { exercise: "push-up", exerciseName: "Push-up", reps: 12 },
        ],
      },
      {
        id: uid("seq-core"),
        name: "Core session — abs and obliques",
        kind: "straight",
        restSecondsDefault: 45,
        steps: [
          { exercise: "ankle-weighted-reverse-crunch", exerciseName: "Ankle-weighted reverse crunch", sets: 4, reps: 12, weightKg: 5 },
          { exercise: "hanging-leg-raise", exerciseName: "Hanging leg raise", sets: 3, reps: 8 },
          { exercise: "kb-suitcase-side-bend", exerciseName: "KB suitcase side bend", sets: 3, reps: 12, weightKg: 16 },
        ],
      },
    ],
  });

  await prisma.plannedWorkout.createMany({
    data: [
      { localDate: dayStr(0), title: "KB Block A", sequenceId: uid("seq-a"), targetWeightKg: 24, status: "planned", source: "chat" },
      { localDate: dayStr(-2), title: "Cerro del Viento loop", trailId: uid("trail-a"), status: "planned", source: "chat", notes: "pack 6 kg" },
      { localDate: dayStr(-4), title: "EMOM 20", sequenceId: uid("seq-emom"), status: "planned", source: "manual" },
      { localDate: dayStr(2), title: "KB Block B", sequenceId: uid("seq-b"), status: "done", source: "chat" },
    ],
  });

  await prisma.workoutPlan.create({
    data: {
      id: uid("plan"),
      name: "4-day kettlebell strength block",
      goal: "build_muscle",
      fitnessLevel: "intermediate",
      daysPerWeek: 4,
      aiGenerated: true,
      schedule: [
        { dayIndex: 0, label: "Monday — Swings + squats", warmup: "3 min halos, hip hinges", exercises: [{ name: "Kettlebell Swing", sets: 5, reps: 15, targetWeightKg: 24, restSeconds: 60, muscleGroup: "Posterior chain" }, { name: "Goblet Squat", sets: 4, reps: 10, targetWeightKg: 20, restSeconds: 60, muscleGroup: "Legs" }] },
        { dayIndex: 1, label: "Wednesday — Press + row", warmup: "shoulder prep", exercises: [{ name: "Clean and Press", sets: 4, reps: 5, targetWeightKg: 16, restSeconds: 75, muscleGroup: "Shoulders" }, { name: "Kettlebell Row", sets: 3, reps: 10, targetWeightKg: 20, restSeconds: 60, muscleGroup: "Back" }] },
        { dayIndex: 2, label: "Friday — Snatch day", warmup: "light swings", exercises: [{ name: "Kettlebell Snatch", sets: 5, reps: 8, targetWeightKg: 16, restSeconds: 75, muscleGroup: "Full body" }] },
        { dayIndex: 3, label: "Sunday — Trail", warmup: "", exercises: [{ name: "Hike", sets: 1, reps: 1, targetWeightKg: 0, restSeconds: 0, muscleGroup: "Cardio" }] },
      ],
      notes: "Raise the bell when every set hits the top of the range two sessions running.",
    },
  });
  await prisma.workoutPlanCompletion.createMany({
    data: [
      { planId: uid("plan"), scheduledDate: at(7), dayIndex: 0, dayLabel: "Monday — Swings + squats", completed: true, feedback: "as_planned", durationMinutes: 41 },
      { planId: uid("plan"), scheduledDate: at(5), dayIndex: 1, dayLabel: "Wednesday — Press + row", completed: true, feedback: "exceeded", durationMinutes: 38 },
      { planId: uid("plan"), scheduledDate: at(3), dayIndex: 2, dayLabel: "Friday — Snatch day", completed: false },
    ],
  });

  await prisma.voiceClip.createMany({
    data: [
      { entryId: uid("clip-1"), workoutExternalId: "demo-gym-4", workoutKind: "freestyle", elapsedSeconds: 412, appBuild: "4", transcript: "ten dumbbell bench press with two twenty-twos", parser: "rules", entries: [{ name: "Dumbbell Bench Press", reps: 10, weightKg: 22, implements: 2 }], rulesResult: { confident: true }, ms: { transcribe: 640, parse: 12, total: 652 }, outcome: "ok", createdAt: at(4, 17, 37) },
      { entryId: uid("clip-2"), workoutExternalId: "demo-gym-4", workoutKind: "freestyle", elapsedSeconds: 980, appBuild: "4", transcript: "another eight", parser: "rules", entries: [{ name: "Dumbbell Bench Press", reps: 8, weightKg: 22, implements: 2 }], rulesResult: { confident: true }, ms: { transcribe: 420, parse: 8, total: 428 }, outcome: "ok", createdAt: at(4, 17, 46) },
      { entryId: uid("clip-3"), workoutExternalId: "demo-gym-4", workoutKind: "freestyle", elapsedSeconds: 1500, appBuild: "4", transcript: "twelve rear delt flies at twenty five", parser: "llm", entries: [{ name: "Rear Delt Fly", reps: 12, weightKg: 25 }], rulesResult: { confident: false }, ms: { transcribe: 700, parse: 1420, total: 2120 }, outcome: "review", createdAt: at(4, 17, 55) },
    ],
  });
}

// ─── weekly reports ─────────────────────────────────────────────────────────

async function seedReports() {
  const reports = [];
  for (let k = 1; k <= 5; k++) {
    const weekStart = isoWeekMonday(7 * k);
    const d0 = 7 * k;
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: dayStr(d0 + 6 - i - ((at(d0).getUTCDay() + 6) % 7)),
      inKcal: rand() < 0.86 ? rint(1900, 2500) : 0,
      burnedKcal: rint(0, 620),
    }));
    const logged = days.filter((x) => x.inKcal > 0);
    const avgIn = Math.round(logged.reduce((s, x) => s + x.inKcal, 0) / Math.max(1, logged.length));
    const avgBurn = Math.round(days.reduce((s, x) => s + x.burnedKcal, 0) / 7);
    reports.push({
      weekStart,
      createdAt: at(d0 - 6, 6, 5),
      data: {
        weekStart,
        weekEnd: dayStr(d0 - 6),
        weekNumber: 38 + (5 - k),
        writtenAt: at(d0 - 6, 6, 5).toISOString(),
        calorieTarget: 2300,
        headline: pick(["Strong week on the bells. Protein slipped twice.", "Every session landed. Sleep was the weak link.", "Volume up, weight down — the plan is working.", "Quiet week. Walks kept the streak alive."]),
        coach: `You trained ${rint(4, 6)} times for ${rint(190, 290)} active minutes and burned about ${rint(1400, 2100)} kcal. Intake averaged ${avgIn} kcal on ${logged.length} logged days against a 2,300 target. Protein reached 180 g on ${rint(3, 6)} of them. Next week: keep the Monday swings at 24 kg and add one set to the presses.`,
        energy: { days, avgInKcal: avgIn, avgBurnedKcal: avgBurn, weekDeficitKcal: (2300 - avgIn) * 7, dailyDeficitKcal: 2300 - avgIn },
        macros: { note: `Protein ≥ 180 g on ${rint(3, 6)} of ${logged.length} logged days.`, loggedDays: logged.length, adherencePct: { protein: rint(82, 98), carbs: rint(80, 105), fat: rint(85, 110) }, proteinDaysHit: rint(3, 6) },
        weight: { startKg: round(92.9 + k * 0.33, 1), endKg: round(92.6 + k * 0.33, 1), deltaKg: -0.3, series: Array.from({ length: 7 }, (_, i) => round(92.9 + k * 0.33 - i * 0.05, 1)) },
        training: { sessions: rint(4, 6), volumeKg: rint(8200, 12400), zonesPct: [34, 38, 19, 8, 1], kcalBurned: rint(1400, 2100), activeMinutes: rint(190, 290), progression: [{ exercise: "Kettlebell Swing", from: 20, to: 24 }] },
      },
    });
  }
  await prisma.weeklyReport.createMany({ data: reports });
}

// ─── today extras: todos, journal, photos, reminders ───────────────────────

async function seedTodayExtras() {
  await prisma.todo.createMany({
    data: [
      { title: "Book the physio for the shoulder", dueDate: at(-1, 10), priority: "high", icon: "📞", category: "manual" },
      { title: "Order creatine", dueDate: at(0, 18), priority: "normal", icon: "🛒", category: "manual" },
      { title: "Renew gym pass", dueDate: at(-5, 9), priority: "normal", icon: "🏋️", category: "manual" },
      { title: "Weigh in", priority: "low", icon: "⚖️", category: "recurring", isRecurring: true, recurrence: "daily" },
      { title: "Sunday hike — pack the 6 kg", dueDate: at(-2, 6), priority: "normal", icon: "🥾", category: "app" },
      { title: "Send the trail GPX to Daniel", completed: true, completedAt: at(1, 20), priority: "low", icon: "📧", category: "manual" },
      { title: "Replace the rope handle", completed: true, completedAt: at(3, 12), priority: "normal", icon: "🔧", category: "manual" },
      { title: "Read Judges 4–5", dueDate: at(0, 21), priority: "normal", icon: "📖", category: "app" },
    ],
  });

  const journal = [
    "Swings felt heavy at 24 but every set landed. Slept badly — the 3 a.m. wake-up again.",
    "Good walk after dinner, legs loose. Protein hit without trying for once.",
    "Rest day. Spent the evening on the Judges reading; Deborah's line about going out before you stuck.",
    "Hike day. Pack felt fine at 6 kg; the climb after the quebrada is where the breathing goes.",
    "Gym with the dumbbells. 22s on the bench are starting to feel like 20s.",
    "Short day, long meetings. One good thing: the double shake instead of the vending machine.",
    "Snatch day. Grip gave out before the lungs did — tape the right hand next time.",
    "Quiet Saturday. Rope, coffee, and the matrix card finally says 'fit'.",
  ];
  await prisma.journalEntry.createMany({
    data: journal.map((text, i) => ({
      localDate: dayStr(i + (i > 2 ? 1 : 0)),
      text,
      photoData: i === 1 ? pngDataUrl(96, 128, [220, 200, 170], [120, 90, 60]) : null,
      createdAt: at(i, 21, 30),
      updatedAt: at(i, 21, 30),
    })),
    skipDuplicates: true,
  });

  await prisma.progressPhoto.createMany({
    data: [
      { takenAt: at(92, 7), imageData: pngDataUrl(120, 160, [214, 205, 198], [150, 128, 118]), journalNote: "Start of the block." },
      { takenAt: at(31, 7), imageData: pngDataUrl(120, 160, [222, 212, 206], [140, 120, 112]) },
      { takenAt: at(2, 7), imageData: pngDataUrl(120, 160, [230, 222, 216], [128, 110, 104]), journalNote: "Jeans fit." },
    ],
  });

  await prisma.reminder.createMany({
    data: [
      { title: "Evening weigh-in", body: "Tap to log tonight's weight.", remindAt: at(-1, 20, 30), url: "/health/body" },
      { title: "Your Sunday Report is ready", body: "Wins, trends, and the coach's note.", remindAt: at(3, 7), url: "/health/report", fired: true },
    ],
  });
}

// ─── chat ───────────────────────────────────────────────────────────────────

async function seedNotifications() {
  const rows = [];
  const kinds = [
    ["spiritHomework", "Carrying · sit with it", "Carry this question through the day: where did the cycle turn?", "/spirit"],
    ["training", "Training day", "KB Block A is planned for this morning.", "/health/workouts"],
    ["weighIn", "Weigh-in synced", "92.6 kg · −0.2 since Monday.", "/health/body"],
    ["prCelebration", "PR · Kettlebell Swing", "28 kg — was 24.", "/health/workouts"],
    ["weeklyReport", "Weekly report ready", "Strong week on the bells.", "/health/report"],
    ["systemAlerts", "Apple Health hasn't synced", "Nothing has arrived for 2 days. Open Pitaya on your iPhone.", "/settings"],
    ["reminders", "Order creatine", "You asked to be reminded tonight.", "/todos"],
  ];
  for (let d = 0; d < 32; d++) {
    const [category, title, body, url] = kinds[(d * 3) % kinds.length];
    const status = d % 6 === 0 ? "sent" : d % 9 === 4 ? "held" : "no_devices";
    rows.push({ category, title, body, url, status, detail: status === "sent" ? { sent: 1, failed: 0, pruned: 0 } : undefined, createdAt: at(d, 19, 10), sentAt: status === "sent" ? at(d, 19, 10) : null, deliverAfter: status === "held" ? at(d - 1, 7, 0) : null });
    if (d % 4 === 1) {
      const [c2, t2, b2, u2] = kinds[(d + 2) % kinds.length];
      rows.push({ category: c2, title: t2, body: b2, url: u2, status: "no_devices", createdAt: at(d, 8, 5) });
    }
  }
  await prisma.notificationLog.createMany({ data: rows });
}

async function seedChat() {
  const convToday = uid("conv-today");
  const convOld = uid("conv-old");
  await prisma.chatConversation.createMany({
    data: [
      { id: convToday, title: "Chicken bowl + swings", titleSource: "ai", lastMessageAt: at(0, 13, 2), createdAt: at(0, 12, 50) },
      { id: convOld, title: "Sunday hike and the pack weight", titleSource: "ai", lastMessageAt: at(6, 10, 15), createdAt: at(6, 9, 40) },
    ],
  });
  const m = (conv, minutes, role, content, meta, dayAgo = 0) => ({
    conversationId: conv,
    role,
    content,
    meta,
    createdAt: at(dayAgo, 12, 50 + minutes),
  });
  await prisma.chatMessage.createMany({
    data: [
      m(convToday, 0, "user", "Chicken bowl for lunch, the usual", { source: "voice" }),
      m(convToday, 1, "proposal", "Logged your chicken bowl at 680 kcal — rice, beans, pico, lime, the usual build.", {
        kind: "food",
        status: "saved",
        data: {
          message: "Logged your chicken bowl at 680 kcal — rice, beans, pico, lime, the usual build.",
          items: [{ foodDescription: "Chicken bowl: rice, black beans, pico, lime", mealType: "lunch", calories: 680, proteinG: 52, carbsG: 74, fatG: 16, loggedAt: at(0, 12, 45).toISOString(), notes: "From your usuals." }],
        },
      }),
      m(convToday, 4, "user", "Swings this morning, 5 by 15 at 24, then goblet squats 4 by 10 at 20", { source: "voice" }),
      m(convToday, 5, "proposal", "Captured the kettlebell block: 75 swings at 24 kg and 40 goblet squats at 20 kg. Volume 2,600 kg.", {
        kind: "workout",
        status: "saved",
        data: {
          message: "Captured the kettlebell block: 75 swings at 24 kg and 40 goblet squats at 20 kg. Volume 2,600 kg.",
          workoutType: "strength",
          durationMinutes: 38,
          exercises: [
            { name: "Kettlebell Swing", sets: 5, reps: 15, weightKg: 24 },
            { name: "Goblet Squat", sets: 4, reps: 10, weightKg: 20 },
          ],
        },
      }),
      m(convToday, 9, "user", "what's my swing PR?", { source: "text" }),
      m(convToday, 10, "assistant", "Your heaviest swing is **24 kg**, set three weeks ago, and your biggest swing volume in one session is **1,800 kg** (5 × 15 at 24). Last Monday you matched the weight; the volume record stands.", null),
      m(convToday, 12, "user", "remind me to order creatine tonight", { source: "text" }),
      m(convToday, 12, "proposal", "Reminder set for 6 pm: order creatine.", { kind: "reminder", status: "saved", data: { message: "Reminder set for 6 pm: order creatine.", title: "Order creatine", remindAt: at(0, 18).toISOString() } }),
      m(convOld, 0, "user", "Planning the loop on Sunday with a 6 kilo pack", { source: "voice" }, 6),
      m(convOld, 1, "assistant", "Noted. Last time on the Cerro del Viento loop you carried 4 kg and finished in 1:48 with 312 m of gain. At 6 kg expect roughly five minutes more on the climb; the descent will not change.", null, 6),
      m(convOld, 3, "user", "ok plan it", { source: "text" }, 6),
      m(convOld, 4, "proposal", "Planned: Cerro del Viento loop on Sunday, pack 6 kg.", { kind: "plan_week", status: "saved", data: { message: "Planned: Cerro del Viento loop on Sunday, pack 6 kg.", days: [{ localDate: dayStr(-2), title: "Cerro del Viento loop", trailId: uid("trail-a"), notes: "pack 6 kg" }] } }, 6),
    ],
  });
}

// ─── spirit ─────────────────────────────────────────────────────────────────

const JUDGES = 7_000_000; // refInt = book*1e6 + chapter*1e3 + verse

async function seedSpirit() {
  const termId = uid("term-judges");
  await prisma.term.create({
    data: {
      id: termId,
      orderIndex: 1,
      title: "The Judges",
      kick: "OT NARRATIVE",
      rationale: "A first term in narrative: a people formed by promise, forgetting it one generation at a time. Before the epistles tell the church what it is, Judges shows what a people becomes when everyone does what is right in his own eyes.",
      hardNote: "Week 7 reads Judges 19–21 whole, in context, with the confessions at hand.",
      homeworkArc: "Keep one running page: every time the cycle turns (sin, servitude, supplication, salvation), note the verse.",
      objectives: ["Name the cycle of Judges from memory", "Read a hard text without flinching or explaining it away", "Trace the need for a king to its answer"],
      weeks: 7,
      status: "active",
      startedAt: at(31),
      generatedAt: at(31),
      syllabus: [
        { week: 1, label: "No king — the generation after Joshua", ref: "Judges 1–2", days: 4 },
        { week: 2, label: "Othniel, Ehud, Shamgar", ref: "Judges 3", days: 4 },
        { week: 3, label: "Sold and delivered — the shape of the cycle", ref: "Judges 2–3", days: 4 },
        { week: 4, label: "Ruth — the interlude of loyalty", ref: "Ruth 1–4", days: 4 },
        { week: 5, label: "Deborah and Barak", ref: "Judges 4–5", days: 4 },
        { week: 6, label: "Gideon to Abimelech", ref: "Judges 6–9", days: 4 },
        { week: 7, label: "When there is no king", ref: "Judges 17–21", days: 4, hard: true },
      ],
    },
  });
  for (const [i, t] of [["The Exile", "PROPHETS & HISTORY", 8], ["Romans", "EPISTLE · DOCTRINE", 8], ["The first five centuries", "CHURCH HISTORY", 6]].entries()) {
    await prisma.term.create({
      data: { orderIndex: i + 2, title: t[0], kick: t[1], rationale: "Upcoming.", weeks: t[2], status: "upcoming", syllabus: [] },
    });
  }
  const days = [
    [1, 1, "After Joshua", "The book opens with a question — who goes first? — and a generation that did not know the Lord or the work he had done.", "Judges 2:10", "Judges 1–2", "Judges 1–2 · after Joshua"],
    [1, 2, "The angel at Bochim", "Weeping is not repentance. The people cry at Bochim and go home to the same altars.", "Judges 2:4", "Judges 2", "Judges 2 · Bochim"],
    [5, 1, "A judge under a palm", "Deborah does not volunteer a battle plan — she relays a command Barak has already received.", "Judges 4:14", "Judges 4", "Judges 4 · Deborah"],
    [5, 2, "The song", "Chapter 5 sings what chapter 4 reported. Poetry is how a people remembers.", "Judges 5:3", "Judges 5", "Judges 5 · the song"],
  ];
  for (const [w, d, title, body, pullRef, readingRef, readingLabel] of days) {
    await prisma.devotionalDay.create({
      data: {
        id: uid(`day-${w}-${d}`),
        termId,
        weekIndex: w,
        dayIndex: d,
        title,
        body,
        pullRef,
        pullText: "“Up! For this is the day in which the LORD has given Sisera into your hand.”",
        contextBlock: "Iron chariots against highland levies — Israel could not hold the valleys, so the muster is at Tabor and the battle is won when rain turns the plain to mud.",
        doctrine: "Faith rests on the word given, not on the messenger kept in view.",
        practice: "Where have you asked for company before obeying a word you already had?",
        question: "What did Barak already know before he asked Deborah to come?",
        readingRef,
        readingLabel,
        estMinutes: 12,
        homework: { kind: "written", label: "Write the cycle in your own words", minutes: 10, text: "Four words, one verse each." },
        writtenPrompt: "Trace the cycle in this chapter: where does it turn?",
        aim: "See the cycle before it is named.",
      },
    });
  }
  await prisma.studyCompletion.createMany({ data: [{ dayId: uid("day-1-1"), completedAt: at(30) }, { dayId: uid("day-1-2"), completedAt: at(29) }, { dayId: uid("day-5-1"), completedAt: at(1) }] });
  await prisma.homeworkCheck.createMany({ data: [{ dayId: uid("day-1-1"), doneAt: at(30) }] });
  await prisma.readingLog.createMany({
    data: [
      { refStart: JUDGES + 1001, refEnd: JUDGES + 2023, label: "Judges 1–2", readAt: at(30), track: "term", dayId: uid("day-1-1") },
      { refStart: JUDGES + 3001, refEnd: JUDGES + 3031, label: "Judges 3", readAt: at(23), track: "term" },
      { refStart: JUDGES + 4001, refEnd: JUDGES + 4024, label: "Judges 4", readAt: at(1), track: "term", dayId: uid("day-5-1") },
      { refStart: 1_001_001, refEnd: 1_003_024, label: "Genesis 1–3", readAt: at(40), track: "track2" },
      { refStart: 1_004_001, refEnd: 1_006_022, label: "Genesis 4–6", readAt: at(33), track: "track2" },
      { refStart: 19_046_001, refEnd: 19_046_011, label: "Psalm 46", readAt: at(12), track: "free", medium: "paper" },
    ],
  });
  await prisma.highlight.createMany({
    data: [
      { refStart: JUDGES + 2010, refEnd: JUDGES + 2010, category: "Sin & Consequence" },
      { refStart: JUDGES + 2016, refEnd: JUDGES + 2016, category: "God" },
      { refStart: JUDGES + 4014, refEnd: JUDGES + 4014, category: "Promise & Covenant" },
      { refStart: JUDGES + 5003, refEnd: JUDGES + 5003, category: "Command" },
      { refStart: 19_046_001, refEnd: 19_046_001, category: "God" },
    ],
  });
  await prisma.spiritNote.createMany({
    data: [
      { refStart: JUDGES + 4008, refEnd: JUDGES + 4008, kind: "observation", body: "Barak will go — but only if she goes. The hedge is in the grammar." },
      { refStart: JUDGES + 2010, refEnd: JUDGES + 2010, kind: "question", body: "How does a generation 'not know' what their parents saw? What did the parents stop doing?" },
      { refStart: 19_046_001, refEnd: 19_046_001, kind: "conviction", body: "Refuge is a place you run to, not a feeling you wait for." },
    ],
  });
  await prisma.memoryVerse.createMany({
    data: [
      { refStart: 19_046_001, refEnd: 19_046_001, refLabel: "Psalm 46:1", occasion: "Anxiety", prompt: "When the ground moves under you — what is God?", why: "The night the plans fell through.", intervalDays: 3, nextDueAt: at(0, 6), lastSeenAt: at(3), timesGot: 4 },
      { refStart: JUDGES + 4014, refEnd: JUDGES + 4014, refLabel: "Judges 4:14", occasion: "Hesitation", prompt: "You already have the word — what is the question?", intervalDays: 2, nextDueAt: at(-1, 6), timesGot: 1 },
      { refStart: 45_008_001, refEnd: 45_008_001, refLabel: "Romans 8:1", occasion: "Assurance", prompt: "After the failure — what is the verdict?", intervalDays: 5, nextDueAt: at(-3, 6), lastSeenAt: at(2), timesGot: 7 },
    ],
  });
  await prisma.churchSeries.create({
    data: {
      id: uid("series"),
      title: "Sons, Not Slaves — Galatians",
      expectedWeeks: 8,
      lengthNote: "pastor said 'through the fall'",
      passages: [{ ref: "Galatians 1", label: "Galatians 1", status: "read" }, { ref: "Galatians 2", label: "Galatians 2", status: "read" }, { ref: "Galatians 3", label: "Galatians 3", status: "next" }],
      themes: "justification, adoption, freedom",
      currentWeek: 3,
      weeks: [
        { index: 1, passageRef: "Galatians 1", title: "No other gospel", status: "read", context: "Paul opens without thanks — the only letter that does. His argument is his own story: the gospel came to him from Christ, not from Jerusalem.", questions: ["What does Paul treat as the test of a true gospel?", "Why tell his own conversion story here?", "Where am I tempted to want a gospel with something added?"] },
        { index: 2, passageRef: "Galatians 2", title: "Table fellowship", status: "read", context: "At Antioch, Peter stops eating with Gentile believers when men from James arrive. Paul confronts him publicly.", questions: ["What did Peter's withdrawal say without words?", "Why does Paul call it a gospel issue, not manners?", "Whose table do I quietly avoid?"] },
        { index: 3, passageRef: "Galatians 3:1-14", title: "Abraham believed", status: "next", context: "Paul asks the Galatians how they received the Spirit — by works of the law or by hearing with faith — and reaches back to Abraham, counted righteous centuries before Sinai.", questions: ["What question does Paul put to their own experience?", "Why is Abraham the decisive example?", "What would 'hearing with faith' change in my week?"] },
      ],
    },
  });
  await prisma.spiritPref.create({ data: { id: "main", posture: "westminster", track2Position: 6 } });
  await prisma.spiritNotebook.createMany({
    data: [
      { id: uid("nb-sermons"), title: "Sermons", kind: "sermons", accent: "#A63D63", sortOrder: 0 },
      { id: uid("nb-term"), title: "Term 1 — The Judges", kind: "term", termId, accent: "#5E7FA6", sortOrder: 1 },
      { id: uid("nb-free"), title: "Loose pages", kind: "free", accent: "#5E9B72", sortOrder: 2 },
    ],
  });
  const stroke = (id, x0, y0, len, t0) => ({
    id,
    tool: "fountain",
    color: "#232227",
    width: 2.2,
    opacity: 1,
    t0,
    pts: Array.from({ length: 24 }, (_, i) => ({ x: x0 + (i / 23) * len, y: y0 + Math.sin(i / 2.5) * 6, p: 0.5 + 0.3 * Math.sin(i / 3), t: i * 14 })),
  });
  await prisma.inkPage.createMany({
    data: [
      {
        id: uid("page-judges-4"),
        notebookId: uid("nb-term"),
        kind: "study",
        title: "Judges 4 — a judge under a palm",
        subtitle: "WEEK 5 · DAY 1",
        dayId: uid("day-5-1"),
        refStart: JUDGES + 4001,
        refEnd: JUDGES + 4024,
        background: "lined",
        strokes: [stroke("s1", 60, 120, 300, 1), stroke("s2", 60, 160, 260, 400), stroke("s3", 60, 200, 320, 800), stroke("s4", 80, 260, 240, 1200)],
        objects: [],
        refs: [JUDGES + 4014],
        strokeCount: 4,
        createdAt: at(1, 20),
        updatedAt: at(1, 20, 25),
      },
      {
        id: uid("page-sermon-3"),
        notebookId: uid("nb-sermons"),
        kind: "sermon",
        title: "Galatians 3 — Abraham believed",
        subtitle: "SUNDAY · WEEK 3",
        seriesId: uid("series"),
        weekIndex: 3,
        refStart: 48_003_001,
        refEnd: 48_003_029,
        background: "dots",
        strokes: [stroke("s1", 50, 110, 320, 1), stroke("s2", 50, 150, 280, 600)],
        objects: [],
        refs: [48_003_006],
        strokeCount: 2,
        recordingId: uid("rec-3"),
        createdAt: at(6, 11),
        updatedAt: at(6, 12),
      },
    ],
  });
  await prisma.recording.createMany({
    data: [
      { id: uid("rec-3"), pageId: uid("page-sermon-3"), seriesId: uid("series"), weekIndex: 3, title: "Galatians 3 — Abraham believed", preacher: "Pastor R.", passageRef: "Galatians 3", startedAt: at(6, 10, 30), durationSec: 2612, status: "ready", lang: "es", transcript: [{ start: 0, end: 6.2, text: "Abramos en Gálatas capítulo tres." }, { start: 6.2, end: 14.8, text: "Pablo pregunta: ¿quién los fascinó?" }, { start: 14.8, end: 22, text: "La fe de Abraham es la fe del evangelio." }], summary: "Paul confronts the Galatians with their own experience: the Spirit came by hearing with faith, not by works of the law. Abraham is the pattern — counted righteous by belief, centuries before Sinai.", summaryAt: at(6, 14), sizeBytes: 0 },
      { id: uid("rec-2"), seriesId: uid("series"), weekIndex: 2, title: "Galatians 2 — Table fellowship", preacher: "Pastor R.", passageRef: "Galatians 2", startedAt: at(13, 10, 30), durationSec: 2390, status: "ready", lang: "es", transcript: [{ start: 0, end: 5, text: "Gálatas dos." }], sizeBytes: 0 },
    ],
  });
  await prisma.hymn.createMany({
    data: [
      { title: "Amazing Grace", body: "Amazing grace! how sweet the sound,\nthat saved a wretch like me!\nI once was lost, but now am found,\nwas blind, but now I see.\n\n'Twas grace that taught my heart to fear,\nand grace my fears relieved;\nhow precious did that grace appear\nthe hour I first believed!" },
      { title: "Be Thou My Vision", body: "Be Thou my vision, O Lord of my heart;\nnaught be all else to me, save that Thou art;\nThou my best thought, by day or by night,\nwaking or sleeping, Thy presence my light." },
    ],
  });
  await prisma.sourceDoc.createMany({
    data: [
      { key: "henry-judges-4", title: "Matthew Henry · on Judges 4", meta: "Commentary, 1706 · condensed · public domain", body: "Deborah was a prophetess; the Spirit of God was upon her, and she judged Israel, not by force, but by counsel." },
      { key: "wcf-14-2", title: "Westminster Confession 14.2", meta: "Confession, 1646 · public domain", body: "By this faith, a Christian believeth to be true whatsoever is revealed in the Word, for the authority of God himself speaking therein." },
    ],
  });
}

// ─── finance ────────────────────────────────────────────────────────────────

async function seedFinance() {
  const checking = uid("acct-checking");
  const card = uid("acct-card");
  await prisma.financialAccount.createMany({
    data: [
      { id: checking, name: "Everyday checking", accountType: "checking", currency: "COP", balance: 6_420_000, isPrimary: true, institution: "Banco Demo", color: "#5E7FA6", icon: "🏦" },
      { id: card, name: "Rewards card", accountType: "credit_card", currency: "COP", balance: -1_180_000, creditLimit: 12_000_000, interestRate: 27.9, institution: "Banco Demo", color: "#A63D63", icon: "💳" },
      { id: uid("acct-savings"), name: "Emergency fund", accountType: "savings", currency: "COP", balance: 18_500_000, institution: "Banco Demo", color: "#5E9B72", icon: "🛟" },
    ],
  });
  const merchants = [
    ["Mercado Verde", "groceries", "food"],
    ["Gym Norte", "fitness", "health"],
    ["Café Origen", "dining_out", "food"],
    ["Transmilenio", "transit", "transport"],
    ["Luz y Gas", "utilities", "housing"],
  ];
  for (const [name, sub, cat] of merchants) {
    await prisma.merchant.create({ data: { id: uid(`merchant-${name}`), name, normalizedName: name.toLowerCase(), categoryHint: cat, subcategoryHint: sub, transactionCount: rint(3, 14), totalSpent: rint(80_000, 900_000) } });
  }
  const tx = [];
  for (let d = 0; d < 45; d++) {
    if (d % 15 === 1) tx.push({ accountId: checking, transactedAt: at(d, 9), amount: 9_800_000, currency: "COP", description: "Salary", category: "income", subcategory: "salary", type: "income", source: "csv_import", merchant: "Employer" });
    if (rand() < 0.55) {
      const [name, sub, cat] = pick(merchants);
      tx.push({ accountId: rand() < 0.6 ? card : checking, merchantId: uid(`merchant-${name}`), transactedAt: at(d, rint(8, 20), rint(0, 59)), amount: -rint(12_000, 240_000), currency: "COP", description: name, category: cat, subcategory: sub, type: "expense", source: pick(["csv_import", "email", "manual"]), merchant: name, cashImpactType: "cash" });
    }
    if (d === 6) tx.push({ accountId: checking, transactedAt: at(d, 10), amount: -1_950_000, currency: "COP", description: "Rent", category: "housing", subcategory: "rent", type: "expense", isRecurring: true, source: "csv_import", merchant: "Landlord" });
    if (d === 3) tx.push({ accountId: card, transactedAt: at(d, 19), amount: -86_000, currency: "COP", description: "Unknown POS 4411", category: "uncategorized", type: "expense", needsCategorization: true, reviewState: "pending_review", source: "email", confidence: 0.42 });
  }
  await prisma.financialTransaction.createMany({ data: tx });

  const cats = [
    ["Groceries", "🥬", "#5E9B72", 900_000],
    ["Dining out", "☕", "#A63D63", 350_000],
    ["Transport", "🚌", "#5E7FA6", 220_000],
    ["Housing", "🏠", "#454349", 2_400_000],
    ["Health & gym", "🏋️", "#DC74A0", 260_000],
    ["Savings", "🛟", "#5E9B72", 1_500_000],
  ];
  const budget = await prisma.budget.create({ data: { name: `${TY}-${String(TM).padStart(2, "0")}`, month: TM, year: TY, totalIncome: 9_800_000, totalBudget: 5_630_000 } });
  for (const [i, [name, icon, color, planned]] of cats.entries()) {
    const c = await prisma.budgetCategory.create({ data: { name, icon, color, type: name === "Savings" ? "savings" : "expense", sortOrder: i } });
    await prisma.budgetItem.create({ data: { budgetId: budget.id, categoryId: c.id, planned, isFixed: name === "Housing" } });
  }
  await prisma.savingsGoal.createMany({
    data: [
      { name: "Trail trip — Cocuy", targetAmount: 4_500_000, currentAmount: 2_900_000, currency: "COP", deadline: at(-120), icon: "🏔️", color: "#5E7FA6" },
      { name: "New kettlebells", targetAmount: 900_000, currentAmount: 900_000, currency: "COP", icon: "🏋️", color: "#A63D63", isCompleted: true },
    ],
  });
  await prisma.fundPocket.createMany({
    data: [
      { name: "Needs", slug: "needs", isCanonical: true, currentBalance: 3_200_000, sortOrder: 0, color: "#454349", icon: "🏠" },
      { name: "Wants", slug: "wants", isCanonical: true, currentBalance: 640_000, sortOrder: 1, color: "#A63D63", icon: "🎟️" },
      { name: "Savings", slug: "savings", isCanonical: true, currentBalance: 1_500_000, targetAmount: 2_000_000, sortOrder: 2, color: "#5E9B72", icon: "🛟" },
      { name: "Giving", slug: "giving", isCanonical: true, currentBalance: 980_000, sortOrder: 3, color: "#5E7FA6", icon: "🤲" },
      { name: "Buffer", slug: "buffer", isCanonical: true, currentBalance: 410_000, sortOrder: 4, color: "#96949B", icon: "🧱" },
    ],
  });
  await prisma.scheduledObligation.createMany({
    data: [
      { name: "Rent", amount: 1_950_000, currency: "COP", category: "housing", frequency: "monthly", dueDay: 5, nextOccurrenceAt: at(-16), defaultAccountId: checking },
      { name: "Tithe", amount: 980_000, currency: "COP", category: "giving", frequency: "monthly", dueDay: 2, nextOccurrenceAt: at(-13), defaultAccountId: checking },
      { name: "Gym Norte", amount: 189_000, currency: "COP", category: "health", frequency: "monthly", dueDay: 12, nextOccurrenceAt: at(-23), defaultAccountId: card },
    ],
  });
  await prisma.recurringTransaction.createMany({
    data: [
      { description: "Streaming bundle", amount: -42_000, currency: "COP", category: "entertainment", type: "expense", frequency: "monthly", dayOfMonth: 9, nextDueDate: at(-20) },
      { description: "Salary", amount: 9_800_000, currency: "COP", category: "income", type: "income", frequency: "biweekly", nextDueDate: at(-8) },
    ],
  });
  await prisma.upcomingPayment.createMany({
    data: [
      { description: "Rewards card statement", dueDate: at(-9), amount: 1_180_000, minimumDue: 118_000, statementBalance: 1_180_000, currency: "COP", status: "detected", confidence: 0.91, source: "email" },
      { description: "Luz y Gas — October", dueDate: at(-4), amount: 212_000, currency: "COP", status: "confirmed", confidence: 0.97, source: "email" },
    ],
  });
  await prisma.financeSource.createMany({
    data: [
      { sourceKey: "banco-demo-statements", label: "Banco Demo statements", senderDomain: "bancodemo.example", trustLevel: "trusted", defaultDisposition: "trusted_autopost", isBiller: false, documentCount: 14, signalCount: 14, confirmedCount: 12 },
      { sourceKey: "luz-y-gas", label: "Luz y Gas", senderDomain: "luzygas.example", trustLevel: "learning", defaultDisposition: "bill_notice", isBiller: true, documentCount: 3, signalCount: 3, confirmedCount: 2 },
    ],
  });
}

// ─── run ────────────────────────────────────────────────────────────────────

function firstHikeDay() {
  for (let d = 0; d <= 150; d++) if (at(d).getUTCDay() === 0 && d % 14 < 7) return d;
  return 0;
}

async function main() {
  console.log(`seeding ${url.hostname}/${dbName} — today = ${todayStr}`);
  await wipe();
  await seedSettings();
  await seedFood();
  await seedBody();
  await seedDaily();
  await seedTrain();
  await seedReports();
  await seedTodayExtras();
  await seedChat();
  await seedNotifications();
  await seedSpirit();
  await seedFinance();
  const counts = await prisma.$queryRawUnsafe(
    `select 'food_logs' t, count(*)::int n from food_logs union all select 'workout_logs', count(*)::int from workout_logs union all select 'body_measurements', count(*)::int from body_measurements union all select 'personal_records', count(*)::int from personal_records union all select 'chat_messages', count(*)::int from chat_messages union all select 'spirit_days', count(*)::int from spirit_days union all select 'financial_transactions', count(*)::int from financial_transactions`
  );
  for (const row of counts) console.log(`  ${row.t}: ${row.n}`);
  console.log(`  stable ids → hike ${uid("hike-" + firstHikeDay())} · ink page ${uid("page-judges-4")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
