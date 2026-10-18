# Follow-ups filed by the 2026-10 lanes

Format: `- **[date] [lane → owner] title** — what, why, pickup hint`

- **[2026-10-18] [lane A → finance owner] Retire or document the env-token Gmail path (`/api/finance/inbox/fetch`)** — a second Gmail integration reads `GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/USER_EMAIL` from env, beside the vault-backed `lib/finance/google.ts` flow; `.env.example` never listed them (audit SEC-039, PLAN D7). Decide whether the route still has a caller; if not, delete it; if so, add the four vars to `.env.example` and route the refresh token through `lib/finance/vault.ts` | pickup: `grep -rn "inbox/fetch" app components`.
- **[2026-10-18] [lane A → main] Full Content-Security-Policy with device testing** — lane A ships only `frame-ancestors 'none'` (PLAN D5). A real policy needs nonces for Next's inline scripts, `blob:` workers and tile hosts for MapLibre, and must be checked on the iPad desk and the TestFlight shell before it can ship | pickup: `next.config.ts headers()`, start in report-only.
