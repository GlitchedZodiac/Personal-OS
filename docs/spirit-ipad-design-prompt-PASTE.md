
Extend the **Pitaya** app design to the **iPad** — same system throughout:
Familjen Grotesk (display) + Instrument Sans (text), raspberry `#A63D63`
family, white cards on `#F2F1F2`, 16–18 px card radii, **Literata** for
Scripture, light / dark / night reading surfaces. The existing Pitaya
canvas (the Spirit screens) is the **component source**: the Reader's
verse rendering, the six highlight categories and their tint-plus-edge-bar
rule, the five note kinds, the three link reasons, the suggested-mark
outline style, the study's six steps, the Church track, the Notebook list,
Settings. **Reuse them at tablet scale. A tablet is not a stretched
phone — it is a desk.**

**Frame:** 11-inch iPad Air (M-series) — **1180 × 820 pt landscape
(primary)**, 820 × 1180 pt portrait (secondary), plus one **compact** state
(~500 pt wide: the app in Split View next to Logos), where the phone
layout simply reappears. **Apple Pencil Pro**: pressure, tilt, **hover**,
**double-tap**, **squeeze**, barrel roll, haptics. Design for the pen
first, the finger second.

### 0. What this is (read before designing anything)

Spirit is a biblical-theological university in the palm of the hand — a
curriculum that decides what the user studies next; he shows up and is
fed. The phone is where he reads and ticks. **The iPad is where he
studies: the Bible open on one side, his notebook on the other, a pen in
his hand.** His own bar for this round, in his words:

> "Anything I can do with a physical Bible and notebook during a lecture
> should be doable within the app — with the added benefits of
> technology. If I can't use my pen to interact seamlessly with the Bible
> to leave notes, to highlight something, to underline something, to drag
> something to my notes, or to level up my class with all of these
> features, then the app will feel lackluster."

He is **left-handed**, has a sketching background (fountain pens and
G-pens; purples, pinks, lighter blues), uses Procreate, and sits in a
Spanish-language sermon on Sundays writing notes in English. He wants to
**pilot this on a Sunday**, so the sermon screens come first.

Design tone unchanged: **serious, warm, unhurried — a study, not a feed.**
No gamification, no streak pressure, no "behind" counters, nothing that
scores him.

### 1. The Study Desk — panes, like Logos

