# Spirit build — kickoff prompt for the NEW chat

Paste everything below the line into a fresh Claude Code session in
`~/VibeCoding/Mikes Personal OS` **once the Claude Design output is
saved into `docs/design/`**. Until the design lands, that chat has
nothing to port — the PORT GATE forbids inventing the visuals.

---

Spirit section build — first block. This is the main lane (web +
backend), branch `claude/phase1-modernization`.

**Read before writing any code, in this order:**

1. `CLAUDE.md` — operating model, PORT GATE, parallel lanes, completion
   report format.
2. `docs/state.md` — top entries. The health phases are DONE and live in
   production; the iOS companion is running in the watch lane against
   contracts I already shipped (`/api/mobile/health/daily` with sleep/
   HRV/weight samples, `/api/mobile/push/register`).
3. **`docs/spirit-journal-plan.md`** — the plan of record. Read it whole.
   It carries Michael's brief in his own words, the AI-authority
   guardrails, the licensing decisions, the study system, and the
   round-5 audit fixes.
4. **`docs/spirit-design-prompt.md`** — what was asked of Claude Design,
   so you know the intended shape of every screen.
5. The Claude Design output in `docs/design/` — **the visual source of
   truth. THE PORT GATE APPLIES: this is a port, not an
   interpretation.** Icons and marks are extracted from the design's own
   SVG, never substituted from an icon library. Re-read each screen's
   slice of the design before building it and list its elements.

**The thesis, so you don't drift from it:** Spirit is not a Bible app
with reading plans. It is **a biblical-theological university in the
palm of the hand** — a curriculum that *decides what Michael studies
next*, the way a pastor's decision to preach Galatians for four months
is not the congregant's decision. The dividing line for every feature
question: *does this serve TODAY'S TEACHING, or is it a reference tool
he'd browse on his own?* Serves the teaching → build it in context.
Browsable reference → deep-link to Logos, never rebuild it.

**Non-negotiables (each one has a reason in the plan):**

- **Never show a "days behind" counter.** Guilt debt kills these apps.
  Coverage is celebrated; deficits are never counted.
- **The day's page is finished before he opens it** — pre-generated,
  cached, dated. A printed devotional that was waiting, not a chatbot
  watching him read. No AI-initiated anything.
- **Retrieval, never recall.** Every quotation renders with a tappable
  citation into a stored public-domain source. If it can't cite, it says
  so. A fabricated Calvin sentence is the worst failure this app can
  produce.
- **The AI never speaks for God about his life, never claims revelation,
  never assesses his spiritual state**, and hands grief/crisis to his
  pastor and elders.
- **Highlights describe the TEXT; notes describe HIS ENGAGEMENT.** Six
  highlight categories, fixed and prescribed (plan §8) — he explicitly
  asked NOT to design his own study system.
- **Suggested highlights are the keystone.** The app pre-marks the day's
  passage in an unaccepted outline style; he taps to accept or dismiss.
  This is what makes the study system survive a man with no study
  habits. Do not ship the study layer without it.
- **⚠️ ESV cache is an LRU with term passages pinned — NOT a permanent
  full-canon cache.** Crossway's license forbids assembling a
  substantially complete copy. Track 2 (Bible-in-a-year) reads a
  free-license text (BSB/Geneva) precisely so full-canon coverage never
  touches the ESV. This is a licensing constraint, not a preference.
- **Notes/highlights anchor to canonical book/chapter/verse integers**,
  not ESV HTML ids, so his layer survives a translation switch.
- **Export to Markdown from day one.** Lifelong archive; his data leaves
  whenever he wants.

**Already done for you:**

- `ESV_API_KEY` is in `.env.local` (gitignored) and documented in
  `.env.example`. **Michael must add it to Vercel himself.** Verified
  working: `/v3/passage/text/`, `/v3/passage/html/` (inline
  cross-references + footnotes + per-verse anchors `id="v19023001"` +
  poetry indentation + `class="woc"` red-letter), `/v3/passage/audio/`
  (mp3s), `/v3/passage/search/` (phrase search), and **multi-passage in
  one request** (`q=Rom 9:13;Eph 1:4;John 6:44`) — which makes a
  thematic thread a single API call.
- No rate-limit headers are exposed, so caching must be preemptive
  (within the LRU constraint above).
- The `spirit` and `journal` tabs exist as placeholder pages with the
  dragonfruit mark; the tab bar already points at them.

**Suggested first block** (confirm with Michael before starting — he may
want a different slice):

1. Data model + migration for the curriculum spine: `Term`,
   `DevotionalDay`, `ReadingPlan`, `ReadingLog`, plus the study layer
   (`Highlight`, `HighlightLegend`, `Note`, `VerseLink`, `StudyThread`).
2. `lib/esv.ts` — the API client with the LRU-cached passage store,
   canonical ref parsing, and HTML→render-model transform (verses,
   headings, poetry, crossrefs, footnotes, woc).
3. The Reader, ported from the design: verse selection, the six-category
   highlight system with suggested marks, typography controls.
4. Today's Spirit page against a seeded first term.

Then self-smoke it the usual way (drive the running app with a minted
auth cookie), update `docs/state.md`, and close with the completion
report and Michael's 3–7 item checklist.

**Deferred/adjacent, do not fold in without asking:** routine
progression intelligence (parked at his request), barcode + meal
bundles, the journal tab's full build, the second-wave items in plan
§10.
