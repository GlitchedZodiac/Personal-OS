# Pitaya · Spirit on iPad — V2: five decisions before the design run

**How to use this:** answer each decision (a letter is enough), then paste this
sheet **together with** `pitaya-ipad-v2-design-prompt.md` into Claude on the
design surface. Every decision ends with the line the prompt gains once you've
chosen. If you skip one, the designer guesses — and these five are exactly the
guesses that are expensive to reverse in code.

They're ordered by cost-of-guessing-wrong, not by how interesting they are.

---

## ANSWERED — Michael, 2026-08-29

1. **A — Freeze.** His words: "when I circle on the Bible think of it as it
   being like a layer on top of the Bible or that page." Ink is a layer over a
   printed page; the page never re-breaks under it. The overlay-drift deferred
   fix is now DELETED, not built: enforce freeze-at-first-ink instead.
2. **Thin, no separate focus mode.** ("Zero-chrome" = a Procreate-style state
   where every toolbar/header hides and only paper + scripture remain — not
   web-vs-app.) He didn't ask for the mode; the V2 sermon-desk design answers
   it his way: chrome pared to one 36 pt band, no hidden state. Revisit only
   if he asks after living with the band.
3. **A — The roll, dressed as a journal.** His words: "think google docs
   pageless."
4. **A — The pen case, and the case is exactly: ballpoint · brush/G-pen ·
   sketch pencil, plus highlighter and eraser as tools.** Those five are the
   whole instrument set.
5. **Portrait = single-screen, swipe-driven.** One pane at a time (notebook or
   Bible; a stacked pair only if it stays simple), with **two-finger
   left/right swipes switching tabs, the way Logos does it.** Not a shrunken
   desk.

---

## 1 · When ink lands on scripture, do the words ever move again?

The circle you drew around "God" in Jonah 2:1 that ended up around "Then Jonah
prayed" is this decision wearing a bug costume. A stroke today anchors to a
verse plus a pixel offset — vertical reflow works, horizontal reflow
structurally cannot. The fix depends entirely on what you decide scripture *is*.

- **A · Freeze (print).** The first stroke freezes that chapter's layout at
  that width. A narrower pane scales it like a page of a PDF — legibility
  floor, then pan. Your ink is *exactly* right forever; the drift bug is
  deleted by prohibition rather than fixed. Cost: a marked chapter in a skinny
  stacked pane reads optically smaller, and Aa / margin-width disable per
  inked chapter (the TEXT SIZE LOCKED chip becomes a coherent identity instead
  of an apology).
- **B · Reflow (stream).** Text always at full reading size at any width; ink
  re-drapes onto its words best-effort (per-word anchoring, ~90 min plus
  forever-maintenance). A circle around one word survives; brackets and
  anything spanning a line break degrade to *approximately* where you put it.
- **C · Hybrid.** Aa may reflow (per-word anchored), width stays frozen. Ships
  BOTH mechanisms — the most total work, not a compromise.

**Recommendation: A.** A wide-margin Bible is trustworthy precisely because
the words never move — writing in it is a commitment. Wrong ink *lies about
scripture*, which attacks the app's one promise; smaller text just reads
smaller until you close a pane.

> Paste on choosing A: *"An inked chapter freezes like print at the width it
> was inked; narrower panes scale it, never re-break it. Show me the margin /
> Aa / split affordances on a frozen chapter."*
> On B: *"The column always reflows; ink re-anchors per word, best-effort —
> design the affordance that admits this honestly."*

---

## 2 · Is there a zero-chrome state — and what brings the chrome back?

The V2 prompt asks for *thinner* chrome but never asks whether **zero** chrome
is a state of the desk, which is the thesis's own ceiling. And the recall
affordance is a hardware decision: no hover, no haptics, and a mis-aimed
recall tap draws ink.

- **A · Explicit focus toggle.** Everything hides except one small persistent
  nub that restores it; a four-finger tap as an accelerator, never the only
  way back. Procreate's economy under your own law.
- **B · No hidden state.** Chrome only gets thinner. Nothing to learn, but the
  at-rest cost never reaches zero.
- **C · Auto-hide on pen contact.** Zero ceremony — and it is the vanishing-UI
  pattern you already outlawed on the audio dock.

**Recommendation: A**, with the rule handed to the designer as one sentence:
*"chrome may leave the screen only when I dismiss it, and one small visible
thing always brings it back."*

---

## 3 · What **is** the notebook page — roll, book of sheets, or free canvas?

"Think Procreate and journal" names two incompatible page models, and the code
ships a third: a fixed-width page that grows downward forever, zoom floored at
fit-to-width (your own ask — "the page should cover the whole thing"). A
designer hearing *Procreate* draws a free canvas, which silently un-ships that
fix. A designer hearing *journal* draws page turns, which break mid-sermon.

