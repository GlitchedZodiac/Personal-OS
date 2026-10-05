# RENPHO body composition — Phase 0 research and gap report

**2026-10-04 · for Michael's read before Phase 1.** Nothing was built or
written to Pitaya. The RENPHO pull was read-only against their cloud; the raw
records stayed in a scratch folder outside the repo.

## The short version

1. **The RENPHO API returns everything on the PDF report.** Segmental muscle
   and fat per limb and trunk, impedance at 20 kHz and 100 kHz per segment,
   SMI, and RENPHO's own reference ranges all come back in each record. Every
   number in your hand-typed 2026-10-04 `notes` row matches the API to the
   digit. The PDF is not needed.
2. **RENPHO history is 5 real weigh-ins, not ten months.** The account was
   created 2026-09-12. Everything from Dec 2025 until then is the Etekcity
   (VeSync) history that Pitaya already holds. "Backfill" therefore enriches
   five rows that already exist; it should create zero new rows.
3. **Apple Health is delivering weight only, even though the code asks for
   more.** RENPHO's records say it writes weight, BMI, body fat and lean mass
   to Apple Health. Pitaya's rows for those same weigh-ins carry weight alone.
   The cause is on the phone and is not yet traced (see "Apple Health" below).
4. **The 15–30 minute cron is not needed.** A RENPHO pull triggered by the
   Apple Health weigh-in arriving does the same job with no schedule, which
   sidesteps the Vercel Hobby daily-cron limit.

> **Update, same night.** Michael approved all five decisions and Phase 1 is
> built (see [`body-composition-changelog.md`](body-composition-changelog.md)).
> One failure mode below is no longer hypothetical: the Phase 0 login **did**
> sign his phone app out. The sync engine is therefore built but switched off
> until it can log in as a second account.

## 1. What RENPHO provides

Client: `renpho-py` 1.2.0 exists on PyPI, but needs Python ≥ 3.10 and this Mac
has 3.9. Its source was read in full (it talks only to `cloud.renpho.com`) and
its three calls were ported to a 200-line Node script, which is also the shape
Phase 2B needs since Pitaya's backend is Node.

Pulled: **6 records, 2026-09-12 → 2026-10-04.** Five are full 8-electrode
weigh-ins (`deviceType 00053`). One is a weight-only 86 kg entry four minutes
before the first real weigh-in (`deviceType 00000`, no impedance); it looks
like the weight typed in at account setup and should not be imported.

Units below were confirmed against the report numbers in your 10-04 notes row.

| RENPHO field | Meaning | Unit | Populated |
|---|---|---|---|
| `weight` | Weight | kg | 6/6 |
| `bmi` | BMI | — | 6/6 |
| `bodyfat` | Body fat | % | 5/6 |
| `fatFreeWeight` | Fat-free mass | kg | 5/6 |
| `sinew` / `sinewRatio` | Muscle mass | kg / % | 5/6 |
| `smmMass` / `muscle` | Skeletal muscle | kg / % | 5/6 |
| `smi` | Skeletal muscle index | kg/m² | 5/6 |
| `water` | Body water | % | 5/6 |
| `protein` | Protein | % | 5/6 |
| `bone` | Bone mass | kg | 5/6 |
| `visfat` | Visceral fat | level | 5/6 |
| `subfat` | Subcutaneous fat | % | 5/6 |
| `bmr` | BMR | kcal/day | 5/6 |
| `bodyage` | Metabolic age | years | 5/6 |
| `whr` | Waist-to-hip ratio (estimated by the scale) | ratio | 5/6 |
| `laMuscleMass` `raMuscleMass` `tMuscleMass` `llMuscleMass` `rlMuscleMass` | Segmental muscle: left arm, right arm, trunk, left leg, right leg | kg | 5/6 |
| `laBodyFatMass` … `rlBodyFatMass` | Segmental fat, same five segments | kg | 5/6 |
| `laMuscle`, `laBodyFatPct` … | Each segment as % of RENPHO's standard | % | 5/6 |
| `z20HandR` `z20HandL` `z20Body` `z20FootR` `z20FootL` | Impedance at 20 kHz | Ω | 5/6 |
| `z100HandR` … `z100FootL` | Impedance at 100 kHz | Ω | 5/6 |
| `bfpMin/Max/Std`, `bfmMin/Max/Std`, `bmrMin/Max/Std`, `smmMin/Max/Std`, `weightMin/Max/Std`, `boneMin/Max`, `muscleMassMin/Max`, `proteinMassMin/Max`, `waterMassMin/Max`, `bmiMin/Max/Std`, per-segment `…Std` | RENPHO's reference ranges, sent with every record | as metric | 5/6 |
| `bodyScore`, `bodyType`, `obesityDegree`, `weightTarget`, `weightControl`, `bfmCtrl` | RENPHO's verdicts and "optimal weight" | — | 5/6 |
| `id`, `timeStamp`, `syncTimeStamp`, `timeZone`, `mac`, `reportId`, `appVersion`, `appleHealthAuth`, `appleHealthSync` | Record metadata | — | 6/6 |

