# Claude-Design Brief — Personal OS Health

**How to use this:** paste everything below the line into Claude (claude.ai,
or the Claude design surface) and iterate. You don't need to prep anything.
When you land on a direction you love, save the outputs — palette values,
type choices, screenshots, generated screens, anything — into
`docs/design/outputs/` (or just paste them into a Claude Code chat) and the
build translates them into the app's design tokens. You can do this any time,
in parallel with all backend work; nothing blocks on it.

---

I'm redesigning my personal health app and I want it in the **Claude design
language** — the warm, calm, editorial feel of Anthropic/Claude's products:
cream and paper backgrounds, warm ink text, a single confident coral/terracotta
accent, a serif for display moments, a clean humanist sans for UI, generous
whitespace, soft depth, nothing clinical or gamified. Think "a beautifully
typeset training journal", not "a fitness dashboard shouting at you".

## What the app is

A single-user mobile-first PWA (installed to my iPhone home screen) that I'll
use for life. One person, my data, my rules. Core loop: I talk to it, photograph
meals, and log kettlebell workouts; it keeps my macros, PRs, and body trends.

The five surfaces that matter (bottom tab bar stays):

1. **Today / Hub** — calories + macros today, workout status, weight trend
   spark, streak; one glance answers "how am I doing today?"
2. **Chat** — the new heart of the app. A conversational AI I talk or type to:
   it logs food/workouts, edits anything ("change lunch to 650 cal"), answers
   ("what's my swing PR?"). Needs: message stream, voice state (recording /
   transcribing), and inline **confirmation cards** — the AI proposes a
   structured log (food items with macros, workout with sets×reps×kg) and I
   confirm/edit/reject before it saves. That proposal card is the signature
   component of the app.
3. **Food** — day timeline of meals with macros, meal-photo analysis flow,
   my personal food library (saved nutrition labels, "my usuals").
4. **Workouts** — kettlebell-first log: exercises with sets × reps × weight,
   **PR celebrations** (tasteful, not confetti-vomit), volume/week, plan view.
5. **Body** — weight + measurements trends, progress photos.

Plus a PIN lock screen (first thing I see — make it feel like opening a fine
notebook, not a bank vault).

## Design system I want out of this session

- **Palette**: light mode on warm paper/cream (not #FFF), warm near-black ink,
  ONE coral/terracotta accent family for actions and highlights, soft success/
  warning tints for macro/goal states. **Dark mode**: warm charcoal (not pure
  black), same accent logic. Give me exact values (OKLCH or hex) for:
  background, surface/card, borders, primary ink, secondary ink, accent,
  accent-on, success, warning, and 4–5 chart series colors that feel of the
  same family.
- **Type**: a serif for display (page titles, big numbers like today's
  calories, PR moments) + a humanist sans for UI/body. Web-safe or Google
  Fonts equivalents fine (e.g. Tiempos-alike serif, Styrene-alike sans).
  Scale: display / title / body / caption with sizes+weights.
- **Shape & depth**: corner radii, border vs shadow philosophy, card style.
  Current app is glassy-dark with 28px radii — I'm open to a full change.
- **Components** (sketch or spec): the AI proposal/confirmation card, chat
  bubbles (me vs AI), stat tile, macro progress (ring? bar? your call), food
  timeline row, workout set row (exercise · 3×8 · 24kg), PR badge/moment,
  bottom tab bar, the floating mic button, PIN screen.
- **Motion**: restraint. Entrances, confirmation success, PR moment.

## Constraints

- Mobile-first (390px), thumb-reachable actions, but it also renders on
  desktop as a wider column layout — don't design desktop-first.
- Information architecture stays (5 tabs + floating voice/camera dock).
- The confirm-before-save flow stays — design it beautiful, don't remove it.
- Accessibility: AA contrast in both modes; the serif never below ~16px.
- It's Tailwind 4 + shadcn/ui under the hood — tokens should map to CSS
  variables cleanly.

Start by showing me: (1) the palette + type ramp on a sample card, (2) the
Today screen, (3) the Chat screen with a food confirmation card in it. Then
we'll iterate from whichever direction feels right.
