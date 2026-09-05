# Pitaya · Spirit on iPad — V3 design prompt

**How to use this:** paste everything below the line into Claude on the design
surface. It stands alone — you do not need the V1/V2 files open, though they are
listed at the end and Claude should read a screen's slice before revising it.

**Why there is a V3:** V2 was about the chrome eating the page, and it worked — the
one-band desk and the seam toolbar shipped and feel right. V3 comes from something
V2 could not have known either: **a real evening of use at a Bible study group.**
The chrome earned its keep; what showed its seams was the *note-taking model
itself*, the *feel* of touching things (menus, dismissal, motion), and a menu row
that has accreted controls nobody can explain. V3 is about those three things.

---

# Pitaya · Spirit on iPad — V3

I took the desk to my Bible study group and used it for real — notes in a notebook,
scratch in Philippians, references dragged in. I enjoyed it. And it told me exactly
what is wrong, which is a different list than last time.

This is a refinement of the note-taking model and the app's manners, not another
chrome pass. Keep the identity exactly. Keep the V2 band and the seam — they just
landed and they are right.

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

Display **Familjen Grotesk** 500–700; body/UI **Instrument Sans** 400–600; scripture
in **Literata** at a genuinely readable size; micro-labels 11–12px uppercase,
0.14–0.2em, 600. Pills for everything interactive (radius 99). Cards 12–18px radius,
hairline borders, minimal shadow. None of this changes.

## Where the app actually is now (so you design against reality)

Since V2 shipped: one 36pt top band (tabs, capture, clock); the pen case lives in
the 40pt seam between panes; the Bible pane's **frozen header** carries navigation —
the passage title opens a book/chapter picker, with ‹ › chapter steppers beside it;
every tab remembers its own Bible position, its own reference position, and its own
notebook page; the selection action bar is a floating dark pill (option A — the
in-header option B is being retired). A hymn library and more translations
(KJV, WEB, Reina-Valera) are being built alongside this design round.

## The V3 thesis

**A note is *about* something.** V1/V2 treated my notes as free-form ink beside the
text — margin space. A week of real use says that is not how I think. When I mark
the Bible, I circle a word, underline part of a verse, and what I want next is to
*say something about it* — and later, to find what I said *from the verse*. The
margin was a workaround for not having that.

## What to design

### 1. Verse comments — the centerpiece

My words, as the brief: *"a note is in reference to either a verse — circling a word
or underlining words or part of a verse — then sort of lining up a bubble like a
comment on the page I would type. I think the cleaner way is to actually treat my
Bible notes like that — so it's less free form on the margin space, but instead when
I circle something or underline something, a bubble I can write in appears — like a
small version of the notebook."*

So: **doc-style comments, anchored to my marks.** Circle a word → a bubble opens,
ready to take ink or type. Later, the verse shows that a comment lives there, and
tapping brings it back.

Design the whole model:

- **The birth moment.** I circle/underline with the pen. Where does the bubble
  appear, how fast, and how does it not cover the verse I just marked? Show the
  gesture → bubble sequence frame by frame.
- **Anchoring & collision.** Three comments on one verse; comments on adjacent
  verses; a comment on a circled single word vs a whole verse. Show the collapsed
  state (a dot? a chip on the verse edge?) and the open state, and how open bubbles
  negotiate space without covering scripture.
- **Ink vs type inside a bubble.** It should feel like "a small version of the
  notebook" — can I write with the pencil in it, type in it, or both? Show both.
- **Coexistence.** Bubbles must live alongside the six highlight categories and the
  free overlay ink layer that already exist. What happens to the margin: does it go
  away entirely, shrink, or become the rail where collapsed bubbles queue?
- **Reflow honesty.** The engineering substrate already anchors ink to verses (each
  stroke knows its verse and offset), so bubbles anchor the same way. Design what
  reflow *looks like*: text size changes, pane width changes — the bubble stays with
  its verse. Show the busy case surviving a narrower column.
- **The phone.** These notes will be read on the phone reader later — show a
  read-only bubble treatment at phone width.

### 2. The highlight / action menu, redesigned

My critique: it *"feels small, hard to know what each action does, and not easy on
the eyes."* The measured facts, so you know what you are replacing: a 41px-tall
dark pill of **icon-only** actions (drag-grip, highlight, note, send, link,
memorize, ask, ⋯), where "highlight" is six **unlabeled 10px color dots**, and the
category names (what amber vs blue *means*) are only visible one stage deeper.

Design a selection surface that:
- names things — categories readable at a glance, actions labeled or instantly
  guessable;
