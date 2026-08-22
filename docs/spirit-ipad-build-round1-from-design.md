# Spirit on iPad — build round 1 from the design canvas (Claude Design's hand-back, verbatim)

**Source:** pasted by Michael on 2026-08-22 after running
`docs/spirit-ipad-design-prompt-PASTE.md` in Claude Design (project
"Health app design system"). Kept verbatim below the rule; the review
notes above it are the main lane's (same day). The build kickoff proper —
data spine, native tasks, merge preflight — is written separately once
the gaps below are settled.

## Review notes (main lane, 2026-08-22) — read before the build kickoff

**Verdict: a strong hand-back that read the prompt and his answers
faithfully — and five screens against a ~35-state deliverables list.**
The design project ("Health app design system") is NOT reachable from the
repo side: the DesignSync tool lists only design-system-type projects
(Broadsheet · Modernist · Black Sheep Global Design System · Design
System) — so "MCP-synced, no exports needed" is true for Claude Design,
not for us. **Export the five `.dc.html` files into `docs/design/`** (per
screen they should each sit under the 256 KiB read cap) — the PORT GATE
needs a fixed source to diff against and to extract icons from, and this
review could not open the screens. Everything below is read from the
hand-back text; items marked VERIFY may exist on the canvas unmentioned.

**What it got right (keep verbatim):** lefty default + handedness setting
· only the highlighter highlights (tap number = verse, drag = span) · tick
/ strike on suggested marks, ink evaporates, result persists · hover rail
+ "which tool" chip · pen-settings popover (squeeze opens, double-tap pen
⇄ eraser, Bible-mode toggle lives there) · **Scratch = frozen layout AND
ink anchored per verse, aA locked while pinned** (better than either of my
options alone) · rail on the seam edge for the free hand · brush library
with streamline + pressure · free palette with recents + saved sets,
category colors available-never-imposed, **painting with one in the
notebook does NOT create a highlight** · page = objects · recording
control in the page header · ref-card drag · handwritten refs become live
links · layout picker with presets remembered per context · Flip +
handedness mirror · seams finger-only, three snaps · **Guided Study reuses
the 2026-08-20 state machine verbatim** (StepId, URL + localStorage
resume, last step IS Mark complete — checked against
`app/(tabs)/spirit/study/page.tsx`, accurate) · the Question step's answer
box files as an open Question only on save · the hard-rules block · build
order = the prompt's §9.

**Repo claims checked:** `lib/spirit-theme.ts` has the three reader
surfaces (light/dark/night tokens + tintAlpha) and `lib/spirit-ui.ts` has
the six category hexes — "tokens already exist, don't fork a palette" is
true for the Reader. The notebook's brushes/palettes/saved sets are NEW
tokens the build adds (an extension, not a fork).

**Gaps vs. the prompt's §9 and his answers (VERIFY on the canvas, then
round-2 or build-in-system-and-flag):**
1. **Sunday's second half:** the **replay state** (stroke selected →
   playhead → the transcript line for that moment), the **closing confirm
   card** (transcription + found refs), the **Recordings library**, the
   **Church card with "Take notes" first on a Sunday**. The recording
   control alone is not the pilot.
2. **Bible pane:** **circle → multi-verse selection** (his first-named
   gesture) · the **action bar — the two options he asked for**
   (pen-positioned vs. upper-right; Q10) · the **margin ink note** glyph ·
   the **reference popover (peek → full)** — "live links" is stated, the
   popover isn't · dark + night surfaces.
3. **Desk:** portrait-stacked and compact are stated as rules, not shown;
   three-pane is effectively 01 (good); Study layout is 04 (good).
4. **Notebook:** shelf is on 00 (good); **page list**, **lasso menu**,
   **transcribe confirm card**, **phone read-only view** not mentioned.
