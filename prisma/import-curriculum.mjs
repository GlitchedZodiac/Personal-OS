// Imports docs/spirit-curriculum.json into Term rows. The curriculum
// file is the living plan — the curriculum lane edits it, this script
// syncs it. SAFETY: terms that are active or completed are NEVER
// touched (his history and his current position are his); only
// upcoming terms are created or updated, keyed by orderIndex.
//
//   node prisma/import-curriculum.mjs          # apply
//   node prisma/import-curriculum.mjs --dry    # show what would happen
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const dry = process.argv.includes("--dry");

const here = dirname(fileURLToPath(import.meta.url));
const doc = JSON.parse(
  readFileSync(join(here, "..", "docs", "spirit-curriculum.json"), "utf8"),
);

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
  if (total > 30) errors.push(`term is ${total} studies — the cap is 30`);
  if (total < 3) errors.push(`term is ${total} studies — the floor is 3`);
  for (const u of t.units ?? []) {
    if (!u.label || !u.ref) errors.push(`unit missing label/ref: ${JSON.stringify(u)}`);
    if (u.days !== undefined && (!Number.isInteger(u.days) || u.days < 1 || u.days > 6)) {
      errors.push(`unit "${u.label}": days must be 1-6 (terms grow by adding units)`);
    }
  }
  return { errors, total };
}

let created = 0;
let updated = 0;
let skipped = 0;

for (const t of doc.terms) {
  const { errors, total } = validateTerm(t);
  if (errors.length) {
    console.error(`✗ T${t.orderIndex} "${t.title}": ${errors.join(" · ")}`);
    process.exitCode = 1;
    continue;
  }

  const existing = await prisma.term.findFirst({ where: { orderIndex: t.orderIndex } });
  if (existing && existing.status !== "upcoming") {
    console.log(`— T${t.orderIndex} "${existing.title}" is ${existing.status} — untouched`);
    skipped += 1;
    continue;
  }

  const syllabus = t.units.map((u, i) => ({
    week: i + 1,
    label: u.label,
    ref: u.ref,
    days: u.days ?? 6,
    ...(u.hard ? { hard: true } : {}),
  }));
  const data = {
    orderIndex: t.orderIndex,
    title: t.title,
    kick: t.kick,
    rationale: t.rationale,
    hardNote: t.hardNote ?? null,
    secondNote: t.secondNote ?? null,
    weeks: syllabus.length,
    syllabus,
    status: "upcoming",
  };

  if (dry) {
    console.log(`${existing ? "would update" : "would create"} T${t.orderIndex} "${t.title}" · ${syllabus.length} units · ${total} studies`);
    continue;
  }

  if (existing) {
    await prisma.term.update({ where: { id: existing.id }, data });
    updated += 1;
    console.log(`✓ updated T${t.orderIndex} "${t.title}" · ${syllabus.length} units · ${total} studies`);
  } else {
    await prisma.term.create({ data });
    created += 1;
    console.log(`✓ created T${t.orderIndex} "${t.title}" · ${syllabus.length} units · ${total} studies`);
  }
}

if (!dry) {
  console.log(`\ncurriculum synced — created ${created} · updated ${updated} · protected ${skipped}`);
}
await prisma.$disconnect();
