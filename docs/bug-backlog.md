# Personal OS Bug Backlog

## Reported by Michael (2026-02-23)

1. Food logs use the wrong day after evening hours.
- Symptom: logging food after ~6 PM local time can appear on tomorrow's date.
- Status: fixed in code (timezone-aware day filtering now uses client offset).

2. Health AI/chat/photo controls overlap bottom nav on iPhone.
- Symptom: floating controls become partially hidden and unresponsive near the bottom menu.
- Status: fixed in code (safe-area-aware bottom offset for floating controls).

3. Full app bug + optimization audit.
- Status: in progress; initial findings captured below.

## Initial Audit Findings

1. Inconsistent local-day handling still exists in other modules.
- Risk: any endpoint or UI deriving date keys from `toISOString().split("T")[0]` may drift by timezone.
- Priority: high.
- Suggested follow-up: centralize local date helpers and replace UTC-derived date-only keys in non-health areas too.

2. Tooling/setup instability on this machine (`npm ci` fails due corrupted npm cache/tarballs).
- Risk: blocks reliable lint/test/CI validation from this environment.
- Priority: high.
- Suggested follow-up: clear npm cache and reinstall dependencies before deeper QA pass.

3. Text encoding mojibake appears in multiple UI strings.
- Risk: poor UX in production for punctuation/emoji in some environments.
- Priority: medium.
- Suggested follow-up: normalize file encoding to UTF-8 and replace corrupted glyph sequences.
