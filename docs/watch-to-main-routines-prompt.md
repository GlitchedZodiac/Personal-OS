# Watch → Main: Routines MVP prompt (2026-08-10)

(Michael: paste everything below the line into the MAIN lane chat at
`~/VibeCoding/Mikes Personal OS`.)

---

Routines directive from Michael, relayed by the watch lane — this is the
next block of the Train stage. Read first: `docs/state.md` entries
2026-08-09h and 2026-08-10a, then the top `[watch → main] ROUTINES MVP
SPEC` entry in `docs/deferred-items.md` (it is the canonical spec; this
prompt is the summary), and `docs/watch-contract.md` § sequences.

Michael's framing, verbatim spirit: **"We shouldn't do workouts. We should
be focused on routines."** He describes his training as routines/flows
built from a video or his own head, told to the AI in plain language. The
watch side is ALREADY BUILT and waiting: circuit runner (tap-per-step with
per-step timing), EMOM runner, pre-start weight editor in 4 kg bell
denominations, Kettlebell → Routines/Free-sets IA. Your pieces:

1. **Sequence model + API (additive only)**: add `rounds: Int?` to
   Sequence and include it in `GET /api/mobile/sequences` (the watch
   already decodes it nil-safe; circuits fall back to 3 rounds until it
   ships). Steps keep `{exercise, exerciseName, reps?, seconds?, weightKg?,
   restSeconds?}` + top-level `restSecondsDefault`. Do NOT rename existing
   fields — the watch decodes the current shape in production.

2. **AI routine builder (chat tool)**: "I want 20 swings, 20 snatches, 20
   goblet squats, repeat 3 times, 60-second rests" → creates/edits a
   Sequence (kind circuit here; also straight/emom/tabata). Must support
   prescribed per-step weights ("swings at 20 kg"), configurable rest
   between exercises and between rounds, and ANY catalog category —
   dumbbell/barbell routines too (curls → rows → bench), not just
   kettlebell. Keep the confirm-card UX before anything persists.

3. **User-created exercises**: AI can mint new movements mid-chat,
   including compound flows ("one-arm clean squat thruster") and variants
   (two-hand vs one-hand cleans) — a `user_exercises` table (slug, name,
   category, aliases) merged into `lib/exercises.ts` normalization
   everywhere names resolve (voice, PRs, routines), plus a bearer
   `GET /api/mobile/exercises` (customs + updatedAt is enough) so the
   watch keeps its picker/normalizer in sync. This kills hard-coding new
   exercises forever.

4. **Post-hoc single-line edit (2b editing family)**: "the windmills I
   just did were 8 kg, not 20" → edits that one entry of the just-synced
   workout via chat, with the confirm card. Optionally offer "update the
   routine's prescribed weight too?". Michael explicitly wants corrections
   AFTER the workout, never interrupting it on the wrist.

5. **Render watch run metadata**: watch circuit/EMOM runs sync
   `metricsData: {sequenceId, sequenceName, roundsCompleted,
   stepSeconds[]}` — surface routine name, rounds, and per-step working
   time in Train history.

Out of scope per Michael: video-exact pacing scripts (the AI conversation
covers converting a watched video into a routine).

Announce in `docs/state.md` when (a) `rounds` is live in the mobile
sequences payload and (b) `/api/mobile/exercises` exists — the watch lane
adopts both the session after. Never edit `ios/**`; asks back to the watch
go through deferred-items as usual.
