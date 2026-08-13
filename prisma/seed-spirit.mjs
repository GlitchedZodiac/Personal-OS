// Spirit v0 seed — idempotent. Seeds the ACTIVE term (The Judges, the
// content the design carried — historically accurate, reviewed), the
// upcoming term stubs for year-at-a-glance, one fully-written devotional
// day, and the two public-domain source excerpts it cites. Seeds NO
// history: no reading logs, no highlights, no fake completed terms —
// his transcript starts truthful. The term-batch generation pipeline
// (next block) replaces hand-seeding.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = new URL(process.env.DATABASE_URL.trim());
for (const p of ["pgbouncer", "connection_limit", "pool_timeout", "sslmode"]) {
  url.searchParams.delete(p);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2 }),
});

const TERM = {
  orderIndex: 1,
  title: "The Judges",
  kick: "OT NARRATIVE · ANNOUNCED, NOT CHOSEN",
  rationale:
    "A first term in narrative. Judges is where covenant theology meets national amnesia — a people formed by promise, forgetting it one generation at a time. Before the epistles tell the church what it is, Judges shows what a people becomes when there is no king and everyone does what is right in his own eyes.",
  hardNote:
    "This curriculum does not skip the difficult texts. Week 7 sits in Judges 19–21 — the Levite's concubine and the near-death of a tribe. It will be read whole, in context, with the confessions at hand.",
  secondNote: null,
  weeks: 7,
  status: "active",
  syllabus: [
    { week: 1, label: "No king — the generation after Joshua", ref: "Judges 1–2" },
    { week: 2, label: "Othniel, Ehud, Shamgar", ref: "Judges 3" },
    { week: 3, label: "Sold and delivered — the shape of the cycle", ref: "Judges 2–3" },
    { week: 4, label: "Ruth — the interlude of loyalty", ref: "Ruth 1–4" },
    { week: 5, label: "Deborah & Barak", ref: "Judges 4–5" },
    { week: 6, label: "Gideon to Abimelech", ref: "Judges 6–9" },
    { week: 7, label: "When there is no king", ref: "Judges 17–21", hard: true },
  ],
};

const UPCOMING = [
  { orderIndex: 2, title: "The Exile", kick: "PROPHETS & HISTORY", weeks: 8 },
  { orderIndex: 3, title: "Romans", kick: "EPISTLE · DOCTRINE", weeks: 8 },
  { orderIndex: 4, title: "Church history — the first five centuries", kick: "HISTORY", weeks: 6 },
];

// refInt = book*1e6 + chapter*1e3 + verse · Judges = book 7
const DAY = {
  weekIndex: 5,
  dayIndex: 4,
  title: "The general who asked for company",
  body: "Deborah does not volunteer a battle plan — she relays a command Barak has already received. He will go, but only if she goes. The prophecy that follows is not punishment so much as reassignment: the glory he hedged on goes to a woman with a tent peg.",
  pullRef: "Judges 4:14",
  pullText:
    "“Up! For this is the day in which the LORD has given Sisera into your hand. Does not the LORD go out before you?”",
  contextBlock:
    "Nine hundred chariots of iron against highland levies with farm tools — Israel could not hold the valleys, which is why the muster is at Mount Tabor and the battle is won when rain turns the Kishon plain to mud. Hazor, burned under Joshua, has been rebuilt; the palm of Deborah is an open-air courtroom, the way judgment was actually done.",
  doctrine:
    "Faith rests on the word given, not on the messenger kept in view. Barak had the promise of v. 7 and still bargained for the prophetess — yet Hebrews 11 names him among the faithful. Grace remembers faith, not its hedges.",
  practice:
    "Name one obedience you have made conditional on company — a person who must come along before you will move. Bring it to v. 14 this week.",
  question: "Where have I made obedience conditional on company God never promised?",
  oneMoreTitle: "Worms, 1521",
  oneMoreBody:
    "Asked to recant everything, Luther asked instead to be shown his error from Scripture — conscience captive to the Word of God. Within days Frederick the Wise had him “kidnapped” to the Wartburg, where he began translating the New Testament.",
  readingRef: "Judges 4-5",
  readingLabel: "Judges 4–5 · Deborah & Barak",
  estMinutes: 12,
  citations: [
    { label: "Henry · on Judges 4", sourceKey: "henry-judges-4" },
    { label: "Westminster XIV.ii", sourceKey: "wcf-14-2" },
  ],
  suggested: [
    { refInt: 7004002, category: "Sin & Consequence" },
    { refInt: 7004003, category: "Context" },
    { refInt: 7004007, category: "Promise & Covenant" },
  ],
};

const SOURCES = [
  {
    key: "henry-judges-4",
    title: "Matthew Henry · on Judges 4",
    meta: "Commentary, 1706 · condensed · public domain",
    body: "Barak insisted much upon Deborah’s presence — he would sooner venture with the prophetess at hand than lean on the bare word already given. A brave man, yet the honour of the day is carried off by a woman; the rebuke is gentle, and Hebrews 11 names him among the faithful still.",
  },
  {
    key: "wcf-14-2",
    title: "Westminster Confession · XIV.ii",
    meta: "Of Saving Faith, 1646 · public domain",
    body: "By this faith, a Christian believeth to be true whatsoever is revealed in the Word — yielding obedience to the commands, trembling at the threatenings, and embracing the promises of God for this life, and that which is to come.",
  },
];

const existing = await prisma.term.findFirst({ where: { orderIndex: 1 } });
let term;
if (existing) {
  term = await prisma.term.update({
    where: { id: existing.id },
    data: { ...TERM, syllabus: TERM.syllabus },
  });
  console.log("term updated:", term.title);
} else {
  term = await prisma.term.create({
    data: { ...TERM, syllabus: TERM.syllabus, startedAt: new Date() },
  });
  console.log("term created:", term.title);
}

for (const u of UPCOMING) {
  const found = await prisma.term.findFirst({ where: { orderIndex: u.orderIndex } });
  if (!found) {
    await prisma.term.create({
      data: { ...u, rationale: "", syllabus: [], status: "upcoming" },
    });
    console.log("upcoming:", u.title);
  }
}

await prisma.devotionalDay.upsert({
  where: {
    termId_weekIndex_dayIndex: {
      termId: term.id,
      weekIndex: DAY.weekIndex,
      dayIndex: DAY.dayIndex,
    },
  },
  create: { ...DAY, termId: term.id },
  update: { ...DAY, termId: term.id },
});
console.log("day seeded:", DAY.title);

for (const s of SOURCES) {
  await prisma.sourceDoc.upsert({ where: { key: s.key }, create: s, update: s });
}
console.log("sources:", SOURCES.length);

await prisma.$disconnect();