**Derived, not sent:** fat mass kg (`weight − fatFreeWeight` = 10.92, exact),
body water kg and protein kg (`% × weight` = 52.63 and 14.40, both exact
against the report).

**Not available from RENPHO:**
- Heart rate: the field is absent for this scale.
- A real waist-to-hip ratio: `whr` is an estimate, and the profile's waist
  and hip fields are zero.
- Any history before 2026-09-12.
- Any push or webhook.

**Two things worth knowing about the ranges and verdicts**
- The reference ranges are population norms for your height, age and sex.
  You sit above the top of the range on muscle mass (67.0 vs 59.1 max),
  skeletal muscle (41.3 vs 36.5), BMR, bone, water and protein. Range bars
  will show you off the top of most scales, so the design has to treat
  "above range" as neutral or good, not as a warning.
- `bmiMin 25 / bmiMax 30 / bmiStd 22` do not describe a normal range; they
  look like the band you currently fall in. Their meaning is unconfirmed.
  `bodyType` is a number (6 or 7) whose mapping to RENPHO's matrix is also
  unconfirmed.

**Sync speed.** RENPHO's cloud had each record 0–128 seconds after the
weigh-in (`syncTimeStamp − timeStamp`).

## 2. What Pitaya has (confirmed in code and data)

- **Schema** (`prisma/schema.prisma`): weight, body fat %, nine tape columns,
  and twelve composition columns (bmi, fatFreeWeightKg, subcutaneousFatPct,
  visceralFat, bodyWaterPct, skeletalMusclePct, muscleMassKg, boneMassKg,
  proteinPct, bmrKcal, metabolicAge, heartRateBpm), plus `skinfoldData`,
  `notes`, `source`. No `external_id`, no `raw_payload`, no segmental or
  impedance columns, no per-field source.
- **MCP `log_measurement`** (`lib/mcp/tools.ts:675`): accepts weight, body
  fat %, nine tape fields and notes only. Confirmed as the prompt says.
- **MCP `query_data`**: already returns all 23 measured columns. Only new
  columns need adding.
- **In-app chat and `POST /api/health/body`**: write the same 11 fields, drop
  any composition value, and leave `source` null (already in deferred-items).
- **Apple Health sync**: the companion has requested body mass, body fat %,
  BMI, lean body mass and waist since 2026-08-26
  (`ios/iPhone/BodyCompositionReader.swift:74`). So "imports weight only" is
  wrong about the code but right about the data: all four Apple Health rows
  for RENPHO weigh-ins hold weight alone.
- **Dedup** (`lib/body-ingest.ts`): a sample within ±10 minutes and ±0.3 kg
  of an existing row merges into it, filling blanks only and never
  overwriting; the row keeps its original `source`.
