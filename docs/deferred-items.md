# Deferred items

Cross-session queue. Format:
`- **[YYYY-MM-DD] [source]** — what | why deferred | where to pick it up`
Newest at top. Annotate `[resolved by X, date]` instead of deleting.

- **[2026-08-09] [ai-5.6]** — chat route executes only tool_calls[0] | a mixed message ("logged food AND a workout") silently drops the second action; the 2b agent loop must execute ALL parallel tool calls and the response contract must carry multiple result types | app/api/ai/chat/route.ts
- **[2026-08-09] [ai-5.6]** — migrate chat to OpenAI Responses API in 2b | chat-completions can't combine tools with reasoning on 5.6; Responses API is also where agentic loop features live | Phase 2b rebuild
- **[2026-08-08] [phase1b]** — TypeScript 7 flip | typescript-eslint hard-blocks below 7.1 (their #10940); Next 16.3 PROVEN type-checking on TS 7.0.2 in 210ms — flip root `typescript` to ^7 the moment typescript-eslint ships support | package.json + run build/eslint/vitest
- **[2026-08-08] [phase1b]** — finance inbox lint errors | 5 `react-hooks/static-components` errors + 24 warnings repo-wide, all pre-existing; finance is frozen per health-first direction | `app/(tabs)/finances/inbox/page.tsx`, polish batch when finance thaws
- **[2026-08-08] [phase1b]** — branch unpushed: `mike-bsg-integrator` lacks write access to GlitchedZodiac/Personal-OS | prod deploys done via `vercel deploy --prod` from the committed tree meanwhile; once collaborator access lands: push branch, open PR, merge to main, and let git-driven deploys take over | `git push -u origin claude/phase1-modernization`
- **[2026-08-08] [phase1]** — Prisma 5→7 migration + real migration history | two-major jump touching the client engine; deserves its own careful session with DB backup first | task #4 [resolved by phase1b session, 2026-08-08: v7.9.1 + adapter-pg, 0_init baseline, drift healed +25 FKs]
- **[2026-08-08] [phase1]** — TypeScript 5→7 upgrade | isolate from the feature branch; verify build/vitest/eslint fallout separately | task #5 [resolved by phase1b session, 2026-08-08: landed 6.0.3; 7 blocked by typescript-eslint — see phase1b entry above]
- **[2026-08-08] [phase1]** — `app/api/health/workout-plan/trends/route.ts` `toISOString().split` sites | verified SAFE (scheduledDate is a date-only round-trip) — convert anyway when touching that file for consistency with `lib/timezone.ts` helpers | that file, lines ~93/103
- **[2026-08-08] [phase1]** — Strava callback route appears to skip OAuth `state` validation | pre-existing; Strava is slated for replacement by the watch app (Phase 3/4) | `app/api/strava/callback/route.ts`
- **[2026-08-08] [phase1]** — `NEXT_PUBLIC_SUPABASE_*` env vars now unused (dead client removed) | prune from Vercel + `.env.example` after confirming nothing else reads them; consider rotating the anon key since RLS now denies it anyway | Vercel dashboard → env
- **[2026-08-08] [phase1]** — demo mode (`demo/doctor-spanish` branch + `lib/demo-*` plumbing in main) | decide keep/kill; it noises up the health-first codebase; `gpt-4.1-mini` demo fallback is stale | `lib/demo-ai-budget.ts`, `lib/demo-client.ts`, demo branch
- **[2026-08-08] [phase1]** — transcribe route buffers audio to a temp file | works; could stream the File directly to the SDK — micro-cleanup when next touching the route | `app/api/ai/transcribe/route.ts`
- **[2026-08-08] [phase1]** — `reasoning_effort: "none"` hardcoded in `lib/openai-text.ts` | revisit per-model once CHAT_MODEL strategy settles (Claude/AI-Gateway decision) | `lib/openai-text.ts`
- **[2026-08-08] [phase1]** — PWA service worker (`public/sw.js`) not audited this pass | verify caching doesn't serve stale JS after the redesign ships | `public/sw.js`, `components/sw-register.tsx`
- **[2026-08-08] [phase1]** — water logging posts one request per glass in a loop | batch endpoint when touching water UX in Phase 2 | `components/voice-input.tsx` handleConfirm water case
