# Spirit + Journal — planning doc

**Status:** plan of record, pre-design. Written 2026-08-12; revised twice
the same day after Michael's review rounds. Nothing built; the two tab
slots hold placeholders (`app/(tabs)/spirit`, `app/(tabs)/journal`).
Design goes to Claude Design (his Fable credits reset tomorrow).

---

## 0. THE THESIS — curriculum, not library

Michael, in his own words, round 3:

> "What I always try to do is to build an app that's tailored to how I
> think. Historical focus, theological narrative, and a deep
> understanding of the culture at the time that it was written is how I
> interpret scripture… I like things fed to me… the key part however is
> that **it is decided for me**, the same way the pastor's decision to
> exposit Galatians for 3–4 months is not my decision but the pastor's."

**That is the product.** Not a Bible app with AI bolted on — an app that
acts as his *teacher and curriculum-setter*, reading Scripture through a
historical/cultural/theological-narrative lens, deciding what he studies
next so he never has to summon the will to choose.

Nothing else on the market does this. Logos is a library — infinite
depth, zero direction. YouVersion has generic plans. The Crossway app is
a text. **Pitaya Spirit is a syllabus with a pastor's voice.**

### The dividing line (use this to answer every feature question)

> **Does this feature serve TODAY'S TEACHING, or is it a reference tool
> he'd browse on his own?**
>
> - Serves the teaching → **build it**, and surface it *in context*.
> - Reference he'd browse → **link to Logos**. Don't rebuild it.

A map of Philippi appears because today's study is Acts 16 — not because
he opened an atlas. That single rule keeps this app small, opinionated,
and un-clonable, and it is why he is **not** rebuilding Logos.

**Corollary he should hold onto:** Logos wins on depth forever. Pitaya
wins on *direction, continuity, and his own accumulated layer*. Those are
different products, and his is the one that doesn't exist yet.

## 1. The term mechanic — "decided for me"

Modeled on a preaching calendar, not a reading app.

- **Terms, announced.** "This term: The Exile — 8 weeks." He doesn't pick
  it; the app does. The syllabus is **visible but not editable** (a pastor
  announces the series; anticipation without the burden of choice).
- **One thing per day.** Today's page holds today's teaching and today's
  reading. No menu, no backlog, no infinite library on the home screen.
- **The rotation guarantees balance** over years: OT narrative → epistle
  → doctrine → gospel → prophets → wisdom → church history. This is his
  "progressive education" — cumulative, not random.
- **Sequenced curriculum, garnished serendipity.** Randomized *topics*
  can't build on each other, so the curriculum stays sequenced; the
  curiosity hit he wants comes from a **"one more thing" card** closing
  each day — an artifact, a word origin, a church-history vignette.
  Things fall into view without fragmenting the education.

### Two escape hatches that don't break the frame

A real pastor also responds to the moment, so:

1. **"My church is preaching Galatians"** → the app aligns the term to
   his church. The app is his teacher, not his rival.
2. **"I need something on suffering right now"** → a short interruption
   series, then back to the term.

### ⚠️ The no-guilt rule (this decides whether he's still using it in 2030)

**Never show a "you're behind by N days" number.** The #1 killer of
Bible-in-a-year plans is guilt debt. A pastor does not make you catch up
on three sermons. If he misses days, the term **shifts** or the app hands
him **one paragraph of what he missed** and moves on. Coverage is
celebrated; deficits are never counted.

## 2. AI etiquette — helpful, never intrusive

His opening question this round. The answer is mostly about *timing and
posture*, not capability:

1. **The day's page is finished before he opens it.** Generated on a
   schedule he controls, cached permanently, dated. It should feel like
   a printed devotional that was written and waiting — **not a chatbot
   watching him read.**
2. **AI never initiates.** No notifications carrying AI content (matches
   his standing rejection of proactive AI check-ins).
3. **AI never assesses his spiritual state.** No "you seem to be
   struggling with consistency." It teaches; it does not evaluate him.
4. **Retrieval, never recall.** Every quotation comes from a stored
   public-domain source and renders with a tappable citation. If it
   can't cite, it says so rather than producing a quote. Fabricated
   patristic quotes are the worst possible failure here.
