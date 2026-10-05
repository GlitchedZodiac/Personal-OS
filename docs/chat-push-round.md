# Chat bugs · chat history · multi-photo · push — the 2026-10-04 round

Branch `claude/pitaya-bugs-motion-ux-5caf0c`, four commits. Everything below
was driven on an **iPhone 17 Pro Max simulator (iOS 26.5, Safari)** — real
WebKit and a real on-screen keyboard, not desktop devtools — but **not on
your physical iPhone, and not inside the TestFlight app**. That last step is
yours; the checklist at the bottom is written for it.

## The four things you asked first

| | |
|---|---|
| **Frontend stack** | Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 + shadcn · Prisma → Supabase Postgres · OpenAI Responses API for chat |
| **PWA or native?** | **Both.** The web app is a PWA (manifest, service worker). The iPhone/iPad app from TestFlight is a thin native shell — a `WKWebView` around that same web app. Your iPhone's active session is the shell. This matters twice: the keyboard fix had to work in WebKit generally, and **web push cannot reach the shell at all** (below). |
| **How chat is stored** | Postgres table `chat_messages` (role, content, a JSON `meta` for cards and photo thumbs). Until this round it was one transcript with no grouping: 248 messages across 30 days, the last 12 replayed to the model on every turn. |
| **How reminders fire** | A `reminders` row, then two paths: an open tab polled every 30 s and showed a local notification *on that tab only, and only if it already had permission*; and a Vercel cron pushed the rest — **once a day at 6am**, because the Hobby plan rejects anything more frequent. Prod has **zero** push subscriptions, so in practice nothing was delivered, and each reminder was marked fired anyway. |

## Bug 1 — the keyboard hides the input when a photo is attached

**Repro (before):** any tab → camera in the floating dock → attach a photo →
tap the note field. The whole "Add photos" sheet fades out and slides away;
you are typing into nothing.

**What was actually wrong** — not `100vh`. The sheet was rendered *inside*
the dock's wrapper, the element that hides itself when the page scrolls
down. Tapping the field raised the keyboard; iOS scrolled the page to reveal
the field; the dock read that scroll as "he's reading, get out of the way"
and took the sheet with it — opacity 0, shifted 240px, and no longer
anchored to the screen (a transformed ancestor re-anchors `position:
fixed`).

**Fix:** the sheet lives outside the dock (portaled to the page root), the
dock stays put while it is open, the page behind is frozen, and the sheet is
laid out against the **visual viewport** — the rectangle above the keyboard —
so it sits directly on the keys however iOS pans. The chat screen uses the
same frame: header, a thread that shrinks, composer on the keyboard. The tab
bar steps aside while you type.

Two corrections came straight off the simulator and would not have been
found on a desktop: `window.innerHeight` is not the layout viewport on iOS
26, and `overflow: hidden` does not stop WebKit scrolling the page to chase a
field.

**Verified (simulator):** dock → photo → tap note → sheet rests on the
keyboard with the thumbnail and the caption visible as typed → Send with the
keyboard still up → one tap, delivered. Also from a scrolled page: the page
returns to where it was afterwards and the dock does not flicker.

## Bug 2 — chat doesn't scroll to the newest message

**Repro (before):** open chat. The newest card is cut off under the
composer. Send anything: the view does not move.

**What was actually wrong:** "scroll to the bottom" aimed at a marker with
325px of composer and padding below it. So the newest message parked under
the sticky composer (132px hidden, measured) and the page stopped 326px short
of its true end — which the "is he near the bottom?" rule (140px) read as
*he has scrolled up*. The thread un-pinned itself with its own scroll, every
time, and then followed nothing.

**Fix:** the thread is its own scroller, so "the bottom" is one number with
nothing on top of it, and the rules are small tested functions
(`lib/chat-scroll.ts`):

- your own message always goes to the end;
- a reply is followed while it streams;
- scroll up mid-reply and it leaves you alone — a **"New below"** pill is the
  way back;
- a finger on the thread suspends following;
- anything that changes height late (an image, a card) is followed by
  observing the content, not by a timer.

**Verified (simulator):** opens on the newest message, fully visible · send →
follows the streaming reply · scroll up mid-stream → stays put, pill appears →
tap → lands at the end.

## Feature 1 — chat history

- **☰** opens a drawer of every chat: **Today · This week · Last week · Last
  month · Older**, a **date range** picker, **search**, **+ New chat**,
  rename (pencil).
- **Titles**: first words immediately, then one small model call names a new
  chat from its first exchange. Tap the title to rename; your name is never
  overwritten.
- **Search** covers everything said *and* the food named inside cards — a
  photo logged with no words is findable by what was on the plate.
- **New chat after a quiet gap — proposed default: 6 hours.** A day's meals
  are 4–6 h apart and stay in one chat, where "make it two" still means
  something; a night is always longer, so each morning starts clean.
  Settings → App → "New chat after" (Never · 1 · 3 · 6 · 12 h · 1 day).
  Opening an old chat on purpose and continuing it is not affected.
- **Migration:** done, and nothing was deleted. 248 messages before and
  after, byte-identical (fingerprint over id + role + content + timestamp),
  now filed as 30 chats, one per Bogotá calendar day. Timestamps stay UTC;
  which shelf a chat is on is decided at display time in the device's
  timezone, so Houston needs no second migration.
- **Context — how it's handled.** A chat's transcript is now only that
  chat's, so "New chat" is a real clean slate. The model's access to your
  data never lived in the transcript: the instructions, today's date and the
  data tool ride on every turn. Proven on the live route — a brand-new chat
  answered *"82.75 kg at 13.2% body fat (Oct 4)"* from two data reads, and
  correctly said it had no earlier message to quote. A first turn is told it
  is first, so "same as yesterday" becomes a lookup rather than a guess.

