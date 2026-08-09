# CLAUDE.md — READ BEFORE ANY WORK ON THIS BRANCH

**`main` is the LEGACY line. Active development happens on
`claude/phase1-modernization`.** If your session started from `main` (cloud
sessions branch from the repo default), fetch the real branch first:

```bash
git fetch origin claude/phase1-modernization
```

Facts that will save you from wrong assumptions:

- **Production** (`personal-os-plum.vercel.app`, the app on Michael's phone)
  deploys from `claude/phase1-modernization`, NOT from `main`. What you see
  on `main` is not what the app looks like.
- The visual system is **pitaya** (light-first, dragonfruit brand), fully
  implemented on the phase1 branch. `main` still carries the sunset
  graphite/teal/amber design — do not restyle `main` and do not copy its
  palette into new work.
- The phase1 branch has its own authoritative `CLAUDE.md` (operating model),
  `docs/state.md` (what shipped last, what's in flight),
  `docs/deferred-items.md` (planned work — check before building something
  "new"; a spec may already exist), and `docs/design/` (design briefs).
  Read those before writing code.
- New features belong on a branch off `claude/phase1-modernization` with a
  PR back into it — not on `main` — unless Michael says otherwise.

`main` only receives: the eventual phase1 merge (PR #1), or fixes Michael
explicitly asks for here.
