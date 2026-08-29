# Pitaya as an MCP server — users bring their own AI

> **STAGE 1 SHIPPED 2026-08-29** (his same-day "build the full MCP" call).
> Live at `POST /api/mcp` — stateless Streamable HTTP, bearer-token auth
> via a year-long revocable DeviceSession (minted at Settings → Claude
> connector), **20 tools**: `query_data` over the whole registry +
> recipes (save/rename/log/delete with fuzzy matching), food log/edit,
> workouts log/edit (packKg included), delete_entry, measurements, water,
> reminders, routines create/update, plan_training + get_training_week,
> name_trail, and `report_gap` — the gap-finder that files missing
> capabilities onto the todo list (🧩). Writes stamp `source: "mcp"`.
> Core is hand-rolled (lib/mcp/server.ts + tools.ts, unit-tested) — no
> SDK, no sessions, no Redis; swap in the SDK if
> sampling/resources/subscriptions are ever needed.
>
> **To connect (Michael):** Settings → Claude connector → Mint → then
> claude.ai → Settings → Connectors → Add custom connector → paste the
> URL, and the token under Advanced. The doc below remains the Stage 2
> (multi-user) blueprint.

*Original proposal, 2026-08-29. The idea: expose the app's data over the
Model Context Protocol so a Claude account (his, and eventually any
user's) can read and write Pitaya directly. The app stops paying for
inference; the user's own AI — which they already pay for and which knows
them — becomes the interface.*

## Why this is unusually cheap to build here

Two things most apps would have to build already exist:

1. **`lib/ai/data-registry.ts` — 48 declarative datasets** (health, body,
   spirit, finance, todos, journal…) with field allowlists, search,
   date-windowing, ref-resolution, and a 24k-char payload budget, executed
   by `lib/ai/data-access.ts`. This IS an MCP read-tool surface; it's
   what the in-app assistant already queries through `get_app_data`.
2. **13 validated write endpoints** behind the confirm-first proposal
   shape (food/batch, workouts, entry-PATCH, sequences, planner, trails,
   favorites, reminders…). Every write an MCP client should make already
   has a validated, PR-rebuilding, name-normalizing route.

An MCP endpoint is therefore mostly *adapter*, not new capability.

## Stage 1 — personal-first (his own Claude account)

**Shape**: one route, `app/api/mcp/route.ts`, speaking Streamable HTTP
(the current MCP transport: POST for JSON-RPC messages, optional SSE
stream for server-initiated messages). The repo already runs one SSE
route on this exact deploy (`/api/ai/chat/stream`), so the platform
question is settled. `@modelcontextprotocol/sdk` ships a fetch-style
server adapter that fits an App Router handler.

**Auth**: a dedicated bearer token, minted in Settings ("Connect Claude"
→ shows the token once), stored as a `DeviceSession` row with a new
`deviceType: "mcp"` — reusing the existing hashed-token machinery
(`lib/mobile-session.ts`) and the existing revocation UI (`/api/health/
devices`). The route joins `PUBLIC_API_PREFIXES` in `proxy.ts` and
verifies its own credential, same contract as `/api/mobile/*`.
claude.ai custom connectors support bearer-token remote servers today, so
Stage 1 needs NO OAuth.

**Tools** (small, deliberate surface):
- `query_data(dataset, days?, from?, to?, q?, limit?, id?)` — the
  registry, verbatim. One tool, 48 datasets, same allowlists.
- `log_food(items[])` → `/api/health/food/batch` (source: "mcp").
- `log_workout`, `edit_workout_entry` (incl. packKg), `log_measurement`,
  `log_water`, `set_reminder`, `plan_training`, `name_trail` — thin
  wrappers over the existing routes.
- `get_report(range)` — the weekly/summary composites.

**Confirm-first translation**: in-app, the human taps Confirm on a card.
Over MCP, the human IS in the loop already — they're talking to their own
Claude, and claude.ai asks permission before tool use. So writes execute
directly, but every write tool returns a human-readable receipt line and
the app's chat thread gets a system row ("logged via Claude connector")
so the trail stays visible in-app.

**What Michael gets immediately**: voice-log food and workouts from ANY
Claude surface (phone app, web, watch Siri-to-Claude), ask "how did my
Tres Cruces runs trend?" from claude.ai with zero Pitaya tokens spent,
and the AI doing the asking is one he already pays for.

**Effort estimate**: 2–3 sessions. Risks: token pasted into claude.ai is
a long-lived credential — scope it read-write-health only (no finance
datasets in Stage 1; the registry's per-dataset allowlist makes this a
one-line filter), and rate-limit the mint route (see hardening, below).

## Stage 2 — multi-user (the product story)

Everything above, tenanted. The honest inventory of what that takes:

1. **A user model.** Today there is NONE — auth is a single PIN, the
   subject is the literal string "personal-os", and every table is
   implicitly his. Multi-user means `User` + a `userId` column on ~40
   models + every query scoped. This is THE cost of the product story,
   MCP or not (a mechanical but wide migration; the Prisma singleton and
   the registry executor centralize enough that scoping has ~2 real
   choke points: `buildWhere` in data-access and the raw prisma calls in
   routes).
2. **OAuth 2.1 authorization server.** claude.ai connectors for
   third-party users expect OAuth with PKCE + dynamic client
   registration (RFC 7591) + authorization-server metadata (RFC 8414).
   Either build it (Next.js routes + a `OAuthClient`/`AuthCode`/`Token`
   table trio) or front the MCP route with an identity provider that
   speaks it (Auth0/WorkOS/Clerk all ship this now; Vercel's own docs
   cover MCP-with-OAuth deployments). Recommendation: DON'T hand-roll;
   use a provider for the AS role and keep resource-server token
   verification local.
3. **Per-user registry scoping**: `executeAppData` gains a `userId`
   argument threaded to every `where`; `EXCLUDED_MODELS`/allowlists
   already prevent cross-cutting leaks by construction.
4. **Rate limiting + quotas**: per-token buckets on the MCP route (the
   in-process Map pattern from `lib/auth.ts` is fine per-instance;
   Upstash/KV if it needs to be global), plus per-user daily write caps.
5. **Billing story**: the whole point — the app charges for the SERVICE
   (storage, sync, watch app), not inference. $0 marginal AI cost per
   user; his $3.92/3-weeks stays HIS, not multiplied by N.

**Effort estimate**: the user-model migration dominates (1–2 weeks of
careful sessions); the OAuth AS via a provider is ~2–3 sessions; the MCP
surface itself is Stage 1 reused.

## Hardening required before ANY external exposure

Found during this round's audit (do these in Stage 1):

- **`POST /api/mobile/auth/session` has NO rate limit** — it accepts PIN
  guesses at line speed today. Apply the same `checkRateLimit` the web
  auth route uses before any MCP work makes the deployment more
  interesting to strangers.
- Scope tokens by dataset group (health/spirit/finance) at mint time.
- Audit-log MCP writes (`externalSource: "mcp"` on rows + the chat-thread
  receipt) so anything surprising is traceable.

## Recommendation

Stage 1 is high-leverage and small: it proves the connector experience on
his own account, costs nothing in inference, and produces the exact tool
surface Stage 2 would ship. Do it as its own session when he says go.
Stage 2 waits until the product decision is real — the user-model
migration is the gate, and it shouldn't be paid for speculatively.
