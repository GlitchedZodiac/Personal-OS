# Spirit — Claude Design prompt (round 3, paste-ready)

Companion to `docs/spirit-journal-plan.md` (the plan of record). This file
is the **prompt itself** — paste it into Claude Design, then expand.
Section 4's study system is fully specified on purpose: Michael asked for
it to be designed *for* him, not left ad hoc.

---

## PASTE FROM HERE

Extend the **Pitaya** app design — same system throughout: Familjen
Grotesk (display) + Instrument Sans (text), raspberry `#A63D63` family,
white cards on `#F2F1F2`, 16–18px card radii, push-in drill-down screens,
iOS device frame. Dark mode is a first-class reading surface, not an
afterthought.

Design the **Spirit** section.

### 0. What this is (read before designing anything)

Not a Bible app with reading plans. **A biblical-theological university in
the palm of the hand** — a curriculum that *decides what the user studies
next*, the way a pastor's decision to preach through Galatians for four
months is not the congregant's decision.

The user is a Reformed (Calvinist) Christian who reads Scripture through
**history, theological narrative, and the culture of the time it was
written**. He has an excellent memory and, by his own description, no
study habits — so **the app must supply the structure, not ask him to
invent it**. He wants to be fed: the app announces, he shows up.

Design tone: **serious, warm, unhurried. A study, not a feed.** No
gamification confetti, no badges, no streak shaming, no "you're behind"
counters anywhere in this section.

### 1. The academic structure

- **The Year** — the curriculum is planned a year ahead and broken into
  terms. A "Year at a glance" view shows the terms ahead like a course
  catalog.
- **Terms** — 6–8 weeks each, announced not chosen: *"Term 3 · The Exile ·
  week 2 of 8."* Balanced rotation across years: OT narrative → epistle →
  doctrine → gospel → prophets → wisdom → church history.
- **The Syllabus** — visible but **not editable**. Week by week, what this
  term covers and where it lands. Anticipation without the burden of
  choosing.
- **The Transcript** — what he has studied across his life (see §6).

Design **Year at a glance**, **Term/Syllabus**, and the daily page below.

### 2. Today's Spirit (the screen he opens every morning)

Top to bottom:

1. **Term banner** — "TERM 3 · THE EXILE · WEEK 2 OF 8", quiet, small caps.
2. **Today's teaching** — the lecture. A titled piece with: the story or
   argument, a **historical/cultural context block** (visually distinct —
   this is his lens), a **doctrinal note**, and the **practical turn**.
   Passages render inline, tappable into the Reader.
3. **Today's reading** — the assignment, with progress and a mark-read.
4. **Closing question** — one question that saves into his notebook with
   a single tap.
5. **"One more thing"** — a small curiosity card closing the day: an
   artifact, a word origin, a church-history vignette. This is his
   serendipity; the curriculum stays sequenced.
6. **Track 2 (supplementary)** — a single quiet collapsible line for the
   Bible-in-a-year background reading: *"Track 2 · Genesis 12–15 ·
   12 min."* Secondary by design, never competing with the term.
7. **Review due (n)** — a small affordance for memory work. Private
   reinforcement, not a headline.

No menus, no backlog, no library on this screen. **One day at a time.**

### 3. The Reader

The heart of the section. Design in **dark mode first**, then light.

- **Typography is the product.** Generous leading (~1.6), comfortable
  measure, adjustable size (5 steps), optional justified + hyphenated
  setting, serif reading face, night/sepia/light themes. Show the type
  settings sheet.
- **Verse interaction** — tap a verse to select it; drag the handles to
  extend across verses. Selection raises an **action bar**: Highlight ·
  Note · Voice note · Link · Word study · Ask · Memorize.
- **Linked bilingual mode** — two panes, English and Spanish, **locked to
  the same verse: scrolling one moves the other.** Design the toggle and
  both the stacked (phone) and side-by-side (landscape/tablet) layouts.
- **Cross-references** — a footnote drawer showing machine references
  (Treasury of Scripture Knowledge) *visually distinct from* the user's
  own hand-made links, which are precious and should look it.
- **Word study sheet** — tap a word → original-language entry, definition,
  and every other occurrence, as a bottom sheet.
- **Open in Logos** — a quiet affordance on any passage or reference.
  Pitaya is the curriculum; Logos is the library.

### 4. THE STUDY SYSTEM (design this exactly — it is prescribed, not ad hoc)

The governing distinction, which should be legible in the UI:

> **Highlights describe the TEXT. Notes describe HIS ENGAGEMENT.**

#### 4a. Six highlight categories — fixed, named, color-coded

| # | Category | Meaning — mark when the text… | Color |
|---|---|---|---|
| 1 | **God** | reveals who God is: His character, attributes, self-disclosure | Gold `#D9A23E` |
| 2 | **Promise & Covenant** | records what God binds Himself to | Blue `#4C7DBF` |
| 3 | **Command** | states what is required of His people | Green `#3E7A54` |
| 4 | **Sin & Consequence** | shows human failure, warning, judgment | Rust `#B4533F` |
| 5 | **Christ** | points forward or back to Christ — type, shadow, fulfillment, gospel | Purple `#7B5EA7` |
| 6 | **Context** | carries a cultural, historical, or geographic detail needing unpacking | Slate `#4E7C8A` |

