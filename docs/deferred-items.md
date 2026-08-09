# Deferred items

Cross-session queue. Format:
`- **[YYYY-MM-DD] [source]** — what | why deferred | where to pick it up`
Newest at top. Annotate `[resolved by X, date]` instead of deleting.

- **[2026-08-08] [phase1]** — Prisma 5→7 migration + real migration history | two-major jump touching the client engine; deserves its own careful session with DB backup first | task #4; baseline from `prisma/manual-migrations/` + live schema
- **[2026-08-08] [phase1]** — TypeScript 5→7 upgrade | isolate from the feature branch; verify build/vitest/eslint fallout separately | task #5
- **[2026-08-08] [phase1]** — `app/api/health/workout-plan/trends/route.ts` `toISOString().split` sites | verified SAFE (scheduledDate is a date-only round-trip) — convert anyway when touching that file for consistency with `lib/timezone.ts` helpers | that file, lines ~93/103
- **[2026-08-08] [phase1]** — Strava callback route appears to skip OAuth `state` validation | pre-existing; Strava is slated for replacement by the watch app (Phase 3/4) | `app/api/strava/callback/route.ts`
- **[2026-08-08] [phase1]** — `NEXT_PUBLIC_SUPABASE_*` env vars now unused (dead client removed) | prune from Vercel + `.env.example` after confirming nothing else reads them; consider rotating the anon key since RLS now denies it anyway | Vercel dashboard → env
- **[2026-08-08] [phase1]** — demo mode (`demo/doctor-spanish` branch + `lib/demo-*` plumbing in main) | decide keep/kill; it noises up the health-first codebase; `gpt-4.1-mini` demo fallback is stale | `lib/demo-ai-budget.ts`, `lib/demo-client.ts`, demo branch
- **[2026-08-08] [phase1]** — transcribe route buffers audio to a temp file | works; could stream the File directly to the SDK — micro-cleanup when next touching the route | `app/api/ai/transcribe/route.ts`
- **[2026-08-08] [phase1]** — `reasoning_effort: "none"` hardcoded in `lib/openai-text.ts` | revisit per-model once CHAT_MODEL strategy settles (Claude/AI-Gateway decision) | `lib/openai-text.ts`
- **[2026-08-08] [phase1]** — PWA service worker (`public/sw.js`) not audited this pass | verify caching doesn't serve stale JS after the redesign ships | `public/sw.js`, `components/sw-register.tsx`
- **[2026-08-08] [phase1]** — water logging posts one request per glass in a loop | batch endpoint when touching water UX in Phase 2 | `components/voice-input.tsx` handleConfirm water case
