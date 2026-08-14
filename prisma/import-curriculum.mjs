// Imports docs/spirit-curriculum.json (v3 wrapper format) into Term
// rows and the generator config. The curriculum file is the living
// plan — the curriculum lane edits it, this script syncs it.
//
// SAFETY: without --replace, terms that are active or completed are
// never touched (upsert of upcoming only). With --replace, a FULL
// wipe-and-reload runs — but only after re-verifying at run time that
// Michael has started nothing (zero completions/readings/highlights/
// notes/memory/series/threads). Any real data → hard abort.
//
//   node prisma/import-curriculum.mjs            # upsert upcoming
//   node prisma/import-curriculum.mjs --dry      # show the plan
//   node prisma/import-curriculum.mjs --replace  # full reload (gated)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const dry = process.argv.includes("--dry");
const replace = process.argv.includes("--replace");

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(
  readFileSync(join(here, "..", "docs", "spirit-curriculum.json"), "utf8"),
);
const terms = Array.isArray(doc) ? doc : doc.terms;
const homeworkKinds = doc.homeworkKinds ?? {};
const generatorRules = doc.generatorRules ?? [];
const caps = doc.constraints?.validatorEnforced ?? {};
const TERM_MIN = caps.termMin ?? 3;
const TERM_MAX = caps.termMax ?? 15;
const kindSet = new Set(Object.keys(homeworkKinds));

const url = new URL(process.env.DATABASE_URL.trim());
for (const p of ["pgbouncer", "connection_limit", "pool_timeout", "sslmode"]) {
  url.searchParams.delete(p);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 2 }),
});

function validateTerm(t) {
  const errors = [];
  if (!Number.isInteger(t.orderIndex) || t.orderIndex < 1) errors.push("bad orderIndex");
  if (!t.title || !t.kick || !t.rationale) errors.push("title/kick/rationale required");
  if (!Array.isArray(t.units) || t.units.length === 0) errors.push("units required");
  const total = (t.units ?? []).reduce((s, u) => s + (u.days ?? 6), 0);
  if (total > TERM_MAX) errors.push(`term is ${total} studies — the cap is ${TERM_MAX}`);
  if (total < TERM_MIN) errors.push(`term is ${total} studies — the floor is ${TERM_MIN}`);
  for (const u of t.units ?? []) {
    if (!u.label || !u.ref) errors.push(`unit missing label/ref: ${JSON.stringify(u).slice(0, 60)}`);
    if (u.days !== undefined && (!Number.isInteger(u.days) || u.days < 1 || u.days > 6)) {
      errors.push(`unit "${u.label}": days must be 1-6`);
    }
    if (!Array.isArray(u.homework) || u.homework.length === 0) {
      errors.push(`unit "${u.label}": homework kinds required`);
    }
    for (const k of u.homework ?? []) {
      if (!kindSet.has(k)) errors.push(`unit "${u.label}": unknown homework kind "${k}"`);
    }
  }
  return { errors, total };
}

// Validate everything before touching the database.
let grandTotal = 0;
let bad = false;
for (const t of terms) {
  const { errors, total } = validateTerm(t);
  grandTotal += total;
  if (errors.length) {
    console.error(`✗ T${t.orderIndex} "${t.title}": ${errors.join(" · ")}`);
    bad = true;
  }
}
if (bad) {
  console.error("\ncurriculum invalid — nothing imported");
  process.exit(1);
}
console.log(`validated ${terms.length} terms · ${grandTotal} studies · cap ${TERM_MIN}-${TERM_MAX}\n`);

if (replace && !dry) {
  // Runtime safety gate — his layer must be truly untouched.
  const [completions, readings, highlights, notes, mem, series, threads] =
    await Promise.all([
      prisma.studyCompletion.count(),
      prisma.readingLog.count(),
      prisma.highlight.count(),
      prisma.spiritNote.count(),
      prisma.memoryVerse.count(),
      prisma.churchSeries.count(),
      prisma.studyThread.count(),
    ]);
  const touched = completions + readings + highlights + notes + mem + series + threads;
  if (touched > 0) {
    console.error(
      `ABORT — started data exists (completions ${completions}, readings ${readings}, highlights ${highlights}, notes ${notes}, memory ${mem}, series ${series}, threads ${threads}). A full replace would clobber it. Stop and ask Michael.`,
    );
    process.exit(1);
  }
  const wipedDays = await prisma.devotionalDay.deleteMany({});
  const wipedTerms = await prisma.term.deleteMany({});
  console.log(`gate passed (zero started data) — wiped ${wipedTerms.count} terms, ${wipedDays.count} generated studies\n`);
}

let created = 0;
let updated = 0;
let skipped = 0;

for (const t of terms) {
  const existing = await prisma.term.findFirst({ where: { orderIndex: t.orderIndex } });
  if (existing && existing.status !== "upcoming" && !replace) {
    console.log(`— T${t.orderIndex} "${existing.title}" is ${existing.status} — untouched`);
    skipped += 1;
    continue;
  }

  const syllabus = t.units.map((u, i) => ({
    week: i + 1,
    label: u.label,
    ref: u.ref,
    days: u.days ?? 6,
    homework: u.homework,
    ...(u.hard ? { hard: true } : {}),
  }));
  const total = syllabus.reduce((s, u) => s + u.days, 0);
  const data = {
    orderIndex: t.orderIndex,
    title: t.title,
    kick: t.kick,
    rationale: t.rationale,
    hardNote: t.hardNote ?? null,
    secondNote: t.secondNote ?? null,
    homeworkArc: t.homeworkArc ?? null,
    weeks: syllabus.length,
    syllabus,
    status: t.orderIndex === 1 ? "active" : "upcoming",
    ...(t.orderIndex === 1 ? { startedAt: new Date() } : {}),
  };

  if (dry) {
    console.log(`${existing ? "would update" : "would create"} T${t.orderIndex} "${t.title}" · ${syllabus.length} units · ${total} studies${t.homeworkArc ? " · arc" : ""}`);
    continue;
  }

  if (existing) {
    await prisma.term.update({ where: { id: existing.id }, data });
    updated += 1;
  } else {
    await prisma.term.create({ data });
    created += 1;
  }
  console.log(`✓ T${t.orderIndex} "${t.title}" · ${syllabus.length} units · ${total} studies${t.homeworkArc ? " · arc" : ""}`);
}

if (!dry) {
  await prisma.spiritCurriculumConfig.upsert({
    where: { id: "main" },
    create: { id: "main", version: doc.version ?? 0, homeworkKinds, generatorRules },
    update: { version: doc.version ?? 0, homeworkKinds, generatorRules },
  });
  const [termCount, dayCount] = await Promise.all([
    prisma.term.count(),
    prisma.devotionalDay.count(),
  ]);
  console.log(
    `\ncurriculum v${doc.version} synced — created ${created} · updated ${updated} · protected ${skipped} · config stored`,
  );
  console.log(`DB now: ${termCount} terms · ${dayCount} generated studies · plan total ${grandTotal}`);
}
await prisma.$disconnect();