- **UI** (`app/(tabs)/health/body`): weight trend, tape, and a SMART SCALE
  card with body fat %, muscle mass and BMR, each with a drill-in. The other
  nine stored composition columns are not drawn anywhere.

### Apple Health: what is known and what is not

Each Apple Health row is stamped exactly 5 seconds before RENPHO's own
timestamp for the same weigh-in, so the two sources line up cleanly.
RENPHO reports `appleHealthAuth: weight,bmi,fat,lbm` with all four switched
on. Yet no body fat, BMI or lean mass reached Pitaya. Three candidates, none
confirmed:

1. Pitaya was never granted read access to those three types on the phone.
2. RENPHO writes them under a different source or more than 120 seconds
   apart, so the companion's clustering drops them as orphans.
3. RENPHO is not actually writing them despite what its record says.

Two checks on the phone separate these: Health → Browse → Body Measurements →
Body Fat Percentage (is there a 13.2% on Oct 4 from Renpho?), and Health →
profile → Apps → Pitaya (are Body Fat Percentage, BMI and Lean Body Mass on?).
The fix, whichever it is, lives in `ios/**` and belongs to the watch lane.

## 3. Gap table

| Metric | RENPHO API | Apple Health | Pitaya column | MCP writes it | Shown in UI |
|---|---|---|---|---|---|
| Weight | yes | yes | `weightKg` | yes | yes |
| Body fat % | yes | claimed, not arriving | `bodyFatPct` | yes | yes |
| BMI | yes | claimed, not arriving | `bmi` | no | no |
| Fat-free / lean mass kg | yes | claimed, not arriving | `fatFreeWeightKg` | no | no |
| Fat mass kg | derived | no | **missing** | no | no |
| Muscle mass kg | yes | no | `muscleMassKg` | no | yes |
| Muscle mass % | yes | no | **missing** | no | no |
| Skeletal muscle % | yes | no | `skeletalMusclePct` | no | no |
| Skeletal muscle kg | yes | no | **missing** | no | no |
| SMI | yes | no | **missing** | no | no |
| Body water % | yes | no | `bodyWaterPct` | no | no |
| Body water kg | derived | no | **missing** | no | no |
| Protein % | yes | no | `proteinPct` | no | no |
| Protein kg | derived | no | **missing** | no | no |
| Bone mass kg | yes | no | `boneMassKg` | no | no |
| Visceral fat | yes | no | `visceralFat` | no | no |
| Subcutaneous fat % | yes | no | `subcutaneousFatPct` | no | no |
| BMR | yes | no | `bmrKcal` | no | yes |
| Metabolic age | yes | no | `metabolicAge` | no | no |
| WHR (scale estimate) | yes | no | **missing** | no | no |
| Segmental muscle kg ×5 | yes | no | **missing** | no | no |
| Segmental fat kg ×5 | yes | no | **missing** | no | no |
| Impedance 20 / 100 kHz ×5 | yes | no | **missing** | no | no |
| Reference ranges | yes, per record | no | **missing** | no | no |
| Heart rate | no | no | `heartRateBpm` | no | no |
| Tape (waist, hips, …) | no | waist only | 9 columns | yes | yes |
| Source record id | yes (19-digit) | HealthKit UUID, not sent | **missing** | — | — |
| Raw source record | yes | — | **missing** | — | — |

## 4. Recommendation: sync architecture

**Make the RENPHO pull (B) the source of composition, and trigger it from
events instead of a schedule.**

- **Trigger 1: Apple Health arrival.** When the companion posts a new weight
  sample, the server pulls RENPHO straight away. RENPHO's cloud usually has
  the record by then; if not, the pull retries once a couple of minutes later.
- **Trigger 2: opening the Body screen**, if the last pull is older than a
  few minutes, plus a manual "Sync now".
- **Trigger 3: the existing daily cron** as a sweep.

