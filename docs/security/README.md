# Pitaya security — in plain words

For Michael. What protects your data, what you must do yourself, and what to
do if something leaks. The full technical record is in
[`audit-2026-10.md`](audit-2026-10.md); the method and decisions are in
[`PLAN.md`](PLAN.md). This page assumes no jargon.

Pitaya holds the three things you'd least want a stranger to read — your
health, your money, and your faith notes. Everything below is about keeping
those to you.

---

## DO THIS FIRST (before you merge the security fixes)

The biggest problem the audit found: when two settings are missing in Vercel,
Pitaya signs your login using **your PIN as the secret**. A 4–6 digit PIN is
easy to guess, so a stranger could forge a login or work your PIN out without
ever touching your phone. The fix makes Pitaya *refuse to run* with those
settings missing — which means if you merge the fix before setting them, the
app will show a clear "not configured" message instead of letting you in.

So, in this order:

1. Open a terminal on the Mac and run this twice, to make two different random
   values:
   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```
2. In Vercel → the `personal-os` project → **Settings → Environment
   Variables**, add both (for **Production**, and **Preview** if you use
   preview links):
   - `AUTH_COOKIE_SECRET` = the first value
   - `APP_AUTH_SECRET` = the second value
3. While you are there, confirm **`CRON_SECRET`** has a value. If it is empty,
   some scheduled jobs (your Gmail finance sync, the daily refresh) will run
   for anyone who finds the URL.
4. **Then** merge the security pull request and let it deploy.
5. After it deploys, open the app once on each device and unlock with your
   PIN. The watch, the iPhone app and the Claude connector keep working — the
   fix was built so you do **not** have to re-pair anything (it honours the
   old sign-in keys for 90 days while the new ones take over).

If you merge before step 2, nothing is damaged — the app just says it is not
configured until you add the two values and redeploy.

---

## How Pitaya is locked (today)

- **One PIN, one door.** The whole app sits behind your PIN. The web app, the
  watch and the iPhone all prove it is you with that PIN.
- **Your browser carries a signed ticket.** When you unlock, Pitaya gives your
  browser a signed "it's Michael" cookie that lasts 30 days. Every page asks
  for data through locked doors that check that cookie.
- **The watch, phone and Claude connector carry tokens, not your PIN.** When
  you pair a device it gets a long random token. You can see and revoke them
  in **Settings → Devices** (and the Claude connector under **Settings →
  Claude connector**). Revoking is instant and is the main control — a token
  cannot be "un-leaked", but it can be revoked.
- **Your Gmail finance login is encrypted** in the database. (After the fixes,
  your Strava token and the OpenAI billing key will be too.)
- **The app talks to OpenAI** to read meal photos and nutrition labels,
  transcribe what you say, and answer in chat — so those photos, that audio,
  and the chat text (with the health/finance data it needs to answer) go to
  OpenAI. Nothing else leaves.

## The secrets Pitaya keeps, and how to rotate each

All of these live in Vercel's environment settings (encrypted there). To
rotate one, change it in Vercel and redeploy. None of them should ever be
pasted into a file in the repo.

| Secret | What it protects | If you rotate it |
|---|---|---|
| `AUTH_COOKIE_SECRET` | The signature on your login cookie | Everyone's browser logs in once more |
| `APP_AUTH_SECRET` | The keys behind PIN hashing and device tokens | After the fix: old device tokens keep working for 90 days, then re-pair |
| `CRON_SECRET` | The scheduled jobs | Update it in Vercel; the crons use it automatically |
| `HEALTH_INGEST_TOKEN` | The Apple Health Shortcut's push | Change it in Vercel, then in the Shortcut's Authorization header |
| `FINANCE_VAULT_MASTER_KEY` | The encryption of your Gmail token (and, after the fix, Strava + OpenAI billing key) | Changing it makes the stored encrypted values unreadable — only rotate with a re-connect of those integrations |
| `STRAVA_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET` | The OAuth apps | Rotate in Strava/Google's developer console, then paste the new value in Vercel |
| `OPENAI_API_KEY` | AI calls | Rotate at platform.openai.com, paste in Vercel |
| `VAPID_PRIVATE_KEY` | Web push notifications | Rotate the keypair; browsers re-subscribe |
| The OpenAI **admin** key | Reading your real OpenAI spend | Delete/reconnect in Settings → AI |

## If a token or secret leaks

- **A device token** (watch, phone, or the Claude connector) — go to
  **Settings → Devices** (or Settings → Claude connector) and revoke it. Done.
  Re-pair the real device afterwards.
- **Your PIN** (you typed it somewhere, or someone watched) — change it in
  **Settings** (after the fix lands, a PIN change is durable and logs other
  devices out). Then rotate `AUTH_COOKIE_SECRET` and `APP_AUTH_SECRET` in
  Vercel so any copies of the old login cookie stop working.
- **A Vercel secret** (one of the table above) — rotate it at its source, paste
  the new value in Vercel, redeploy. For `FINANCE_VAULT_MASTER_KEY`, also
  reconnect the integrations it encrypts.
- **The OpenAI key** — rotate at platform.openai.com first (that stops the
  spend), then update Vercel.
- You never need to paste a secret into chat or a file to rotate it. If a tool
  or a web page ever asks you to, that is the wrong move.

## What to check once a month (two minutes)

1. **Settings → Devices.** Does every device listed still belong to you? If
   not, revoke it.
2. **Settings → Claude connector.** Is only the connector you expect listed?
3. **Settings → AI / spend.** Anything surprising means a key may be loose.
4. **Settings → Notifications → Recently sent.** A notification you did not
   cause is worth a second look.
5. Once the security pull request is in, the **build gate** does the heavy
   checking for you on every change — a new unlocked door or a pasted secret
   will fail the build before it ships.

## Honest gaps (recorded, not yet closed)

- **No backups.** If a bad change or a mistaken "delete" wipes data, it is
  gone — there is no restore today. Worth fixing: Supabase's paid plan gives
  daily backups and point-in-time restore, or you can run a monthly database
  dump from the Mac. (Audit SEC-044.)
- **The repository is public, and `docs/state.md` contains your body data.**
  Either scrub that file or make the repo private. Your call — the audit does
  not change it. (SEC-063.)
- **Preview deployments.** If you use Vercel preview links, check they are
  password-protected and are not pointed at your real database. The audit
  could not see your Vercel settings. (SEC-060.)
- **The connector and device tokens can currently read your finances and
  faith notes.** The fixes lock the Claude connector down to its own token
  type and put finance behind a switch you turn on deliberately. (SEC-010/011.)

## Who did this, and what changed

An automated security review (October 2026) walked every one of Pitaya's 196
data doors, the sign-in pages, the service worker and the public files, found
and reproduced the problems above, and is fixing them in batches — each with a
test that fails if the problem ever comes back, plus a gate that runs on every
build. No feature of the app changes; only the locks and limits tighten. The
watch and iPhone keep their exact data contracts.
