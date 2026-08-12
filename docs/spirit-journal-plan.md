# Spirit + Journal — planning doc

**Status:** plan of record, pre-design. Written 2026-08-12 from Michael's
brief (main-lane chat). Nothing built yet; the two tab slots hold
placeholders (`app/(tabs)/spirit`, `app/(tabs)/journal`).

**Michael's brief, in his words:** a daily story/devotional walking a theme
or two — "progressive education" plus a Bible-in-X-time track; historical
events with related passages, culture, why it happened, its impact then,
what we learn now; doctrine too (Romans on election, on grace) — "specific
to me while also being unbiased and agnostic"; he is Reformed/primarily
Calvinist but conversant with other positions (credo- vs paedobaptism);
practical application as well as history; "to understand what our
forefathers said or text from other theologians." Reading is book-at-a-time
(now Judges; before that John, before that Romans), not left-to-right.

---

## 1. The AI question — the one that decides everything else

His skepticism is correct and has a precise, fixable shape. The danger is
not that a machine touches Scripture; it is these four failure modes:

1. **Fabricated authority.** LLMs invent plausible quotes and citations.
   An imagined Calvin sentence that *sounds* like Calvin is the single
   worst thing this app could do.
2. **Doctrinal flattening.** Ungrounded generation drifts to a generic,
   therapeutic, lowest-common-denominator evangelicalism — exactly the
   distinctives he cares about, sanded off.
3. **Claimed revelation.** Any drift into "God is telling you…" /
   prophetic voice about his life.
4. **Crisis counseling.** Standing in for his pastor/elders.

**The architecture that answers all four:**

- **AI is librarian and tutor, never authority.** Authority is Scripture
  and the named historic sources. The model synthesizes, paces, and
  teaches; it does not rule.
- **Retrieval, never recall.** Every quotation comes from a stored,
  public-domain text in the app's own corpus and renders with a tappable
  citation into that stored text. If it cannot cite, it says so plainly
  instead of producing a quote. This kills failure mode 1 structurally.
- **Confessional posture, honest opposition.** "Unbiased and agnostic"
  content is mush nobody grows on. What he actually wants: *teach from
  the Reformed position with confidence, and state every other position
  in the terms its own best advocates would use.* Ship it as a per-topic
  setting — **Teach from my tradition · Compare traditions · Just the
  text** — so baptism can render as steelmanned Westminster **and**
  steelmanned 1689, with the real point of division named.
- **Hard lines in the system prompt:** never speak for God about his
  life; never claim revelation; on grief/crisis/sin-in-crisis, name that
  this belongs with his pastor and elders and stop.

If those hold, he is not asking a machine what to believe. He is asking a
well-read study assistant that always shows its work.

## 2. Spirit ≈ Train (why this stays small)

The section maps onto patterns the app already has, which means the data
shapes, the drill-down IA, and the design language all transfer:

| Train | Spirit |
|---|---|
| Routines (Sequences) | Series (devotional arcs) + Reading campaigns |
| Free sets | Open reading / open study |
| Activities history + detail | Reading + devotional history, per-day detail |
| PRs, streak, week overview | Streak, coverage map, week overview |
| Progression from real runs | Coverage + memory retention from real reading |

## 3. The daily surface

**Today's Spirit** (the screen he opens every morning):
- **Devotional** — series name, day *n* of *m*: the story/teaching, the
  passage(s) inline, historical/cultural context, a doctrinal note, the
  practical turn, and one closing question that drops into his notebook.
- **Today's reading** — from the active campaign (e.g. Judges at his
  chosen pace), with per-chapter progress and a mark-read.
- **Quick actions** — pray · note · memorize.
- **Streak + coverage** glance.

**Drill-downs:** series library · campaign detail · lifetime coverage map ·
notebook · prayer list · memory deck · source library search.

## 4. Reading, his way (not left-to-right)

- **Book campaigns**: pick a book, pick a pace, track completion. Multiple
  tracks can run at once (a book campaign + a doctrinal series), the way
  routines and free sets coexist.
- **Lifetime coverage map**: every book, when he last read it, how many
  times. This is the Bible-in-X-time feature done his way — the goal
  ("finish the Pentateuch this year") sits on top of the map instead of a
  rigid daily calendar he'll fall behind on and abandon.
- **Historical/chronological and thematic orderings** available as
  campaign types, so "read the exile in order" is a campaign, not a
  different app.

## 5. The five additions (Claude's recommendations)

Ordered by value to his stated goal — connect with the teaching, grow the
habit.

1. **Passage Notebook — his own compounding commentary.**
   Every question he asks and note he writes is anchored to a passage or
   topic, and *resurfaces when he returns there*. Reading Judges in 2026
   and again in 2031, he meets his younger self. This is the highest-value
   feature for growth because his own thinking accumulates instead of
   evaporating. It is also the natural bridge to Journal.

2. **Memory work with spaced repetition.**
   Flagged verses + the Westminster Shorter Catechism (107 Q&As, public
   domain) as a lifelong deck. Scheduling is **pure math — zero AI cost**
   (same rule as progression intelligence). This is the single most proven
   *habit* mechanism in the whole plan.

3. **Prayer list with an answered-prayer history.**
   Requests by category/person, marked answered with a date and a note.
   The looking-back is the point: a multi-year record of answered prayer
   is one of the most faith-building artifacts a person can own. No AI.

