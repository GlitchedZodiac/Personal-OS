# Apple Health → Pitaya: the nightly Shortcut

> **Optional since 2026-10-17.** The Pitaya iPhone app now does all of this
> itself. It sends the last 8 days on every sync, in the background, and
> your whole history once. Update it from TestFlight, open it, and allow the
> new Health data when it asks. Keep this Shortcut only as a backup.

An iPhone Shortcut reads your daily **Steps, Active Energy, Resting Energy and
Walking + Running Distance** from Apple Health and sends them to Pitaya. Each
run sends the **last 8 days** (today plus the 7 before it), so a night the
phone misses is filled in by the next run. Pitaya keeps one row per day and
overwrites it when the day is sent again, so re-sending never makes duplicates.
A second, **one-time History Shortcut** sends every day Health has ever
recorded (step 5).

What you get in Pitaya:
- **Today → Activity** (also Train → "Steps & calories history"):
  - yesterday, compared with your 7-day average and the same weekday last week;
  - the Mon–Sun week: daily bars, total, daily average, best and lowest day, and the change from last week;
  - **History** for steps, active kcal or km, by days, weeks, months or years;
  - trends over 7, 30 and 90 days and 12 months;
  - all-time records: total, best day, week and month, 10k days and streaks, and steps by weekday.
- A push around **7 am Central** with yesterday's numbers, and one on **Sunday
  evening** with the week. Switch them off in Settings → Notifications →
  "Steps & calories".
- Claude can read it: `query_data` dataset `daily_activity`, with `from`/`to`.

---

## 0. One-time server setup

1. Make a token (on a Mac): `openssl rand -hex 32`. It must be at least 16
   characters long.
2. Vercel → `personal-os` project → Settings → Environment Variables → add
   `HEALTH_INGEST_TOKEN` = that token (Production, and Preview if you want).
   Then **redeploy**: a new variable only reaches a new deployment.
3. Until the token is set, Pitaya refuses every push with `401`. That is
   deliberate: it fails closed.

## 1. Test the endpoint with curl before building anything

```bash
export HEALTH_INGEST_TOKEN='paste-the-token-here'

curl -i -X POST https://personal-os-plum.vercel.app/api/health/daily \
  -H "Authorization: Bearer $HEALTH_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"date":"2026-10-16","steps":8123,"active_energy_kcal":512,"resting_energy_kcal":1890,"walking_running_distance_km":6.4,"source":"mixed"}]'
```

Expected: `HTTP/2 200` and

```json
{"upserted":1,"dates":["2026-10-16"],"skippedEmpty":[],"rejected":[]}
```

Run it again: still `"upserted":1`, and still one row for that day. That
shows the overwrite works. The made-up numbers are replaced by your real ones
the first time the Shortcut sends that date.

Other answers you might see:
- `401 {"error":"Unauthorized"}`: the token is missing or wrong, or the
  variable has not reached a deployment yet (see step 0).
- `400`: the body is not a JSON array, or no day in it is valid. The response
  says which field is wrong.
- `"skippedEmpty": [...]`: those days had no data at all. This is what a run
  on a locked phone looks like, and those days are **not** written over.

## 2. Check two settings in the Health app

- **Distance unit.** Health → Browse → Activity → Walking + Running Distance.
  If it shows **km**, use the key `walking_running_distance_km` below. If it
  shows **mi**, use `walking_running_distance_mi` instead (Pitaya converts).
- **Energy unit.** Active Energy should show **Cal / kcal**. If it shows kJ,
  tell Claude and kJ support can be added.

## 3. Build the Shortcut

Shortcuts app → **+** → name it **Pitaya Health Sync**. Add these actions in
order. Indented lines go *inside* the Repeat. "→ Set Variable X" means: add a
**Set Variable** action right after, named X, taking the previous action's
result.

**Setup**

1. **Number**: `8` → Set Variable **DaysBack**
   *(the nightly run sends 8 days; your full history comes from step 5)*

**For each day**

2. **Repeat** `DaysBack` times
3. ⠀⠀**Calculate**: `Repeat Index` − `1` → Set Variable **Offset**
   *(Repeat Index starts at 1; Offset 0 is today)*
4. ⠀⠀**Adjust Date**: Subtract `Offset` days from `Current Date`
5. ⠀⠀**Adjust Date**: Get Start of Day of `Adjusted Date` → Set Variable **DayStart**
6. ⠀⠀**Adjust Date**: Add `1` day to `DayStart`
7. ⠀⠀**Adjust Date**: Subtract `1` minute from `Adjusted Date` → Set Variable **DayEnd**
   *(23:59 of the same day, so the next midnight never sneaks in)*