This needs no new cron, so the Vercel Pro versus GitHub Actions decision goes
away. A 15-minute pinger can be added later if this proves too slow.

**Apple Health (A) stays as the fast path for weight.** Getting body fat, BMI
and lean mass through it, and true background delivery, are both watch-lane
work; background delivery also needs the paid-team signing swap. Once B
works, A's composition fields are a nice-to-have.

**Dedup.** Upsert RENPHO records by `external_id`. Where an Apple Health,
manual or MCP row already sits within the window, merge into it with RENPHO
winning on composition fields. That is a new precedence rule: today's merge
only fills blanks. The 5-second offset between the sources is well inside
the ±10 minute window.

**Per-field source.** "The source of each field is visible" cannot be met by
the single `source` column once rows are merged. It needs a small per-field
map on the row.

**Credentials.** Vercel environment variables marked Sensitive, the same way
`DATABASE_URL` is held. Locally they are in `.env.local`.

**Manual fallback.** Extending MCP `log_measurement` to every field covers
it with no new screen: paste a report or screenshot into Claude and it logs
the real columns. An in-app upload screen would need a design.

### Failure modes

| Failure | Effect | Mitigation |
|---|---|---|
| RENPHO app update changes the encryption key, endpoints or version gate | Every pull fails | Store `raw_payload`; alert after 3 failures; Apple Health weight keeps flowing |
| Password changed | Login fails | Same alert; update the secret |
| API login signs the phone app out | Scale stops reaching the cloud until you sign back in | **Confirmed 2026-10-04.** The pull must log in as a second account and read the main user's records; the sync stays off until that works |
| 19-digit ids rounded by JavaScript | Queries silently ask for the wrong user and return nothing | Hit and fixed during this pull. Parse ids as strings; store `external_id` as text |
| `device/count` reports 0 records when records exist | A count-based check would conclude there is no data | Never trust the count; page until empty |
| Weight-only setup entry | A phantom 86 kg weigh-in | Skip records with no impedance and `deviceType 00000` |
| Weigh-in with the phone app closed | Record may not reach the cloud until the app opens | Unknown behaviour; the 48-hour "Apple Health has weigh-ins, RENPHO has none" alert covers it |
| RENPHO blocks Vercel's IPs | Works locally, fails in prod | Unknown until deployed; test from prod first in Phase 2 |
| Two triggers fire at once | Double insert | Unique `external_id` absorbs it |
| Password protection is weak in transit | The client encrypts with a fixed key that is public in the library, so only TLS protects it | Use a password you use nowhere else |

**The alert** can use the web push that already exists (`sendPush` in
`lib/push.ts`). Whether the VAPID keys ever reached Vercel is unconfirmed;
without them the alert sends nothing.

## Decisions needed before Phase 1

1. **Go for a production migration** adding the missing columns,
   `external_id` (unique) and `raw_payload`.
2. **Segmental and impedance storage.** Recommended: real columns for the ten
   segmental masses (they get charted and compared left to right), one JSON
   column for the ten impedance values, one JSON column for RENPHO's
   reference ranges. Verdict fields (`bodyScore`, `weightTarget`, …) stay in
   `raw_payload` only and are never displayed.
3. **Event-triggered pull instead of the 15–30 minute cron** — yes or no.
4. **The 86 kg setup entry** — skip it (recommended) or import it.
5. **Backfill scope.** With only five RENPHO rows, "Done means: backfill with
   a row count and no duplicates" becomes: 5 rows enriched, 0 created.
   Confirm that is the expected result.

## What RENPHO cannot give us

- Measured (rather than estimated) composition. Everything except weight is a
  BIA estimate; a DEXA scan is the only calibration.
- A real waist-to-hip ratio. That comes from your tape.
- History before 2026-09-12. Earlier composition is Etekcity data from a
  different scale, so the two series are not directly comparable and a chart
  should mark the device change.
- Heart rate, on this scale.
- An instant push. The fastest path is Apple Health arriving, then a pull.