- is comfortable for a pencil tip and a resting palm (assume ≥40pt targets);
- scales from one verse to a multi-verse selection;
- and ties into the comment model above — "comment" should be a first-class action
  here, arguably *the* primary one.
Show it at rest, with the categories open, and mid-drag onto the notebook.

### 3. Motion — an animation language, with one hard law

The app barely animates, and where it does, it has been naive. Define the motion
language: how menus enter and leave, how a bubble births from a circle gesture, how
panes resize, how a tab switch feels, durations and easing as tokens.

**The law your motion must obey (engineering constraint, non-negotiable): nothing
that contains ink may ever animate `transform` or `scale` — opacity and clip only.**
We shipped an entrance animation that scaled the page 0.985→1.0 for 380ms, and every
pen stroke made during it was silently stored ~1.5% off-position, permanently. That
class of motion is now banned in code; the design language must be built on fades,
clips, and moves of *non-ink* surfaces instead.

### 4. The Bible header menu — rationalized

*"It's not clear what the Bible menu options do and I think some of them are legacy
and useless."* Correct. A census of all 17 header-class controls was taken; design
from this honest starting point (the retirements are already happening in code):

| Control | Status | Note for the design |
|---|---|---|
| BIBLE ⌄ (pane kicker) | keep, relabel | it secretly swaps the whole pane — nothing says so |
| Title = navigator + ‹ › steppers | keep | gaining a **verse step** this round |
| SELECTED chip | keep | the only statement of what actions will act on |
| **Back** | **new** | after a jump, a labeled pill ("← John 3") returns me to chapter *and* scroll |
| Translation switcher | **new** | ESV / KJV / WEB / RVR-1909 / RVR60 — replaces the decorative "ESV" label; each translation carries a small required attribution line — design it in, don't bolt it on |
| eye HIDE/DIM/SHOW | simplify | it's a *global* pref dressed as per-pane; DIM is rarely useful — consider show/hide |
| MARGIN · NONE/WIDE/WIDER | demote | set-once; also self-overriding (margin auto-appears when margin ink exists) — and if bubbles replace margins (§1), it may retire entirely |
| MY LAYER ⌄ | demote | nothing else in the app ever creates layers; the one useful thing inside ("Clear my ink on this chapter") deserves a better home |
| TEXT SIZE LOCKED | demote | belongs inside the Aa sheet, next to the size it locks |
| ⤺ ⤻ ink undo/redo | keep | but beware: they read as navigation sitting next to ‹ › |
| ESV ⇄ NBLA card | retired | was a non-functional placeholder that broke selection; superseded by the translation switcher |
| ActionBar "option B" | retired | the A/B experiment is over; A won |

Design the header at rest and fully loaded, at full width and at a stacked pane's
narrow width. The V2 principle stands: chrome costs nothing when I'm not using it.

### 5. Dismissal manners

A small thing that colored the whole evening: *"clicking out of anything wasn't
clean."* The rule being implemented in code: **one tap outside closes the topmost
surface, and that tap does nothing else** — never draws, never selects. Your part:
make dismissal *visible* — how does a sheet/menu leave so I trust it heard me?
(Within the motion law of §3.)

## Constraints — unchanged from V2, still binding

- The scripture column is sacred; take space from chrome, never from the serif.
- Pencil-first everywhere; palm resting on glass; ≥40pt targets.
- iPad Air 5 + Pencil 2: no hover, no squeeze, no haptics — every acknowledgement
  must be visible.
- Ink over scripture must survive reflow — anything you design that changes the
  column answers: what happens to the circle I drew around a word?
- Keep the saved-tab-arrangements model, the V2 band, and the seam toolbar.

## What to produce

In the existing `.dc.html` idiom (1180×820 landscape, 820×1180 portrait where
relevant), all icons as inline SVG:

1. **Verse comments** — birth (gesture→bubble), collapsed, open, three-on-a-verse
   collision, and the reflow case. This is the round's headline screen set.
2. **The selection surface** — at rest, categories open, mid-drag.
3. **The Bible header** — rationalized, at rest and fully loaded, wide and narrow,
   including Back, the verse-capable navigator, and the translation switcher with
   its attribution treatment.
4. **A motion spec sheet** — durations, easings, and enter/leave patterns per
   surface class, annotated with the §3 law.
5. **A full desk, in use, V3** — comments open on a marked verse, notebook beside
   it, the honest busy state.

## The archive

`docs/design/pitaya-ipad-00-home` … `-11-settings` (V1), the V2 Sermon Desk
(`Pitaya iPad 01 - Sermon Desk.dc.html`), `pitaya-tokens.md`, and
`pitaya-ipad-v2-design-prompt.md` for the voice of the previous brief. Where V3
departs from them, the departure is deliberate — call it out.