5. **Two voices, always distinguishable:** cited source material vs. the
   app's own teaching voice — and the teaching voice never claims
   authority Scripture doesn't give it.
6. **Ask is opt-in and lives on the passage.** He taps it; it never taps
   him.
7. **Hard lines:** never speak for God about his life; never claim
   revelation; on grief/crisis, name that this belongs with his pastor
   and elders, and stop.
8. **Confessional posture, honest opposition.** Per-topic setting —
   *Teach from my tradition · Compare traditions · Just the text.* Not
   mush neutrality: steelman Westminster **and** the 1689, name the real
   division.

## 3. Feature sort — his round-3 list against the dividing line

| His ask | Verdict |
|---|---|
| Voice notes + transcription on a passage | **Build** — pipeline already exists; near-free |
| Tap a verse → selects the verse | **Build** — core reader |
| Semantic highlighting (color = meaning) | **Build** — the queryable index; the differentiator |
| Strong's / original-language word study | **Build** — public domain, serves doctrine directly |
| Cross-references (TSK, ~500k) | **Build** — public domain |
| Verse links with a stated reason | **Build** — his own cross-reference web |
| **Linked bilingual scroll (ESV ⇄ NBLA)** | **Build — sleeper hit.** He's bilingual; two panes locked to the same verse is rare, cheap, and *tailored to him* |
| Tabs / multiple sources open | **Build (v2)** — generalizes the parallel-harmony view |
| Weekly memory work tied to readiness | **Build** — see §4 |
| Maps, historical sites, archaeology | **Build, curated per teaching** — PD atlases + OpenBible.info geodata + Wikimedia imagery. Never a standalone atlas |
| Audio Bible | **v1 — CONFIRMED WORKING** via the ESV API audio endpoint (no extra license) |
| Typography / text size / fonts | **Build in v1, not last** — see §5 |
| Exegetical guides, syntax graphs, sense lexicon | **Don't build. Link to Logos.** Decades of licensed scholarly data; unwinnable and off-thesis |
| RSB (Sproul) footnotes in-app | **Not licensable — see §6** |

## 4. Memory work, reframed around his own words

He tied memorization to "being prepared to offer sound advice when
preaching the gospel and always being prepared" — that's **1 Peter
3:15**, "always being prepared to make a defense" (ESV).

So the deck isn't trivia recall. It's **readiness**, organized by
occasion: the gospel itself · assurance · suffering · doubt · the
exclusivity of Christ · God's sovereignty · forgiveness. One verse a
week, spaced repetition (**pure math, zero AI cost**), and the weekly
review asks him to *use* it — "someone says God can't be good with this
much suffering; which verse do you reach for, and why?" That's rehearsal
for real conversations, not flashcards.

## 5. Typography is not a v2 nicety