8. ⠀⠀**Format Date**: `DayStart`, Date Format **Custom**, `yyyy-MM-dd`,
   Time Format **None** → Set Variable **DayKey**

**Steps**

9. ⠀⠀**Find Health Samples** where
   - `Type` is `Steps`
   - `Start Date` is between `DayStart` and `DayEnd`
   - **Group By: Day** (and leave Fill Missing **off**)
10. ⠀⠀**Get Details of Health Sample**: `Value` → Set Variable **Steps**

**Active Energy, Resting Energy, Distance.** Repeat steps 9–10 three more
times, changing only the Type and the variable name:

11. ⠀⠀Find Health Samples, `Active Energy`, same date filter, Group By Day →
    Get Details: `Value` → Set Variable **Active**
12. ⠀⠀Find Health Samples, `Resting Energy`, same date filter, Group By Day →
    Get Details: `Value` → Set Variable **Resting**
13. ⠀⠀Find Health Samples, `Walking + Running Distance`, same date filter,
    Group By Day → Get Details: `Value` → Set Variable **Distance**

> **Why "Group By: Day" matters.** Without it you get the raw samples, and
> your iPhone and your Watch both count the same steps, so a plain sum
> double-counts. Grouped by day, Health de-duplicates them and gives the same
> number the Health app shows. After your first run, compare one day's steps
> in Pitaya with the Health app. They should match.

**Source (optional, but it fills "phone / watch / mixed")**

14. ⠀⠀**Find Health Samples** where `Type` is `Steps`, `Start Date` is between
    `DayStart` and `DayEnd`, **Group By: None**, Limit on, **20**
15. ⠀⠀**Get Details of Health Sample**: `Source`
16. ⠀⠀**Combine Text**: `Source`, separator **Custom** `, ` → Set Variable **Sources**

    Pitaya reads the device names ("…'s Apple Watch", "…'s iPhone") and
    stores `watch`, `phone` or `mixed`. If you skip 14–16, delete the
    `"sources"` part from the Text in step 17.

**One day as JSON**

17. ⠀⠀**Text**. Type this exactly, inserting the variables where the
    `[brackets]` are (tap the spot, then pick the variable):

    ```
    {"date":"[DayKey]","steps":"[Steps]","active_energy_kcal":"[Active]","resting_energy_kcal":"[Resting]","walking_running_distance_km":"[Distance]","sources":"[Sources]"}
    ```

    Keep the quotes around every value. A day where Health had nothing for
    a metric then sends `""`, which Pitaya stores as "no data", instead of
    breaking the JSON. Pitaya also accepts `6,42` from a phone set to a
    decimal-comma region. (Using miles? Change the key to
    `walking_running_distance_mi`.)
18. ⠀⠀**Add to Variable**: `Text` → **Days**
19. **End Repeat**

**Send**

20. **Combine Text**: `Days`, separator **Custom** `,`
21. **Text**: `[` `Combined Text` `]` (an opening bracket, the Combined Text
    variable, then a closing bracket, with no spaces)
22. **Get Contents of URL**: `https://personal-os-plum.vercel.app/api/health/daily`
    - Method **POST**
    - Headers:
      - `Authorization` → `Bearer YOUR_TOKEN` (the word Bearer, one space, then the token)
      - `Content-Type` → `application/json`
    - Request Body **File** → the `Text` from step 21
23. **Get Dictionary Value**: `upserted` from `Contents of URL`
24. **Show Notification**: `Pitaya: Dictionary Value days synced`
    *(optional. It is handy while you test; you can delete it later.)*

Run it once by tapping ▶︎ **with the phone unlocked**. You should get "Pitaya: 8
days synced". Then open Pitaya → Today → **Activity**.

## 4. Make it run every night

Shortcuts → **Automation** → **+** → **Time of Day**
- **10:00 PM**, Repeat **Daily**
- **Run Immediately**. Switch **Notify When Run** off if you don't want a banner.
- Next → choose **Pitaya Health Sync**.

> ⚠️ **Health data can't be read while the iPhone is locked.** If the phone is
> locked at 10 pm, the automation still runs but reads nothing. Pitaya sees
> 8 empty days, skips them (it never writes over good data), and reports them
> as `skippedEmpty`. The next run while the phone is unlocked fills them in,
> because every run re-sends the last 8 days.
>
> **Recommended backup trigger:** add a second automation: **App** → **Is
> Opened** → **Pitaya** → Run Immediately → same shortcut. You can only open
> an app on an unlocked phone, so this run always reads Health. Re-sending is
> free: each day is simply overwritten with the same or newer numbers.

