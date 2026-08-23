# Pitaya · Spirit on iPad — V2 design prompt

**How to use this:** paste everything below the line into Claude on the design
surface. It is written to stand alone — you do not need to open the V1 files
first, though they are listed at the end and Claude should read them before
proposing changes to a screen that already exists.

**Why there is a V2 at all:** V1 was designed before the app existed. It was a
good guess and most of it survived contact. This brief is written *after* a week
of real use on real hardware with a real Apple Pencil, and it is mostly about
one thing V1 could not have known: **the chrome is eating the page.**

---

# Pitaya · Spirit on iPad — V2

I have been using this app daily for a week on an iPad Air 5 with an Apple
Pencil, writing real Bible study notes in it. It works. The ink is fast, the
Bible is there, the layouts do what I want. What I keep running into is that the
*furniture* of the app is taking space and attention away from the two things I
actually came for: **the text I am reading** and **the page I am writing on.**

This is a refinement pass, not a reinvention. Keep the identity exactly. Fix the
economy of the screen.

## The brand — unchanged, do not redesign

**PITAYA** · *"It's just you. Prove it."* · mark = a 45°-rotated square (diamond)
in raspberry.

| Token | Hex | Use |
|---|---|---|
| bg | `#F2F1F2` | app background |
| bg-raised | `#FAF9FA` | subtle raised zones |
| card | `#FFFFFF` | cards, panes |
| ink | `#232227` | primary text |
| ink-secondary | `#66646C` | secondary text |
| ink-muted | `#96949B` | muted text / icons |
| hairline | `#E4E2E6` (also `#D9D7DC`) | borders |
| primary | `#A63D63` | raspberry — actions, active states, the mark |
| primary-deep | `#8C2F51` | pressed / emphasis |
| accent-bright | `#DC74A0` | links, live states |
| tint | `#F6E3EB` | pink chip fills |
| success | `#5E9B72` | positive |
| paper | `#FFFDF9` | the notebook page itself |

Display type **Familjen Grotesk** 500–700; body/UI **Instrument Sans** 400–600;
micro-labels 11–12px uppercase, letter-spacing ~0.14–0.2em, 600. Pills for
everything interactive (radius 99). Cards 12–18px radius, hairline borders,
minimal shadow. Scripture is set in a serif at a genuinely readable size — that
is the one place the app should feel like a book, and it is currently right.

Nothing above changes in V2.

## What the app is

A study desk for one person. Landscape iPad, split into panes. Typically a
**notebook** page on one side and the **Bible** on the other, sometimes with a
third **reference** pane stacked under the Bible. A strip of saved tab
arrangements across the top (Bible · Notebook | Bible · Notebook · Bible |
Reference · Notebook | Bible/Reference). I write with the Pencil directly on the
notebook page and directly *over* the scripture — circling words, underlining,
margin notes — and that ink stays anchored to the verses.

Hardware truth, because V1 assumed otherwise in places: it is an **iPad Air 5**
with an **Apple Pencil 2**. There is **no hover**, **no squeeze**, **no barrel
roll**, and **no haptics** (no iPad has a Taptic Engine). Double-tap on the
barrel works. Design nothing that depends on hover or squeeze.

## The V2 thesis

**Chrome should cost nothing when I am not using it.**

Right now every pane carries a permanent header of 6–10 controls, the notebook
carries a permanent vertical rail of tools, and the desk carries a top bar plus
a tab strip. Stacked up, on a 1180×820 screen, the furniture is taking something
like a fifth of the glass — and most of those controls are things I touch once a
session, sitting permanently next to things I touch constantly.

I want the opposite economy: **the page and the text get the room; the tools
come to me when I reach for them, and get out of the way when I don't.**

## What is wrong, specifically

### 1. Too many icons, permanently visible

The notebook's vertical rail had eleven buttons. I have already had two removed
(a lasso "Select" tool I never used because I select by holding and dragging,
and a "Verse" reference-card button I never used because I drag verses over
instead), and two more moved to the top bar (camera and microphone — those are
things I *add* to a page, not things the pen *does*).

What is left is right in *kind* — brush, highlighter, eraser, hand, text, undo,
redo, size, opacity, colour — but it is still a permanent column of chrome down
the middle of the screen, and the size/opacity sliders at the bottom are so
short they are hard to set precisely with a pencil tip.

**Design question for you:** does the rail need to be permanently visible at
all? What would a tool surface look like that is instantly reachable, never
covers the page, and does not occupy a fixed column?

### 2. The pen menu is in the wrong place

To change my pen I tap the pen icon in the **top-right corner of the desk**,
which opens a popover **over the Bible**. My hand is on the left, on the
notebook. It is the single most-used control in the app and it is the furthest
thing from my hand.

