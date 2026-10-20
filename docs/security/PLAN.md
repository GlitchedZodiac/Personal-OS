# Security and privacy audit — October 2026 — the plan

Lane A of the 2026-10-17 weekend. Branch `claude/security-audit-2026-10`,
worked in its own worktree against an empty local Postgres. Findings live in
[`audit-2026-10.md`](audit-2026-10.md); the plain-words guide for Michael is
[`README.md`](README.md) (Phase 2). This file says what will be done, why, and
in what order, so the work can be checked against it.

Everything here is safe for a public repository: no secret values, no body
data, no transcripts. Where a value matters it is described, never pasted.

---

## What Michael will see (plain English)

Pitaya holds the three things you would least want a stranger to read: your
health (weight, body composition, workouts, what you ate), your money (Gmail
statements, accounts, budgets), and your faith notes (sermons, journal, the
desk). This audit walks every door into that data and asks three questions
of each: who can open it, what can they take or break once inside, and how
would you find out.

The result, by Monday, is:

1. **A list of every door** (196 API routes plus the sign-in pages, the
   service worker and the public files) with the lock each one uses.
2. **A findings table** with a severity for each problem, a reproduction
   that was actually run, and the fix.
3. **Fixes shipped** for everything that can be fixed in code without your
   say — the cookie secret, the connector token's reach, request size caps,
   security headers, logging, dependency upgrades — each with a test that
   fails if it regresses.
4. **A short list of things only you can do** (set or rotate a few values in
   Vercel), ordered by how much they matter.
5. **A gate** that runs on every build and every pull request, so a new
   unlocked door or a pasted secret fails the build instead of shipping.
6. **A guide** (`docs/security/README.md`): what is protected and how, what
   to rotate, what to do if a token leaks, what to check monthly.

Nothing in this lane changes what the app does for you day to day. The watch
and iPhone contracts (`/api/mobile/*`) keep their shapes; only locks and
limits tighten.

---

## Method

Per door: **inventory → threat → reproduction → severity → fix → regression
test.** A finding is not a finding until it has been reproduced against the
local dev server (port 3101) or a script, with the command and the observed
output recorded (redacted). Anything that cannot be reproduced here (for
example what the production Vercel project has set) is labelled
**unverified** and carries the check Michael can run.

Rules in force (CLAUDE.md wins):

- **Record and continue.** Michael is away until Monday. A decision the code
  cannot settle goes under *Decisions* below with a recommended default, and
  the work proceeds under that default.
- **Trace the real path first.** Client → `proxy.ts` → route → `lib/` → DB,
  before calling anything a finding.
- **Contracts are frozen.** `/api/mobile/*` payload shapes are additive-only
  (`docs/watch-contract.md`). Tightening auth and bounds is allowed;
  changing a shape is not.
- **Use what exists.** `lib/auth.ts` (HMAC cookie), `lib/security.ts`
  (opaque tokens, compact HMAC), `lib/mobile-session.ts` (device sessions),
  `lib/oauth.ts`, `proxy.ts`, `lib/prisma.ts`, `lib/timezone.ts`.
- **One commit per phase/batch**, each green on `npx vitest run`,
  `npx tsc --noEmit`, `npx eslint <touched>`, `npm run build`, and smoked on
  the running dev server.
- **Out-of-lane work** goes to `docs/followups.md`, never a drive-by fix.

### Severity scale

| Level | Meaning here |
|---|---|
| **Critical** | A stranger, with no credential, can read or change his data, or can recover the PIN / forge the session. |
| **High** | A leaked or low-value credential (a watch token, an unset env var) opens far more than it should; or a door fails *open* under a plausible configuration. |
| **Medium** | Needs a precondition (an existing session, a database leak, a specific client) and the damage is bounded; or a hardening gap with a known exploit class. |
| **Low** | Defence in depth; unlikely to be exploited alone. |
| **Info** | Documented behaviour, a design choice to record, or a verified pass. |

### Finding ids

`SEC-NNN`, assigned in this plan and kept stable. The audit table carries:
id, title, severity, door, reproduction, fix, status, regression test.
Status is one of `hypothesis` (planned, not yet reproduced), `verified`,
`unverified` (cannot be reproduced here; check given), `fixed` (commit +
test named), `accepted` (deliberate, recorded), `false-positive`.

---

## Trust boundaries (what the code actually does)

```
browser / PWA ──cookie "auth"──▶ proxy.ts ──▶ /api/** route ──▶ lib/** ──▶ Prisma ──▶ Postgres
watch / iPhone ──Bearer device token──▶ (allowlisted) /api/mobile/** ──▶ requireMobileSession
claude.ai ──Bearer device token (deviceType "mcp")──▶ /api/mcp ──▶ lib/mcp/server → tools → same libs
Vercel cron ──Bearer CRON_SECRET──▶ /api/cron/*
iPhone Shortcut ──Bearer HEALTH_INGEST_TOKEN──▶ /api/health/daily (exact path)
Strava / Google ──state cookie──▶ /api/strava/callback, /api/finance/google/callback
claude.ai OAuth ──PKCE code / rotating refresh──▶ /api/oauth/token ; policy-only ──▶ /api/oauth/register
```

- **The gate** is `proxy.ts`: every `/api/*` path needs a valid `auth`
  cookie unless it is on `PUBLIC_API_EXACT` (`/api/health/daily`) or starts
  with a `PUBLIC_API_PREFIXES` entry (`/api/auth`, `/api/cron/`,
  `/api/mobile/`, `/api/mcp`, `/api/oauth/token`, `/api/oauth/register`,
  `/api/strava/callback`, `/api/finance/google/callback`).
- **Pages** are not gated server-side. `app/(tabs)/layout.tsx` wraps them in
  the client `PinGate`; the shell renders, but every byte of data comes
  through `/api/*`. Verifying that no page server-renders data without the
  cookie is part of dimension 10.
- **The cookie** is `base64url(JSON{sub,iat,exp}).HMAC-SHA256(secret)`,
  30 days, `httpOnly`, `sameSite=strict`, `secure` in production. The secret
  is `sha256(AUTH_COOKIE_SECRET || APP_PIN + ":personal-os:auth-cookie")`.
