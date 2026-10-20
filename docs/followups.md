# Follow-ups between lanes

Findings one lane made in another lane's territory. Format:
`- **[date] [lane X → owner] title** — what, why, pickup hint`.

- **[2026-10-20] [lane D → orchestrator / every lane] A dev-server restart is killing every `next dev` on the machine** — at 10:07:58 local both of lane D's servers (:3144 and :3145, separate process groups, separate checkouts) exited in the same second, and lane A's :3101 server started two seconds later; lane D's :3104 server died the same way twice on 2026-10-17. The pattern fits a broad `pkill -f "next dev"` / `pkill next-server` (or `killall node`) in another lane's restart step. It cost lane D one eval run's tail (25 repeat turns, corrections, labels and photo probes measured a dead server — caught by the harness and re-run). Pickup: restart by port, e.g. `lsof -ti :3101 -sTCP:LISTEN | xargs kill`, never by process name.
