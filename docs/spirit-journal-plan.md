# Spirit + Journal — planning doc

**Status:** plan of record, pre-design. Written 2026-08-12, **revised same
day after Michael's review**. Nothing built yet; the two tab slots hold
placeholders (`app/(tabs)/spirit`, `app/(tabs)/journal`).

**His brief:** a daily story/devotional walking a theme or two —
"progressive education" plus a Bible-in-X-time track; historical events
with related passages, culture, why it happened, its impact then, what we
learn now; doctrine too (Romans on election, on grace) — taught from his
position (Reformed/Calvinist) while representing others honestly
(credo- vs paedobaptism); practical application as well as history; "to
understand what our forefathers said." **Review round:** reading must be
**intelligently non-linear** (thematic and historical cross-comparison,
not one book at a time), and the Bible surface needs a **real study
layer** — semantic highlighting, note-taking methodology, verse linking,
cross-references, glossary, reference texts.

---

## 1. The AI question — the one that decides everything else

His skepticism is correct and has a precise, fixable shape. The danger is
not that a machine touches Scripture; it is these four failure modes:

1. **Fabricated authority.** LLMs invent plausible quotes and citations.
   An imagined Calvin sentence that *sounds* like Calvin is the single
   worst thing this app could do.
2. **Doctrinal flattening** toward generic therapeutic evangelicalism —
   his distinctives, sanded off.
3. **Claimed revelation** — drift into "God is telling you…"
4. **Crisis counseling** — standing in for his pastor and elders.

**The architecture that answers all four:**

- **AI is librarian and tutor, never authority.** Authority is Scripture
  and the named historic sources.
- **Retrieval, never recall.** Every quotation comes from a stored,
  public-domain text in the app's corpus and renders with a tappable
  citation into that text. If it cannot cite, it says so instead of
  producing a quote. Kills failure mode 1 structurally.
- **Confessional posture, honest opposition.** A per-topic setting —
  **Teach from my tradition · Compare traditions · Just the text** — so
  baptism renders as steelmanned Westminster *and* steelmanned 1689 with
  the real division named. Not mush neutrality.
- **Hard lines in the system prompt:** never speak for God about his
  life; never claim revelation; on grief/crisis, name that this belongs
  with his pastor and elders, and stop.

## 2. Spirit ≈ Train (why this stays small)

| Train | Spirit |
|---|---|
| Routines (Sequences) | Devotional series + reading plans |
| Free sets | Open reading / open study |
| Activities history + detail | Reading + devotional history, per-day detail |
| PRs, streak, week overview | Streak, coverage map, week overview |

## 3. Texts — decided, and the correction that matters

**⚠️ Correction to the first draft (Claude's error).** The first draft
called the 1599 Geneva Bible "the Reformation study Bible," which is a
fair historical description but collides with the actual product Michael
owns. They are different things:

- **The Reformation Study Bible** (Ligonier, R.C. Sproul general editor,
  his physical copy) = the **ESV text** + Ligonier's **modern,
  copyrighted study notes**. The ESV text is licensable via Crossway's
  API. **The RSB notes are not licensable** for a personal app — there is
  no API and no consumer license for them.
- **1599 Geneva Bible** = the Reformation-*era* study Bible, public
  domain, with its own Calvinist marginal notes. Bundleable free, but
  archaic English.

**Decision (recommended):**
- **English: ESV via the Crossway API** — same text as his physical RSB,
  so app and paper agree. Accept the API's caps (per-query verse limits,
  daily limits, no whole-book reproduction, required copyright line).
  Fallback if the key is refused: **Berean Standard Bible**.