Heads-up on one consequence of "This week" meaning Monday-to-Sunday: on a
Monday, yesterday's chat is under **Last week**.

## Feature 2 — several photos before sending

- The chat composer has its **own camera** now (it had none — the dock is
  hidden on the chat screen, so sending a photo "in chat" meant leaving it).
- Photos collect in a **tray** inside the composer: ✕ on each, **Add
  another** (straight back into the camera), **Library**. Camera and library
  mix in one message. The dock's sheet uses the same tray.
- **Proposed cap: 6.** Each photo leaves at ≤1280px (~150–330 KB), so six is
  ≈2 MB — inside Vercel's 4.5 MB request limit, where eight or ten are not
  once a few detailed plates are in the batch — and about 1¢ of vision input
  per send.
- Compressed in the browser (one decode per photo, one at a time).
- **One meal:** all photos go in one request and the model is told they
  belong together — one card listing every item — unless they are plainly
  different things or your words say otherwise.

## Feature 3 — push notifications

Full detail: [`push-notifications.md`](push-notifications.md).

- **Which applies:** Web Push for the PWA — built and working. **The
  TestFlight app cannot receive it**; that needs APNs and a native update.
  Until then, notifications can reach Pitaya installed from Safari
  (Share → Add to Home Screen; iOS 16.4+) and any desktop browser.
- **The ask** appears in chat right after you confirm a reminder — never on
  launch. "Not now" holds two weeks.
- **Categories** (Settings → Notifications): Reminders · Training day · New
  weigh-in synced · System alerts · PR celebrations · Weekly report · Spirit.
- **Reminders now deliver** — and wait if there is nowhere to deliver them,
  instead of being marked done.
- **Weigh-in hook** is built for the RENPHO work: one call, one line —
  *"82.1 kg · 13.0% body fat · −0.7 kg since yesterday"*.
- **System alerts**: a pipeline failing for 2 days, or a daily source silent
  for 2 days. The Apple Health sync is the first one watched.
- **Quiet hours** default 10pm–7am on the device's clock; held items go out
  at 7. Reminders you timed yourself still arrive on time (switchable).
- **Log**: every notification, when, and delivered / failed / held / nowhere
  to send — at the foot of the same screen.

## Motion

One vocabulary, on the design's own curves: things arrive from where they
were made, settle without bouncing, leave faster than they came.

- Your message rises out of the composer; replies and cards come in from the
  left. Only what *arrives* animates — opening a chat is not sixty bubbles
  fading in.
- One live bubble from the first dot to the last word (it used to be two
  elements, so every reply began with a blink).
- Send grows in beside the mic with the first character. The composer warms
  when it has the keyboard. The photo tray opens by growing; a photo pops in
  where it lands and its neighbours slide over when it is removed.
- Sheets and the drawer leave with an animation instead of a jump cut; the
  drawer drags shut; shelves stagger in; switching chats settles in.
- A confirmed card's ✓ pops; the verdict strip fades up.
- Haptics on send, confirm, reject and selection (inside the iPhone app).
- All of it collapses under Reduce Motion.

## Decisions that are yours

1. ~~**Deploy.**~~ Done — merged and deployed 2026-10-05 on your go (PR #23).
   Both migrations are additive and were already applied to the shared
   database. To see it in the iPhone app: swipe the app closed and reopen it,
   so it loads the new build.
2. **Exact-minute reminders.** Hourly cron + anything that talks to the
   server is "within minutes, usually; ~2 h worst case". Exact needs Vercel
   Pro (~$20/mo) or a per-minute job in Supabase (free, but a secret in the
   database). Or neither.
3. **Notifications in the TestFlight app.** Needs an APNs key from your
   Apple Developer account and a native round.
4. The three defaults above — 6 h, 6 photos, reminders through quiet hours.

## Found, not fixed

- **`DELETE /api/ai/chat/messages` erases every message in every chat.** No
  screen calls it. Left as found.
- **The nightly cleanup cron probably skips most nights.** It only works in
  the first 15 minutes of 2am, and Vercel fires Hobby crons anywhere in the
  hour. From reading the code — I did not check the run history.
- **~300 lines of dead UI in the dock** (the old confirm/edit cards, still in
  the pre-Pitaya dark styling). Nothing can open them.
- The range picker still closes with a jump cut (shared with Food and
  Activities).
- History shows a chat's most recent 400 messages and the newest 300 chats.

## Your checklist — on the iPhone

Add `?vvdebug=1` to any URL for an on-screen readout if something looks off;
a screenshot of it tells me exactly what the phone reported.

1. **Bug 1.** Any tab → dock camera → take a photo → tap the note field.
   The sheet should rest on the keyboard with the photo and your typing
   visible. Tap Send while the keyboard is up — it should send on the first
   tap. *Check this one in the TestFlight app specifically.*
2. **Bug 2.** Open Chat: the newest message is fully visible. Send
   something: it follows the reply. Scroll up while it answers: it stays
   put, and "New below" takes you down.
3. **History.** ☰ → the shelves look right; search a food you remember;
   open an old chat; rename one.
4. **New chat.** "+ New", say something, watch the title name itself.
5. **Photos.** Camera button in the chat composer → take one → "Add
   another" → take a second → add one from the library → remove one → send.
   One card for one meal?
6. **Notifications.** In chat: "remind me in ten minutes to stretch" →
   confirm → does the card that follows read right for where you are?
   Then Settings → Notifications: do the hours and switches feel right?
7. **Motion.** Does it feel smoother, or busier? Anything that moves and
   shouldn't.
