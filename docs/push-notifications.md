# Push notifications

How Pitaya's notifications work as of 2026-10-05, what it takes to receive
them on each device, and what is still missing. Code: `lib/notify.ts` (the
pipeline), `lib/quiet-hours.ts` (the rules, tested), `lib/push.ts` (Web Push
transport).

## Which kind of push applies

Pitaya is **both** things the question allows for, and they need different
answers:

| Surface | What it is | Push that reaches it | State |
|---|---|---|---|
| Safari / Chrome, and Pitaya added to a home screen | A PWA | **Web Push** (VAPID + service worker) | **Works** — built, needs one tap per device to switch on |
| "Pitaya Personal" from TestFlight (iPhone, iPad) | A native shell: a `WKWebView` around the same web app | **APNs** only | **Not yet** — see [The iPhone app](#the-iphone-app-apns) |

The second row is the one that matters day to day: the iPhone's device
session is the TestFlight app, and a `WKWebView` has no Push API at all — no
`PushManager`, no service-worker push. Nothing done in the web code can make
a notification appear from that app.

**So today:** notifications can reach Pitaya installed from Safari on the
iPhone (it sits beside the TestFlight icon), and any desktop browser. They
cannot reach the TestFlight app until it gets a native update.

## iOS requirements for Web Push

- **iOS / iPadOS 16.4 or later.**
- **Installed to the Home Screen**: open the site in Safari → Share → *Add to
  Home Screen*, then open Pitaya **from that icon**. Safari in a tab cannot
  receive push on iOS, and neither can any in-app browser.
- **Permission from a tap.** iOS only shows the permission prompt inside a
  user gesture. `enablePush()` asks for it before making any network call so
  the prompt opens inside the tap.
- Uninstalling the home-screen app discards its subscription; the server
  prunes the dead endpoint the next time a send fails with 404/410.

## Turning it on

1. On the device: Settings → Notifications → **This device**. Or accept the
   card that appears in chat right after you set a reminder — that is the
   only place the app asks unprompted, and "Not now" silences it for two
   weeks.
2. "Send a test notification" on the same screen proves the round trip.

As of this writing **no device is subscribed** (`push_subscriptions` is
empty), so nothing has ever been delivered. Reminders that come due in that
state now **wait** instead of being marked fired and lost.

## Categories

Each has its own switch in Settings → Notifications; all default on.

| Switch | Sent when | Sender |
|---|---|---|
| Reminders | A reminder comes due — from chat (`set_reminder`), a week plan's timed reminders, or an automation | the sweep |
| Training day | Morning of a day the week plans training; silent once trained | `cron/training-nudge` |
| New weigh-in synced | A weigh-in measured in the last 36 h arrives; one line: weight · body fat · change | `announceWeighIn()` |
| System alerts | A sync pipeline has been failing, or a heartbeat source silent, for 2 days; repeats every 3 days while it lasts | `checkSyncHealth()` |
| PR celebrations | A watch save sets a personal record | `mobile/workouts/sync` |
| Weekly report ready | The Sunday report is written | `cron/weekly-report` |
| Spirit evening reminder | ~7pm, only while carrying unticked homework | `cron/spirit-reminder` |

## Quiet hours

Default **10:00 pm – 7:00 am**, in the timezone the device last reported
(`NotificationHeartbeat` sends it whenever it changes — the hours follow a
move to Houston without anything being reconfigured).

- Anything that comes up inside the window is **held** and delivered when it
  ends. 22:00 is quiet; 07:00 is not.
- **One exception, on by default:** a reminder *you* set for a specific time
  arrives at that time. Quiet hours govern what the app decides to send;
  "remind me at 5:30am" is you deciding. Switch "Let my timed reminders
  through" off and even those wait for the morning.
- A held notification that still cannot be delivered 12 h after its window
  ended is marked expired rather than sent stale.

## When things are actually delivered

Web Push has no "deliver at 4:00 pm" — something has to run at 4:00 pm.
What runs:

| Trigger | How often |
|---|---|
| Vercel cron → `/api/cron/reminder-push` | Hourly, each run ±59 min (24 once-a-day entries — the most the Hobby plan allows) |
| Any open Pitaya (`NotificationHeartbeat`) | Every minute while on screen |
| The watch or phone companion checking in (`/api/mobile/*`) | Whenever they do, at most one sweep a minute |

Every trigger runs the same sweep and reminders are claimed atomically, so
they overlap safely: each reminder goes out exactly once.

**What that means in practice:** with a watch on the wrist checking in
through the day, a timed reminder usually lands within minutes. With nothing
talking to the server, the worst case is the hourly cron — up to about two
hours late. **It is not exact-minute delivery**, and it cannot be on this
plan. Two ways to get exact:

1. **Vercel Pro** (~$20/mo): change the schedule to `* * * * *`, delete the
   other 23 entries. One line.
2. **Supabase `pg_cron` + `pg_net`** (free): the database calls
   `/api/cron/reminder-push` every minute with the `CRON_SECRET`. No new
   vendor, minute precision — but it stores a secret in the database and is a
   standing job in production, so it wants an explicit yes. (A GitHub Actions
   pinger was the earlier idea; on a private repo a 15-minute schedule
   overruns the free minutes.)

The native route below sidesteps the question for the iPhone entirely: the
app can schedule reminders as *local* notifications, which iOS fires on time
with no server involved.

## The log

Settings → Notifications → **Recently sent** (and `notification_log`):
every notification, when, and what became of it.

| Status | Meaning |
|---|---|
| Delivered (`sent`) | At least one device's push service accepted it |
| Shown in app (`local`) | No subscription; the open app showed it itself |
| Held · quiet hours (`held`) | Waiting for the window to end; shows when it goes out |
| No device subscribed (`no_devices`) | Nowhere to send it |
| Failed (`failed`) | Devices exist and none accepted it; the error is kept |
| Too late to send (`expired`) | A reminder 48 h overdue, or a held item 12 h past its window |
| Switched off (`muted`) | Its category was turned off while it was held |

"Delivered" means the push service took it. Web Push gives the server no
receipt that the banner actually appeared on the phone. Rows older than 90
days are pruned.

## Adding a source (the RENPHO hook)

Two calls, both safe to make from anywhere and both no-ops on failure:

```ts
// after storing new weigh-ins — announces only the newest, only if recent
await announceWeighIn(createdRows);

// on EVERY sync attempt, success or failure
await recordSync("renpho", { ok: true, label: "Body composition" });
await recordSync("renpho", { ok: false, label: "Body composition", error: message });
```

`recordSync` is what makes "body composition sync failed for 2 days"
possible: the first failure after a success starts a clock, a success clears
it, and the hourly check raises the alert once the clock passes two days. A
source that reports on its own schedule can pass `heartbeat: true`, and then
two days of *silence* alerts too — which is how the Apple Health companion is
watched (it posts daily whether or not there is a weigh-in, so silence means
the phone app is not syncing, not that nobody stepped on the scale).

## The iPhone app (APNs)

What it would take for the TestFlight app to notify, and whose it is:

| Piece | Owner | State |
|---|---|---|
| `aps-environment` entitlement on the app | iOS lane (`ios/**`) | Missing. Possible now — the paid developer program landed 2026-08-28 |
| Ask permission + register (`CompanionModel.requestPush`) | iOS lane | Written, never called |
| Token upload `POST /api/mobile/push/register` | main lane | Works. Fixed 2026-10-05: the app sends `deviceToken`, the route only read `token` |
| An APNs auth key (`.p8`) + key id + team id in Vercel | **Michael** — created in the Apple Developer portal | Missing |
| A sender that signs a JWT and posts to APNs | main lane | **Not built.** It would be a second transport inside `deliver()` in `lib/notify.ts`; categories, quiet hours and the log apply to it unchanged |
| Reminders as local notifications (exact timing, offline) | iOS lane | Not built; the cleanest fix for timing |

The sender was deliberately left unbuilt: without a key or a single
registered device there is no way to prove it delivers, and a dormant code
path that has never run is not a feature.

## Known edges

- A notification whose send is interrupted mid-flight (the function is
  killed between claiming the row and finishing) stays `sending` and is not
  retried.
- A held notification released into a moment with no subscribed device is
  logged `no_devices` and gone — it does not wait a second time.
- `delivered` cannot distinguish "banner shown" from "accepted by Apple's
  push service and dropped by a Focus mode".
