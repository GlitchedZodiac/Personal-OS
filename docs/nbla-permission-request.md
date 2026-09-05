# NBLA — permission request to The Lockman Foundation

**Why this document exists.** The NBLA (Nueva Biblia de las Américas) is the
translation Michael's church uses, and the one the app has anticipated since the
bilingual pane was designed. The licensing research (2026-09-05) found: **there is no
Lockman API and no data-licensing program** — their digital page lists only partner
platforms (Logos, YouVersion, Olive Tree, Bible Gateway, e-Sword, Accordance). But
their *Permission to Quote* policy covers websites and apps up to **500 verses**
without written permission (with the full copyright notice and a clickable
lockman.org link), and their request form **explicitly asks whether the use is
"for your personal use only"** — unlike Crossway and Biblica, individuals can apply.

Realistic outcome: a **yes** on quoting permission; a probable **no** on any
machine-readable text feed. It costs a form to find out, and Michael is the only
person who can.

**How to submit:** the form at <https://www.lockman.org/permission-to-quote/>
(or mail: The Lockman Foundation, PO Box 2279, La Habra, CA 90632-2279 ·
(714) 879-3055). Suggested answers below — edit freely; the voice should be yours.

---

## Suggested form answers

- **Name / contact:** Michael Giraldo · michael@blacksheepglobal.net
- **Project title:** Personal OS — a private, single-user Bible study notebook
- **Translation requested:** NBLA (Nueva Biblia de las Américas)
- **Format:** Personal web application (PIN-protected, single user — myself only;
  not distributed, not listed publicly, no other users possible)
- **Is this for your personal use only?** Yes.
- **Audience / distribution:** One person (the author). The app is my private study
  notebook for following sermons and Bible study at my Spanish-language church,
  which preaches from the NBLA.
- **Commercial?** No. Nothing is sold, no ads, no donations, no accounts.
- **Verse count / scope:** Displayed passages are read chapter-by-chapter as I
  study; at any time the app would display or hold well under the 500-verse
  quotation allowance, and never a complete book.
- **Percentage of the work:** Scripture display is the app's reading pane;
  my own handwritten notes and highlights are the substance of the app.
- **Copyright notice:** The full NBLA notice will be displayed with the text,
  with "Lockman.org" as a clickable link, exactly per your permissions policy.

## The paragraph worth adding (the real question)

> My church preaches from the NBLA, and my study app currently shows the ESV
> (licensed through Crossway's personal-use API) alongside public-domain Spanish
> texts. What I would most value is the NBLA itself in my private reading pane.
> Since the Foundation does not offer an API: **is there any form in which a
> personally-licensed project like this one could obtain NBLA text for its own
> display — a text or USFM export, or access through an existing digital partner —
> under whatever terms and fee the Foundation considers appropriate?** If the answer
> is no, I would still be grateful for standard permission to quote within the
> 500-verse allowance, entered by hand as my study requires.

## While waiting

The app ships with Reina-Valera 1909 (public domain) immediately and Reina-Valera
1960 through American Bible Society's API.Bible personal tier — so the Spanish pane
is alive either way. If Lockman answers yes to any text access, the `apibible`-style
source lane in `lib/passage-service.ts` is the template for wiring it.