- **Spanish: NBLA** — Lockman Foundation, copyrighted; **requires
  verifying license/API availability before design commits to it**
  (worth checking API.Bible's catalog and Lockman permissions directly).
  If it's not obtainable: **Reina-Valera 1909** (public domain) or BSB's
  Spanish equivalent. *Do not assume NBLA is available — confirm first.*
- **Bundle the 1599 Geneva free** as a historical/Reformed reference
  layer, not the reading default.
- **Two translations, not ten** (his rule). Everything else is reference
  material, not another Bible to toggle.

**Logos:** he owns it and offered to pay for resources. Reality: **Logos
has no public API that lets a third-party app read his licensed
library** — resource text cannot be pulled into Pitaya at any price. The
right integration is a **deep link**: tapping a passage or a source
reference in Pitaya opens it in Logos on the same device via its URL
scheme (`logos4:`/`logosref:` — verify on his device). **Pitaya must not
try to clone Logos.** Logos is the deep reference library; Pitaya is the
daily rhythm, his own notes, and the coverage of his life. Link, don't
duplicate.

## 4. Reading engine — non-linear by design (his review note)

Book-at-a-time stays available, but it is **one plan type among several**.
The engine runs **plans**, and a plan is an ordered list of passage
ranges with optional connective teaching. Types:

1. **Book campaign** — what he does today (Judges now; John, Romans
   before). Keep.
2. **Thematic thread** — the headline feature. One doctrine or motif
   developed *across* books: election through Rom 9, Eph 1, John 6,
   Ex 33, Mal 1; or covenant, atonement, the fear of the Lord. The AI
   assembles the thread from the source corpus and writes the connective
   tissue between passages; every claim cites.
3. **Chronological / historical** — events in the order they happened,
   with the prophets interleaved into Kings and Chronicles at their real
   historical moments. This alone transforms the OT.
4. **Parallel / harmony reading** — literal cross-comparison: the Gospels
   side by side, Kings vs. Chronicles on the same reign. Needs a
   **two-column synoptic view** in the design.
5. **Redemptive-historical arc** — creation → fall → Abraham → Moses →
   David → exile → Christ → church → consummation (biblical-theology
   shape; fits his Reformed instincts).
6. **Genre-balanced daily mix** — **M'Cheyne's calendar** (Robert Murray
   M'Cheyne, Scottish Reformed, public domain) reads four places a day
   across OT/NT/Psalms; **Grant Horner's system** is the aggressive
   ten-lists version. Both are proven non-linear methods with pedigree.

**Lifetime coverage map** sits under all of them: every book, when last
read, how many times, by which plan. Goals ("finish the Pentateuch this
year") ride on the map rather than a rigid calendar he'd abandon.

**Physical reading counts.** He reads a paper RSB. Marking a passage read
must never require reading it in-app, or the coverage map lies and the
feature dies. One tap: "read this on paper."

## 5. The study layer (his review note — the heart of the Bible surface)

What a book actually needs to be *studied*:

- **Verse selection.** Tap a verse, drag to extend a range → action bar:
  highlight · note · link · word study · ask · memorize · copy.
- **Semantic highlighting — the key idea.** A user-defined legend where
  **each color carries a meaning he assigns** (e.g. promise · command ·
  attribute of God · sin/warning · covenant · Christ/typology). The
  payoff is not decoration: colors become a **queryable index** — "show
  every promise I've marked in the Psalms," "every command in the
  Epistles." Most Bible apps stop at pretty colors; this is the one that
  compounds.
- **Typed notes** (see methodology below), always anchored to a verse
  range.
- **Verse linking with a reason** — connect two passages *and say why*
  ("fulfills," "parallel account," "tension with my note in Romans").
  Over years this becomes his own cross-reference web.
- **Built-in cross-references:** **Treasury of Scripture Knowledge**
  (public domain, ~500k references) from day one.
- **Reference shelf, all public domain:** Easton's and Smith's Bible
  Dictionaries, ISBE (1915), Nave's Topical Bible, Strong's Concordance,
  Thayer's Greek lexicon, BDB Hebrew lexicon, Josephus, Eusebius, older
  Bible atlases/maps.
- **Word study:** tap a word → Strong's number → definition → every other
  occurrence in Scripture. Directly serves the doctrinal bent.
- **Passage-anchored AI conversation.** Asking a question while reading
  Judges 4 stores that exchange **on Judges 4** — permanently, and
  searchable. This is his "store the search history" done right: the
  conversation becomes part of his study layer, not a disposable chat.
- **One search across everything:** Scripture text + his notes + his
  highlights (by color/meaning) + his past questions + the source corpus.

### Note methodology (he asked for a practice, not just a feature)

Recommended: **typed notes + semantic colors, both anchored to verse
ranges.** Note kinds — **observation · question · cross-link · doctrine ·
application**. Why typing matters: it makes the corpus queryable and it
teaches the discipline. Classic frames worth offering as templates:
**Observation → Interpretation → Application** (inductive), **COMA**
(Context, Observation, Meaning, Application), **SOAP** (Scripture,
Observation, Application, Prayer).

The sleeper feature this unlocks: **an open-questions list** — every
question he's written that he hasn't answered, resurfaced when he returns
to that passage, or reviewable on its own. That is spiritual growth made
visible without scoring anything.

## 6. The accepted additions

1. **Passage Notebook** — notes, questions, and AI exchanges anchored to
   passages, resurfacing on return. His own compounding commentary.
2. **Memory work with spaced repetition** — flagged verses + Westminster
   Shorter Catechism. Pure math, **zero AI cost**.
3. **Source Library** — real, citable, public domain: Calvin's
   *Institutes* + commentaries, Matthew Henry, Westminster Confession +
   catechisms, Heidelberg/Belgic/Dort, the 1689 (credo side in its own
   words), Schaff's Ante-/Post-Nicene Fathers, Spurgeon incl. *Treasury
   of David*, Edwards, Owen, Josephus, Eusebius. *Modern works (Bavinck
   ET, Berkhof, Sproul, Grudem) are copyrighted — discussable, never
   quoted or bundled, never fabricated.*
4. **Sermon capture** — Sunday's sermon by voice, auto-tagged to the
   passages preached, into the same notebook.

**DECLINED — prayer list with answered/unanswered history.** His
objection: *"I'm scoring God here."* Correct instinct, and the fault is
specific: the **status field** is what turns prayer into an audit of
God's performance. If prayer is ever recorded, it belongs in **Journal
as a tag with no verdicts** — a record of his dependence, not a ledger of
God's replies. Not a Spirit feature.

## 7. Data model sketch

`Series` (title, kind: history|doctrine|practical, dayCount, posture) ·
`DevotionalDay` (seriesId, dayIndex, theme, body, passageRefs[],
citations[], generatedAt) — **permanent archive, never silently
regenerated** · `ReadingPlan` (type: book|thread|chronological|parallel|
arc|mixed, orderedRanges[], pace) · `ReadingLog` (ref, readAt, medium:
app|paper) → coverage derived · `Highlight` (range, colorId) +
`HighlightLegend` (colorId, meaning) · `Note` (range, kind:
observation|question|crosslink|doctrine|application, body, resolvedAt?) ·
`VerseLink` (fromRange, toRange, reason) · `StudyThread` (range,
messages[]) — passage-anchored AI · `MemoryCard` (ref or catechism Q,
interval, dueAt, ease) · `SourceDoc`/`SourceChunk` (corpus + embeddings) ·
`CrossRef` (TSK import).

## 8. Cost rules (his standing "no hidden tokens")

- Devotionals and threads generated **on demand or on a schedule he
  controls**, then **stored permanently** — cost bounded by days elapsed,
  never by re-reads.
- Retrieval runs on locally stored embeddings: free at read time.
- Highlights, notes, links, SRS, coverage, cross-references, word study,
  reference shelf: **zero AI**.

## 9. What he'd otherwise have missed

- **Physical reading must count** (§4) — he reads paper; the app can't
  demand in-app reading.
- **Export / ownership.** Years of notes and highlights must leave in
  Markdown/PDF whenever he wants. Non-negotiable for a lifelong archive.
- **Offline reading** — his text, notes, and highlights work without
  signal (PWA cache now, native later).
- **Reading mode vs. study mode** — sometimes he's covering ground,
  sometimes excavating one paragraph. Different surfaces, same data.
- **Open-questions list** (§5) — the growth artifact that isn't a score.

## 10. Decisions Michael owns

1. **ESV via Crossway** — apply for the API key and accept its caps?
   (Recommended: yes, it matches his physical RSB.)
2. **NBLA licensing** — verify availability before design locks Spanish.
3. **Posture default** — Teach-from-Reformed vs Compare-traditions.
4. **Plan types at launch** — recommend book + thematic thread +
   chronological first; parallel/harmony and M'Cheyne second wave.

## 11. Paste-ready Claude Design prompt

> Extend the Pitaya app design (same system: Familjen Grotesk + Instrument
> Sans, raspberry #A63D63 family, white cards on #F2F1F2, push-in
> drill-downs, iOS frame) with the **Spirit** section — a serious study
> space for a Reformed Christian who wants history, doctrine, and
> practice, not a devotional feed.
>
> Screens: (1) **Today's Spirit** — the daily devotional card (series, day
> n of m, the teaching, inline passage, historical-context block,
> doctrinal note, practical turn, closing question that saves to his
> notebook), today's reading from his active plan with progress, quick
> actions (note · memorize · word study), streak + coverage glance.
> (2) **Plans** — start a reading plan by type: book, **thematic thread**
> (one doctrine traced across books), **chronological**, **parallel
> harmony** (two-column: Gospels side by side, Kings vs Chronicles),
> redemptive-historical arc, or a genre-mixed daily calendar. (3)
> **Lifetime coverage map** — every book of the Bible, when last read, how
> often, with a one-tap "read this on paper." (4) **The Reader** — the
> heart: verse-tap selection with drag-to-extend, an action bar
> (highlight · note · link · word study · ask), **semantic highlighting**
> where each color has a user-assigned meaning (promise, command,
> attribute of God, warning, covenant, Christ) plus a legend editor and a
> **browse-by-color** view, inline cross-references, and a footnote/
> reference drawer. (5) **Passage Notebook** — his notes typed as
> observation / question / cross-link / doctrine / application, his verse
> links with reasons, and his passage-anchored AI conversations, all
> searchable; plus an **open questions** list. (6) **Memory deck** —
> verses and Westminster Shorter Catechism with spaced repetition (due
> today, streak, review card). (7) **Source library reader** — public-
> domain theology (Calvin, Henry, the confessions, church fathers,
> Spurgeon) where every quotation in a devotional is tappable to its real
> source text. (8) **Word study sheet** — Strong's entry, definition, and
> every occurrence.
>
> Tone: unhurried, serious, warm. A study, not a feed.
>
> Also design a **Journal** tab: the archive of entries (photo, voice,
> text), tags, search, "on this day," and entries optionally linked to a
> passage.