Six is the ceiling — more categories cause paralysis and abandonment.
Categories 1–5 are the classic redemptive-historical grid; **6 is his
signature lens** and should feel like the historian's marker.

**Rendering:** a subtle tinted background at ~18% alpha in dark mode
(~14% light) **plus a 3px left edge bar** in the full category color, and
a small category dot in the margin. Never a highlighter-pen fill — it
wrecks legibility. Multiple categories on one verse stack as thin
adjacent bars. **Every highlight also carries its category name in the
UI** (browse and filter by name, not color alone) so the system survives
colorblindness and never depends on memorized hues.

**Applying one:** press-and-hold a verse → a single row of six labeled
color chips → one tap. One gesture, one tap, no sub-menus.

#### 4b. Suggested highlights — the feature that removes the discipline problem

Because the app already writes the day's teaching, it can **pre-mark the
day's passage with suggested highlights**, rendered in a distinctly
*unaccepted* style — **outlined bar, no fill** — with a one-tap accept or
dismiss. He curates instead of initiating.

This is the single most important mechanic in the study system: it does
the first pass for a man with no study habits, and over weeks it teaches
him the grid by example. **Design the accepted vs. suggested states side
by side, and a "review today's marks" strip.**

#### 4c. Five note kinds — his engagement, not the text's properties

| Kind | Prompt | Where it goes |
|---|---|---|
| **Observation** | what I notice | notebook |
| **Question** | what I don't understand | notebook + **open questions** |
| **Connection** | this links to that | creates a verse link |
| **Conviction** | what this demands of me | notebook, surfaced in review |
| **Doctrine** | what I now hold, and why | notebook, filterable by topic |

**He should almost never type.** The primary path is a **voice note on a
verse**: he speaks, it transcribes, and the app **proposes the kind** —
he confirms or changes it with one tap. Typing is the fallback.

#### 4d. Cross-referencing — three reasons, that's all

Every hand-made link between passages carries one reason:

- **Fulfills** — promise → fulfillment, type → antitype
- **Parallels** — the same event or teaching told elsewhere
- **Tension** — these appear to conflict; unresolved on purpose

Design the link-creation flow (from a selected verse, pick the target
passage, pick the reason, optional line of why) and the **web view** of a
passage's links.

#### 4e. The rhythm that needs no willpower

- **Daily** — read; accept or dismiss the suggested marks; speak one note
  if moved.
- **Weekly review** (two minutes) — what he marked this week, his open
  questions, this week's memory verse.
- **End of term** — the term summary: what was covered, what he marked
  most, which questions are still open. This becomes part of the
  transcript.

Design the **weekly review** and **term summary** screens.

### 5. Passage Notebook

Everything anchored to passages: his notes by kind, his links with
reasons, his voice notes, and his **passage-anchored AI conversations**
(asking a question while reading Judges 4 stores that exchange *on*
Judges 4, permanently and searchably).

Include: filter by note kind · filter by highlight category ·
**browse-by-category** ("every Promise I've marked in the Psalms") · one
search across Scripture, notes, highlights, questions, and sources · and
the **Open Questions** list — questions he's written and not yet answered,
resurfacing when he returns to that passage. Growth made visible without
scoring anything.

### 6. The Transcript (lifetime coverage)

Every book of the Bible: when last read, how many times, under which
term. Terms completed across the years. **A one-tap "read this on paper"**
— he reads a physical study Bible and the record must accept that, or it
lies. Celebrate coverage; **never display a deficit**.

### 7. Memory work — private reinforcement

One verse a week, organized **by occasion** rather than by reference:
the gospel · assurance · suffering · doubt · the exclusivity of Christ ·
God's sovereignty · forgiveness. Spaced repetition. The weekly review
asks him to *use* it — *"someone says God can't be good with this much
suffering; which verse do you reach for, and why?"* Rehearsal for real
conversations, not flashcards. Keep it quiet in the IA: a small "review
due" entry, its own screen when tapped.

### 8. Source library

Public-domain theology (Calvin, Matthew Henry, the confessions and
catechisms, the church fathers, Spurgeon) where **every quotation in a
teaching is tappable through to its real source text**. Design the reader
and the citation chip that appears inline in a teaching.

### 9. What the AI is — and how it must behave on screen

- The day's page is **written before he opens it** — cached and dated. It
  should read like a printed devotional that was waiting for him, **not a
  chatbot watching him read**. No typing indicators, no live-generation
  shimmer on the daily page.
- **It never initiates.** No AI-authored notifications.
- **It never assesses his spiritual state.**
- **It never quotes without a citation** he can tap through to the source.
- **Ask is opt-in and lives on the passage.**
- A **posture control** in settings: *Teach from my tradition · Compare
  traditions · Just the text* — so a doctrine like baptism can render the
  Westminster case and the 1689 case each at full strength, with the real
  division named.

### 10. Do NOT design

Badges, streaks-as-pressure, "days behind" counters, a general-purpose
atlas or reference browser (maps and images appear **only** in service of
the day's teaching), exegetical/syntax diagram tooling (that is Logos —
link out), or any surface where the AI speaks for God about his life.

## PASTE TO HERE
