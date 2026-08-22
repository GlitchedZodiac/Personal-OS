# Spirit on iPad — brainstorm, decision sheet, and idea menu

**Status:** ANSWERED 2026-08-22 (his answers in §15; design prompt written:
`docs/spirit-ipad-design-prompt.md`). Originally written 2026-08-21 from Michael's voice
brief ("bring Spirit — and the app generally — to the iPad, with the
Pencil: a notebook beside the Bible, circle → highlight/comment, drag a
verse into my notes, structured sermon notes, worksheets for the homework,
handwriting or handwriting-to-text, and a custom recognizer if Apple's
keeps messing up"). Nothing is built. **This file is for him to answer.**

**How to use it:** read §0–§11 for the ideas and the honest constraints,
then fill **§12 (answer sheet)** and tick **§13 (idea menu)**. One-line
answers are fine; "your call" means "take the recommendation."

**The answering copy is a Google Doc (created 2026-08-21 from this file,
yellow answer boxes + a tinted "Your call" column):**
https://docs.google.com/document/d/1DsC3kVawFygH0kfnKbdIce1clIz2wq1GObD8SxmZMh0/edit
(Drive file id `1DsC3kVawFygH0kfnKbdIce1clIz2wq1GObD8SxmZMh0` — a Claude Code session reads it back with the
Drive connector's `read_file_content`.) Answer there; when done, tell
Claude Code "the iPad doc is answered" and the next session turns the
answers into the paste-ready Claude Design prompt
(`docs/spirit-ipad-design-prompt.md`, same format as
`docs/spirit-design-prompt.md`) and a build kickoff. This markdown stays
the repo record of the questions as asked; his answers live in the Doc
until they are folded into the design prompt.

Companion docs: `docs/spirit-journal-plan.md` (the thesis — still the
law), `docs/spirit-design-prompt.md` (phone design round), `docs/state.md`
2026-08-20 (the lesson-as-journey state of the section).

---

## 0. Where we actually stand (facts from the repo, not opinions)

- **Spirit is phone-built and phone-designed.** 13 screens under
  `app/(tabs)/spirit/*`, every one a single column; the only responsive
  class on each page is `lg:px-8`. The tabs shell caps content at
  `max-w-lg` (~512 px) below 1024 px and switches to a desktop rail +
  wide container above it. On an iPad today: **portrait = a centered
  phone column; landscape = a phone layout stretched across ~1100 px**
  next to the desktop rail. Nothing breaks; nothing was designed.
- **The design canvas has no tablet in it.** `docs/design/pitaya-app.dc.html`
  is 17 screens in a 440 px iOS frame. **Every iPad screen is new design
  work** — the PORT GATE needs a source before anything is built.
- **The iPhone companion exists and is a WKWebView shell** (watch lane,
  `ios/iOSApp/`): prod web is the UI, durable mic/camera, HealthKit sync,
  APNs wired. `TARGETED_DEVICE_FAMILY: "1"`, portrait only. Extending the
  shell to iPad is a manifest line; **anything native (PencilKit) is new
  code in `ios/**`, the watch lane's territory.**
- **Free-team native installs expire every 7 days.** The $99 Developer
  Program was approved in principle (08-09) and is still listed as open
  in state.md (08-15). A daily-use native iPad app is not livable on a
  7-day cert — this gates any native option.
- **The study layer is canonical-ref anchored** (`refStart/refEnd` ints):
  Highlight (6 categories, `origin: user|accepted`), SpiritNote (5 kinds,
  `spoken` flag), VerseLink (3 reasons), StudyThread, MemoryVerse,
  `DevotionalDay.suggested` pre-marks. **Everything the Pencil produces
  should land in these tables or alongside them, never in a parallel
  system.**
- **Reader today:** tap a verse → single-verse selection → bottom action
  bar (Highlight · Note · Link · Word · Ask · ⋯ Memorize/Copy). No
  multi-verse drag-select, no drag-out. ESV per-verse anchors give every
  verse element its `refInt` — the coordinates a circle gesture needs
  already exist in the DOM.
- **Homework is a card and a tick.** Six kinds (sit · read · research ·
  write · compare · ask), one per study ≤20 min, carried until ticked
  (`HomeworkCheck`). **There is no place to *do* the homework in-app.**
  The study's QUESTION step is read-only.
- **Sermons:** the Church track sets up a series (speak / photograph
  slides / paste → proposal → confirm) and generates a weekly follow-along
  (context + 3 questions). **No live note-taking surface exists.**
- **Journal** is a "coming soon" placeholder (`JournalEntry`: one text +
  one photo per day) — design-blocked since 08-12.
- **Licensing stays the law:** ESV via Crossway, LRU cache ≤200 unpinned
  chapters, never a full copy, export omits ESV text. BSB (CC0) for Track
  2. NBLA unlicensed — Spanish lives in Logos via the `compare` homework.
  → "paste a verse into my notes" must be a **reference card** (store the
  ref, render the text live), not frozen text.
- **Reusable plumbing:** voice → transcription, photo → vision parse, the
  confirm-before-persist card, push reminders, nav-stack backlinks,
  themed reader (light/dark/night, Literata), `lib/spirit-refs` parser.
- **Procreate has no API, SDK, or URL scheme for drawing handoff.** Files
  in and out (PNG/PSD/PDF) and Split View drag-and-drop are the only
  bridges. Its *interactions* can be borrowed; its engine cannot.

---

## 1. The fork that decides everything: where does the ink live?

Three honest options. The design round is the same for all three (layout,
gestures, and the notebook are designed once); what differs is the pen
feel, what the Pencil can do, and who builds it.

| | **A — Web** (Safari/PWA, or the companion shell extended to iPad) | **B — Native iPad app** (SwiftUI + PencilKit, consuming `/api/spirit/*`) | **C — Hybrid** (web for reading/study/structure; a native PencilKit notebook pane inside the iPad companion; web canvas as the fallback) |
|---|---|---|---|
| Ink feel | Pointer-events canvas. Pressure + tilt arrive; no predicted touches; visibly behind the tip. Fine for notes, not Procreate-grade | Apple Notes quality: predicted touches, Metal path, ~instant | Notes-quality ink where it matters (the notebook); web everywhere else |
| Palm rejection | Decent (ignore finger pointers while a pen is down) | System-grade | System-grade on the ink pane |
| Apple Pencil Pro (squeeze · barrel roll · haptics) / double-tap | **Not exposed to web content** | Yes | Yes on the ink pane |
| Pencil hover | Partial (recent iPadOS fires pointer moves for hover — verify on his iPad) | Yes, with distance | Yes on the ink pane |
| Scribble (system handwriting → text in fields) | Works in every text field; cannot be tuned | Controllable per field | Controllable on native fields |
| On-device handwriting recognition | No (needs a cloud pass — see §7) | Vision / ML Kit, offline | Yes on the ink pane |
| Drag a verse into notes | HTML5 DnD works in iPad Safari (long-press to lift; a bit sluggish with the Pencil) | Immediate with the Pencil | Web pane → native pane via system drag-and-drop (WKWebView content is draggable out) |
| Split View with Logos / Procreate | Safari: yes. Installed PWA: **verify** (iPadOS home-screen web apps have been inconsistent here) | Yes | Yes |
| Offline | Term passages are pinned; ink pages need a local queue either way | Native store | Native store for ink |
| Who builds / where | Main lane, one codebase, the existing Reader (1,761 lines) is reused as-is | Watch lane; **re-implements the Reader, notebook, study flow natively** and keeps two UIs in parity forever | Main lane builds the desk; watch lane builds the pane + a small JS bridge |
| Cost to first usable | weeks | months | weeks (web) + weeks (pane) |
| Install | none (it's the URL) / companion | Xcode install; weekly re-sign until the $99 program | companion install; same $99 caveat |

**Recommendation: C, staged — A first.** Roughly 80 % of what he asked for
is *layout + structure + semantic gestures*: Bible beside notes, circle →
select, underline → highlight, drag → reference card, sermon template,
worksheets, handwriting → text. None of that needs 9 ms latency; a
circle gesture is recognized from a handful of points. Ship the desk on
the web first (main lane, the Reader already exists), with the stroke
model designed so a native PencilKit pane can replace the renderer
without touching the data. Then, if he is writing on it daily, the watch
lane upgrades the notebook pane to PencilKit inside the iPad companion.
If the answer to "will a web canvas feel like a downgrade from Notes?"
is a hard *yes, I won't use it*, say so and we flip the order (C-first),
accepting that the ink pane then arrives before the structure around it.

Option B is the one I would not choose: it re-builds a section that was
ported to design in three rounds, and then there are two Spirits.

---

## 2. The Study Desk — the iPad's home screen for Spirit

One screen, two panes, the thing he opens with the Pencil in hand.

- **Left pane — the Text.** Tabs: **Bible** (the Reader: today's
  assignment bracketed, or free reading) · **Teaching** (the six-step
  study, one step at a time) · **Source** (a library document) ·
  **Sunday** (the church week). The six-step study runs here; its "read
  the passage" step simply shows the Bible tab.
- **Right pane — the Notebook.** The page for *this* study / sermon /
  worksheet, plus the page list. (Detail in §4.)
- **The seam.** Three snap widths — Bible-wide · half · Notes-wide — and a
  **Flip** (swap sides; left-handers want the notebook on the left so
  the writing hand doesn't cover the text). **Fingers move the seam; the
  Pencil never does** (a stroke near the divider must not re-layout the
  desk).
- **Portrait** (834 pt wide): stacked (Bible on top, Notes below, seam
  draggable) or tabbed with a swipe — his call (Q4). **Compact width**
  (Split View next to Logos): falls back to the phone Spirit we already
  have — which means the phone screens must keep working inside a
  360–500 pt pane; that is the one place the existing screens are the
  design.
- **The desk remembers.** Opening a study page re-opens the Bible at the
  assignment; opening a sermon page re-opens it at the passage; the
  seam position and pen tool persist per device.
- **Voice on the desk.** The dock's mic dictates into the notebook page
  at the cursor (the pipeline exists); the floating dock itself probably
  moves into the notebook toolbar on iPad rather than floating over
  text.
- **ESV audio** plays while he annotates; the follow-along rail stays.

---

## 3. Pencil on the Bible — gestures, not free ink

**Principle:** the Bible's marking language is the six-category system
the phone already taught him. Ink on the Bible is *interpreted* into that
system, so a mark made today still means something in 2030 and still
shows up in the Notebook filters. Free ink lives in the Notebook (§4).

| Gesture on the text | Result |
|---|---|
| **Circle** a verse or a phrase (loop spanning several verses = multi-verse selection — which the phone Reader cannot do today) | Selection + the action bar **under the pen tip** (a compact pen-positioned bar, not the phone's bottom sheet): Highlight (six labelled chips) · Note · **Send to notes** · Link · Memorize · Ask |
| **Underline** | Highlight in the **current pen color** — the tool rail's color set *is* the six categories + ink black; underlining in black = selection only |
| **Strike through** a *suggested* (outlined) highlight / **tick** next to it | Dismiss / accept — the "curate, don't initiate" mechanic in pen form; the day's suggested marks reviewed with a few flicks |
| **Write in the margin** beside a verse | An **ink note** anchored to that verse (a `SpiritNote` carrying the ink + its recognized text; kind proposed, one-tap confirm) — rendered as a small ink glyph in the margin, tap to expand |
| **Press-hold and drag** a verse (Pencil or finger) into the Notebook | A **reference card** lands at the drop point (ref + live ESV text + a tap-to-jump link back). "Send to notes" on the action bar does the same without dragging |
| **Hover** (Pencil 2 / Pro) | A faint rail under the verse the loop would bind to — so he knows before he draws |
| **QuickShape-style hold** at the end of a circle | The loop snaps to a clean ellipse around the verses it encloses |

**Do circles persist?** Recommendation: **no** — the *result* persists
(highlight, note, card, link); the ink is the gesture and evaporates. It
keeps the Bible clean and the index queryable. **Marginalia** — free ink
on the Bible page itself — is a separate, optional idea (I-09) because
ink on *reflowable* text is the one genuinely hard problem: change the
font size and the ink no longer sits beside its verse. Three ways out,
for him to pick (Q8): (1) semantic gestures only (recommended); (2)
marginalia anchored to verse tops — shifts with layout, tolerable,
breaks on big size changes; (3) a **"printed page" mode** that freezes
the chapter's layout the first time it is annotated, like marking a PDF.

---

## 4. The Notebook — ink pages, structure, recognition

**Page kinds** (each auto-headed so the page is never blank):
- **Study page** — one per study: term · study title · aim · passage,
  then whatever he writes. Created the first time he opens the desk on
  that study.
- **Sermon page** — §5.
- **Worksheet** — §6.
- **Free page** — lined / dotted / grid / blank.
- **Term reflection** — end-of-term, prompted by `Term.summary`'s open
  questions.

**A page is** a vertically growing canvas (Notes-style) holding **ink**,
**typed blocks**, **reference cards** (objects: draggable, tappable →
the Bible pane jumps), and **photos** (slides, whiteboards). Every
stroke carries a timestamp (this matters in §5).

**Tool rail** (left or right edge — pen-hand setting): Pen · Marker ·
Pencil · Eraser · Lasso · Text · Ref-card · Photo · Undo/Redo. **Colors:
ink black + the six category colors** (so a highlight in the notes means
the same thing as one in the Bible) + optionally one "comment" color.
Size and opacity as rail sliders.

**Borrowed from Procreate** (interactions, not the engine): two-finger
tap undo · three-finger tap redo · pinch zooms the *page* (never the
Bible text) · QuickShape snap for circles/lines/arrows · a hold-to-open
QuickMenu of the last tools · streamline (smoothing) slider · Pencil
double-tap → eraser and squeeze → tool palette (**native only**, §1).

**Lasso menu:** move/resize · **convert to text** · **make this a note**
(anchors to the nearest ref-card, or asks which verse) · send to Journal
· copy as image.

**Handwriting → text, three tiers** (full comparison in §7):
1. **Scribble** in typed fields — free, system, bilingual-ish, cannot be
   tuned (this is the one that "messes up").
2. **On-device stroke/image recognition** — Vision or ML Kit; native
   only; fast, offline, decent.
3. **The custom path: vision-LLM transcription of the rendered page**
   (the app's own models, `lib/openai.ts`) — works on web *and* native,
   best on messy bilingual handwriting and on Bible references, can be
   told the context (this is a sermon page; "Ro 8 28" is Romans 8:28;
   Kat / Jonathan / Benjamin are names), produces a **confirm card** in
   the dock shape before anything is saved. Order of magnitude: a cent
   or two per page, a few seconds.

**Recommendation:** ink stays the record. Recognition runs (a) on demand
— "transcribe this page" / lasso → convert — and (b) quietly when a page
is closed, producing a **searchable text layer + the references it
found** (proposed as notes/links, one card, he confirms). He sees his
handwriting; search sees the text. If he wants the *text* visible too,
that is a toggle, not the default (Q11).

**Search / export:** ink pages join the Notebook search through their
text layer. Export: PDF per page or per term (ink intact), Markdown for
text; ESV text omitted per license (ref-cards export as references).

**The phone reads what the iPad wrote.** Ink pages render read-only on
the phone (a PNG per page is enough) so a Sunday's notes are in his
pocket on Wednesday.

---

## 5. Sermon mode — structured notes on Sunday

- **Entry:** the Church card's first button on a Sunday is **"Take notes"**
  (no AI initiative; the button is just first). Opens a **Sermon page**
  with the Bible pane on the series' announced passage.
- **Template, pre-filled where known:** date · church (IBCC Cali) ·
  preacher · series (from `ChurchSeries`) · passage (editable) — then:
  **Big idea** · **Outline** (I / II / III — ink or typed) · **Verses he
  read** (ref-cards as they're announced; a quick "+ ref" that takes
  "Gal 3 1-5" written or spoken) · **Quotes worth keeping** ·
  **Application** · **Questions to bring back** (feeds the week's
  three-questions loop directly) · language of the notes (Spanish
  sermon, English notes? → recognition language).
- **Closing the page** runs one pass and shows **one confirm card:** the
  ink transcribed to a text layer; references found → proposed notes /
  links ("you wrote Gal 3:1 beside 'bewitched' — keep as a Connection?");
  an outline summary; the `ChurchSeries` week updated (preached passage,
  title) — "Sunday happened → prep next week" becomes a by-product of
  closing the page rather than a button he has to remember.
- **Audio-synced replay (the Notability trick).** Record the sermon;
  every stroke is timestamped; afterwards **tap any scribble to hear what
  the preacher was saying at that moment**. Needs chunked transcription
  (45 min > Whisper's 25 MB request cap — already a v2 item in the plan)
  and ~40 MB of storage per sermon; transcription is pennies. His call
  on recording at all (church policy, phone in pocket, signal) — Q14.
- **Live "verse catcher"** (optional, maybe distracting): he writes a ref
  anywhere on the page → it becomes a card and the Bible pane jumps.
  Q15.

---

## 6. Worksheets — homework he can *do*, not just tick

The six kinds, mapped to what an iPad makes possible:

| Kind | Share | On the iPad |
|---|---|---|
| **sit** (Sit with it) | 35 % | **No worksheet, on purpose** — the point is it follows him into the car. At most a one-line evening trace on the study page |
| **read** (Read one more) | 25 % | The Bible pane opens the second passage; optional one line: "what does this complicate?" |
| **research** (Find one thing out) | 20 % | **The iPad's natural homework.** A card: the thing · where I found it (Logos / RSB in **Split View**) · one line · an optional **sketch** — a map, a timeline, a floor plan of the temple. Recommend |
| **write** (Leave a trace) | 10 % | **A lined page with the prompt at the top**; the "one paragraph" rule shown as a gentle line count; ink or typed; transcribed for search. Recommend |
| **compare** (Two translations) | 5 % | **Two columns** — ESV beside KJV/BSB in-app (NBLA stays in Logos, honestly, via Split View) — with a margin column for "what shifts", ink per row. Recommend |
| **ask** (Bring it to someone) | 5 %, T13+ | A card: the question · who · what they said. Typed/spoken; not an iPad special. Later |

Plus two that aren't homework but belong here:
- **The QUESTION step** (step 5 of every study) gets an answer box —
  ink, typed, or spoken. Today it is read-only; answering it is what
  turns a devotional into a course.
- **Term reflection** — the end-of-term summary becomes a page he writes
  on, prompted by his own open questions.

**Worksheets need no AI to generate**: templates per kind + the homework
text that already exists on the study. **AI never grades** (the etiquette
rule: it teaches, it does not evaluate). If he wants to *discuss* an
answer, that is the existing Ask thread, on his tap. Q17.

---

## 7. Handwriting recognition — the honest table

| | Where | EN + ES | Offline | Messy writing | Bible refs / his names | Cost | Web? |
|---|---|---|---|---|---|---|---|
| **Scribble** (system) | any text field | yes, but mixed-language lines confuse it | yes | fair | no | free | yes |
| **Vision** `VNRecognizeTextRequest` | native, from an image of the ink | yes | yes | fair–good | no | free | no |
| **ML Kit Digital Ink** (Google) | native, from strokes | yes | yes (model download) | good | no | free | no |
| **MyScript iink** | native + web SDK | yes | partly | very good, interactive ink | no | commercial licence | yes |
| **Vision-LLM pass** (ours) | server, from a rendered page | yes, in one pass | no | **best** — and it reads context | **yes — we tell it** | ~¢/page | **yes** |

**Recommendation:** the vision-LLM pass is "the custom way that isn't
part of the Apple ecosystem" he asked about — and it's the only one that
works on the web path *and* understands that "1 Co 7 1-7" is a reference.
Scribble stays for typed fields. On-device recognition becomes worth it
only if the ink pane goes native (offline sermon notes). MyScript only if
he wants *live* word-by-word conversion as he writes, which I would not
build — it fights the "ink is the record" stance.

---

## 8. Procreate — what is real

- **No integration API.** The bridges are **Files** (export a page or
  worksheet as PNG/PDF → open in Procreate → draw → drag the result back
  as a *picture object*, not editable ink) and **Split View drag-and-drop**
  of images both ways. That's it; promising more would be dishonest.
- **What we take from it is the interaction grammar** (§4): QuickShape,
  two/three-finger undo/redo, the left rail with size/opacity, QuickMenu,
  streamline, pinch-to-fit the page, pressure → opacity on the marker.
- **Brushes:** no. Its brush engine is its own; a Pen · Marker · Pencil
  trio with pressure is what a notebook needs.

---

## 9. Data, sync, licensing — the ink model (sketch, for the build kickoff)

- **`InkPage`** — `kind` (study | sermon | worksheet | free | reflection)
  · anchors (`dayId` / `seriesId`+`weekIndex` / homework kind) · title ·
  page size + background · **strokes** (JSON: per stroke `{tool, color,
  width, points:[x, y, pressure, t, tilt?]}` — a PencilKit `PKDrawing`
  exposes the same points, so the native pane round-trips into this) ·
  **objects** (ref-cards, text blocks, images) · **textLayer** (recognized
  text) · `refs[]` (canonical ints found on the page) · thumbnail ·
  optional `audioUrl` · timestamps. Typical dense page 50–300 KB of
  JSON — Postgres JSONB is fine; thumbnails and audio in Supabase Storage.
- **Autosave by stroke deltas every few seconds** + an offline queue, so a
  45-minute sermon never loses more than seconds, signal or not.
- `SpiritNote` gains an optional `pageId` / ink snippet; `VerseLink`
  unchanged; `ChurchSeries.weeks[n]` gets a `pageId`; `JournalEntry` can
  take an ink page later (Journal's real design is still pending).
- **ESV rule:** reference cards store refs; text renders from the cache;
  export writes references. A verse he *writes out by hand* is his
  handwriting — a quotation in his own notes — and is fine.
- **One sync model, three clients:** the web desk writes pages, the phone
  reads them, the native pane (if/when) writes the same rows.

---

## 10. The Health side on iPad (he said "the app generally")

Spirit is the reason for the iPad; Health on iPad is mostly *room*, not
new capability. Worth a short second design round after the desk:

- **Body** as a spread: weight / volume / calories charts full-width, the
  body map beside the measurement history, progress photos side-by-side
  compare.
- **Train:** the routine builder with drag-drop ordering and a
  plan-the-week grid; the live session mirror big on the left with the
  HR/zone strip; the weekly PDF report as a readable two-page spread.
- **Chat beside the day:** the thread on one side, Today/Food on the
  other, confirm cards landing where the data goes.
- **Food:** the day timeline beside the photo-analysis sheet.
- Nothing here needs the Pencil; all of it is "responsive-ize with
  intent". Recommend: **after** the Spirit desk ships (Q22).

---

## 11. What goes to Claude Design (once the answer sheet is back)

A paste-ready prompt in the existing format (`docs/spirit-design-prompt.md`
round-5 style), same Pitaya system (Familjen Grotesk + Instrument Sans,
raspberry family, white cards on `#F2F1F2`, Literata in the reader, dark
and night as first-class), **iPad 11" landscape + portrait + a compact
(Split View) state** — with the instruction that a tablet is not a
stretched phone and the phone screens are the component source. Screens:

1. **The Study Desk** — three seam states + Flip; portrait; compact
   fallback; the desk's top bar (tabs, page list, tool rail position).
2. **Reader pane with Pencil states** — hover rail; circle → pen-positioned
   action bar; underline → category highlight; strike/tick on suggested
   marks; margin ink glyph (collapsed + expanded); drag ghost of a verse
   ("ref-card in flight"); multi-verse selection.
3. **Notebook page** — tool rail (both hands), page kinds, the reference
   card object (+ tapped/jump state), typed block, photo object, lasso
   menu, "transcribe this page" confirm card, page list / term archive,
   empty states.
4. **Sermon page** — the template; live state; the closing confirm card;
   audio-replay chip on a stroke (if Q14 is yes).
5. **Worksheets** — write · research (with sketch) · compare (two columns
   + margin) · the Question-step answer box · term reflection.
6. **Memory "write it out"** (I-24) if greenlit.
7. **Settings additions** — pen hand, recognition language, ink defaults,
   recording.
8. **Journal on iPad** — only if bundled (Q21).

Also ask Design for **per-screen exports** (the phone canvas already
exceeds the 256 KiB design-MCP read cap).

---

## 12. ANSWER SHEET — the decisions that are his

Write under each one. "Your call" = take the recommendation.

**Platform**

- **Q1. Where does the ink live?** A web / B native / C hybrid, staged
  (web desk first, native PencilKit pane second). *Recommend C-staged.*
  If a web canvas would feel like such a downgrade from Notes that you
  wouldn't write on it, say "C-first" and we build the pane first.
  > Your answer:

- **Q2. Which iPad and which Pencil?** (Pencil USB-C has **no pressure**;
  2nd gen has pressure + tilt + double-tap; Pro adds squeeze, barrel
  roll, haptics; hover needs Pencil 2/Pro on an M2+ iPad.) Size — 11" or
  13"? It sets the design frame.
  > Your answer:

- **Q3. The $99 Developer Program — bought yet?** Without it every
  native install re-signs weekly, which rules out a daily-use native
  pane. (Also unlocks APNs for the phone.)
  > Your answer:

- **Q3b. Two-minute test on your iPad:** open the *installed* Pitaya
  (home-screen icon) and try to Split View it next to Logos. Does it
  split? (Decides whether the PWA or the companion shell is the iPad
  host.)
  > Your answer:

**The desk**

- **Q4. Portrait behavior:** stacked (Bible above, notes below) or tabbed
  with a swipe? *Recommend stacked with a draggable seam; tabbed only
  below ~700 pt.*
  > Your answer:

- **Q5. Which hand holds the Pencil?** Sets the default side of the tool
  rail and which pane sits where (writing hand should not cover the
  Bible). Flip stays available either way.
  > Your answer:

- **Q6. Default pairing when a study opens:** Teaching | Notebook, with
  the Bible tab taking the left pane on the reading step? Or Bible |
  Notebook always, with the teaching as a sheet? *Recommend the first —
  "the desk follows the step."*
  > Your answer:

- **Q7. Should the phone's floating mic/camera dock move into the
  notebook toolbar on iPad** (so nothing floats over text)? *Recommend
  yes.*
  > Your answer:

**Pencil on the Bible**

- **Q8. Ink on the Bible page itself (Marginalia):** (1) semantic
  gestures only — circles evaporate, results persist; (2) marginalia
  anchored to verse tops; (3) "printed page" mode that freezes the
  layout once annotated. *Recommend (1) now; (3) as a later option if
  you miss writing on the page.*
  > Your answer:

- **Q9. Underline = highlight in the current pen color** (rail colors =
  the six categories + black)? Or underline always opens the chip row?
  *Recommend color = category; black = select only.*
  > Your answer:

- **Q10. Pen-positioned action bar** (compact, under the tip) vs. the
  phone's bottom sheet on the Bible pane? *Recommend pen-positioned.*
  > Your answer:

**Notebook & recognition**

- **Q11. Handwriting stays handwriting?** Recognized text is a hidden
  search layer by default, with a "show text" toggle — or do you want
  the converted text visible beside/under your ink? *Recommend hidden
  layer; convert-on-demand via lasso.*
  > Your answer:

- **Q12. Recognition path:** the vision-LLM pass (works on web, reads
  refs + names, bilingual) vs. wait for on-device (native only). Any
  objection to a rendered page image going to the model? *Recommend the
  LLM pass; it's the same provider that already reads your slides and
  meal photos.*
  > Your answer:

- **Q13. Colors on the notebook rail:** ink black + the six categories,
  or a free palette? *Recommend black + six (+ one comment color) — the
  notes then speak the Bible's language.*
  > Your answer:

**Sunday**

- **Q14. Record the sermon audio** for tap-a-scribble replay? (Church
  policy, phone in pocket, ~40 MB/sermon, chunked transcription needed.)
  *Recommend yes if it's allowed — it's the feature that makes Sunday
  notes alive on Wednesday.*
  > Your answer:

- **Q15. Live "verse catcher"** — writing a reference jumps the Bible
  pane during the sermon — useful or distracting? *Recommend off by
  default, one-tap on.*
  > Your answer:

- **Q16. Sermon template fields** — anything missing or unwanted in §5
  (Big idea · Outline · Verses read · Quotes · Application · Questions
  to bring back)? Language of your notes in church?
  > Your answer:

**Worksheets**

- **Q17. May AI ever respond to a written answer?** *Recommend: only via
  Ask, on your tap; never unsolicited, never graded.*
  > Your answer:

- **Q18. Which homework kinds get sheets in v1?** *Recommend write ·
  research · compare + the Question step; sit and read stay sheetless;
  ask later.*
  > Your answer:

- **Q19. Should closing a worksheet tick the homework** (`HomeworkCheck`)
  automatically, or stay a deliberate tick? *Recommend: closing with
  content ticks it; the tick stays undoable.*
  > Your answer:

**Scope & order**

- **Q20. What is v1?** Pick the line: (a) the desk + Bible gestures +
  ref-cards only; (b) + notebook with ink + worksheets; (c) + sermon mode
  with the closing pass; (d) all of it incl. audio replay. *Recommend
  (c); audio replay follows once the 45-min transcription lands.*
  > Your answer:

- **Q21. Bundle Journal into this design round?** It is design-blocked
  and an ink notebook is most of what it needs (photos/voice/text/ink,
  tags, on-this-day, passage links). Bundling saves a round; it also
  grows the round. *Recommend: include Journal's archive screen as one
  artboard, build it after the desk.*
  > Your answer:

- **Q22. Health on iPad** — second round after the desk (recommended), or
  in this round?
  > Your answer:

- **Q23. Where's the seam between lanes** for Stage 2: the watch lane
  builds the native pane in `ios/**` against a JSON bridge the main lane
  defines — OK? (It is the only option that respects the lane contract.)
  > Your answer:

- **Q24. Anything in his brief I've under-weighted?** (He said: circle →
  highlight; circle → comment; hold-drag a verse; quick flip; structured
  sermon notes; worksheets with colors and sketches; handwriting or
  text; a custom recognizer.) What's the *one* thing that, if it isn't
  great, the iPad doesn't earn its place?
  > Your answer:

---

## 13. IDEA MENU — greenlight or not

✅ build · ⏳ later · ❌ no. Size = S (a session or less) / M (2–3) / L (4+).
"Web?" = works on the web path (Option A) without native code.

| # | Idea | Why it earns a place | Size | Web? | Stage | Your call |
|---|---|---|---|---|---|---|
| I-01 | **The Study Desk** — two panes, three seam states, Flip, portrait stack, compact fallback | The iPad's reason to exist for Spirit | M | yes | 1 | |
| I-02 | **Responsive Spirit shell** — iPad breakpoints for the 13 existing screens (no redesign, just room) | Without it the desk sits inside a phone column | S | yes | 1 | |
| I-03 | **Circle → multi-verse selection + pen-positioned action bar** | The gesture he described first; the phone can't multi-select at all | M | yes | 1 | |
| I-04 | **Underline → highlight in the pen's category color** | One stroke, one meaning, zero menus | S | yes | 1 | |
| I-05 | **Strike / tick on suggested marks** | The keystone mechanic ("curate, don't initiate") in pen form | S | yes | 1 | |
| I-06 | **Drag a verse into the notebook → reference card** (+ "Send to notes" button) | His "hold and drag" ask; the card keeps notes navigable and the license clean | M | yes | 1 | |
| I-07 | **Margin ink note anchored to a verse** (glyph in the margin, tap to expand) | "Circle and write a comment" without dirtying the page | M | yes | 1 | |
| I-08 | **Pencil hover rail** (which verse the loop will bind to) | Confidence before the stroke | S | partial | 1 | |
| I-09 | **Marginalia / printed-page mode** — free ink on the Bible page | Only if he misses writing *on* the page (Q8) | L | yes | 3 | |
| I-10 | **Notebook v1** — pages per study/sermon/worksheet/free; ink + typed blocks + ref-cards + photos; tool rail; undo gestures; autosave deltas; offline queue | The notepad beside the Bible | L | yes | 1 | |
| I-11 | **Procreate-grammar interactions** — QuickShape snap, two/three-finger undo/redo, QuickMenu, streamline, pinch-zoom page | Makes the pen feel intentional, borrowed from the app he already loves | M | yes | 1 | |
| I-12 | **Lasso → move / convert to text / make a note / send to Journal / copy image** | Ink becomes structure when he wants it to | M | yes | 1–2 | |
| I-13 | **Handwriting → text via the vision-LLM pass** (on demand + on page close; text layer + found references → one confirm card) | The custom recognizer; bilingual; reads refs and names | M | yes | 1 | |
| I-14 | **Scribble in typed fields** (nothing to build; just don't fight it) | Free, for quick typed fields | — | yes | 1 | |
| I-15 | **Native PencilKit notebook pane in the iPad companion** (device family 1,2; landscape; JS bridge; PKDrawing ⇄ stroke JSON) | Notes-quality ink, Pencil Pro, palm rejection, on-device recognition option | L | no | 2 | |
| I-16 | **Extend the companion shell to iPad** (manifest + layout check only; no native ink) — durable mic for sermon dictation, guaranteed Split View | Ten-minute change on the watch lane; a safer host than the PWA | S | — | 1.5 | |
| I-17 | **Sermon page template + "Take notes" on Sunday** | The structured sermon notes he asked for | M | yes | 1 | |
| I-18 | **Closing pass** — transcribe, extract refs → proposed notes/links, outline summary, advance the series week (one confirm card) | Sunday feeds the week's follow-along by itself | M | yes | 1 | |
| I-19 | **Audio-synced replay** — record, timestamped strokes, tap to hear that moment; chunked 45-min transcription | Makes Sunday notes alive later; also unblocks the plan's v2 "sermon audio upload" | L | yes (recording in Safari; native is steadier) | 2 | |
| I-20 | **Live verse catcher** (write a ref → card + jump) | Fast during a sermon — or distracting (Q15) | S | yes | 2 | |
| I-21 | **Worksheets: write · research (with sketch) · compare (two columns + margin)** | Homework he can *do*; research is the iPad's natural assignment | M | yes | 1 | |
| I-22 | **The Question step gets an answer box** (ink/typed/spoken) | Turns the devotional into a course | S | yes | 1 | |
| I-23 | **Term reflection page** (prompted by his own open questions) | The transcript gains his hand | S | yes | 2 | |
| I-24 | **Memory "write it out"** — write the verse from memory with the Pencil, then see the text beside it; never scored | Recall by writing beats reciting; fits the no-verdict rule | S | yes | 2 | |
| I-25 | **Ink pages readable on the phone** (PNG per page) | Sunday's notes in his pocket on Wednesday | S | yes | 1 | |
| I-26 | **PDF export per page / per term** (ink intact; Markdown for text; ESV as refs) | The lifelong archive rule | S | yes | 1 | |
| I-27 | **"Open in Procreate" round-trip** (export PNG/PDF → draw → drag back as a picture) | The only honest Procreate integration | S | yes | 3 | |
| I-28 | **Journal archive on iPad** (photos/voice/text/ink, tags, on-this-day, passage links) — design slice in this round | Unblocks the tab that's been "coming soon" since 08-12 | L | yes | 2 | |
| I-29 | **Health iPad pass** — Body spread, Train builder + live mirror, Chat beside the day, Food beside analysis | Room, not new capability; second round | M | yes | 3 | |
| I-30 | **Settings:** pen hand · recognition language · ink defaults · recording consent | Small, necessary | S | yes | 1 | |

---

## 14. Staging, if the recommended set is greenlit

- **Stage 0 — Design round** (his Claude Design credits): the prompt from
  §11, 1–2 rounds, per-screen exports. PORT GATE applies to the build.
- **Stage 1 — The web desk** (main lane): I-01…I-08, I-10…I-14, I-17,
  I-18, I-21, I-22, I-25, I-26, I-30. Roughly 5–7 build sessions, each
  ending with his checklist.
- **Stage 1.5 — Companion on iPad** (watch lane, tiny): I-16.
- **Stage 2 — Native ink + Sunday audio** (watch lane for the pane, main
  lane for the bridge + chunked transcription): I-15, I-19, I-20, I-23,
  I-24, I-28. Gated on Q1/Q3.
- **Stage 3 — Optional:** I-09, I-27, I-29.

**What I'd want him to feel at the end of Stage 1:** he sits down on a
Sunday with the iPad, taps "Take notes", the passage is already open on
the left, he circles Galatians 3:1 with the Pencil, taps *Send to notes*,
writes "bewitched — who?" under the card, and when he closes the page
the app asks, once, whether to keep that as a Question on Gal 3:1. On
Wednesday it's on his phone. That is the bar.


---

## 15. HIS ANSWERS (2026-08-22, from the Google Doc) — and what they decided

Read back from the Doc (file id `1DsC3kVawFygH0kfnKbdIce1clIz2wq1GObD8SxmZMh0`).
Short quotes are his; the right column is the decision carried into
`docs/spirit-ipad-design-prompt.md` and the build.

| Q | His answer (short) | Decision |
|---|---|---|
| Q1 ink | "C first" | **Hybrid, native-first:** the PencilKit notebook pane inside the iPad companion comes first; the Reader stays the web Reader inside the same shell |
| Q2 device | "I have the pro and I have an ipad air 11 inch" | Frame = iPad Air 11" (M-series) 1180×820 pt; Apple Pencil Pro (hover, squeeze, double-tap, barrel roll, haptics) |
| Q3 $99 | "Tell me where to pay for it then and lets buy it and set it up" | **He will enroll** (steps given in chat 08-22); gates year-long installs + APNs |
| Q3b split view | "Just connected it to developer mode so I can install pitaya." | The iPad host is the **native companion** (Xcode install), not the PWA; Split View is therefore a given |
| Q4 portrait | recommended; "landscape might be how I operate this" | Landscape-first; portrait stacked, secondary |
| Q5 hand | "I'm lefty — should be lefty righty permissions though … if I share this with people" | **Handedness setting, default left**; notebook LEFT, rail by the seam for the free hand; never hardcoded (multi-user someday) |
| Q6 pairing | recommended; "most of your recommendations will take root" | Study layout = Teaching \| Notebook, Bible takes the text pane on the reading step |
| Q7 dock | "yes" | Dock moves into the notebook toolbar; nothing floats over text |
| Q8 marginalia | "both — … hover highlight and non permanent marks … but I also want a bible I can write on … a toggle of scratch notes versus our regular usage" | **Two Bible modes:** Study (gestures evaporate, hover rail) + **Scratch** (frozen printed-page layout, his ink persists). Marginalia is IN for round 1 |
| Q9 underline | "underline = underline — if I have the highlighter enabled … touch the number … or push my pen over it simulating a real highlighter that once done then connects to our highlighting feature" | **The highlighter tool highlights** (tap verse number = whole verse; drag = span; six labelled category colors); the pen never creates a highlight; a **pen-settings quick toggle** (squeeze / double-tap) |
| Q10 action bar | "Upper right maybe? Tell the claude design prompt to give me two options" | Design **two options**: pen-positioned vs. fixed upper-right |
| Q11 text layer | "recommended" | Hidden text layer; convert on demand via lasso; "show text" toggle off by default |
| Q12 recognizer | "sure" | Vision-LLM pass via `lib/openai.ts`; confirm card before anything saves |
| Q13 colors | "Free palette with recently used and … my own saved palette … purples and pinks and lighter blues … fountain pens and gpens … width thickness and brush style … multiple notebooks" | **Free palette** + recents + saved palettes; **brush library** (fountain pen, G-pen, pencil, marker, eraser, lasso) with width/opacity/pressure; **multiple notebooks** (a shelf). Category colors available, never imposed. Procreate brushes can't be imported — emulate the styles |
| Q14 recording | "Yes — record the sermon on the corner while I write … then I need a library to store recordings and label them and AI transcribe them" | **Record in the corner**, timestamped strokes → tap-to-replay; **Recordings library** (new screen: label, transcript, status, linked page); chunked 45-min transcription is now v1 |
| Q15 verse catcher | "Maybe — I like it … two bible instances open … one for the main sermon reading, one for jumping around … if I write a reference the app interprets it and auto hyperlinks … or even better, it pops up like it would in logos!" | **Reference Bible pane** (second Bible instance that follows links) + **live references in ink** → Logos-style popover (peek → full) → "Open in the reference Bible" |
| Q16 template | "They look right … we'll define these further as I use the app" | Template as proposed; section heads, not form fields |
| Q17 AI on answers | "Not for now" | AI never responds to or grades written answers; Ask on his tap only |
| Q18 sheets | "Correct — though … every lesson should have a written assignment even if a short one … a university of education for the working Christian who doesn't have time to do a full seminary but likes to dabble on the weekends" | **Every study carries a written assignment**; worksheets for all six kinds (sit/read short); **curriculum-engine change for the build** (generator + `DevotionalDay.homework`) |
| Q19 tick | "No — we should be able to go back to it … a complete button at the end or a 'submit' … like a form but with more freedom" | **Submit button**, never auto-ticked; resumable |
| Q20 v1 | "D all of it — the app should feel almost fully functional for the next sunday sermon so I can pilot it" | Scope = everything incl. recording/replay; **Sunday is the pilot** → sermon screens first in design and build. Timeline honesty in chat: design this weekend → build → a thin Sunday slice is the earliest realistic pilot |
| Q21 Journal | "Honestly this might be scrapped. Defer for now." | **Out of this round**; deferred item annotated |
| Q22 Health | "Second round — less about tracking and more about better visuals and trends — a scorecard/spreadsheet of data. Phone and watch own the actual collection" | Round 2, framed as scorecards/trends |
| Q23 lanes | "I'm not obsessed with the lane contract … lanes for me meant different chat ownership … fine it all belonging in one" | **One chat may own web + `ios/**` for this project** (the lane split was a git-collision guard, not a product rule); coordinate with the watch lane through state.md; worktree discipline still applies |
| Q24 the one thing | "the features of the actual pen … selecting the type of writing tool and the color … If I can't use my pen to interact seamlessly with the Bible … the app will feel lackluster. Anything I can do with a physical bible and notebook during a lecture should be doable within the app with the added benefits of technology." | Quoted verbatim as the bar in the design prompt §0 |

**Idea-menu notes he left:** I-01 "pane decider — two panes, 3 panes. 2
panes on left and one on right. Options like in logos" (→ the pane system
+ layout picker) · I-02 "sure" · I-03 "Yes" · I-04 "different as described
above but yes" (→ highlighter semantics). Everything else he left blank on
purpose — "I think I answered what we wanted in your questions."

### Build-facing decisions (not for Design — for the kickoff after design lands)

1. **C-first.** The iPad companion gains `TARGETED_DEVICE_FAMILY: "1,2"`
   + landscape, a native **PencilKit notebook pane** (PKDrawing ⇄ the
   stroke JSON of §9) and a JS bridge to the web Reader pane; the web
   desk layout, Bible modes, ref-cards, worksheets, sermon template and
   the closing pass are main-lane web work inside the same shell. The
   recording runs natively (AVAudioRecorder; steadier than Safari).
2. **$99 Developer Program** — his action; year-long installs, APNs.
3. **One chat owns web + ios for this project** (his Q23); the watch lane
   merges first (`claude/watchos-workout-ui-ba4448` → `claude/watch-app`)
   and is told before `ios/**` is touched.
4. **Curriculum engine:** every study gets a written assignment — the
   generator rule set + `DevotionalDay.homework` (a `written` companion or
   a second item) + importer validation; worksheets get a `Submit` →
   `HomeworkCheck` (never auto).
5. **Recordings:** Supabase Storage for audio, chunked transcription
   (45 min > the 25 MB request cap), a `Recording` model linked to the
   InkPage + ChurchSeries week, a library screen.
6. **Two Bible instances + live references:** the Reader must run twice on
   one desk (state per pane), recognized refs resolve through
   `lib/spirit-refs`, popover reuses the crossref tooltip's verse fetch.
7. **Journal** deferred (possibly scrapped — his words); **Health iPad**
   round 2 as scorecards.
