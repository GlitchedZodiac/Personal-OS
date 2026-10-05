# Body composition — changelog

Running record of the RENPHO body-composition work. Research and the gap
table are in [`renpho-gap-report.md`](renpho-gap-report.md).

## 2026-10-05 · Report upload

- **Add report** on the Body screen: choose the RENPHO report as a PDF or as
  screenshots, check the numbers on a confirm card, save.
- Reads the whole report: weight, composition, all five segments for muscle
  and fat with their standards, impedance at both frequencies.
- Joins the weigh-in already stored for that moment instead of creating a
  second one; fills what is blank and corrects what disagrees.
- Checks each value is plausible and that the report agrees with itself;
  anything doubtful is said in a sentence on the card.
- A PDF reads exactly. A low-resolution screenshot misread one impedance digit
  in testing, so picture reads are labelled and every number is shown.

## 2026-10-05 · Phase 3: the Body screen, round 1

Ported from `docs/design/pitaya-body/`.

- **New Body screen**, eight cards on real data: today's weigh-in, target and
  forecast, composition against reference bands, body map, body-type matrix,
  trends, tape, milestones. Light and dark.
- **New metric push-in** for the nine scale metrics and waist: trend, the
  value against its band with one sentence, weekly readings, what it means.
- **Targets**: weight, body fat and a date, editable in a sheet. Stored in
  settings, default 77 kg · 13% · Feb 28.
- **Tape by voice or keypad.** "waist 86.5 and hips 96" becomes two cards and
  one Save. English and Spanish site words. Nothing saves until Save.
- **Milestones**: the weight, BMI and body-fat lines appear on their own;
  anything else is logged through the Claude connector (`log_milestone`).
- **Database**: one new table, `body_milestones` (additive).
- **Not in this round**: back view, the detailed anatomical figure, training
  mode on the body map, pulling from the scale on demand.

## 2026-10-04 · Phase 1 (data model) and the sync engine, switched off

**Database** (migration `20261004230000_body_composition_renpho`, additive)
- 17 new measured columns on `body_measurements`: fat mass, muscle mass %,
  skeletal muscle kg, SMI, body water kg, protein kg, the scale's WHR
  estimate, and segmental muscle and fat for both arms, trunk and both legs.
- `impedance` and `referenceRanges` (JSON), `fieldSources` (per-field
  provenance), `externalId` (unique), `rawPayload` (the untouched record).
- New `body_sync_runs` table: one row per pull, success or failure.

**Backfill**
- 6 RENPHO records fetched; 5 scale readings merged into the 5 rows that
  already existed for those weigh-ins; the 86 kg setup entry skipped.
- 424 rows before, 424 after. 0 created, 0 duplicates. A second pass changes
  nothing.
- The hand-typed 2026-10-04 row now holds every value in real columns. Its
  `notes` text was left as written.

**Merge rule**
- RENPHO records upsert by `externalId`. A row within ±10 min and ±0.3 kg
  that no RENPHO record has claimed is the same weigh-in: the scale's values
  win on every field it carries; tape, notes and the row's origin are kept.
- Apple Health and hand entry still only fill blanks.

**MCP**
- `log_measurement` accepts every measured column plus impedance. A check-in
  that matches an existing weigh-in is added to that row (blanks only) and
  the result lists any stored value that differed.
- `query_data body_measurements` returns the new columns, impedance and
  per-field sources; a single-row fetch adds the reference ranges.

**Also fixed**
- `POST /api/health/body` wrote 11 fields and left `source` empty. It now
  writes every measured column and stamps `manual`.
- `measurements.csv` exports the new columns.

**Sync engine — built, not running**
- `lib/renpho-client.ts` (login, table lookup, paging), `lib/renpho-sync.ts`
  (run log, alert rule), `/api/cron/renpho-sync`, `/api/health/body/sync`,
  and a trigger on Apple Health weigh-in arrival.
- All of it is a no-op unless `RENPHO_SYNC_ENABLED=1`, because a login with
  the main account signs the phone app out.
- Alert rule proven with three deliberate failed logins (a nonexistent
  account): silent on 1 and 2, alert on 3, no repeat on 4. Push delivery to
  the phone was not exercised.

## What RENPHO cannot give us

- Measured composition. Everything except weight is a bioimpedance estimate.
- A real waist-to-hip ratio; the scale's is a guess. Tape is the source.
- Tape measurements of any kind.
- History before 2026-09-12. Earlier composition is the Etekcity scale's, and
  the two are not comparable: body fat reads 20.7% in late July (Etekcity)
  and 14.5% in mid-September (RENPHO). Most of that gap is the device.
- Heart rate on this scale (the Apple Watch covers it).
- A push when a weigh-in happens.
- A login that leaves the phone app signed in.