- **The app secret** (`lib/security.ts getAppSecret`) is
  `APP_AUTH_SECRET || NEXTAUTH_SECRET || APP_PIN || "personal-os-local-secret"`.
  It keys the PIN hash, every device/refresh token hash, every OAuth code
  hash, and the signature on stateless DCR client ids.
- **Device sessions** are 32 random bytes, stored as HMAC hashes, 30-day
  access / 90-day refresh for devices, 365/365 for connector tokens minted
  in Settings, 30/365 for OAuth-minted ones. Revocation: `revokedAt` via
  `DELETE /api/health/devices`.
- **Secrets at rest**: Google OAuth tokens are AES-256-GCM in
  `finance_vault_secrets` under `FINANCE_VAULT_MASTER_KEY`; Strava tokens
  are plaintext in `strava_tokens`; the OpenAI admin key is plaintext in
  `integration_secrets`; everything else is Vercel env.

---

## The doors — inventory

Generated from `app/api/**/route.ts` at `edf5099` (196 files). *Gate*
`proxy-cookie` means the proxy demands the cookie; `ALLOWLIST` means the
route is reached unauthenticated and must verify its own credential —
*Self-auth* names the call found in the file. *Bound hints* counts
size/length caps seen in the file (0 does not mean unbounded — the lib may
cap — it means the route file itself shows none). *Raw SQL* marks
`$executeRawUnsafe` / `$queryRawUnsafe`.

Beyond `/api`: `app/oauth/authorize/page.tsx` (public page; calls
`/api/auth` then `/api/oauth/approve`), the three `/.well-known/*` metadata
routes (public, discovery only), `public/sw.js`, `public/manifest.json`,
the two icons, the MapLibre worker chunks and `public/assets/body-front.svg`.

Every one of the 30 allowlisted routes contains a recognised self-auth
call (verified by the inventory script; the gate in the final phase makes
this check permanent).

