# CLAUDE.md

Operating model for Claude sessions on Personal OS. Read this first, every
session, before writing code. Adapted from the Process Lounge operating model
(`~/VibeCoding/TheProcessLounge/CLAUDE.md`) for a solo, single-user app —
lighter ceremony, same principles.

## Context

Personal OS is Michael's single-user life dashboard — a Next.js PWA behind a
PIN, deployed on Vercel (`personal-os` project, prod:
https://personal-os-plum.vercel.app), data in Supabase Postgres via Prisma.

**Current direction (2026-08): the app is being refocused as a lifelong
HEALTH app** — workouts (kettlebell especially) and calorie/macro tracking,
with pinpoint voice + photo logging and a real conversational AI. Finance and
todo modules stay functional but get no investment. See
[`docs/MODERNIZATION-PLAN.md`](docs/MODERNIZATION-PLAN.md) for the phased
plan, and [`docs/design/claude-design-brief.md`](docs/design/claude-design-brief.md)
for the visual redesign direction.

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 + shadcn ·
Prisma → Supabase Postgres (43 models) · OpenAI (models centralized in
`lib/openai.ts`) · Strava + Gmail integrations · Vercel crons · PWA service
worker · Swift scaffold in `ios/` for the future watch app.

## Before any work

1. Read [`docs/state.md`](docs/state.md) — what shipped last, what's in flight.
2. Read [`docs/deferred-items.md`](docs/deferred-items.md) — known follow-ups;
   check before filing a "we should fix X later" note (the slot may exist).
3. For AI-layer work: models and API patterns live in `lib/openai.ts` (single
   registry — never hardcode a model id in a route).
4. For anything user-facing: the design direction in
   `docs/design/claude-design-brief.md` is the standard once Phase 2 lands.

## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # prisma generate + next build — MUST pass before commit
npm run test       # vitest
npm run test:e2e   # playwright
```

Env: `.env.local` (gitignored) holds real secrets. `vercel env pull` restores
most; `DATABASE_URL`/`DIRECT_URL` are Sensitive in Vercel (write-only) — they
come from Supabase (session pooler :5432 for DIRECT_URL, transaction pooler
:6543 + `pgbouncer=true` for DATABASE_URL). `.env.example` documents the
contract.

## Rules of engagement

**Halt on discovery.** When a finding invalidates the task's premise — the
file/route doesn't exist, the design doc disagrees with the code, a fix needs
a schema change that wasn't cleared — halt and surface it in chat. Don't
improvise a workaround. A halt costs nothing; a workaround creates a hidden
debt site.

**Discovery-first investigation.** Before claiming a fix: reproduce, trace the
real code path end-to-end (UI → handler → lib → DB), form a hypothesis,
confirm it, fix at the root layer. Never fix from the symptom or the doc alone.

**Self-smoke before "done."** Build green + tests green is the floor, not the
finish. Drive the running app (or curl the API with a locally minted auth
cookie — see `lib/auth.ts` token shape) and verify the change actually works.
Report "self-smoke caught/fixed: X" when it catches something.

**Prove data-flow claims.** "The field flows to the UI" is proven by asserting
the API response contains it — not by the existence of wiring code.

**Use existing patterns.** Grep before inventing: shadcn primitives in
`components/ui/`, timezone helpers in `lib/timezone.ts` (never
`toISOString().split("T")[0]` for a local day), Prisma singleton in
`lib/prisma.ts`, the confirmation-dock UX in `components/voice-input.tsx`
(AI proposes → user confirms → then it persists — keep this shape).

**Auth is server-side.** `proxy.ts` gates all `/api/*` behind the signed
cookie except self-authenticating routes (auth, cron w/ CRON_SECRET, mobile
bearer tokens, OAuth callbacks). A new API route is protected by default; a
new self-authenticating route must verify its own credential AND be added to
the allowlist knowingly.

**Every upgrade ships its check.** A change to user-visible behavior ends with
a 3–7 item plain-language checklist for Michael ("open X → do Y → see Z") —
his review is judgment (does it feel right), not bug-hunting; the bug-hunting
already happened in self-smoke.

**Scope discipline.** Small related cleanup (<30 min, same files, no new blast
radius) may fold into the current work. Anything bigger goes to
`docs/deferred-items.md` with a pickup hint. Don't mass-restyle surfaces
mid-task.

## Design parity (THE PORT GATE)

**Codified 2026-08-09 after the Pitaya Stage A miss** (generic lucide icons
and an invented diamond logo shipped where the design had its own icons and
a dragonfruit mark). When a Claude-design source exists in `docs/design/`,
implementation is a **port, not an interpretation**:

1. **Assets come from the design file verbatim.** Icons, logos, and marks are
   extracted from the design's own SVG — never substituted from an icon
   library, never re-drawn from memory. `components/pitaya-icons.tsx` is the
   only icon source for designed surfaces; add to it by extraction.
2. **Before building any screen, re-read its slice of the design file** and
   list the elements it contains. Build to that list.
3. **"Close enough" is a defect.** If the design and the implementation
   disagree, either fix the implementation or surface the deviation to
   Michael explicitly — never ship it silently.
4. **Old-identity remnants are bugs.** Teal/amber/graphite styling, lucide
   icons on designed surfaces, or stripped-feature UI resurfacing all count.
5. Screens not yet rebuilt to the design are listed in `docs/state.md` as
   pending stages — that's the only sanctioned gap between design and app.

## Watch legibility floor (codified 2026-08-29 — his "tiny menus" call)

Round 3's raw px/2 type silently dropped the app's wrist legibility factor
and shipped 4.5–7 pt labels; the rest-screen Skip was a bare ≈24×14 pt hit
region. The standard, enforced in `ios/Shared/Theme.swift`:

1. **Type**: design-canvas px/2 is verbatim for GEOMETRY (`Theme.r3()`);
   TYPE goes through the legibility curve (`Theme.r3TypeSize`: <12 pt
   boosts ×1.40625, ceiling 12, floor 7). This is a documented standard,
   not a silent PORT-GATE deviation — new design rounds inherit it unless
   Michael says otherwise for a specific screen.
2. **Tap targets**: every tappable control presents ≥38 pt of hit area
   (`Theme.minTap`). Any `.buttonStyle(.plain)` control is either a
   PitayaCTA/tile or wears `.pitayaTappable()` INSIDE the Button label
   (modifiers outside the label don't grow the target). Inline header
   chips/segments may use the documented 32 pt exception.
3. **Never** `.minimumScaleFactor` below 0.8 on meaning-bearing text, and
   padding that sizes a control lives inside the label, not outside.

New watch UI that violates the floor is a defect, same class as PORT-GATE
misses.

## Parallel lanes

Two Claude sessions may run against this repo at once:

- **Main lane** (web + backend): owns `app/**`, `lib/**`, `prisma/**`,
  `components/**`, `proxy.ts`, deploys, and the `/api/mobile/*` contracts.
  Directory: `~/VibeCoding/Mikes Personal OS` (branch
  `claude/phase1-modernization`).
- **Watch lane** (native Apple): owns `ios/**`, the Xcode workspace, and
  `docs/watch-*.md`. Directory: `~/VibeCoding/personal-os-watch` — a git
  worktree on branch `claude/watch-app`. Kickoff prompt:
  `docs/watch-kickoff-prompt.md`; ownership contracts:
  `docs/watch-contract.md`.

**NEVER switch branches in the other lane's directory** — the 2026-08-09
shared-checkout collision (a lane's `checkout -b` yanked the branch out from
under the other mid-commit) is why each lane has its own worktree.

Cross-lane work is never edited directly — file a `docs/deferred-items.md`
entry (tagged `[watch]` or `[main]`) and surface it to Michael. **Exception
(his 2026-08-22 call, Q23): the Spirit-on-iPad project may be built by one
session across `app/**`, `lib/**` AND `ios/**`** — provided `ios/` is at parity
with `claude/watch-app` first (`git log HEAD..claude/watch-app -- ios/` empty)
and state.md says so before `ios/**` is touched. Both lanes
read `docs/state.md` at session start and write entries when they ship.
`/api/mobile/*` payload shapes are the inter-lane contract: the main lane
implements changes, the watch lane requests them.

## Commits, branches

- Branch `claude/<short-slug>` off `main`. Push branches freely (Vercel only
  builds previews); **merging/deploying to prod main waits for Michael's go.**
- Commit messages: imperative subject ≤70 chars; body explains the *why*; end
  with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never amend,
  never `--no-verify`.

## Completion report

End every session with:

```
## Session report
- Scope: <what this session set out to do>
- Shipped: <bullets>
- Build/tests: <pass|fail, N/N>
- Self-smoke: <what was driven and what it proved>
- Deferred: <items added to deferred-items.md>
- Michael's checklist: <3–7 plain-language confirmations>
- Next: <recommended next step>
```

Update `docs/state.md` (top entry) in the same session.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
