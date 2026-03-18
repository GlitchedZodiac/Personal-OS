# Doctor Demo Setup (Isolated + Shareable)

This runbook creates a demo deployment that starts with your current data, but all demo edits stay isolated from your real app.

## 1) Create an isolated demo branch

```bash
git switch -c demo/doctor-spanish
```

Your main branch and production deployment remain untouched.

## 2) Create a separate demo database

Use a second Postgres instance/database (for example `personal_os_demo`).

Copy your production data once:

```bash
# Example (replace connection strings)
pg_dump --no-owner --no-privileges "$PROD_DATABASE_URL" | psql "$DEMO_DATABASE_URL"
```

After this, demo users can edit freely without affecting production.

If you prefer same database server with isolated schema, run:

```bash
npx prisma@5.22.0 db execute --url "$DIRECT_URL" --file scripts/clone-demo-schema.sql
```

Then use `schema=doctor_demo` in demo `DATABASE_URL` and `DIRECT_URL`.

## 3) Configure demo environment variables in Vercel

Set these variables on the demo deployment (Preview or a dedicated Project Environment):

```bash
DATABASE_URL=<demo db url>
DIRECT_URL=<demo db direct url>

APP_PIN=<doctor demo pin>

DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_DEMO_LANGUAGE=es

# AI budget + model for demo
DEMO_AI_SPEND_LIMIT_USD=0.10
DEMO_OPENAI_MODEL=gpt-4.1-mini
DEMO_AI_MAX_COMPLETION_TOKENS=1200
DEMO_AI_INPUT_COST_PER_1M_TOKENS=0.40
DEMO_AI_OUTPUT_COST_PER_1M_TOKENS=1.60
DEMO_AI_TRANSCRIPTION_COST_USD=0.002
```

Recommended: use a separate OpenAI key for demo.

## 4) Deploy and get a shareable link

Option A: Branch preview (auto link per push)
```bash
git push origin demo/doctor-spanish
```

Option B: Deploy manually
```bash
vercel --target preview
```

Share the preview URL with your doctor.

## 5) Verify before sending

1. Open `/api/ai/demo-budget` and confirm `demoMode: true`.
2. Confirm banner appears in app saying demo edits are isolated.
3. Confirm walkthrough opens on first load in Spanish.
4. Confirm AI replies in Spanish (default demo behavior).

## 6) Optional reset between presentations

Re-copy production snapshot into demo DB before each new demo if you want a clean starting point.