He listed text size and fonts as "maybe last." **In a reading app,
typography is the product.** Line length, leading, size, night mode, and
justification are the difference between an app he reads for 20 minutes
and one he skims. It's also a couple of hours of work. **v1.**
(His own screenshots of Logos show hyphenated justified text at generous
leading — that's why it reads well on a phone.)

## 6. Texts, licensing, and two honest No's

- **English: ESV via the Crossway API — ✅ KEY ACQUIRED AND VERIFIED
  2026-08-12.** Stored as `ESV_API_KEY` in `.env.local` (gitignored;
  name-only in `.env.example`). **Michael must also add it to Vercel
  himself.** Live-tested endpoints:
  - `/v3/passage/text/` ✅ — plain text
  - `/v3/passage/html/` ✅ — **and it carries cross-references and
    footnotes inline** (Romans 3 returned 48 `class="cf"` crossref
    anchors with `title="See ch. 11:14"` and 13 footnote links). That is
    *exactly* the tap-a-letter → "See ch. 11:14" → verse-preview popup
    from his Logos screenshots, **available natively from the ESV API**.
    The Reader gets Logos-style reference tooltips for free.
  - `/v3/passage/audio/` ✅ — **ESV audio works** (302 → mp3 at
    audio.esv.org, David Cochran Heath narration). **This promotes audio
    from "v2, licensing-gated" to v1-available at no extra cost.**
  - `/v3/passage/search/` ✅ — full-text ESV search.
  Caps still apply (per-query verse limits, daily limits, no whole-book
  reproduction, required copyright line) — cache aggressively.

  **Capability audit, all live-tested 2026-08-12 — five things worth
  building around:**

  1. **Multiple passages in ONE request.** `q=Romans 9:13;Ephesians
     1:4;John 6:44` returns all three, separately parsed. **A thematic
     thread is therefore a single API call**, not one per verse — the
     curriculum's headline feature is cheap. This shapes the thread
     data model: store the ref string, fetch once, cache once.
  2. **Per-verse anchors.** HTML returns `id="v19023001"` plus
     `<a class="va" rel="v19023001">` on every verse. **Verse-level
     selection, highlighting, and note anchoring get their coordinates
     for free** — no custom parser, and highlight ranges stay stable
     across refetches because the ids are canonical (book/chapter/verse
     encoded).
  3. **Real typography markup.** Section headings (`<h3>`), psalm titles
     (`h4.psalm-title`), poetry indentation (`block-indent`, 10 blocks in
     Psalm 23), and **words of Christ (`class="woc"`, red-letter)**.
     Psalms will read like a printed Bible rather than a wall of prose,
     and red-letter is a one-line CSS toggle.
  4. **Full-text search with phrase support.** `"fear of the Lord"`
     returned 27 results, paged. This powers his own concordance work and
     the app's "find every place X appears" without any extra dataset.
  5. **Audio per passage** — mp3 URLs at any granularity, verse range
     included in the filename, so a follow-along player is trivial.

  **No rate-limit headers are exposed**, so the caching strategy can't be
  reactive: **cache every fetched passage permanently in our own DB**
  (allowed for personal use within the caps) and treat the API as a
  fill-on-miss source. This also makes offline reading free, and means a
  term's readings can be pre-fetched the night the term is generated.
- **Spanish: NBLA** (Lockman) — copyrighted; **verify licensing before
  design locks it**. Fallback: Reina-Valera 1909 (PD).
- **⚠️ RSB notes: not obtainable.** Ligonier sells the Reformation Study
  Bible in print, Kindle, and *inside Logos* — there is **no data license
  or API** letting a personal app render Sproul's notes. Buying a
  personal copy does not convey redistribution rights into software.
  **The honest bridge:** his RSB is (or can be) in his Logos library, so
  a tap in Pitaya **deep-links to Logos at that verse** and he reads the
  notes there. One tap, fully legal, zero build.
- **⚠️ Logos has no public API** to read his licensed library — no price
  fixes this. Deep link (`logos4:` / `logosref:`, verify on device),
  never clone.
- **Free and bundleable:** 1599 Geneva Bible (Reformation-era notes),
  Treasury of Scripture Knowledge, Strong's, Thayer's, BDB, Easton's,
  Smith's, ISBE, Nave's, Calvin's *Institutes* + commentaries, Matthew
  Henry, Westminster + Heidelberg/Belgic/Dort + the 1689, Schaff's
  Ante-/Post-Nicene Fathers, Spurgeon, Edwards, Owen, Josephus, Eusebius,
  pre-1929 Bible atlases.
- **Never bundleable, never quoted:** Bavinck ET, Berkhof, Sproul,
  Grudem — discussable by position only, and **never fabricated**.

## 7. Reading engine — non-linear by design

Plan types (a plan = ordered passage ranges + connective teaching):

1. **Book campaign** (his current habit — kept, but now the app picks it)
2. **Thematic thread** — one doctrine traced across books (election
   through Rom 9 → Eph 1 → John 6 → Ex 33 → Mal 1)
3. **Chronological / historical** — prophets interleaved into Kings and
   Chronicles at their real moments. Transforms the OT
4. **Parallel harmony** — two-column: Gospels side by side, Kings vs.
   Chronicles on one reign
5. **Redemptive-historical arc** — creation → fall → Abraham → Moses →
   David → exile → Christ → church → consummation
6. **Genre-mixed daily** — M'Cheyne's calendar (Reformed, public domain,
   four readings/day); Grant Horner's is the aggressive version

**Lifetime coverage map** underneath: every book, when last read, how
often, by which plan. **Paper counts** — one tap, "read this on paper,"
or the map lies and the feature dies.

## 8. The study system — PRESCRIBED, not user-invented

Michael's round-4 note: *"I don't need to create the highlighting and
note taking structure… I'm a terrible student with very little study
habits… I need your help taking the pain away from developing the study
system and instead lay one out for me."* So it is specified, not offered
as configuration. Full spec (colors, gestures, states) lives in
**docs/spirit-design-prompt.md §4**. The essentials:

**Governing distinction:** *highlights describe the TEXT; notes describe
HIS ENGAGEMENT.* This is what keeps the taxonomy from bloating — a
question is not a property of Scripture, it is his state, so it is a note
kind rather than a color.

**Six highlight categories (ceiling — more causes abandonment):** God
`#D9A23E` · Promise & Covenant `#4C7DBF` · Command `#3E7A54` · Sin &
Consequence `#B4533F` · Christ `#7B5EA7` · Context `#4E7C8A`. The first
five are the classic redemptive-historical grid; **Context is his
signature lens** (culture/history/geography needing unpacking). Rendered
as an 18% tint + 3px edge bar, never a highlighter fill, and **always
labeled by name** so the system never depends on remembering hues.

**Suggested highlights are the keystone.** The app already writes the
day's teaching, so it pre-marks the passage in an *unaccepted* outline
style; he taps to accept or dismiss. A man with no study habits curates
instead of initiating — and learns the grid by example. This single
mechanic is what makes the rest survive contact with him.

**Five note kinds:** Observation · Question (→ open-questions list) ·
Connection (→ verse link) · Conviction · Doctrine. **He should almost
never type** — the primary path is a voice note on a verse, transcribed,
with the app proposing the kind for one-tap confirmation.

**Cross-referencing = three reasons:** Fulfills · Parallels · Tension.
Machine references (TSK) stay visually distinct from his own hand-made
links.

**Rhythm without willpower:** daily (accept marks, one spoken note) →
weekly review (two minutes) → term summary (becomes the transcript).

Plus: passage-anchored AI threads, one search across Scripture + his
layer + corpus, browse-by-category ("every Promise I've marked in the
Psalms").

## 9. Accepted additions / declined

**Accepted:** Passage Notebook · Memory work (SRS) · Source Library
(citable, PD) · Sermon capture (voice → tagged to the passages preached).

**DECLINED — prayer with answered/unanswered history.** His objection:
*"I'm scoring God here."* Right, and the fault is the **status field** —
it audits God's performance. If prayer is recorded at all it belongs in
**Journal as a tag with no verdicts**.

## 9b. Church Series Follow-Along (his round-4 ask)

His church preaches in series but announces little in advance; the first
sermon of a series is the one that explains where it's going. So the app
learns the series **from him, in whatever form he has it**, and builds a
follow-along around it.

**Inputs, easiest first — all already possible with shipped plumbing:**
1. **Speak it.** "Pastor started Galatians Sunday, about ten weeks, on
   freedom from legalism" → the app drafts the follow-along.
2. **Photograph the slides.** The dock's multi-photo capture + vision
   already reads slides; snap them and the app parses series title,
   outline, and passages.
3. **Paste a transcript** from a recording.
4. *Future:* upload sermon audio (he may buy a Plaud recorder) →
   transcription. `/api/ai/transcribe` exists, but a 45-minute sermon
   exceeds Whisper's 25 MB request limit — needs chunking. **v2.**

**Output — a parallel Sunday track, NOT a replacement term.** He said
"in addition to." The term keeps running; the church track sits beside
it: *"Sunday: Galatians 3 · the passage, its context, and three
questions to bring back."*

**The loop that makes it valuable:** the sermon lands Sunday → the week's
follow-along deepens exactly what was preached → **he arrives the next
Sunday already primed.** Sermon capture (voice notes tagged to the
passages preached) feeds the same Passage Notebook, so his church life
and his study become one record instead of two. No other app does this.

**Optional escalation:** if a series runs long, he can promote it to the
term itself — the app becomes the study companion to his church's
teaching rather than a parallel curriculum.

## 9c. Three additions Claude recommends (round 4)

1. **"Why this term, why now."** A university course has a rationale.
   When a term is announced, one short paragraph explaining the choice —
   *"two terms in narrative; this one goes to an epistle, and Ephesians
   pairs with the Exile because both are about a people being formed."*
   Nearly free to build (one field on the term) and it is the difference
   between an app with **intent** and one that feels like a shuffle. It
   is what earns the authority the whole "decided for me" model depends
   on.

2. **The hard-sayings commitment — the anti-fluff guarantee.** Devotional
   content almost universally skips Judges 19, the conquest, the
   imprecatory psalms, Romans 9's hardening, 1 Samuel 15. This curriculum
   **does not skip them**: when it hits a hard text it says so plainly,
   gives the historical situation, shows how the tradition has wrestled
   (including where honest people land differently), and refuses the
   easy moral. For a man who wants doctrine and history rather than
   comfort, this single commitment is the credibility of the whole
   product. State it in the app's own words on the term page.

3. **Second-reading intelligence — progressive education across YEARS.**
   When a term revisits a book he has studied before, the app surfaces
   **what he marked and what he asked last time**, and teaches at a
   higher level: *"You read Romans in 2026 and left three questions open
   in chapters 9–11 — that's where this term goes deeper."* A 300-level
   course, not the 100-level again. This is the strongest argument that
   the app is lifelong rather than a one-year novelty, and it only works
   because his notes, highlights, and questions accumulate in one place.

## 10. Staging — what "polished at launch" means

**v1 (must feel finished, nothing half-built):** the daily page (term +
teaching + reading) · the Reader (selection, semantic highlights, typed
notes, voice notes, typography) · **linked ESV⇄NBLA scroll** · TSK
cross-refs · Strong's word study · Passage Notebook + open questions ·
memory deck · coverage map with paper-counts · Logos deep-links · AI
etiquette per §2.

**v1 additions from round 4:** ESV audio playback (confirmed working) ·
Logos-style cross-reference tooltips (native from the ESV API) · church
follow-along from a spoken or photographed series.

**v2:** tabs/multi-source · curated maps & site imagery ·
source-library reader · parallel-harmony view · sermon audio upload
(needs Whisper chunking).

Better a small app that decides for him and reads beautifully than a
half-built Logos.

## 11. Data model sketch

`Term` (title, thesisLine, weeks, rotationSlot, status) · `Series`/
`DevotionalDay` (termId, dayIndex, theme, body, passageRefs[],
citations[], generatedAt) — **permanent archive, never silently
regenerated** · `ReadingPlan` (type, orderedRanges[], pace) ·
`ReadingLog` (ref, readAt, medium: app|paper) · `Highlight` (range,
colorId) + `HighlightLegend` (colorId, meaning) · `Note` (range, kind,
body, resolvedAt?) · `VerseLink` (fromRange, toRange, reason) ·
`StudyThread` (range, messages[]) · `MemoryCard` (ref, occasion,
interval, dueAt, ease) · `SourceDoc`/`SourceChunk` (corpus + embeddings)
· `CrossRef` (TSK import) · `PlaceRef` (geodata + imagery per teaching).

## 12. Decisions Michael owns

1. **Apply for the Crossway ESV API key** (recommended: yes).
2. **Verify NBLA licensing** before design locks Spanish.
3. **Term length + rotation** — 6–8 weeks feels right; confirm.
4. **Posture default** — Teach-from-Reformed vs Compare-traditions.
5. **Church alignment** — does the app follow his church's series when
   one is running?

## 13. The design prompt

Lives standalone and paste-ready at **docs/spirit-design-prompt.md**
(round 3): the university framing, terms/syllabus/no-guilt, the daily
page incl. the supplementary Bible-in-a-year track and the "one more
thing" card, the Reader (typography, bilingual linked scroll, Logos
deep-link), **the fully-specified study system (§4)**, notebook + open
questions, transcript, memory-by-occasion, source library, AI on-screen
etiquette, and an explicit do-NOT-design list.
