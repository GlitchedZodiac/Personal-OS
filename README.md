# Personal OS

A single-user "life dashboard" PWA: health tracking (food, water, workouts, body,
recovery, AI coach), deep personal finance (Gmail statement ingestion, budgets,
pockets, obligations, USD/COP), todos + reminders, and cross-module trends —
behind a PIN gate, deployed on Vercel.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + Tailwind 4 + shadcn/ui
- **Prisma** → Supabase Postgres (43 models)
- **OpenAI** for chat/coach/vision (meal photos) and Whisper dictation
- **Integrations**: Strava OAuth (activity sync), Google OAuth (read-only Gmail
  finance scanning)
- **Vercel crons**: daily refresh, finance Gmail sync, weekly report
- **PWA**: installable, service worker in `public/sw.js`
- Native Apple companion scaffold in `ios/` (Swift, pre-Xcode-project — see
  `ios/README.md`)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in — see comments in the file
npm run dev
```

Environment variables are documented in [.env.example](.env.example). Production
values live in the Vercel project (`personal-os`); pull with
`vercel env pull .env.local --environment=production`. The two database URLs are
Sensitive in Vercel (write-only) — fetch them from the Supabase dashboard.

## Commands

```bash
npm run dev        # dev server (Turbopack)
npm run build      # prisma generate + production build
npm run test       # vitest unit tests
npm run test:e2e   # Playwright smoke tests
npm run lint       # eslint
```

## Layout

- `app/(tabs)/` — pages: dashboard, health/*, finances/*, todos, trends, settings
- `app/api/` — route handlers: ai/*, health/*, finance/*, todos, reminders,
  strava/*, mobile/* (iOS companion contracts), cron/*
- `lib/` — domain logic (finance pipeline in `lib/finance/`, AI prompts, auth,
  timezone helpers)
- `prisma/` — schema + `manual-migrations/` (SQL applied by hand; no migration
  history yet)
- `docs/` — bug backlog, Google/finance setup notes
