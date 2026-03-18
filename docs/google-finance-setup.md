# Google Finance Gmail Setup

This app already includes the finance Gmail integration code path:

- `GET /api/finance/google/auth`
- `GET /api/finance/google/callback`
- `GET /api/finance/google/status`
- `POST /api/finance/google/sync`
- `GET /api/cron/finance-sync`

The remaining setup is mostly production configuration.

## 1. Create the Google OAuth app

In Google Cloud:

1. Open the target Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID for a `Web application`.
5. Add these redirect URIs:
   - `https://personal-os-plum.vercel.app/api/finance/google/callback`
   - `http://localhost:3000/api/finance/google/callback`

If you later move production to a custom domain, add that callback too.

## 2. Add production environment variables

The finance Gmail integration requires these env vars:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FINANCE_VAULT_MASTER_KEY`

Optional but recommended:

- `CRON_SECRET`

`FINANCE_VAULT_MASTER_KEY` should be a random 32-byte secret. Example PowerShell generation:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Recommended Vercel targets:

- `production`
- `preview`
- `development`

## 3. Redeploy after adding env vars

The Gmail connect button stays disabled until both of these are true on the server:

- Google OAuth is configured
- Finance vault encryption is configured

After updating env vars, redeploy so the server picks them up.

## 4. Connect Gmail in the app

1. Open `/settings`
2. Find `Gmail Expense Sync`
3. Click `Connect Gmail`
4. Approve the Gmail read-only scope
5. Return to `/settings`
6. Use `Sync Now` for the first import

The app stores the Gmail token in the encrypted finance vault and only requests:

- `https://www.googleapis.com/auth/gmail.readonly`

## 5. Scheduling note

The app is designed for a 15-minute sync cadence, but Vercel Hobby cron jobs currently only support daily execution windows. That means:

- Manual sync works now
- Daily Vercel cron is possible
- 15-minute background sync needs either:
  - a Vercel plan that supports minute-level cron
  - an external scheduler that calls `GET /api/cron/finance-sync`

If you use an external scheduler, send:

- `Authorization: Bearer <CRON_SECRET>`

## 6. Security changes already in place

The Gmail setup now includes:

- app-session auth checks on finance Google endpoints
- OAuth `state` validation on connect/callback
- encrypted token storage in the finance vault
- optional cron bearer protection with `CRON_SECRET`