- **A · The roll, formalized.** Fixed width, endless height, *dressed* as a
  journal — faint page-break rules, paper feel, section marks. Zero engine
  change; export slices into sheets. The page never has a true edge.
- **B · Book of sheets (GoodNotes).** Discrete paper-shaped pages stacked in
  one scroll, explicit "add page", real page numbers and honest thumbnails.
  Costs the auto-grow rewrite plus a migration for your existing tall pages.
- **C · Free canvas (Procreate proper).** Open zoom both directions. Reverses
  the dead-margin fix by construction; highest cost, least journal.

**Recommendation: A.** You studied on the endless page for a week without once
asking for a page edge. Tell the designer plainly: *Procreate in this brief
means how the tools feel and summon, never the canvas model; the zoom floor is
settled; a sermon must never hit a page boundary.*

---

## 4 · Is the pen a **case of pens**, or a tunable instrument with sliders?

The prompt's screen-2 deliverable currently *orders* pencil-precise size and
opacity sliders — which presumes the answer and re-requires the exact chrome
you're complaining about. (That line is now conditional in the prompt.)

- **A · The pen case.** 3–6 saved pens — nib + colour + width + opacity as one
  object. The colour dot cycles the case (or opens it); full tuning and
  "save as new pen" live one tap down inside the pen menu. The scrunched-
  slider problem is *deleted*, not fixed.
- **B · Tunable tool (status quo).** Resident SIZE/OPAC sliders that must be
  permanently visible AND pencil-precise — the complaint restated as a
  requirement.
- **C · Hybrid.** Case at rest, Procreate-style edge sliders only while the
  pen menu is open. Both grammars, more states, risks being neither.

**Recommendation: A.** A person owns a few pens, not a mixing desk — and it's
the natural end of the motion you already started when the rail was trimmed to
"things the pen does." Procreate keeps live sliders because artists retune
every minute; you study with the same pens every day.

---

## 5 · What is portrait **for**?

The prompt asks for portrait "designed rather than squeezed" but never says
what rotation *means* — which delegates a posture decision disguised as
styling. Nothing in seven rounds of feedback says what you do when you rotate;
only you know.

- **A · The reader.** Rotation closes the desk and opens the book: one
  full-bleed scripture pane, true book margins, chrome near zero, margin
  marking still live, the notebook a swipe away. The tool surface only ever
  has to solve landscape. Pairs with 1-A so an inked chapter scales like
  print.
- **B · Stacked mini-desk (current).** One coherent app both ways — and the
  chrome problem twice, on half the glass.
- **C · The writing page.** Full-width notebook, Bible as a pull-over sheet.
  Presumes you write in portrait, which nothing observed supports.

**Recommendation: A.** Writing is a landscape act — palm down, split desk. An
upright tablet in a chair or a pew is for reading. Give rotation a job.

---

## Two more the designer will otherwise guess

**6 · Nothing persistent sits ON the paper.** The prompt hands the designer an
impossible triple ("instantly reachable, never covers the page, no fixed
column") — something must give, and *which* is identity: drawing apps float
palettes over the canvas; a journal never has anything sitting on the paper.
Recommend making it law: *nothing persistent on the page; transient surfaces
(summoned by me) may overlap it.* It also keeps the tool layer out of the ink
canvas's pointer pipeline, where seven rounds of blood went.

**7 · How the pen menu opens.** You asked for double-tap. Know the cost: a
timed second tap forces a ~300 ms delay onto *every* tool selection and races
the shipped 480 ms hold on the same 38 px button. Procreate's own answer to
this exact collision is **tap-again** — tap an inactive tool to select it, tap
the *active* tool to open its options. Timer-free, and the muscle memory of
every drawing app you use. (The Pencil *barrel* double-tap is unaffected
either way — it toggles the eraser, shipped and working.) Your call, made
knowingly.

---

## Already settled — don't let the designer reopen these

- Barrel double-tap = pen ⇄ eraser (native, honours your iPadOS setting)
- Fit-to-width zoom floor on the notebook (your ask, shipped round 7)
- The tab pills stay permanently visible — your words: best thing in the app
- The ink engine stays web; no PencilKit swap ("the pen works great now")
- The eraser cuts at the nib (partial erase, shipped)
- Two-finger tap = undo, three = redo (shipped, palm-guarded)

**Optional scope lines** worth adding so silence isn't an invitation: *"V2 is
light appearance only — night reading is a later pass"* and *"the notebook
page list / shelf is out of scope for this run."*