One screen, made of **panes**. Each pane hosts a document, switchable from
its header: **Bible** (two instances allowed — the *main* text and a
*reference* Bible that follows links) · **Teaching** (the six-step study,
one step at a time) · **Notebook** (a page in one of his notebooks) ·
**Source** (a library document) · **Sunday** (the church week) ·
**Recording** (a sermon's audio + transcript).

- **Layouts:** two panes (Text | Notebook) or three (**two stacked on the
  left, the Notebook on the right** — e.g. Bible over Reference Bible |
  Notebook). A **layout picker** — a small grid control, the way Logos
  offers layouts — with presets per context: *Study* · *Sermon* · *Free
  reading*. The desk **remembers the last layout per context**.
- **Seams:** draggable with a finger, three snap widths each; **the Pencil
  never moves a seam** (a stroke near a divider must not re-layout the
  desk). A **Flip** swaps sides.
- **Handedness is a setting, default left** for this user — never
  hardcode it; he may share the app. For a left-hander the **Notebook
  sits on the LEFT** (the writing hand never covers the Bible) and the
  notebook's **tool rail sits on its right edge, by the seam**, worked by
  the free hand — Procreate's sidebar logic. Show the lefty default **and**
  the mirrored right-handed layout.
- **Portrait:** stacked — text above, notebook below (writing at the
  bottom suits either hand). **Compact:** the phone screens, untouched.
- **The desk remembers:** opening a study page reopens the Bible at the
  assignment; a sermon page reopens the preached passage; tool, color and
  layout persist per device.
- **Nothing floats over text.** The phone's floating mic/camera dock moves
  into the notebook toolbar (dictation lands at the cursor).

Design: the Desk in the *Study* layout (Teaching | Notebook — with the
Bible taking the text pane on the study's reading step), the *Sermon*
layout (Bible over Reference | Notebook, recording chip live), the
three-pane state, portrait, compact, the layout picker, Flip, and both
handedness mirrors.

### 2. The Bible pane — two modes, one highlighter

The Bible keeps the phone Reader's typography and its six-category
highlight system — God · Promise & Covenant · Command · Sin & Consequence
· Christ · Context; ~18 % tint + 3 px edge bar + a margin dot; suggested
marks drawn as an outlined bar. On the iPad it gains a pen and **two
modes, toggled from the pen settings**:

- **Study mode** — pen marks are *gestures* and **evaporate**; their
  results persist in the study system. **Hover** shows a faint rail under
  the verse the pen would bind to. **Circle** a verse or a phrase →
  selection (a loop across several verses = multi-verse selection) → the
  action bar. **Tap a verse number** → select that verse. **Tick / strike**
  beside a *suggested* mark → accept / dismiss (the daily "curate, don't
  initiate" rhythm, in pen form). **Press-hold and drag** a verse toward
  the notebook → a **reference card in flight**.
- **Scratch mode** ("a Bible I can write on") — the chapter's layout
  **freezes like a printed page** and **his ink stays**: an underline is
  an underline, a circled word stays circled, a word in the margin stays
  in the margin — the personality of a physical study Bible, with the
  notebook beside it. Everything from Study mode still works here
  (selection, the highlighter, drag). Design the mode toggle, the
  frozen-page affordance (how he knows the layout is pinned; what happens
  to the type-size controls), and a chapter carrying a week's worth of his
  ink without losing legibility.
- **The highlighter tool is what highlights — not the underline.** With
  the highlighter selected (six category colors, **labelled**), **tap a
  verse number** → the whole verse; **drag across the text** like a real
  highlighter → the span; on lift it **connects to the highlight system**
  (category stored, margin dot, notebook filters). The pen tool never
  creates a highlight.
- **Action bar — design two options, show both:** (A) **pen-positioned**,
  a compact bar rising beside the tip; (B) **fixed, upper-right of the
  Bible pane**. Contents: Highlight (six chips) · Note · **Send to notes** ·
  Link · Memorize · Ask · ⋯ (copy with attribution, open in Logos).
- **Margin ink note** (Study mode): writing in the margin beside a verse
  becomes an ink note anchored to it — a small ink glyph in the margin,
  tap to expand; the note kind is proposed, one tap confirms.
- **Reference popovers, Logos-style:** any reference — a crossref letter,
  a reference card, *or a reference he wrote in his own notes* — taps to a
  popover with the verse text and **"Open in the reference Bible."** The
  most-used gesture in the section; design both states (peek → full).
- **Pen settings quick toggle** — a compact popover: tool (pen ·
  highlighter · pencil · marker · eraser · lasso), color, width. **Pencil
  squeeze** opens it; **double-tap** switches pen ⇄ eraser (or last tool).
  Design the popover and a quiet "which tool am I holding" affordance near
  the hover point.

Design: both modes side by side on the same chapter; the highlighter in
use (tap-number and drag states); circle → multi-verse selection → **both
action-bar options**; the hover rail; the ref-card in flight; the margin
ink glyph (collapsed and expanded); the reference popover (peek + full);
the pen-settings popover; dark and night surfaces.

### 3. The Notebook — a real sketchbook, not a text field

- **Notebooks, plural:** a shelf — *Sermons* · *Term 1 — Reading the Room*
  · *Free* · *Worksheets* (system-made) plus his own. Each holds
  **pages**. Design the shelf and a notebook's page list (thumbnails,
  dates, linked passage, a recording dot).
- **A page** is a vertically growing canvas holding **ink**, **typed
  blocks**, **reference cards** (objects: draggable, tappable → the Bible
  pane jumps; popover on hover), **photos** (slides, whiteboards), and a
  **recording chip** when one is attached. Every stroke is timestamped
  (§4).
- **Page kinds** auto-head themselves so a page is never blank: Study page
  (term · study · aim · passage), Sermon page (§4), Worksheet (§5), Free
  page (lined / dotted / grid / blank), Term reflection (optional).
- **Tool rail** (by the seam, for the free hand): a **brush library** —
  fountain pen · G-pen · pencil · marker/highlighter · eraser · lasso ·
  text · ref-card · photo · undo/redo; width + opacity sliders; pressure
  shapes the line. A **free palette** with **recently used** and **his own
  saved palettes**; the six category colors are *available*, never
  imposed. Design the rail, the brush picker, the palette editor.
- **Procreate grammar, borrowed (not the app):** two-finger tap undo ·
  three-finger tap redo · pinch zooms the *page* (never the Bible) ·
  QuickShape snap (hold at the end of a circle / line / arrow) · a
  hold-to-open quick menu of recent tools · a streamline (smoothing)
  slider.
- **Lasso menu:** move / resize · **convert to text** · **make this a
  note** (anchor to the nearest ref-card, or pick a verse) · copy as image.
- **Handwriting stays handwriting.** Recognition produces a hidden **text
  layer** (for search and references) — on demand via lasso → convert,
  and once when a page is closed via one **confirm card** in the app's
  proposal-card shape: here is what I read, here are the references I
  found — keep / edit / discard. A "show text" toggle exists, default
  off. **References he writes become live:** "Ro 8 28" or "Gal 3:1–5"
  gets a quiet underline; a tap (pen or finger) opens the popover or
  sends the reference Bible there.
- **Ink pages read back on the phone** — a rendered page, read-only.
  Design that as one small phone artboard.
- **Dark mode question for you:** does the notebook page stay paper-light
  inside a dark desk, or go to dark paper with light ink? Show your
  recommendation.

Design: the shelf; a notebook's page list; a Study page with ink + a typed
block + two reference cards + a photo; the tool rail, brush picker and
palette editor; the lasso menu; the transcribe confirm card; a recognized
reference underlined, with its popover; the phone read-only view.

### 4. Sunday — the pilot: sermon page + recording + replay

The first thing he will use for real. It gets the most care.

- **Entry:** on a Sunday the Church card's first button is **"Take notes"**
  → the *Sermon* layout: the series' announced passage in the main Bible,
  the reference Bible beneath it (ready to jump), the Sermon page in the
  Notebook.
- **Sermon page template** (pre-filled where known, all editable): date ·
  church · preacher · series (from the Church track) · passage — then
  **Big idea** · **Outline** (I / II / III) · **Verses read** (reference
  cards as they are announced; a quick **"+ ref"** that takes "Gal 3 1-5"
  written, typed or spoken) · **Quotes worth keeping** · **Application** ·
  **Questions to bring back** (feeds the week's three-questions loop).
  Structure as gentle section heads on the page, not form fields — he
  writes anywhere.
- **Record the sermon, in the corner:** a small recording control on the
  page (start · level · elapsed · pause) that stays visible and quiet
  while he writes. **Every stroke is timestamped against the recording**,
  so afterwards **tapping a stroke replays the sermon from that moment**.
  Design the live state, the replay state (a stroke selected, a playhead,
  the transcript line for that moment), and the one-time consent line in
  settings.
- **The reference Bible during the sermon:** a reference he writes is
  recognized and becomes live; tap → the reference Bible shows it (or the
  popover). The main Bible stays on the preached text.
- **Closing the page** → **one confirm card**: the ink transcribed to the
  text layer; references found → proposed notes / links ("you wrote Gal
  3:1 beside 'bewitched' — keep as a Connection?"); an outline summary;
  the series week updated. Nothing saves until he confirms.
- **Recordings library** (new screen): every recording — date, series,
  preacher, passage, duration, status (transcribing · ready), label —
  opening to a player + transcript with the linked page alongside;
  rename, label, delete.

Design: the Sermon layout live; the Sermon page mid-sermon (ink, a
reference card just dropped, the recording chip); the replay state; the
closing confirm card; the Recordings library list and one recording open;
the Church card with "Take notes" first on a Sunday.

### 5. Worksheets — every study has a written assignment

The curriculum's homework comes in six kinds — sit · read · research ·
write · compare · ask — one per study. On the iPad **every study also
carries a written assignment**, short or long: "a university for the
working Christian who doesn't have time for seminary but dabbles on
weekends." A worksheet is **form-like with freedom**: prompts as section
heads, ink or typed answers anywhere, notes and comments welcome, and a
**Complete / Submit** button at the end — **never auto-ticked**; he can
leave and return before submitting. **AI never grades and never comments
on an answer**; Ask exists on his tap only.

Design one sheet per kind, as a family:
- **sit** — the carried question at the top; a short "one line before
  bed" trace.
- **read** — the second passage opens in the Bible pane; prompt: "what
  does this complicate?" + a few lines.
- **research** — *Find one thing out:* the thing · where I found it (Logos
  in Split View) · one line · **a sketch area** (a map, a timeline, a
  floor plan).
- **write** — *Leave a trace:* the prompt on a lined page; the
  one-paragraph rule as a gentle line count.
- **compare** — **two columns** (ESV | KJV/BSB in-app; NBLA stays in
  Logos) with a margin column for "what shifts."
- **ask** — the question · who · what they said (later in the curriculum;
  design the sheet anyway).
- Plus **the Question step** of every study (step 5) gets an answer box —
  ink, typed or spoken — on the study page itself; and an optional **Term
  reflection** page prompted by his own open questions.

Design: the worksheet family (write, research with sketch, compare, and
one of sit / read), the Submit affordance and its submitted state, the
Question-step answer box.

### 6. Settings additions

Handedness · default Bible mode (Study / Scratch) · pen defaults + saved
palettes · recognition language (sermon in Spanish, notes in English —
per notebook) · recording consent + storage · layout presets. Small, in
the existing Spirit settings.

### 7. What the AI is — unchanged

Written before he opens it; never initiates; never assesses him; never
quotes without a citation; Ask is opt-in on the passage. On the iPad it
adds exactly one behavior: the **confirm card** after a page closes (what
it read, what it found) — a proposal he accepts, never an autosave of its
interpretation.

### 8. Do NOT design

Journal (deferred) · Health on iPad (next round) · badges, streak pressure
or "days behind" · a general atlas or reference browser · Apple's stock
PencilKit tool picker (we draw our own rail in Pitaya's language) · a
Procreate clone (borrow the grammar, not the app) · any surface where the
AI grades or comments on his written answers · any AI that speaks for God
about his life.

### 9. Deliverables, in the order he needs them

1. **Sunday first:** the Sermon layout (Bible over Reference | Notebook)
   live; the Sermon page mid-sermon with the recording chip; the replay
   state; the closing confirm card; the Recordings library; the Church
   card on a Sunday.
2. **The Bible pane:** Study mode and Scratch mode on the same chapter;
   highlighter tap-number + drag; circle → multi-verse → **both action-bar
   options**; hover rail; ref-card in flight; margin ink glyph; reference
   popover (peek + full); pen-settings popover; dark + night.
3. **The Desk:** Study layout, three-pane state, layout picker, Flip,
   portrait, compact, lefty default + righty mirror.
4. **The Notebook:** shelf, page list, a Study page, tool rail + brush
   picker + palette editor, lasso menu, transcribe confirm card, live
   reference underline, phone read-only view.
5. **Worksheets:** the family + Submit + the Question-step answer box.
6. **Settings additions.**
7. If the round has room: **Memory "write it out"** (write the verse from
   memory with the pen, then see the text beside it — never scored) and
   the **Term reflection** page.

**Start by showing me three screens:** (1) the Desk in the Sermon layout
mid-sermon, (2) the Bible pane in Scratch mode beside the same chapter in
Study mode with the highlighter in use, (3) the Notebook's tool rail and
palette open over a Study page. Then we iterate.

**Export note:** please export **per screen** (the phone canvas already
exceeds the 256 KiB read cap of the import tool). Icons and marks must be
real vectors in the file — the build extracts them verbatim.

