
The five iPad screens you designed are right — the lefty desk, the
highlighter-only rule, Scratch's frozen page with ink anchored per verse,
the rail on the seam edge, the free palette, the guided study reusing the
phone's step machine. **Do not redesign those screens.** This round makes
two fixes and closes eight gaps the build needs before it can start. Same
system as everything else: Familjen Grotesk + Instrument Sans, raspberry
`#A63D63` family, white cards on `#F2F1F2`, Literata for Scripture,
light / dark / night. Frame: 11" iPad Air, **1180 × 820 pt landscape
(primary)**, 820 × 1180 portrait, ~500 pt compact. Apple Pencil Pro. The
user is **left-handed** (handedness is a setting; show the lefty default,
mirror where it matters). The six category colors are fixed: God `#D9A23E`
· Promise & Covenant `#4C7DBF` · Command `#3E7A54` · Sin & Consequence
`#B4533F` · Christ `#7B5EA7` · Context `#4E7C8A`.

### Fix 1 — Home is a mini-hub (ratified)

Spirit as the iPad's front door is confirmed. Refine **00 - Home** into a
small hub, not a launcher:

1. **Top: the Spirit desk resume cards** as you have them (Study at its
   step · Sunday's page · Free reading) and the notebook shelf.
2. **Then a mini-hub row of 3–4 glance widgets** — each one number and
   a small trend, tap → opens that section's main app: **Training**
   (this week's sessions / volume, trend spark) · **Eating** (calories +
   macro adherence, 7-day trend) · **Measurements** (weight 7-day average
   and delta, last check-in) · **Journal** (a quiet slot, "if we keep
   it"). Until Health-on-iPad is designed (a later round), tapping a
   widget opens the existing phone layout in a compact pane — design
   that transition once.
3. **The right-hand rail** (yours from round 1) must list **Food** and
   **Settings** as well (Settings is where handedness, pen defaults and
   recording consent live — it has to be one tap away); "Trends" can stay
   as the name of the future Health round; Journal stays quiet.
4. Keep your rule that **undesigned sections open the phone layout in a
   compact pane** — say it on the screen's annotation so the build never
   restyles Food or Today on iPad by accident.

### Fix 2 — two small corrections (only where round 1 doesn't already show them)

- The Bible's **action bar must come in two options, side by side**: (A)
  pen-positioned beside the tip, (B) fixed in the upper-right of the
  Bible pane. Contents: Highlight (six labelled chips) · Note · Send to
  notes · Link · Memorize · Ask · ⋯ (copy with attribution, open in Logos).
  He will pick one after seeing both.
- **Settings** reachable from the Home rail and from the pen-settings
  popover ("All pen settings →").

### Gap 1 — THE BIBLE INK OVERLAY: "my notes on the Bible" (the biggest one)

He wants to **freely scribble on the Bible** — not only underline and
circle, but write a sentence in the margin, draw an arrow from verse 3 to
verse 7, bracket a paragraph, jot a word between lines — the way a
physical study Bible fills up over years — **and bring that layer in and
out at will.** Round 1's Scratch mode is the start of this: make it a
first-class **Overlay** and design it fully:

1. **The overlay is an ink layer over the whole Bible page** (margins,
   between lines, over the text), drawn with the **same tools as the
   notebook** — the pen follows the pane: brush, color, width come from
   the rail; pressure and tilt respected. **Marks like underline and
   circle are simply ink in this layer.** The highlighter stays the only
   thing that creates a highlight (round-1 rule).
2. **Room to write — the wide-margin (journaling-Bible) layout.** When
   the overlay is on, the page can widen its writing margin (a slider or
   three steps: none · wide · wider). **The margin sits on the side the
   writing hand can reach without covering the text — follows the
   handedness setting: left margin for a left-hander, right for a
   right-hander.** Show both.
3. **Visibility: show · dim · hide** — a finger control in the pane header
   (an eye), so he can read clean text and bring his notes back. Hiding
   never deletes. Show the three states on one chapter.
4. **Layers:** one overlay per chapter by default ("my layer"), plus
   context layers he can switch to — *this study*, *this sermon* — shown
   as a small layer chip in the pane header. Design the chip, the layer
   list, and a chapter with two layers (his layer + this sermon's).
5. **Layout rules carried from round 1:** while a chapter has overlay ink
   its layout stays frozen (aA locked while pinned); ink is anchored per
   verse so a future re-layout moves it with its verse. Show the "pinned"
   affordance and what the type-size control says when locked.
6. **Where his ink is:** the chapter navigator / book shelf shows a small
   pen dot on chapters that carry overlay ink; the Transcript does not
   (no scorekeeping — it is a finding aid, not a stat).
7. **Reading it elsewhere:** the phone Reader renders the overlay
   read-only with a toggle (one phone artboard); PDF export of a chapter
   carries the ink.
8. **Lefty, landscape, real density:** design the main screen with a
   chapter that carries a few weeks of his writing — margin notes in his
   purples and light blues, an arrow between verses, a bracketed
   paragraph, a circled word — at a density that is still readable. Then
   the same chapter with the overlay hidden.

Design: overlay ON (wide left margin, lefty, dense ink) · dimmed · hidden
· the margin control · the layer chip + list · the pinned/aA-locked
affordance · the pen dot in the chapter navigator · the phone read-only
view · dark and night with overlay ink (ink keeps its color; paper goes
dark).

### Gap 2 — Sunday's second half

The recording control exists; the states around it don't:

1. **Replay state** — a stroke tapped → it highlights, a playhead appears
   on the recording's timeline with the waveform, and the **transcript
   line for that moment** shows beside it; scrub; "play from here";
   stop. Show it on the Sermon page from round 1.
2. **Closing confirm card** — when he closes the page: the ink
   transcribed to a text layer (collapsed preview), the **references
   found** as rows, each with a proposed action ("Gal 3:1 beside
   'bewitched' → keep as a Connection?"), an outline summary, and the
   series week update — **keep / edit / discard per row, nothing saves
   until confirmed.** Design it in the app's proposal-card shape.
3. **Recordings library** — the list (date, series, preacher, passage,
   duration, status: transcribing · ready, label) and **one recording
   open**: player, transcript, the linked page alongside; rename, label,
   delete.
4. **The Church card on a Sunday** — "Take notes" first, before the
   sermon; after it: "Sunday's page closed · 3 questions carried · next
   week prepped."

### Gap 3 — Bible pane states that are still missing

- **Circle → multi-verse selection:** the loop across several verses, the
  resulting selection (verse range named), and the action bar in **both**
  options (Fix 2).
- **The reference popover, Logos-style:** peek (the reference line) →
  full (the verse text + "Open in the reference Bible") — from a crossref
  letter, from a reference card, and from a reference he wrote in his
  notes (the live-link underline from round 1).
- **The margin ink note in Study mode** (when the overlay is off and a
  gesture evaporates): a small ink glyph in the margin, collapsed and
  expanded, kind proposed.
- **Dark + night** versions of the Bible pane with selection, highlights
  and overlay ink.

### Gap 4 — Notebook states

- A notebook's **page list** (thumbnails, dates, linked passage, a
  recording dot).
- The **lasso menu**: move / resize · convert to text · make this a note
  (anchor to the nearest ref-card or pick a verse) · copy as image.
- The **transcribe confirm card** (what I read · references found · keep
  / edit / discard) — same shape as Gap 2's closing card, smaller.
- **Dictation landing at the cursor** from the rail's mic; the
  **recording chip** states on a page (attached · playing).
- The **phone read-only page view**.

### Gap 5 — Worksheets: every study has a written assignment

Homework comes in six kinds — sit · read · research · write · compare ·
ask — one per study, and on the iPad **every study also carries a written
assignment, short or long** ("a university for the working Christian who
doesn't have time for seminary but dabbles on weekends"). A worksheet is
**form-like with freedom**: prompts as section heads, ink or typed
answers anywhere, notes and comments welcome, and a **Complete / Submit**
button at the end — **never auto-ticked**; he can leave and return before
submitting. AI never grades or comments; Ask exists on his tap only.

Design the family, one sheet each, in the same grammar:
- **sit** — the carried question at the top; a short "one line before
  bed" trace.
- **read** — the second passage opens in the Bible pane; "what does this
  complicate?" + a few lines.
- **research** — *Find one thing out:* the thing · where I found it (Logos
  in Split View) · one line · **a sketch area** (a map, a timeline, a
  floor plan).
- **write** — *Leave a trace:* the prompt on a lined page; the
  one-paragraph rule as a gentle line count.
- **compare** — **two columns** (ESV | KJV/BSB in-app; NBLA stays in
  Logos) with a margin column for "what shifts."
- **ask** — the question · who · what they said.
- **Where it lives:** the study's homework step (step 6) gets "Open the
  worksheet →"; the Sunday page gets none (the sermon page is the
  sheet). Show the **Submit** affordance, the **submitted** state, and
  **reopening** before submit.
- Optional if the round has room: **Term reflection** (prompted by his
  own open questions) and **Memory "write it out"** (write the verse from
  memory with the pen, then see the text beside it — never scored).

### Gap 6 — Desk states not yet drawn

- **Portrait, stacked** (820 × 1180): text above, notebook below, the seam
  between, the rail adapting.
- **Compact** (~500 pt, Split View beside Logos): the phone screen,
  untouched, inside the pane.
- **The right-handed mirror** of the Sermon desk if round 1 shows only
  the lefty.
- Optional: a **Source pane** in the three-pane layout (a Calvin passage
  beside the Bible, citation chip tappable) — Logos-style reading.

### Gap 7 — Settings additions (one artboard)

Handedness · default Bible mode (Study / Scratch) and **overlay defaults**
(margin width, visibility, default layer) · pen defaults + saved palettes
· recognition language per notebook (sermon Spanish, notes English) ·
recording consent + storage · layout presets. Small, inside the existing
Spirit settings.

### Gap 8 — Export (not a screen, but the build cannot start without it)

The repo's build tool can only read **design-system-type** projects. When
this round is done, **export every screen — round 1's five as well — as
individual `.dc.html` files he can download** (each under 256 KiB), or
place the whole canvas in a design-system project. Name them in the same
series: "Pitaya iPad 05 - Bible Overlay", "06 - Sunday Replay +
Recordings", "07 - Bible States", "08 - Notebook States", "09 -
Worksheets", "10 - Desk States", "11 - Settings", and "00 - Home" revised.
Icons and marks must be real vectors in the files — the build extracts
them verbatim.

### Still true from round 1

Handedness is a setting, default left · the pen tool never creates a
highlight and never moves a seam · nothing floats over text · every stroke
timestamps against an active recording · the AI's only new behavior is
the confirm card (nothing saves until confirmed), it never grades or
comments on his answers, recognition language per notebook · no "behind"
counters or pressure surfaces · Journal deferred, Health-on-iPad later, no
reference browser, no stock PencilKit picker, no Procreate clone, no AI
verdict surface anywhere.

**Start by showing me three screens:** (1) the Bible with the overlay ON —
wide left margin, a few weeks of his ink, lefty — and the same chapter
hidden; (2) the Sermon page in the replay state; (3) the `write`
worksheet with Submit. Then the rest.