If no data reaches Pitaya for 2 days, you get a "Apple Health Shortcut hasn't
synced" alert (Settings → Notifications → System alerts).

## 5. Your whole history (once): the History Shortcut

The nightly Shortcut asks Health one day at a time, which is fine for 8 days
and far too slow for years. This second Shortcut asks once per metric for
every day at once ("Group By: Day"), then sends one list per metric. Pitaya
writes only the metric each list carries, so the four sends fill in each day
together.

Shortcuts app → **+** → name it **Pitaya Health History**.

1. **Number**: `3650` → Set Variable **DaysBack**
   *(10 years. Use `5475` for 15. Days before your first iPhone simply come
   back empty.)*

**Steps**

2. **Find Health Samples** where
   - `Type` is `Steps`
   - `Start Date` is in the last `DaysBack` days
   - **Group By: Day**, Fill Missing **off**
   - Sort by **Start Date**, Order **Oldest First**, Limit **off**
3. **Repeat with Each** item in `Health Samples`
4. ⠀⠀**Get Details of Health Sample**: `Start Date` of `Repeat Item`
5. ⠀⠀**Format Date**: `Start Date`, Custom `yyyy-MM-dd`, Time Format **None**
6. ⠀⠀**Get Details of Health Sample**: `Value` of `Repeat Item`
7. ⠀⠀**Text**: `{"date":"[Formatted Date]","steps":"[Value]"}`
8. **End Repeat**
9. **Combine Text**: `Repeat Results`, separator **Custom** `,`
10. **Text**: `[` `Combined Text` `]`
11. **Get Contents of URL**: the same URL, method, headers and **File** body
    as step 22 of the nightly Shortcut, using the Text from step 10.
12. **Get Dictionary Value**: `upserted` → **Show Notification**:
    `Steps: Dictionary Value days`

**Active Energy, Resting Energy, Distance:** select steps 2–12, tap **Duplicate**
three times, and in each copy change only:

| copy | Find Health Samples `Type` | key in the Text of step 7 |
|---|---|---|
| 2 | `Active Energy` | `"active_energy_kcal"` |
| 3 | `Resting Energy` | `"resting_energy_kcal"` |
| 4 | `Walking + Running Distance` | `"walking_running_distance_km"` (or `_mi`, as in section 2) |

Check that each copy's Repeat uses **its own** Health Samples and that its
Combine Text uses **its own** Repeat Results. Duplicated actions sometimes
still point at the first copy's variables.

**Running it:**
- Unlock the phone, open Shortcuts and run it with ▶︎. Keep it on screen.
- It works through every day for each metric, so 10 years can take several
  minutes per metric. Try `365` first to see how long a year takes.
- Expect four notifications, one per metric: "Steps: 3,650 days", and so on.
  Fewer is normal if Health has no data for some days.
- A push can carry up to 7,500 days.
- Running it again is harmless: each day is overwritten with the same numbers.

Until this runs, the Activity screen shows what the iPhone app has synced on
its own. That sync only happens while the app is open, so some of those days
are partial. A day the Shortcut sends always replaces it.

## Reference: what Pitaya accepts

`POST /api/health/daily` with header `Authorization: Bearer <HEALTH_INGEST_TOKEN>`.
Body: a JSON array of days (or `{"days":[...]}`), at most 7,500:

| key | required | notes |
|---|---|---|
| `date` | yes | `YYYY-MM-DD`, your phone's local day. Not more than a day in the future. |
| `steps` | no | whole steps |
| `active_energy_kcal` | no | kcal |
| `resting_energy_kcal` | no | kcal |
| `walking_running_distance_km` | no | or `_mi` / `_m`, converted to km |
| `source` | no | `phone`, `watch` or `mixed` |
| `sources` | no | device names; Pitaya works out `source` from them |

Numbers may be JSON numbers or text (`"8123"`, `"6,42"`). Unknown keys are
ignored. **A key you leave out is left alone; a key sent empty (`""`) clears
it.** So the nightly Shortcut, which sends every key, overwrites the whole
day, and the History Shortcut, which sends one metric at a time, never wipes
the other three. A day with a bad value is rejected on its own and listed in
`rejected`, and the other days are still stored. A day with nothing in it is
skipped (`skippedEmpty`). The response's `upserted` is the number of days
written.

"Yesterday" in the reports is yesterday in **Central time** (America/Chicago).
The date on each day is whatever your phone called it, so when you travel a
day is still the day your phone lived through.