4. **The Source Library — real, citable, public domain.**
   His "what our forefathers said" ask, and simultaneously the anti-
   fabrication backbone from §1. Stored, searchable, quoted with real
   citations: Calvin's *Institutes* + commentaries, Matthew Henry,
   Westminster Confession + catechisms, Heidelberg/Belgic/Dort, the 1689
   London Baptist Confession (the credo side, in its own words), Schaff's
   Ante-/Post-Nicene Fathers (Augustine, Chrysostom, Athanasius),
   Spurgeon incl. *Treasury of David*, Edwards, Owen, Josephus and
   Eusebius for historical context. He can ask "what did Calvin actually
   say on Romans 9:13?" and get the real text, not a paraphrase.
   *Copyright note:* modern works (Bavinck's English translation,
   Berkhof, Sproul, Grudem) cannot be bundled or quoted at length — the
   AI may discuss their positions but must never manufacture quotes.

5. **Sermon capture.**
   Sunday sermon by voice (the app's existing voice pipeline), auto-tagged
   to the passages preached, landing in the same Passage Notebook. It
   connects his actual church life to the app instead of making the app a
   parallel spiritual silo — and it's nearly free to build on what exists.

**Worth having, second wave:** word study (Strong's + interlinear, public
domain — strong fit for his doctrine/history bent); church-calendar
awareness (Advent/Lent/Holy Week) as optional seasoning; read-aloud/
household mode if that's ever relevant.

## 6. Journal (the other tab)

One journal, two doors — not two half-journals.

- **Tonight's Page stays on Today** as the daily capture (it works).
- **Journal tab = the archive and the richer surface:** entries with
  photos and voice, tags, search, "on this day" retrospection, and
  optional links to a passage, a prayer, or a devotional day.
- **Spirit shows the filtered subset** (entries tagged spiritual /
  linked to a passage) so reflection lives in one place but is reachable
  from the context that prompted it.

## 7. Data model sketch

`Series` (title, kind: history|doctrine|practical|book, dayCount, posture)
· `DevotionalDay` (seriesId, dayIndex, theme, body, passageRefs[],
citations[], generatedAt) — **permanent archive, never silently
regenerated** · `ReadingCampaign` (scope, pace, progress) · `ReadingLog`
(passageRef, readAt) → coverage is derived · `PassageNote` (ref, body,
kind: note|question|sermon) · `PrayerRequest` (title, category, status,
answeredAt, notes[]) · `MemoryCard` (ref or catechism Q, interval, dueAt,
ease) · `SourceDoc`/`SourceChunk` (corpus + embeddings for retrieval).

## 8. Cost rules (his standing "no hidden tokens")

- Devotional content is generated **on demand or on a schedule he
  controls**, then **stored permanently** — cost is bounded by days
  elapsed, never by re-reads.
- Retrieval runs against locally stored embeddings: free at read time.
- Notebook, prayer, memory (SRS), coverage, reading logs: **zero AI**.
- The AI-status card's spend meter covers this section like any other.

## 9. Decisions Michael owns (surface before building)

1. **Bible translation — the licensing landmine.** Public domain: KJV,
   ASV, WEB, YLT, Geneva 1599 (the Reformation study Bible, with its own
   Calvinist notes). Effectively free and modern: **Berean Standard
   Bible** — the recommended default. **ESV** (his likely preference)
   requires a Crossway API key with real limits (per-query verse caps,
   daily caps, no whole-book reproduction, mandated copyright line).
   **NET Bible** is worth adding regardless for its extensive translator
   notes, which serve the "why does it say this" instinct directly.
   *Decide before design: default translation + whether to pursue ESV.*
2. **Posture default** — Teach-from-Reformed vs Compare-traditions as the
   out-of-box setting.
3. **Devotional cadence** — one series at a time, or a devotional track
   plus a reading campaign in parallel (recommended: parallel).
4. **Where sermon capture points** — his church's actual weekly rhythm.

## 10. Paste-ready Claude Design prompt

> Extend the Pitaya app design (same system: Familjen Grotesk + Instrument
> Sans, raspberry #A63D63 family, white cards on #F2F1F2, push-in
> drill-downs, iOS frame) with the **Spirit** section for a Reformed
> Christian man who wants history, doctrine, and practice — not fluff.
> Screens: (1) **Today's Spirit** — the daily devotional card (series name,
> day n of m, the teaching, inline passage, a historical-context block, a
> doctrinal note, the practical turn, and a closing question that saves to
> his notebook), plus today's reading from his active book campaign with
> progress, quick actions (pray · note · memorize), and a streak/coverage
> glance. (2) **Series library** — browse devotional arcs by kind: history,
> doctrine, practical. (3) **Reading campaigns + lifetime coverage map** —
> he reads a book at a time (Judges now, John and Romans before), so show
> every book of the Bible with when he last read it and how often, and let
> him start a campaign at a chosen pace. (4) **Passage Notebook** — his
> notes and questions anchored to passages, resurfacing when he returns.
> (5) **Prayer list** with an answered-prayer history. (6) **Memory deck**
> — verses and Westminster Shorter Catechism Q&As with spaced repetition
> (due today, streak, a review card). (7) **Source library reader** — real
> public-domain theology (Calvin, Henry, the confessions, the church
> fathers, Spurgeon) with tappable citations from any quote in a
> devotional. Tone: serious, warm, unhurried — a study, not a feed.
> Also design a **Journal** tab: the archive of entries (photo, voice,
> text), tags, search, "on this day", and entries optionally linked to a
> passage or prayer.
