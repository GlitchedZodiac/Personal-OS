# Spirit — Design round 2 (gap pass, paste-ready)

Surgical follow-up to the Spirit screens already in this project. Paste
everything below the line. Findings it addresses are logged in
docs/spirit-journal-plan.md; the round-1 review verdict lives in the
main-lane chat (2026-08-13).

---

The **Spirit** section you designed is right — the study system, the term
structure, the voice ("written before you woke," "a shelf, not a debt")
all stand. **Do not redesign those screens.** This round closes six gaps
and makes two small fixes. Same system as everything else: Familjen
Grotesk + Instrument Sans, raspberry `#A63D63` family, white cards on
`#F2F1F2`, push-in drill-downs, iOS frame. The six highlight-category
colors are fixed and already in the design: God `#D9A23E` · Promise &
Covenant `#4C7DBF` · Command `#3E7A54` · Sin & Consequence `#B4533F` ·
Christ `#7B5EA7` · Context `#4E7C8A`.

### Fix 1 — Spirit home, deduplicated

The home currently shows Memory twice, Notebook twice, and the Syllabus
twice. Keep: header + weekly-verse banner, the dark University card,
the 2×2 quick grid, the Sunday follow-along card, Track 2, and the
Transcript mini-map. **Delete the second Memory/Notebook card row and
the THE TERM/LIBRARY card row** (the grid and University card already
cover them; Library moves into the quick grid in place of "Ask
anything"). One screen, no duplicates.

### Fix 2 — two small corrections

- The Reader's **Legend pill** must preview three REAL category colors
  (e.g. gold, blue, purple from the list above) — not colors outside the
  system.
- "Ask" is **anchored to a passage, never floating**: any Ask entry
  point outside the Reader routes into the Reader with a verse picker,
  and the design should make that visible (the sheet header always names
  the verse it's anchored to).

### Gap 1 — Reader typography + dark mode (the biggest one)

The Reader is the product and it came back light-only, sans-serif, with
no controls. Design:

1. **The reading face**: a serif for Scripture text (pick one that pairs
   with Familjen Grotesk headers), ~1.6–1.75 leading, comfortable
   measure.
2. **The type settings sheet**: text size (5 steps), serif/sans toggle,
   justified + hyphenated toggle, and theme: light · sepia · **night**.
3. **The Reader in night mode, fully designed** — true dark reading
   surface (not inverted), highlight tints and category bars re-tuned
   for dark, and the whole action-bar sheet in dark. Show Judges 4 in
   night mode side by side with light.

### Gap 2 — Linked bilingual mode (built for this specific user)

He reads English and Spanish. Design the Reader's **two-pane linked
mode**: ESV and Spanish locked to the same verse — scrolling one moves
the other, a verse selected in one highlights in both. Phone = stacked
panes with a center grab handle; landscape = side-by-side. Design the
toggle (a quiet `ESV ⇄ NBLA` pill in the Reader header) and both
layouts. His notes and highlights attach to the verse, so they render
in both panes.

### Gap 3 — Audio

ESV audio exists per passage. Design: a small play affordance on the
Reader header and on the day's reading card; a **mini-player** docked
above the tab bar (play/pause · verse back/forward · speed · dismiss);
and the Reader's **follow-along state** — the currently-read verse
subtly emphasized, no bouncing karaoke.

### Gap 4 — Reference tooltips (the most-used gesture)

Cross-references render as superscript letters inline in the verse text.
Design the two-state popup: **tap once** → a compact bubble with the
reference line ("See ch. 11:14"); **tap again** → the bubble expands to
the actual verse text with an **Open** action. Also style inline
translation-footnote markers distinctly from cross-reference markers,
and keep machine references visually distinct from his own hand-made
links (which are precious).

### Gap 5 — Poetry

Scripture that is poetry must not read as prose. Design **Judges 5 (the
Song of Deborah)** in the Reader — stanza breaks, hanging indents on
wrapped lines, couplet spacing — and one Psalm with a psalm-title
header. Poetry must work with highlights and the action bar exactly like
prose.

### Gap 6 — the four stubbed screens, designed for real

1. **Passage Notebook** — his layer, one screen: filter chips by note
   kind (Observation · Question · Connection · Conviction · Doctrine)
   and by highlight category; entries grouped by passage with the verse
   inline; his verse links with their reasons; his passage-anchored Ask
   exchanges; **an Open Questions view** (questions not yet resolved,
   each showing where it will resurface); one search field across all of
   it.
2. **Memory deck** — the by-occasion library (the gospel · assurance ·
   suffering · doubt · sovereignty · forgiveness), the review-due state,
   and **the review card itself**: occasion on the front ("someone says
   God can't be good with this much suffering — which verse do you reach
   for?"), verse revealed, got-it / show-again. Plus the **weekly
   review** (two minutes: this week's marks, open questions, the verse)
   and the **end-of-term summary** that files into the Transcript.
3. **Church series entry flow** — "My church started a series": three
   equal inputs (speak it · photograph the slides · paste a transcript),
   then the **parsed draft for confirmation** — series title, expected
   length, passages, themes, each editable — then the confirmed Sunday
   track card. Design all three steps.
4. **Settings & ownership** — one quiet screen: translation +
   posture control, **Export everything to Markdown** (one button),
   **curriculum pause** (guilt-free, visible), and the term-generation
   moment ("Preparing Term 3 — 42 studies" as a one-time visible batch,
   never a nightly shimmer).

### Still true from round 1

No badges, no streaks-as-pressure, no "days behind" counters, no AI that
initiates or assesses him, every quotation tappable to its source, and
maps/images only in service of the day's teaching.
