# Followups

Out-of-lane findings from the parallel lanes (2026-10-17 onward). One line
each: what, why it matters, where to start. Never a drive-by fix — the owner
lane picks it up.

- **[2026-10-17] [lane B → main] The Sunday Report's morning cron publishes a partial week** — `vercel.json` lists `/api/cron/weekly-report` twice: `0 14 * * 0` (Sun 09:00 Bogotá) and `0 4 * * 1` (Sun 23:00). `generateWeeklyReport(todayStr)` on Sunday morning computes the CURRENT Mon–Sun week with Sunday missing, upserts it, and `notify()` sends "Weekly report ready" with that partial headline (`dedupeKey: weekly-report:<weekStart>`). The 23:00 run rewrites the report but its push is a `duplicate`, so the notification he receives always carries the morning's partial verdict, and two sol calls are spent per week. Pickup: drop the Sunday-morning entry, or make the morning run skip when the week is not over (`app/api/cron/weekly-report/route.ts`, `vercel.json`).
- **[2026-10-17] [lane B → C] De-emphasise the water tracker in the IA** — `water_logs` has 0 rows after two months with a full screen (`/health/water`, lucide/shadcn, pre-Pitaya styling), a dock path, a chat tool and an MCP tool. The Coach (lane B) reports hydration only when rows exist. Decision D10 in `docs/coach-plan.md` keeps the intake; the screen itself wants either a Pitaya restyle or demotion to a row under Food. Pickup: `app/(tabs)/health/water/page.tsx`, `components/water-tracker.tsx`.