5. **Worksheets — the biggest gap against his answers** (Q18 "every
   study gets a written assignment", Q19 "a complete/submit button, like
   a form with freedom"): the family + Submit is absent; only the
   Question-step answer box (04) is designed. "Worksheets" appears only in
   the build order.
6. **Settings additions** listed, not designed — fine to build in-system
   (small), flag it.

**Two decisions the hand-back makes that are his to ratify:**
- **00 Home changes the iPad IA:** Spirit is the front door (desk resume
  cards, notebook shelf), then a "directory rail of the real tabs (Today,
  Chat, Health [round 2], Trends, Journal [deferred])" — on the phone the
  center tab is Today. Right for "the iPad is where he studies," but it
  is an IA decision, not a screen detail. Also: **Food and Settings are
  missing from that rail as written** ("Health" may absorb Food; Settings
  must be reachable — handedness, pen defaults, recording consent live
  there), and "Trends" anticipates round 2.
- **"Undesigned tabs open the existing phone layout in a compact pane"** —
  a sane rule (matches the prompt's compact state); ratify it so nobody
  restyles Food/Today on iPad mid-build.

**What the build kickoff must add (the hand-back is design-side only):**
the data spine (`InkPage` · `Notebook` · `Recording` models;
`/api/spirit/ink|notebooks|recordings`; Supabase Storage for audio;
chunked transcription; stroke timestamps relative to recording start) ·
the native list (companion `TARGETED_DEVICE_FAMILY: "1,2"` + landscape;
PencilKit pane; JS bridge; AVAudioRecorder; PKDrawing ⇄ stroke JSON;
`UITouch.type == .pencil` as the native twin of `pointerType === 'pen'`) ·
the curriculum change (written assignment per study + Submit →
`HomeworkCheck`) · the merge preflight (watch lane's
`claude/watchos-workout-ui-ba4448` → `claude/watch-app` before `ios/**` is
touched; one chat owning web + ios per his Q23) · the $99 gate for
year-long installs.

**Recommendation:** (1) export the five files to `docs/design/`; (2) a
**round-2 gap pass** in Claude Design — the phone's
`spirit-design-prompt-round2.md` precedent — with the list above, written
after the files are in and checked (so it doesn't ask for what exists);
(3) do NOT block Sunday on round 2: kick off the build on what IS designed
(Sermon Desk + recording + Bible modes + rail + guided study) plus the
spine, and build the three undesigned Sunday states (replay, closing card,
recordings list) from existing components **flagged UNDESIGNED in-file**
(the watch lane's Freestyle precedent), swapped when round 2 lands;
(4) ratify the Home IA in one line.


---

# Spirit on iPad — build round 1 from the design canvas

The iPad design round lives in the Claude Design project "Health app design
system" (MCP-synced — read the screens there; no exports needed). Five DC
screens are the spec, each self-annotated:

- "Pitaya iPad 00 - Home.dc.html" — app home. Spirit is the front door:
  desk resume cards per context (Study at its step · Sunday's page ·
  Free reading), notebook shelf, then a directory rail of the real tabs
  (Today, Chat, Health [iPad round 2], Trends, Journal [deferred]).
  Undesigned tabs open the existing phone layout in a compact pane.
- "Pitaya iPad 01 - Sermon Desk.dc.html" — the Sunday pilot. Lefty desk:
  Notebook + tool rail | main Bible over reference Bible. Recording
  control in the page header (start/level/elapsed/pause), ref-card drag
  from Bible → notebook, handwritten refs become live links, layout
  picker (Study/Sermon/Free presets, remembered per context), Flip +
  handedness mirror, seams finger-only with 3 snap widths
  (pointerType === 'pen' is ignored by dividers).
- "Pitaya iPad 02 - Bible Modes.dc.html" — Study vs Scratch on one
  chapter. Only the highlighter highlights (tap verse number = whole
  verse, drag = span; six labelled categories → tint + 3px bar + margin
  dot). Pen tick/strike accepts/dismisses suggested marks (ink
  evaporates, result persists). Hover rail + "which tool" chip. Pen
  settings popover: squeeze opens, double-tap swaps pen⇄eraser, Bible
  mode toggle lives here. Scratch = frozen layout, ink persists anchored
  per verse, aA locked while pinned.
- "Pitaya iPad 03 - Notebook Rail.dc.html" — rail on the seam edge for
  the free hand: brush library (fountain pen, G-pen, pencil, marker +
  streamline + pressure), free palette (recents, saved sets, the six
  category colors available-never-imposed — painting with one does NOT
  create a highlight). Page = objects: ink, typed blocks, ref cards,
  photos, recording chip.
- "Pitaya iPad 04 - Guided Study.dc.html" — the desk port of
  app/(tabs)/spirit/study/page.tsx on main (the 2026-08-20 guided
  rewrite). Reuse that state machine verbatim — StepId list, URL +
  localStorage resume, Next always named, last step IS Mark complete.
  The desk adds: labelled rail ticks, the Notebook alongside the whole
  lesson, and the Question step opening an answer box (ink/type/speak)
  on the study page that files as an open Question only on save.

Platform split (per docs/spirit-ipad-brainstorm.md §15): the notebook
pane is PencilKit-backed in the iPad companion; the Reader stays the web
Reader; landscape-first, portrait stacked; compact (~500pt Split View)
renders the phone layout untouched. Tokens already exist in
lib/spirit-theme.ts — the designs match them; don't fork a palette.

Build order: Sunday first (sermon page template + recording + per-stroke
timestamps → tap-a-stroke replay + recordings library), then the Bible
pane modes, then desk/panes/layout memory, then notebook, worksheets,
settings additions.

Hard rules carried from the design:
- Handedness is a setting, default left — never hardcoded.
- The pen tool never creates a highlight and never moves a seam.
- Nothing floats over text — dictation mic lives in the rail.
- Every stroke timestamps against any active recording.
- AI never grades or comments on his answers; its only new behavior is
  the close-page confirm card (transcription + found refs, nothing saves
  until confirmed). Recognition language is per notebook (sermon es,
  notes en).
- No "behind" counters or pressure surfaces anywhere new.

Settings additions: handedness · default Bible mode (Study/Scratch) ·
pen defaults + saved palettes · recognition language per notebook ·
recording consent + storage · layout presets.

Out of scope this round: Journal, Health-on-iPad, a reference browser,
Apple's stock PencilKit picker, Procreate cloning, any AI verdict
surface.

---

## Build landed — 2026-08-22 (V1, branch `claude/spirit-app-ipad-redesign-79442c`)

Read `docs/state.md` (top entry) for the full account. Map from the twelve
screens to the code:

| Screen | Built where |
|---|---|
| 00 Home | `app/(desk)/home/page.tsx` · `/api/spirit/hub` |
| 01 Sermon desk · 06 Sunday replay · 06c recordings | `components/spirit/desk/{desk-shell,notebook-pane,recording-control,closing-card}.tsx` · `lib/spirit-recording.ts` · `lib/transcribe-segments.ts` · `/api/spirit/{sermon,recordings}` · `app/(desk)/spirit/recordings/page.tsx` |
| 02 Bible modes · 05 overlay · 07 Bible states | `components/spirit/desk/bible-pane.tsx` + `components/spirit/reader.tsx` (the phone Reader, embedded) · overlay pages `kind="overlay"` in `/api/spirit/ink` |
| 03 Notebook rail · 08 notebook states | `components/spirit/desk/{tool-rail,pen-popovers,ink-canvas,page-objects,lasso-menu,ref-card}.tsx` · `lib/ink.ts` · `lib/recognition.ts` |
| 04 Guided study | `components/spirit/desk/teaching-pane.tsx` |
| 09 Worksheets | `lib/spirit-notebooks.ts` (templates) · `/api/spirit/worksheet` · `writtenPrompt` |
| 10 Desk states (layouts, portrait, compact, Source) | `desk-shell.tsx` · `source-pane.tsx` · `app/(desk)/spirit/desk/page.tsx` (<700 → phone) |
| 11 Settings | `app/(desk)/spirit/desk-settings/page.tsx` · `/api/spirit/desk-prefs` · `lib/desk-prefs.ts` |
| 5d · 8e (phone) | `components/spirit/phone-overlay.tsx` · `app/(tabs)/spirit/notebook/page/[id]/page.tsx` |

Deviation surfaced: the ink engine is web (one engine for notebook, overlay,
phone read-back) inside the companion's WKWebView; the native PencilKit pane
his Q1 asked for first is the deferred upgrade (stroke JSON is
PencilKit-shaped). Icons: `components/spirit/desk/desk-icons.tsx`, extracted
from the design files verbatim.
