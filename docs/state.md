# State

Single source of truth for "what's done and what's in flight." Newest entry
first. Update the top of this file whenever a session ships.

---

**Last updated:** 2026-08-08
**Current phase:** Phase 1 (solidify + modernize) — mostly complete; Prisma 7
and TS 7 upgrades remain. Phase 2 (health redesign + real chat) unblocked:
design brief ready at `docs/design/claude-design-brief.md`.
**Branch in flight:** `claude/phase1-modernization` (pushed; preview only —
NOT merged to main/prod yet).

## 2026-08-08 — Phase 1 modernization session (Claude, hands-off evening run)

Context: app untouched ~5 months; Michael set the new direction (health-first
lifelong app, voice/AI first, then Claude-design redesign, then watch app).

Shipped:

- **Access restored**: repo cloned to `~/VibeCoding/Mikes Personal OS`, Vercel
  CLI linked (`personal-os`), prod env pulled, DB connection rebuilt
  (Supabase pooler `aws-1-us-east-1`, password in `.env.local` only). App
  boots locally against production data (419 food logs, 100 workouts).
- **Security**: RLS enabled on all 43 public tables (anon key now reads 0 rows;
  Prisma unaffected — verified both sides). Dead `lib/supabase.ts` +
  `@supabase/supabase-js` removed. **`proxy.ts` added — the previously wide-open
  `/api/*` surface (confirmed 200 unauthenticated on prod) now requires the
  signed auth cookie** except auth/cron/mobile/OAuth-callback routes.
- **Deps**: Next 16.1.6→16.3.0, React 19.2.3→19.2.8, lucide/sonner/tw-merge
  bumped. Prisma 5→7 and TS 5→7 deliberately deferred (tasks #4/#5).
- **AI layer modernized** (the "voice + AI first" directive):
  - Deprecated `functions` API → modern `tools` API (`lib/ai-prompts.ts`
    exports `HEALTH_TOOLS`).
  - `/api/ai/chat` now accepts `history` — **real back-and-forth works**
    (self-smoke: "actually it was three eggs" returned the delta, live).
  - `voice-input.tsx` keeps a rolling 12-message history.
  - Transcription `whisper-1` → **`gpt-transcribe`** with a domain-vocabulary
    prompt (kettlebell/macros/Colombian food); whisper-1 fallback. Self-smoke:
    synthesized kettlebell audio transcribed flawlessly.
  - Meal photo analysis → strict `json_schema` structured outputs.
  - All model ids centralized in `lib/openai.ts` (`CHAT_MODEL` = gpt-5.5,
    override via `OPENAI_MODEL`).
- **Bug fixes** (from `docs/bug-backlog.md`): UTC date-key drift in
  trends/daily-log `isToday` and workout-plan chat history grouping; mojibake
  🔁 in todos; repo-wide mojibake scan clean.
- **Docs**: CLAUDE.md (operating model, adapted from TPL), this file,
  `deferred-items.md`, `MODERNIZATION-PLAN.md`, `design/claude-design-brief.md`,
  `.env.example`, rewritten README.

Verification: `npm run build` green (type-checked), vitest 13/13, middleware
401/200 both directions, live two-turn chat + workout logging + transcription
against the dev server with a locally minted cookie.