| Route | Methods | Gate | Self-auth | Body | Rate limit | Bound hints | OpenAI | console.* | Raw SQL |
|---|---|---|---|---|---|---|---|---|---|
| `/api/admin/finance-schema-sync` | POST | proxy-cookie | CRON_SECRET | - | - | 0 | - | 1 | RAW |
| `/api/ai/admin-key` | GET,POST,DELETE | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/ai/balance` | GET | proxy-cookie | - | json | - | 2 | yes | 1 | - |
| `/api/ai/chat/conversations/[id]` | PATCH | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/ai/chat/conversations` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/ai/chat/messages` | GET,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/ai/chat/stream` | POST | proxy-cookie | - | json | - | 2 | yes | 2 | - |
| `/api/ai/demo-budget` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/ai/status` | GET | proxy-cookie | - | - | - | 0 | yes | 0 | - |
| `/api/ai/suggest` | POST | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/ai/transcribe` | POST | proxy-cookie | - | form+raw | - | 0 | yes | 5 | - |
| `/api/auth` | POST,GET,DELETE | ALLOWLIST | PIN | json | yes | 0 | - | 1 | - |
| `/api/auth/update-pin` | POST | ALLOWLIST | PIN | json | yes | 0 | - | 2 | - |
| `/api/cron/daily-refresh` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 1 | - |
| `/api/cron/finance-sync` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 1 | - |
| `/api/cron/reminder-push` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 1 | - |
| `/api/cron/renpho-sync` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 0 | - |
| `/api/cron/spirit-reminder` | GET | ALLOWLIST | CRON_SECRET | - | - | 1 | - | 0 | - |
| `/api/cron/training-nudge` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 0 | - |
| `/api/cron/weekly-report` | GET | ALLOWLIST | CRON_SECRET | - | - | 0 | - | 2 | - |
| `/api/finance/accounts` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/finance/ai-advisor` | GET | proxy-cookie | - | - | - | 0 | yes | 1 | - |
| `/api/finance/assistant` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/budget-categories` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/budgets` | GET,POST | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/finance/documents/[id]` | PATCH | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/documents` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/finance/goals` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/finance/google/auth` | GET | proxy-cookie | cookie(explicit)+oauth-state | - | - | 2 | - | 0 | - |
| `/api/finance/google/callback` | GET | ALLOWLIST | oauth-state | - | - | 1 | - | 1 | - |
| `/api/finance/google/rescan` | POST | proxy-cookie | cookie(explicit) | json | - | 0 | - | 1 | - |
| `/api/finance/google/status` | GET,DELETE | proxy-cookie | cookie(explicit) | - | - | 0 | - | 2 | - |
| `/api/finance/google/sync` | POST | proxy-cookie | cookie(explicit) | json | - | 0 | - | 1 | - |
| `/api/finance/inbox/fetch` | POST | proxy-cookie | - | json+text | - | 4 | - | 1 | - |
| `/api/finance/inbox/review` | POST | proxy-cookie | - | json | - | 4 | - | 1 | - |
| `/api/finance/inbox` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/learning-events` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/finance/merchants` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/finance/obligations/[occurrenceId]/checkoff` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/obligations` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/paycheck-allocation-rules` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/paycheck-allocation-runs/[id]/confirm` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/pending-categorization` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/finance/pockets` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/priority-sources` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/receipts/analyze` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/reports` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/finance/rules` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/finance/sources/[id]/actions` | POST | proxy-cookie | - | json | - | 1 | - | 1 | - |
| `/api/finance/sources/[id]` | PATCH | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/sources` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/finance/summary` | GET | proxy-cookie | - | - | - | 1 | - | 2 | - |
| `/api/finance/transactions/import` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/finance/transactions` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/finance/upcoming-payments` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/achievements` | GET | proxy-cookie | - | - | - | 34 | - | 1 | - |
| `/api/health/activity/history` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/activity` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/automations` | GET,PUT,POST | proxy-cookie | - | json | - | 2 | - | 3 | - |
| `/api/health/body/goals` | PUT | proxy-cookie | - | json | - | 1 | - | 1 | - |
| `/api/health/body/metric` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/body/milestones` | POST,DELETE | proxy-cookie | - | json | - | 2 | - | 2 | - |
| `/api/health/body/overview` | GET | proxy-cookie | - | - | - | 4 | - | 1 | - |
| `/api/health/body/report` | POST,PUT | proxy-cookie | - | json+form+raw | - | 6 | yes | 2 | - |
| `/api/health/body` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/health/body/summary` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/body/sync` | GET,POST | proxy-cookie | - | - | - | 0 | - | 2 | - |
| `/api/health/coach` | GET,POST | proxy-cookie | - | json | - | 2 | - | 2 | - |
| `/api/health/command-center` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/daily-brief` | GET | proxy-cookie | - | - | - | 2 | - | 1 | - |
| `/api/health/daily-log` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/daily` | POST | ALLOWLIST | HEALTH_INGEST_TOKEN | text | - | 0 | - | 2 | - |
| `/api/health/devices` | GET,DELETE | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/health/exercises` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/health/export/csv` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/export/gpx` | GET | proxy-cookie | - | - | - | 1 | - | 0 | - |
| `/api/health/export` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/favorites` | GET,POST,DELETE | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/health/food/batch` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/health/food/history` | GET | proxy-cookie | - | - | - | 3 | - | 1 | - |
| `/api/health/food` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/health/food/scan-label` | POST | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/health/habits` | GET,POST | proxy-cookie | - | json | - | 2 | - | 2 | - |
| `/api/health/import` | POST | proxy-cookie | - | json | - | 2 | - | 3 | - |
| `/api/health/import/vesync` | POST | proxy-cookie | - | json+form+text | - | 2 | - | 1 | - |
| `/api/health/journal` | GET,POST | proxy-cookie | - | json | - | 3 | - | 2 | - |
| `/api/health/mcp-token` | GET,POST | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/health/outcomes` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/health/planner` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/health/progress-photos/[id]` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/health/progress-photos` | GET,POST,DELETE | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/health/progression` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/health/prs/backfill` | POST | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/prs` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/recovery` | GET | proxy-cookie | - | - | - | 2 | - | 1 | - |
| `/api/health/report` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/sequences` | GET,POST,PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/health/streak` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/summary` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/today` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/trails` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/health/train` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/trends/insights` | GET | proxy-cookie | - | - | - | 0 | yes | 1 | - |
| `/api/health/trends/projections` | GET | proxy-cookie | - | - | - | 0 | yes | 2 | - |
| `/api/health/trends` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/voice-audit/clip` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/voice-audit` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/health/water` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 1 | - | 4 | - |
| `/api/health/weekly-report` | GET | proxy-cookie | - | - | - | 1 | - | 2 | - |
| `/api/health/workout-plan/chat` | POST | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/health/workout-plan/complete` | POST,GET | proxy-cookie | - | json | - | 2 | - | 3 | - |
| `/api/health/workout-plan` | GET,POST,PUT,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/health/workout-plan/streak` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/workout-plan/trends` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/workouts/activities` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/health/workouts/activity` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/workouts/analytics/backfill` | POST | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/health/workouts/entry` | PATCH | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/health/workouts/gpx` | GET | proxy-cookie | - | - | - | 1 | - | 0 | - |
| `/api/health/workouts` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 6 | - |
| `/api/mcp` | POST,GET,DELETE | ALLOWLIST | device-session | json | - | 0 | - | 0 | - |
| `/api/mobile/auth/refresh` | POST | ALLOWLIST | oauth-code/refresh | json | - | 0 | - | 1 | - |
| `/api/mobile/auth/session` | POST | ALLOWLIST | PIN | json | yes | 0 | - | 1 | - |
| `/api/mobile/exercises` | GET | ALLOWLIST | device-session | - | - | 0 | - | 1 | - |
| `/api/mobile/health/activity` | POST | ALLOWLIST | device-session | json | - | 1 | - | 2 | - |
| `/api/mobile/health/body` | POST | ALLOWLIST | device-session | json | - | 4 | - | 2 | - |
| `/api/mobile/health/daily` | POST | ALLOWLIST | device-session | json | - | 0 | - | 2 | - |
| `/api/mobile/prs` | GET | ALLOWLIST | device-session | - | - | 0 | - | 1 | - |
| `/api/mobile/push/register` | POST,DELETE | ALLOWLIST | device-session | json | - | 0 | - | 1 | - |
| `/api/mobile/sequences` | GET | ALLOWLIST | device-session | - | - | 0 | - | 1 | - |
| `/api/mobile/summary` | GET | ALLOWLIST | device-session | - | - | 0 | - | 1 | - |
| `/api/mobile/trails` | GET,POST | ALLOWLIST | device-session | json | - | 0 | - | 1 | - |
| `/api/mobile/voice/workout-entry` | GET,POST | ALLOWLIST | device-session | json | - | 4 | yes | 3 | - |
| `/api/mobile/workouts` | GET | ALLOWLIST | device-session | - | - | 1 | - | 1 | - |
| `/api/mobile/workouts/sync` | POST | ALLOWLIST | device-session | json | - | 0 | - | 7 | - |
| `/api/mobile/zones` | GET | ALLOWLIST | device-session | - | - | 0 | - | 1 | - |
| `/api/oauth/approve` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/oauth/register` | POST | ALLOWLIST | dcr-policy | json | - | 1 | - | 0 | - |
| `/api/oauth/token` | POST | ALLOWLIST | oauth-code/refresh | json+text | - | 0 | - | 0 | - |
| `/api/push/log` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/push/prefs` | GET,PUT | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/push/subscribe` | GET,POST,DELETE | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/reminders/[id]/fire` | POST | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/reminders/due` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/reminders` | POST,GET | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/settings` | GET,PUT | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/ask` | POST | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/spirit/bible` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/bsb` | GET | proxy-cookie | - | json | - | 1 | - | 1 | - |
| `/api/spirit/church` | GET,POST,PATCH,PUT | proxy-cookie | - | json | - | 0 | yes | 4 | - |
| `/api/spirit/comments/[id]` | PATCH,DELETE | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/spirit/comments` | GET,POST | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/spirit/complete` | POST,DELETE | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/curriculum/written` | GET,POST | proxy-cookie | - | json | - | 0 | yes | 1 | - |
| `/api/spirit/desk-prefs` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/export` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/spirit/generate` | GET,POST | proxy-cookie | - | json | - | 4 | yes | 2 | - |
| `/api/spirit/homework` | GET,POST,DELETE | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/hub` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/hymns/[id]` | GET,PATCH,POST,DELETE | proxy-cookie | - | json | - | 1 | - | 4 | - |
| `/api/spirit/hymns/read` | POST | proxy-cookie | - | json | - | 1 | yes | 1 | - |
| `/api/spirit/hymns` | GET,POST | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/spirit/ink/[id]` | GET,PATCH,POST,DELETE | proxy-cookie | - | json | - | 0 | - | 4 | - |
| `/api/spirit/ink/[id]/transcribe` | POST,PUT | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/spirit/ink` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/layer` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/memory` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 1 | - | 4 | - |
| `/api/spirit/notebook` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/notebooks/[id]` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/notebooks` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/orientation` | POST | proxy-cookie | - | - | - | 3 | yes | 1 | - |
| `/api/spirit/passage` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/prefs` | GET,PATCH | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/read` | POST,DELETE | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]/attach` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]` | GET,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 3 | - |
| `/api/spirit/recordings/[id]/segments/[index]` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]/segments` | POST | proxy-cookie | - | raw | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]/summary` | POST | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]/transcribe` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/spirit/recordings/[id]/worksheet` | POST | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/recordings` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/spirit/sermon` | GET,POST | proxy-cookie | - | json | - | 1 | - | 2 | - |
| `/api/spirit/source` | GET | proxy-cookie | - | - | - | 1 | - | 0 | - |
| `/api/spirit/today` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/track2` | GET,POST | proxy-cookie | - | json | - | 2 | - | 3 | - |
| `/api/spirit/transcript` | GET | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/spirit/translations` | GET | proxy-cookie | - | - | - | 0 | - | 1 | - |
| `/api/spirit/worksheet` | GET,POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/strava/auth` | GET | proxy-cookie | oauth-state | - | - | 0 | - | 0 | - |
| `/api/strava/backfill-streams` | POST | proxy-cookie | - | - | - | 1 | - | 1 | - |
| `/api/strava/callback` | GET | ALLOWLIST | oauth-state | json+text | - | 0 | - | 5 | - |
| `/api/strava/status` | GET,DELETE | proxy-cookie | - | - | - | 0 | - | 2 | - |
| `/api/strava/sync` | POST | proxy-cookie | - | json | - | 0 | - | 2 | - |
| `/api/todos/complete-by-title` | POST | proxy-cookie | - | json | - | 0 | - | 1 | - |
| `/api/todos` | GET,POST,PATCH,DELETE | proxy-cookie | - | json | - | 0 | - | 6 | - |

---

## The ten dimensions — threats, hypotheses, planned reproductions

Each hypothesis has a reserved id. "Repro" is what Phase 2 will run. Severity
is provisional until reproduced.

### 1. The MCP server and OAuth (`/api/mcp`, `lib/mcp/*`, `lib/oauth.ts`, `/api/oauth/*`, `/oauth/authorize`, `/.well-known/*`)

What exists: stateless JSON-RPC over POST; bearer = any valid `DeviceSession`;
26 tools over the full data registry (health, body, spirit, journal, todos,
**finance_* datasets included**) with destructive tools (`delete_entry`,
`delete_recipe`, `edit_workout` list-replace, `update_routine`,
`plan_training replaceWeek`) gated only by client-side approval hints
(annotations). OAuth: RFC 8414/9728 metadata, open DCR with HMAC-signed
stateless client ids, PKCE S256 required, single-use atomically-claimed
codes (5 min), rotating refresh, redirect allowlist (Anthropic hosts +
localhost).

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-010 | Any device session (a watch/phone token) is accepted at `/api/mcp`; a leaked phone token reaches every dataset and every destructive tool | High | pair a "watch" session via `/api/mobile/auth/session`, call `tools/call query_data finance_accounts` with it |
| SEC-011 | No dataset scoping for connector tokens: `query_data` returns `finance_*` and `spirit_*` rows to the same token that logs food | High | `query_data` over `finance_transactions` / `journal` with a Settings-minted mcp token |
| SEC-012 | 365-day connector TTL, refresh also 365; revocation exists but no "revoke all"; `lastSeenAt` is the only forensic | Info | read code; check Devices list surfaces it |
| SEC-013 | Destructive tools run with no server-side trail: a delete via MCP leaves nothing but a missing row | Medium | `delete_entry` then look for any audit row |
| SEC-014 | `report_gap.detail` and other free-text tool args are unbounded (`notes`, `description`, hymn `body`) | Low | send a 5 MB `detail` |
| SEC-015 | `/api/mcp` reads `request.json()` with no size check; only Vercel's 4.5 MB body cap applies | Low | POST 4 MB of JSON locally |
| SEC-016 | `/api/oauth/register` is unauthenticated and unlimited; each call returns an HMAC signed with the app secret — see SEC-002 for why that matters | see SEC-002 | `curl -d '{"redirect_uris":["https://claude.ai/x"]}'` |
| SEC-017 | OAuth path review: code replay, PKCE downgrade (`plain`), redirect confusion, `scope` passthrough unbounded | Info/Low | replay a code; send `code_challenge_method=plain`; 10 KB `scope` |
| SEC-018 | `/oauth/authorize` and `.well-known` are public by design; CIMD `client_id` URL is fetched server-side at approve time (cookie-gated SSRF surface) | Low | approve with `client_id=https://127.0.0.1:…` (expect metadata fetch) |
| SEC-019 | `getBearerToken` also accepts `api-token` / `x-api-key` on every `/api/mobile/*` route, not only `/api/mcp` | Info | call `/api/mobile/summary` with `x-api-key` |

Planned fixes (Phase 3, batch "MCP + OAuth"): require `deviceType === "mcp"`
at `/api/mcp`; default-deny `finance_*` datasets over MCP behind an explicit
opt-in (see Decisions); write a system `ChatMessage` row for every MCP
write/delete (the trail the 08-29 proposal promised, no schema change);
field caps on free text; a 256 KB body cap on `/api/mcp`; cap `scope`.

### 2. Intake endpoints (watch, Shortcut, iPhone app, pairing)

What exists: `/api/mobile/auth/session` (PIN → session, per-instance rate
limit, PIN verified against `auth_credentials.pinHash`), `/auth/refresh`
(rotating 256-bit token, no limiter), `/api/health/daily` (bearer token,
fail-closed below 16 chars, ≤7,500 days, numeric bounds), `/api/mobile/
health/{activity,daily,body}` (body ≤500 samples; activity shares the
7,500 cap), `/workouts/sync` (no item-count cap seen; streams downsampled
server-side), `/voice/workout-entry` (≤2 MB audio, 180-day clip retention),
`/push/register` (hex token regex).

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-020 | Pairing is a PIN oracle limited only per warm instance (5 fails / 10 min / IP, in-memory) — serverless instances do not share the map, and the IP comes from `x-forwarded-for` | Medium | locally: 6 wrong PINs → 429, then vary `X-Forwarded-For` → limiter resets |
| SEC-021 | `/api/mobile/auth/refresh` has no limiter — infeasible to brute force (256-bit) but each call is a DB lookup | Info | read code |
| SEC-022 | `/api/health/daily` fail-closed and bounds — verify, expect pass | Info (pass) | unset/short token → 401; 7,501 days → 400; negative kcal → rejected |
| SEC-023 | `/api/mobile/voice/workout-entry`: `transcript` field skips recognition (authenticated, fine); `audioBase64` decoded before the 2 MB check (base64 inflates 4/3 → ~2.7 MB decoded in memory) | Info | send 2.6 MB base64 → 413 |
| SEC-024 | `/api/mobile/workouts/sync` has no cap on `items[]`, `routeData.points[]` or stream lengths before processing | Medium | post 2,000 items / 200k points locally; time it |
| SEC-025 | `/api/mobile/health/daily` samples uncapped; `deviceLabel`/`platform` strings uncapped at pairing | Low | 100 KB `deviceLabel` |
| SEC-026 | `/api/mobile/push/register` DELETE by raw token (single user: fine) | Info | — |
| SEC-027 | Replay: no nonce; TLS + bearer + idempotent upserts — acceptable | Info | — |

Planned fixes (batch "intake"): a shared, DB-backed limiter for the two
PIN doors (see Decisions — needs an additive table); item/points/stream
caps on sync (additive contract: a cap is not a shape change); string caps
at pairing.

### 3. Web UI auth (`lib/auth.ts`, `lib/security.ts`, `/api/auth*`, `proxy.ts`, `PinGate`)

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-001 | **Cookie secret derives from the PIN when `AUTH_COOKIE_SECRET` is unset.** A forged cookie for each candidate PIN can be tried against any `/api/*` route with **no rate limit** (the proxy has none), so a 4–8 digit PIN is recovered online in ≤10^8 cheap 401s — or offline in seconds once any valid cookie is seen. Production likely has it unset (`.env.example` lists it optional). | **Critical** (if unset) | run the server with `AUTH_COOKIE_SECRET` empty; script forges cookies for PINs 0000–9999 against `/api/health/summary`; expect one 200 |
| SEC-002 | **App secret falls back to the PIN, then to a constant.** `/api/oauth/register` (public) returns `pos1.<payload>.<HMAC(appSecret)>` — an offline PIN-recovery oracle: enumerate PINs until the HMAC matches, then log in / forge cookies / mint sessions. Also keys PIN hash, token hashes, code hashes. | **Critical** (if unset) | register once; node script recovers the PIN from the client_id offline |
| SEC-003 | `hashPin` is an unsalted HMAC under the same secret — with the fallback it is HMAC(PIN, key=PIN): a DB leak yields the PIN instantly | Medium | compute table for 10^4 PINs; match the stored hash |
| SEC-004 | PIN change is not durable and does not reach devices: `/api/auth/update-pin` writes `.env.local` (read-only on Vercel) and `process.env` on one instance, never `auth_credentials.pinHash`; watch pairing keeps accepting the old PIN, and the next cold start reverts the web PIN | High | change PIN → pair with OLD PIN succeeds; restart server → old PIN logs in |
| SEC-005 | The in-memory limiter is per instance and keyed on the first `x-forwarded-for` hop | Medium | as SEC-020 |
| SEC-006 | 30-day cookies cannot be revoked server-side; a PIN change does not invalidate them (unless the secret derives from the PIN — the one case where the bug helps) | Low | change PIN; old cookie still 200 |
| SEC-007 | CSRF posture: `sameSite=strict` + JSON bodies; `GET /api/strava/auth?redirect=` builds the Strava callback from a query param (Strava validates the registered domain) | Info/Low | cross-site GET with cookie → 401 (strict) |
| SEC-008 | Demo mode flags (`DEMO_MODE`, `NEXT_PUBLIC_DEMO_*`) must not weaken auth | Info | grep + run with flags set → still 401 |
| SEC-009 | `/api/auth/update-pin` sits under the `/api/auth` prefix, so it is reachable **without a cookie** — a second PIN oracle with its own limiter scope | Low | `curl -d '{"currentPin":"0000","newPin":"1111"}'` with no cookie → 401 (not 401-from-proxy) |
| SEC-058 | `/api/admin/finance-schema-sync` requires the cookie (proxy) AND `x-admin-secret == CRON_SECRET`; runs fixed `$executeRawUnsafe` DDL — acceptable, but CRON_SECRET doing double duty is recorded | Info | — |

Planned fixes (batch "auth/cookie", first): fail closed in production when
`AUTH_COOKIE_SECRET` / `APP_AUTH_SECRET` are missing or under 32 characters
(cookie minting and verification refuse; `/api/auth` returns 503 with a
plain message; dev keeps working with a loud warning); derive per-purpose
keys (`cookie`, `pin`, `token`, `compact`) from the one secret with
`sha256(secret + ":" + purpose)` so one leak does not cross purposes;
move the PIN to `auth_credentials` for the web login too (DB hash first,
env as bootstrap) and make `update-pin` write it; `scrypt` the PIN hash with
a per-row salt (verify-then-rehash for the existing HMAC row); cookie-gate
`update-pin`; stamp the cookie with a PIN-generation marker so a PIN change
logs other devices out. Document the rotation Michael must do in Vercel.

### 4. File uploads (audio, photos, PDFs, CSV, email)

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-028 | `POST /api/health/progress-photos` stores any string as `imageData` with no type or size check; `GET` with `limit=100000` returns every photo **with full base64**; `parseInt("x")` → `take: NaN` | Medium | post 3 MB of `"zzzz"`; `GET ?limit=abc` → 500; `GET ?limit=99999` → payload size |
| SEC-029 | Journal photo (prefix + 2.5 MB), chat photos (≤6 data URLs), body report (≤4 MB, ≤4 images), voice clip (≤2 MB) — expected passes; `/api/ai/transcribe` has no own cap (Vercel 4.5 MB) | Info | send oversize → 400/413 |
| SEC-030 | Recording segments store `content-type` verbatim and serve it back as `Content-Type` — an uploaded `text/html` segment is served same-origin (self-XSS only; cookie needed to upload; no `nosniff` header today) | Low | upload `text/html` segment; GET it; observe header |
| SEC-031 | Statement PDFs: `lib/finance/pdf.ts` is a regex text extractor (no PDF parser library) — no parser attack surface; encrypted PDFs detected | Info (pass) | read code |
| SEC-032 | CSV / JSON bulk imports (`/api/health/import`, `/api/finance/transactions/import`, `/api/health/import/vesync`) have no row caps; `health/import` is typed `any` | Medium | 200k-row CSV locally; time/memory |
| SEC-033 | What leaves to OpenAI: meal/label/report photos, voice audio, chat text with registry data, finance advisor context — product behaviour, to be written down plainly | Info | document |
| SEC-034 | Where blobs live: all in Postgres (`progress_photos.imageData` base64, `recording_segments.bytes`, `voice_clip_audio.bytes`, `journal_entries.photoData`) — no object storage; fetch-back routes are cookie-gated | Info | document |

Planned fixes (batch "uploads + bounds"): data-URL prefix + size cap +
`limit` clamp + list-without-blob on progress photos; audio/* mime allowlist
on segments; row caps on the three imports; `nosniff` via headers (dim 10).

### 5. Third-party keys and secrets at rest

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-035 | Strava access + refresh tokens are **plaintext** in `strava_tokens` (Google's are AES-GCM in the vault) | Medium | `SELECT` after a mocked callback; read code |
| SEC-036 | OpenAI org **admin** key is plaintext in `integration_secrets.value` | Medium | read code |
| SEC-037 | Env-held secrets (RENPHO password, ESV key, VAPID private, CRON_SECRET, HEALTH_INGEST_TOKEN, OPENAI_API_KEY, FINANCE_VAULT_MASTER_KEY, STRAVA/GOOGLE client secrets) — Vercel-encrypted; no rotation story written anywhere | Info | document rotation per secret |
| SEC-038 | **Three cron routes fail open when `CRON_SECRET` is unset** (`daily-refresh`, `finance-sync`, `spirit-reminder` use `process.env.CRON_SECRET && …`); the other four fail closed; all seven compare with `!==` (not constant-time) | High (if unset) / Low | run with `CRON_SECRET` empty → `GET /api/cron/finance-sync` runs |
| SEC-039 | GitHub Actions: `testflight.yml` push/schedule/dispatch only, `permissions: contents: read`, key written then removed; `ios-build.yml` on `pull_request` with no secrets; `testflight-status.yml` on `workflow_run` (base context) — expected pass. A second Gmail path (`/api/finance/inbox/fetch`) reads `GMAIL_REFRESH_TOKEN` from env, undocumented in `.env.example` | Info / Low | read workflows; grep env |
| SEC-042 | `lib/push.ts` hardcodes his email as the default `VAPID_SUBJECT` in a public repo | Low | read code |

Planned fixes (batch "logging + deps" or "auth"): a shared
`requireCronSecret()` (fail closed, constant-time) used by all seven crons
and the admin route; encrypt Strava tokens and the admin key with the
existing vault (read-plaintext fallback, rewrite on next refresh/save);
placeholder VAPID subject; `.env.example` gains the `GMAIL_*` block or the
route is retired (see Decisions).

### 6. Backups and exports

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-044 | Exports (`/api/health/export`, `/csv`, `/gpx`, `/api/spirit/export`) are cookie-gated and stream to the browser; nothing is stored server-side. **There is no backup story**: Supabase Free has no PITR and no restorable daily backups; a bad migration or a destructive MCP call is permanent | Info (gap, high impact) | `proxy` test; document |
| SEC-045 | `settings/import` → `/api/health/import` (cookie) — pass | Info | — |

Plan: write the gap down honestly in README with two concrete options
(Supabase Pro backups; a monthly `pg_dump` from the Mac with the direct URL)
and a recommended default. No code.

### 7. Logging

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-041 | 392 `console.*` calls in `app/` + `lib/`. Known PII lines: `/api/ai/transcribe` logs the first 60 chars of every transcript; `/api/strava/callback` logs the athlete's name; many `console.error("…", error)` log whole error objects (Prisma errors can carry row values). Vercel Hobby keeps runtime logs ~1 hour, which bounds exposure | Low | grep; trigger transcribe locally and read the log line |

Planned fixes: remove transcript/name logging; keep counts; a tiny
`logError(label, error)` that logs `error.message` only where the error may
carry data; the gate (final phase) flags new `console.*` of body/transcript/
token variables.

### 8. Dependencies and history

`npm audit` today: 43 advisories in the full tree (4 critical, 29 high,
7 moderate, 3 low); `--omit=dev`: 11 (1 critical, 8 high, 2 moderate).
`gitleaks` over all 322 commits: **2 hits, both false positives**
(`key:` / `sourceKey:` strings naming public-domain source documents in
`prisma/seed-spirit.mjs`). No real secret has ever been committed.

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-046 | `next` 16.3.x carries 9 advisories incl. RCE in the Image Optimization API (AVIF) and `next/og`; `next/image` is not used anywhere, `next/og` not used; still, fix is a patch upgrade | High (patch available) | `npm audit`; `npm ls next`; upgrade; build |
| SEC-047 | `prisma` 7.9.1 → chain (`deepmerge-ts`, `mysql2` unreachable on Postgres) | Medium | upgrade; build; migrations |
| SEC-048 | Transitive runtime: `sharp` (via next; no image optimization in use), `ws`, `source-map-js`, `uuid@13.0.0` (direct; advisory is v3/v5/v6 with `buf`; grep shows no `uuid` import in app code) | Low | triage each as reachable / not |
| SEC-049 | Dev-only: `vitest` (critical, dev), `eslint-config-next`/`shadcn` chain (`fast-glob`/`braces`), `@babel/core`, `esbuild`, `vite` — never in the production bundle | Info | `npm audit --omit=dev` excludes them |
| SEC-050 | Lockfile pinning: `npm ci` reproducible; `^` ranges are resolved by the lockfile | Info | `npm ci --dry-run` |
| SEC-051 | gitleaks history: pass; add `.gitleaks.toml` allowlisting the two seed strings so CI stays quiet and honest | Info (pass) | re-run with config → 0 |

Planned fixes (batch "logging + deps"): upgrade `next`, `prisma`,
`@prisma/*`, `uuid`; `npm audit --omit=dev` to zero high/critical;
documented threshold in CI (fail on high+ in production deps).

### 9. Rate limits and input bounds, every endpoint

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-052 | Only three routes rate-limit (`/api/auth`, `/update-pin`, `/mobile/auth/session`). Unauthenticated routes with no limiter: `/api/oauth/register` (stateless), `/api/oauth/token`, `/api/mobile/auth/refresh`, `/api/mcp` (one hash + lookup per 401), `/api/health/daily` (one HMAC) | Low | document; cheap 401 cost measured locally |
| SEC-053 | `limit`/`offset` query params unclamped: `progress-photos` (`parseInt` no cap, NaN → 500), `finance/transactions` | Low | `?limit=abc`, `?limit=1e9` |
| SEC-054 | Raw SQL: `$executeRawUnsafe` with `$n` params in `lib/activity-reports.ts` (safe), fixed DDL in the admin route, `Prisma.sql` tag in `lib/chat-conversations.ts` (safe) — no string-built SQL from input | Info (pass) | read code |
| SEC-055 | `q` search → Prisma `contains`/`insensitive` (parameterised); length unbounded → ILIKE over large tables | Low | 100 KB `q` |
| SEC-056 | Date parsing: `new Date(String(v))` everywhere, invalid → null; `days` numeric unbounded in `query_data` | Low | `days=1e12` |
| SEC-057 | JSON body size: Next route handlers impose no limit; Vercel caps at 4.5 MB; locally unbounded | Info | document; add caps where a route stores the body |

Planned fixes: a `clampInt(param, {min,max,default})` helper applied to
every `limit`/`offset`/`days`; body caps on routes that persist bodies.

### 10. Deployment surface

Verified read-only against production (a handful of requests, no
credentials): `/` → 307; `/api/health/summary` → 401; `POST /api/mcp` → 401
with the RFC 9728 `WWW-Authenticate` pointer; `/.well-known/
oauth-authorization-server` → public metadata; `/robots.txt` → 404;
`/sw.js` → 200. Response headers carry **only** `strict-transport-security`
(Vercel's). No CSP, no `X-Frame-Options`, no `X-Content-Type-Options`, no
`Referrer-Policy`, no `Permissions-Policy`. `next.config.ts` has no
`headers()`.

| id | hypothesis | prov. sev | repro |
|---|---|---|---|
| SEC-059 | Missing security headers (above) — clickjacking of the PIN screen, MIME sniffing of served blobs, referrer leakage of `/oauth/authorize?...code_challenge` URLs | Medium | `curl -I` prod and local; after fix, local shows them |
| SEC-060 | Vercel **preview deployments** run the same code; whether Preview env shares the production DB/PIN and whether previews are protected cannot be seen from here | Unverified | Michael checks Vercel → Settings → Deployment Protection, and the Preview env scope |
| SEC-061 | `DELETE /api/ai/chat/messages` wipes every chat message (cookie-gated, no UI caller; deferred item 2026-10-05) | Low | `curl -X DELETE` with cookie on a seeded local DB |
| SEC-062 | Public files: `manifest.json`, `sw.js` (caches only allowlisted read APIs; network-first), icons, MapLibre chunks — nothing sensitive; `NEXT_PUBLIC_BUILD` exposes the commit (public repo anyway) | Info (pass) | read |
| SEC-063 | The repository is **public** and `docs/state.md` carries body data (deferred item). Nothing in this lane rewrites history; recorded for his decision | Info | — |
| SEC-064 | Pages render without the cookie (client gate); confirm no server component fetches data pre-auth | Info | `curl /dashboard` without cookie; look for data in HTML |

Planned fixes (batch "headers + deployment"): `headers()` in
`next.config.ts` — `X-Content-Type-Options: nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(self), microphone=(self), geolocation=(self)`,
and `Content-Security-Policy: frame-ancestors 'none'` (the one CSP
directive that cannot break the app; a full CSP is a Decision). Remove the
chat wipe handler. README gets the preview-protection check.

---

## Phases and commits

| Phase | Deliverable | Commit |
|---|---|---|
| 1 | This plan + the audit skeleton | docs only |
| 2 | `audit-2026-10.md` filled with reproductions; `README.md` for Michael | docs only |
| 3a | Batch **auth/cookie**: SEC-001/002/003/004/006/009, cron fail-closed (SEC-038) | code + tests |
| 3b | Batch **MCP + OAuth**: SEC-010/011/013/014/015/017 | code + tests |
| 3c | Batch **intake**: SEC-020/024/025 (DB-backed limiter, caps) | code + tests (+ additive migration if Decision 2 stands) |
| 3d | Batch **uploads + bounds**: SEC-028/030/032/053/055 | code + tests |
| 3e | Batch **headers + deployment**: SEC-059/061 | code + tests |
| 3f | Batch **logging + deps + secrets at rest**: SEC-035/036/041/042/046/047 | code + tests |
| 4 | `scripts/security-gate.mjs` in `npm run build` + `.github/workflows/security.yml` (gate, `npm audit --omit=dev` threshold, gitleaks action), `.gitleaks.toml`, gate tests; `docs/state.md`; `docs/followups.md`; draft PR | code + docs |

Each code commit: `npx vitest run` green, `npx tsc --noEmit` clean,
`npx eslint <touched>` clean, `npm run build` green, smoke on :3101, and the
finding's status flipped to `fixed` in the audit doc in the same commit.

---

## Decisions (record-and-continue; Michael's word on Monday)

Revised 2026-10-18 after the independent review of this plan (items marked ⟲).

| # | Decision | Default taken | Why |
|---|---|---|---|
| D1 ⟲ | **Fail the PRODUCTION BUILD, not the request path.** `scripts/security-preflight.mjs` runs first in `npm run build` and exits non-zero when `VERCEL_ENV === "production"` and `AUTH_COOKIE_SECRET` or `APP_AUTH_SECRET` is missing or shorter than 32 characters. Runtime fail-closed (loud 503 on `/api/auth` naming the variable; `MissingSecretError` elsewhere) is the second line. | Yes (shipped 3a) | A failed Vercel build keeps the last good deployment live; a runtime 503 would take web, watch, iPhone and the connector down together while he is away. |
| D1a ⟲ | Legacy verification tries **every candidate** of the exact old chain `APP_AUTH_SECRET \|\| NEXTAUTH_SECRET \|\| APP_PIN \|\| constant` — not just its head, which changes the moment the new secret is set — for `tokenHash`, `refreshTokenHash`, `auth_credentials.pinHash` and DCR client ids, re-hashing on match, until 2027-01-17 (`LEGACY_SECRET_UNTIL`). | Yes (shipped 3a) | Nothing he owns must need re-pairing. Pinned with a leftover-`NEXTAUTH_SECRET` test. |
| D2 ⟲ | **DB-backed rate limiter** for the two PIN doors (additive table) — batch 3c. 3a added a GLOBAL per-scope cap and prefers `x-real-ip`; 3b made the cap/window env-configurable, let a clean client pass with the CORRECT PIN during a lock (the DoS lever the coordinator flagged), and wired the lock to a system alert. | Add in 3c | The per-instance memory is the real gap on serverless; the global cap already defeats header rotation on one instance. |
| D11 | **Only a production server with an explicit secret rewrites stored hashes** (re-key, PIN re-hash, re-seed); every other process verifies only. Each hash carries `keyVersion`, and Settings counts what still depends on `APP_PIN`. `APP_AUTH_SECRET_PREVIOUS` is the documented way to replace an existing secret; `APP_PIN_RESET` is single-use per value. (A `LEGACY_APP_SECRETS` variable was proposed by the review; rejected as a manual step he would have to do from a phone — the legacy keys stay read from `APP_PIN`, and the count tells him when it is safe to touch.) | Yes (review fixes) | The main checkout's `.env.local` points at production; a dev server must never be able to log his devices out. |
| D2b | **Narrow the lock exemption to known devices.** 3b exempts any client with no failures of its own (as asked), which gives each fresh IP one real PIN check during a lock. Replace with a signed long-lived `known-device` marker set at successful login (HMAC under the cookie secret): during a lock only marked browsers with no failures may try the correct PIN; new devices and pairing wait out the window. | Do in 3c, with D2 | Keeps Michael's own browser in during a flood AND makes rotation worthless again. Pairing is rare, so waiting is acceptable. |
| D3 ⟲ | **Finance over MCP.** Default-deny `finance_*` for connector tokens unless Settings → Claude connector → "Allow finance over MCP" is on. The denial is a clear tool error naming the switch — never an empty result. | Deny by default (shipped 3b) | The 08-29 proposal said no finance in Stage 1; it never happened. |
| D4 ⟲ | **Restrict `/api/mcp` to `deviceType === "mcp"`** AND restrict pairing to `iphone` / `apple_watch` (the only values the apps have ever sent) so nobody with the PIN can pair AS `mcp`. | Pairing allowlist shipped 3a; `/api/mcp` kind check shipped 3b (device routes refuse connector tokens too) | Without the pairing allowlist the MCP check is cosmetic. |
| D5 | **Full CSP** — ship only `frame-ancestors 'none'` now. | Partial | A wrong CSP blanks the iPad desk on a weekend nobody can test it. |
| D6 | **Strava tokens + admin key at rest** — encrypt with the existing vault. Depends on `FINANCE_VAULT_MASTER_KEY` being set in prod (**unverified**; `lib/finance/vault.ts` throws without it). | Yes, with plaintext-read fallback | Reuses a proven primitive. |
| D7 | `/api/finance/inbox/fetch` env-token Gmail path. | Leave; document `GMAIL_*`; followup to retire | Deleting a route is his call. |
| D8 | `DELETE /api/ai/chat/messages` | Remove the handler (3e). | No caller; wipes everything. |
| D9 ⟲ | **One PIN source.** `auth_credentials.pinHash` (scrypt) for web login AND pairing; `APP_PIN` is the bootstrap seed only when the row is missing; the `.env.local` writer in `update-pin` is deleted (not kept for dev). | Yes (shipped 3a) | Two paths by `NODE_ENV` would have kept the web≠devices divergence alive in exactly the environment that matters. |
| D9a | One-time transition and an explicit recovery: while the stored row is still in the pre-audit HMAC format, a login matching `APP_PIN` re-seeds it (web trusted `APP_PIN`, pairing trusted the row — they may disagree today); and `APP_PIN_RESET=1` re-seeds from `APP_PIN` after an `APP_AUTH_SECRET` rotation (which changes the scrypt pepper). Never otherwise. | Yes (shipped 3a) | Prevents a lockout on the day of the change and after any future rotation, without a standing second PIN. |
| D10 | **Backups** — document; recommend Supabase Pro. | Document | Money decision. |

## Out of lane (to `docs/followups.md` as they arise)

- Retiring `/api/finance/inbox/fetch` (D7) — finance owner.
- Scrubbing body data from the public `docs/state.md` or taking the repo
  private (SEC-063) — Michael.
- Full CSP with device testing (D5) — design/main lane.
- APNs key handling when the iOS lane adds push (`docs/push-notifications.md`).

## Non-goals

No restyling, no contract changes, no new product surface, no history
rewriting, no production writes of any kind.