**What I want:** double-tap the pen tool where my hand already is, and the pen
settings open *right there* — nib, colour, width, opacity. And a **small colour
dot** I can tap for a fast colour change without opening anything at all.

Note that single-tap already means "select this tool", so the double-tap has to
coexist with that. Show me how you'd resolve it.

### 3. The nav should be at the top, and thinner

The desk bar and the tab strip are two separate horizontal bands. I would rather
have one band at the very top holding everything, so the panes start higher and
I get the maximum possible page height. Show me how thin this can get while
still being pencil-tappable.

### 4. The per-pane headers are overloaded

Each Bible or Reference pane header can be carrying: the pane kicker, the
passage title, a "JONAH 2:1 SELECTED" chip, a "TEXT SIZE LOCKED" chip, a layers
pill, undo/redo, an eye, HIDE / DIM / SHOW, a margin-width button, a split-view
button, and a STUDY / SCRATCH toggle. On a stacked pane that is more controls
than the pane is wide, and they used to fall off the right edge.

Most of these I set once and never touch. **Which of these genuinely belong in a
permanently visible per-pane header, and which should live in a menu?** I would
rather have a clean pane with a title and one affordance than a control strip.

### 5. Status chips that explain nothing

I had a chip that said "PAGE PINNED" with a permanent footer note underneath it
on *both* panes. I had no idea what it meant. (It turned out to mean "the text
size control is locked so reflowing the text can't move your ink off the words".
It is now called TEXT SIZE LOCKED and the footer is gone.)

The lesson generalises: **a status chip that needs a footnote is a design
failure.** Look for others. Anything in the app that is telling me about its own
internal state should either explain itself in the words on the chip, or not be
on screen.

### 6. Portrait was an afterthought

Landscape is my primary posture and should stay primary. But portrait exists and
should be coherent, not a squeezed landscape.

## What to design

Please produce, in the existing `.dc.html` idiom (1180×820 for landscape, plus
820×1180 for the portrait screens), with all icons as inline SVG:

1. **The desk chrome, V2** — one top band. Show it at rest, and show every state
   it can be in (a tab being renamed, a layout menu open, a capture action
   running). Give me the exact height you are proposing and defend it.

2. **The tool surface, V2** — whatever replaces the permanent rail. Show it
   collapsed, expanded, and mid-use with a pen in hand. Show it on both sides
   (I am right-handed but the desk can flip). Include the size and opacity
   controls at a size a pencil tip can actually land on.

3. **The pen menu in place** — the double-tap-to-open interaction, the quick
   colour dot, and the full nib/colour/width/opacity surface. Show where it
   anchors relative to the tool it came from, and what happens near a screen
   edge.

4. **The pane header, V2** — a clean Bible pane, and the same pane with
   everything switched on, so I can see that the busy case still reads. Show
   your proposed menu for the controls you demote.

5. **A full desk, at rest** — Notebook | Bible, nothing selected, no menus open.
   This is the screen I look at for hours; I want to see how much page and how
   much scripture V2 buys me versus V1. Put a number on it.

6. **A full desk, in use** — a verse selected, ink over the scripture, the pen
   menu open, a reference card on the notebook page. The honest busy state.

7. **Portrait** — the same desk, designed rather than squeezed.

## Constraints — please respect these

- **The scripture column is sacred.** Do not shrink the serif, tighten its
  leading, or crowd it to win space. Take the space from chrome.
- **Everything is pencil-first.** Minimum comfortable target for a Pencil tip is
  larger than for a fingertip on a phone; assume I am also resting my palm on
  the glass.
- **No hover states as the only affordance.** This hardware has no hover.
- **No haptic-only feedback.** This hardware has none. Every acknowledgement
  needs to be visible.
- **Ink over scripture must survive reflow.** Anything you design that changes
  the text column's width has to answer: what happens to the circle I drew
  around a word?
- **Keep the tab-arrangement model.** Saved multi-pane arrangements swiped
  across the top is the best thing about the app and works exactly as I hoped.

## What is already fixed — do not redesign these

Recent build, all working: the ink engine and Pencil responsiveness; a partial
eraser that cuts a stroke instead of deleting it whole; live pinch-to-zoom;
a Bible navigator (book grid, chapter grid, type-ahead like "jn 3" or "rom
8:28"); a floating audio transport pinned to the bottom of the screen;
hold-and-drag to send a verse to the notebook; tapping a reference card to jump
the Bible to that verse.

## The V1 archive

`docs/design/pitaya-ipad-00-home` through `-11-settings` (`.dc.html`), plus
`pitaya-tokens.md` for the full token set and `pitaya-app.dc.html` for the phone
app's language. Read the screen you are revising before you revise it — V2 is a
refinement of these, and where V2 departs from V1 I want the departure to be
deliberate and called out, not accidental.
