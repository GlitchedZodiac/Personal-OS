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
| Audio Bible | **v2, licensing-gated** — PD audio exists for KJV/WEB; ESV audio must be confirmed with Crossway |
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

- **English: ESV via the Crossway API.** Same text as his physical
  Reformation Study Bible, so paper and app agree. Accept the caps
  (per-query verse limits, daily limits, no whole-book reproduction,
  required copyright line). **Action: apply for the key.**
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

## 8. The study layer

Verse tap-and-drag selection → action bar (highlight · note · link ·
word study · voice note · ask · memorize). **Semantic highlighting** with
a user-defined legend (promise · command · attribute of God · warning ·
covenant · Christ), browsable by color — colors as a queryable index, not
decoration. **Typed notes** (observation · question · cross-link ·
doctrine · application) anchored to ranges; templates offered
(Observation→Interpretation→Application, COMA, SOAP). **Verse links carry
their reason.** **Passage-anchored AI threads** — asking about Judges 4
stores that exchange on Judges 4 forever, searchable. **One search** over
Scripture + notes + highlights + questions + corpus. **Open-questions
list** — growth made visible without scoring anything.

## 9. Accepted additions / declined

**Accepted:** Passage Notebook · Memory work (SRS) · Source Library
(citable, PD) · Sermon capture (voice → tagged to the passages preached).

**DECLINED — prayer with answered/unanswered history.** His objection:
*"I'm scoring God here."* Right, and the fault is the **status field** —
it audits God's performance. If prayer is recorded at all it belongs in
**Journal as a tag with no verdicts**.

## 10. Staging — what "polished at launch" means

**v1 (must feel finished, nothing half-built):** the daily page (term +
teaching + reading) · the Reader (selection, semantic highlights, typed
notes, voice notes, typography) · **linked ESV⇄NBLA scroll** · TSK
cross-refs · Strong's word study · Passage Notebook + open questions ·
memory deck · coverage map with paper-counts · Logos deep-links · AI
etiquette per §2.

**v2:** tabs/multi-source · curated maps & site imagery · audio ·
source-library reader · parallel-harmony view · sermon capture.

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

## 13. Paste-ready Claude Design prompt (round 2 — supersedes round 1)

> Extend the Pitaya app design (Familjen Grotesk + Instrument Sans,
> raspberry #A63D63 family, white cards on #F2F1F2, push-in drill-downs,
> iOS frame) with **Spirit** — not a Bible app with plans, but **a
> curriculum that decides for him**, like a pastor's preaching calendar.
> Historical, cultural, and doctrinal depth; serious and unhurried.
>
> (1) **Today's Spirit** — the current TERM stated at the top ("Term 3 ·
> The Exile · week 2 of 8"), then today's teaching (the story, the
> historical/cultural context, the doctrinal note, the practical turn, a
> closing question that saves to his notebook), today's reading with
> progress, and a closing **"one more thing"** curiosity card. No menus,
> no backlog, **never a 'days behind' counter**.
> (2) **The Term page** — the syllabus he can see but not edit: what this
> term covers week by week, what's next, and what past terms covered.
> (3) **The Reader** — the heart. Verse tap with drag-to-extend, action
> bar (highlight · note · voice note · link · word study · ask),
> **semantic highlighting** where each color carries a user-assigned
> meaning plus a legend editor and browse-by-color, inline
> cross-references, footnote drawer, and **a linked two-pane bilingual
> mode (ESV ⇄ Spanish) where scrolling one moves the other**. Typography
> matters: generous leading, adjustable size, night mode.
> (4) **Passage Notebook** — typed notes (observation / question /
> cross-link / doctrine / application), verse links with reasons,
> passage-anchored AI threads, all searchable, plus an **open questions**
> list.
> (5) **Coverage map** — every book, when last read, how often, with a
> one-tap "read this on paper."
> (6) **Memory deck** — one verse a week organized by *occasion*
> (the gospel, suffering, doubt, assurance), spaced repetition, and a
> weekly review that asks him to use it in a real conversation.
> (7) **Word study sheet** — Strong's entry, definition, every occurrence.
> (8) **Source library reader** — public-domain theology where every
> quotation in a teaching is tappable to its real source text.
>
> Also design a **Journal** tab: archive of entries (photo, voice, text),
> tags, search, "on this day," entries optionally linked to a passage.
