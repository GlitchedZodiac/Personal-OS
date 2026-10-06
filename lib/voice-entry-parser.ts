// Rule-based parser for the watch's mid-workout voice clips ("10 kettlebell
// swings", "10 squats with a vest"). Transcript in, structured exercise
// entries out — no LLM, no I/O, no Prisma. The LLM only sees transcripts this
// parser is NOT confident about, so the contract is asymmetric on purpose:
//   - when `confident` is true the entries must be right;
//   - anything shaky is kept but flagged (needsReview + reason), never dropped
//     and never padded with numbers that were not said.
//
// Pipeline: tokenize → fold number words (EN/ES) → split into movements →
// peel quantities off each segment (per-side, vest, duration, weight, sets,
// reps) → whatever words remain are the movement name → match the catalog.
//
// The catalog's own normalizer (lib/exercises.ts) is whole-word containment,
// longest key first — it happily swallows "jump squats" into Squat. That pass
// is reused here, not changed: a containment hit only scores as confident
// when the words it did NOT cover are harmless qualifiers ("heavy",
// "kettlebell" on a kettlebell movement); otherwise it is kept at a review
// score.

import {
  EXERCISE_CATALOG,
  findExerciseByExactName,
  foldExerciseName,
  getCustomExercises,
  getExerciseById,
  normalizeExerciseName,
  type ExerciseCategory,
  type ExerciseDef,
} from "@/lib/exercises";

export interface VoiceLoad {
  type: "vest";
  kg: number;
  assumed?: boolean;
}

export interface ParsedVoiceEntry {
  /** Canonical catalog/custom name when matched, else the spoken name cleaned up in Title Case. */
  name: string;
  /** Canonical exercise id when matched. Absent for unknown movements. */
  exercise?: string;
  reps?: number;
  /** Only when stated ("3 sets of…", "5 rounds of…", "3 by 10"). Absent otherwise — the composer treats absent as 1. */
  sets?: number;
  /** TOTAL implement load in kg (count × each), rounded to 0.1. */
  weightKg?: number;
  /** Duration per set in seconds when stated ("30 second plank", "plank for one minute"). */
  seconds?: number;
  perSide?: boolean;
  /** Worn load — a weighted vest. Never folded into weightKg. */
  load?: VoiceLoad;
  /** What was actually said about the implement, for the review screen. */
  spoken?: { unit?: "kg" | "lb"; each?: number; count?: number };
  /** 0..1 */
  confidence: number;
  needsReview: boolean;
  reason?: "new_exercise" | "low_match" | "no_quantity" | "ambiguous_weight" | "unparsed";
  matchedBy: "exact" | "alias" | "contains" | "fuzzy" | "none";
}

export interface VoiceParseResult {
  entries: ParsedVoiceEntry[];
  /** True only when every entry is matched with high confidence and has a quantity — the caller skips the LLM. */
  confident: boolean;
  /** The folded transcript the parser actually worked on. */
  normalized: string;
}

export interface VoiceParseOptions {
  /** Used when he says "with a vest" and no number. Default 5. */
  defaultVestKg?: number;
}

type MatchedBy = ParsedVoiceEntry["matchedBy"];

interface SpokenMatch {
  def: ExerciseDef | null;
  score: number;
  by: MatchedBy;
}

// ── Constants ───────────────────────────────────────────────────────────

const LB_TO_KG = 0.45359237;
const DEFAULT_VEST_KG = 5;
const VEST_MIN_KG = 1;
const VEST_MAX_KG = 40;
const WEIGHT_MIN_KG = 1;
const WEIGHT_MAX_KG = 400;

// Match tiers. Anything below CONFIDENT is a review-screen match.
const SCORE_EXACT = 1;
const SCORE_CONTAINS = 0.85;
const SCORE_PLURAL = 0.8; // singular/plural, spacing and word-order folds
const SCORE_MISHEARD = 0.75;
const SCORE_LOOSE = 0.7; // containment with unexplained extra words
const CONFIDENT = 0.85;

const NO_MATCH: SpokenMatch = { def: null, score: 0, by: "none" };

const wordSet = (list: string) => new Set(list.split(" "));

const PREP = wordSet("with at using w con usando");
const ARTICLE = wordSet("a an the my un una el la los las mi mis");
const ONE_ARTICLE = wordSet("a an un una");
const OF = wordSet("of de");
const KG_UNIT = wordSet("kg kgs kilo kilos kilogram kilograms kilogramo kilogramos k");
const LB_UNIT = wordSet("lb lbs pound pounds libra libras");
const SECOND = wordSet("second seconds sec secs segundo segundos");
const MINUTE = wordSet("minute minutes min mins minuto minutos");
const SETS = wordSet("set sets serie series");
const ROUNDS = wordSet("round rounds ronda rondas vuelta vueltas");
const REPS = wordSet("rep reps repetition repetitions repeticion repeticiones");
const TIMES = wordSet("x times by por veces");
const EACH = wordSet("each per every cada por");
const SIDE = wordSet("side arm leg hand way lado brazo pierna mano");
const BOTH_SIDES = wordSet("sides arms legs hands");
const SIDE_LEAD = wordSet("on in for de en");
const HAND = wordSet("hand mano");
const VEST = wordSet("vest vested chaleco");
const VEST_PREP = wordSet("with wearing in using w con usando");
const VEST_LINK = wordSet("of de at");
const DURATION_PREP = wordSet("for por durante");
const SEPARATOR = wordSet(", and then plus y luego despues");
const GLOBAL = wordSet("all both everything todo todos ambos ambas");
const LOAD_LEAD = wordSet("with at using con usando wearing in vested weighted");
const COUNT_PAIR = wordSet("pair par");
const RUSA = wordSet("rusa rusas");
const LIMB = wordSet("arm arms armed hand hands handed leg legs legged");
const FILLER = wordSet("um umm uh uhh er erm hmm okay ok please yeah alright");
const EDGE_STOP = wordSet(
  "of de for with at the a an my on in and y then plus x times by rep reps set sets each per " +
    "did do doing done i just is was that this log another some more too to also again today now " +
    "so well we got have ive im thats its using wearing con el la un una por hice otra otro mas " +
    "weighted once finished completed"
);
// Sign-offs transcription invents over trailing silence — dropped without a flag.
const COURTESY = wordSet("thank thanks you watching bye goodbye gracias adios");
/** Words that mark an unmatched name as conversation rather than a movement. */
const CHATTER = wordSet(
  "i ill im ive you your we they he she it its be been am are is was were there here will would " +
    "should could cant dont gonna wanna going want need think know what when where why how not no yes"
);
/** Lower-cased inside a displayed name, like the catalog's "Clean and Press". */
const SMALL_WORD = wordSet("and of to the with a in on de y con");
/** Qualifiers a containment match may leave uncovered and still be the same movement. */
const QUALIFIER = wordSet(
  "heavy light strict regular normal standard full basic easy hard slow fast bodyweight weighted unweighted double single"
);

const COUNT_WORD = new Map<string, number>([
  ["double", 2],
  ["doubles", 2],
  ["dual", 2],
  ["doble", 2],
  ["single", 1],
]);

/** Implement words and the catalog category they point at (null = no category, e.g. plates). */
const IMPLEMENT = new Map<string, ExerciseCategory | null>([
  ["kettlebell", "kettlebell"],
  ["kettlebells", "kettlebell"],
  ["bell", "kettlebell"],
  ["bells", "kettlebell"],
  ["kb", "kettlebell"],
  ["kbs", "kettlebell"],
  ["pesa", "kettlebell"],
  ["pesas", "kettlebell"],
  ["dumbbell", "dumbbell"],
  ["dumbbells", "dumbbell"],
  ["db", "dumbbell"],
  ["dbs", "dumbbell"],
  ["mancuerna", "dumbbell"],
  ["mancuernas", "dumbbell"],
  ["barbell", "barbell"],
  ["bar", "barbell"],
  ["barra", "barbell"],
  ["plate", null],
  ["plates", null],
]);
const PLURAL_IMPLEMENT = wordSet("kettlebells bells kbs pesas dumbbells dbs mancuernas plates");

// Transcription homophones. Never folded blindly — only when one sits where
// the rep count belongs and nothing else supplies it (see buildEntry).
const HOMOPHONE = new Map<string, number>([
  ["for", 4],
  ["to", 2],
  ["too", 2],
  ["ate", 8],
  ["won", 1],
]);

// Mishearings seen through transcription. A name that needed one of these is
// a fuzzy match however well the corrected text matches.
const MISHEARD: Array<[string[], string[]]> = (
  [
    ["kettle bells", "kettlebells"],
    ["kettle bell", "kettlebell"],
    ["kettle balls", "kettlebells"],
    ["kettle ball", "kettlebell"],
    ["cattle bells", "kettlebells"],
    ["cattle bell", "kettlebell"],
    ["clean to press", "clean and press"],
    ["swing s", "swings"],
    ["swing's", "swings"],
    ["swims", "swings"],
    ["berpees", "burpees"],
    ["berpee", "burpee"],
    ["burpies", "burpees"],
    ["burpie", "burpee"],
    ["squads", "squats"],
    ["squad", "squat"],
  ] as Array<[string, string]>
).map(([from, to]) => [from.split(" "), to.split(" ")]);

const EN_ONES = new Map<string, number>(
  (
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
    "fifteen sixteen seventeen eighteen nineteen"
  )
    .split(" ")
    .map((w, i) => [w, i])
);
const EN_TENS = new Map<string, number>([
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fourty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);
const ES_ONES = new Map<string, number>(
  (
    "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince " +
    "dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres " +
    "veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve"
  )
    .split(" ")
    .map((w, i) => [w, i])
);
const ES_TENS = new Map<string, number>([
  ["treinta", 30],
  ["cuarenta", 40],
  ["cincuenta", 50],
  ["sesenta", 60],
  ["setenta", 70],
  ["ochenta", 80],
  ["noventa", 90],
]);
// "once" is eleven in Spanish and an adverb in English — only read it as a
// number when the rest of the clip is plainly Spanish.
const SPANISH_HINT = wordSet(
  "con de por y lado chaleco serie series repeticion repeticiones segundo segundos minuto minutos " +
    "libra libras flexiones lagartijas sentadilla sentadillas dominadas plancha zancadas estocadas " +
    "fondos abdominales columpio columpios cargada arranque remo"
);
/** Words a trailing "and a half" can attach to ("a minute and a half", "12 kilos and a half"). */
const MEASURE = new Set([...MINUTE, ...KG_UNIT, ...LB_UNIT]);

/** Grammar words — never the start of a movement name on their own. */
const NON_NAME = new Set([
  ...PREP,
  ...ARTICLE,
  ...OF,
  ...KG_UNIT,
  ...LB_UNIT,
  ...SECOND,
  ...MINUTE,
  ...SETS,
  ...ROUNDS,
  ...REPS,
  ...TIMES,
  ...EACH,
  ...VEST,
  ...SEPARATOR,
  ...GLOBAL,
  ...FILLER,
  ...EDGE_STOP,
]);

// ── Tokens ──────────────────────────────────────────────────────────────

interface Tok {
  /** Folded word; "#" for a number (read `n`). */
  t: string;
  n?: number;
  /** "16s" — a plural number, i.e. more than one implement of that size. */
  plural?: boolean;
  /** Rewritten from a known mishearing. */
  heard?: boolean;
  /** Part of a vocabulary name ("clean AND press", "ONE arm swing") — grammar passes leave it alone. */
  lock?: boolean;
}

type NumTok = Tok & { n: number };

const num = (n: number, plural = false): Tok => (plural ? { t: "#", n, plural } : { t: "#", n });
const isNum = (tok: Tok | undefined): tok is NumTok => tok != null && tok.n != null;
/** An unlocked word token in `set`. */
const free = (tok: Tok | undefined, set: { has(word: string): boolean }): boolean =>
  tok != null && !tok.lock && tok.n == null && set.has(tok.t);
/** An unlocked word token equal to one of `words`. */
const isWord = (tok: Tok | undefined, ...words: string[]): boolean =>
  tok != null && !tok.lock && tok.n == null && words.includes(tok.t);
const unitOf = (tok: Tok | undefined): "kg" | "lb" | undefined =>
  free(tok, KG_UNIT) ? "kg" : free(tok, LB_UNIT) ? "lb" : undefined;
/** A word that can belong to a movement name (implement words are judged separately). */
const isNameish = (tok: Tok | undefined): boolean =>
  tok != null && tok.n == null && (tok.lock === true || (!NON_NAME.has(tok.t) && !IMPLEMENT.has(tok.t)));

const round1 = (value: number) => Math.round(value * 10) / 10;

function tokenize(transcript: string): Tok[] {
  const text = transcript
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc`]/g, "'")
    .replace(/(\d+):(\d\d)(?!\d)/g, "$1 minute $2 seconds") // "1:30 plank"
    .replace(/(\d)'s\b/g, "$1s") // "two 16's"
    .replace(/(\d),(\d{1,2})(?=\s*(?:kg|kilo|lb|libra|pound))/g, "$1.$2"); // "22,5 kilos"
  const pieces = text.match(/\d+(?:\.\d+)?[a-z]*|[a-z']+|[,;.!?:]|[@&\u00d7+]/g) ?? [];
  const out: Tok[] = [];
  for (const piece of pieces) {
    if (/^[,;.!?:]$/.test(piece)) {
      out.push({ t: "," });
    } else if (piece === "@") {
      out.push({ t: "at" });
    } else if (piece === "&") {
      out.push({ t: "and" });
    } else if (piece === "\u00d7") {
      out.push({ t: "x" });
    } else if (piece === "+") {
      out.push({ t: "plus" });
    } else if (/^\d/.test(piece)) {
      // "24kg", "16s", "3x", "45sec" — a number glued to its suffix.
      const glued = /^(\d+(?:\.\d+)?)([a-z]*)$/.exec(piece);
      if (!glued) continue;
      const suffix = glued[2];
      if (suffix === "s") {
        out.push(num(Number(glued[1]), true));
      } else {
        out.push(num(Number(glued[1])));
        if (suffix && !/^(st|nd|rd|th)$/.test(suffix)) out.push({ t: suffix === "k" ? "kg" : suffix });
      }
    } else {
      const word = piece.replace(/^'+|'+$/g, "");
      if (word === "swing's") out.push({ t: "swings", heard: true });
      else if (word) out.push({ t: word.replace(/'/g, "") });
    }
  }
  return out;
}

function rewriteMisheard(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < toks.length) {
    const rule = MISHEARD.find(([from]) =>
      from.every((word, j) => toks[i + j] != null && toks[i + j].n == null && toks[i + j].t === word)
    );
    if (rule) {
      for (const word of rule[1]) out.push({ t: word, heard: true });
      i += rule[0].length;
    } else {
      out.push(toks[i]);
      i++;
    }
  }
  return out;
}

/** Singular fold for matching: "presses" → "press", "swings" → "swing", "ups" → "up". */
function stem(word: string): string {
  if (word.length < 3 || /(ss|us|is)$/.test(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

// ── Vocabulary (catalog + user-minted movements) ────────────────────────

interface VocabKey {
  def: ExerciseDef;
  key: string;
  words: string[];
  stems: string[];
  /** Stems joined with no spaces — "push ups", "pushups" and "push up" all squash alike. */
  squashed: string;
  /** Stems sorted — "kettlebell front squat" equals "front squat kettlebell". */
  sorted: string;
}

let vocabSource: ExerciseDef[] | null = null;
let vocabKeys: VocabKey[] = [];
let vocabPhrases: string[][] = [];

// Rebuilt whenever setCustomExercises swaps the customs array (it always
// allocates a new one), so the server's per-request load is picked up.
function vocabulary(): VocabKey[] {
  const customs = getCustomExercises();
  if (vocabSource === customs) return vocabKeys;
  const keys: VocabKey[] = [];
  const seen = new Set<string>();
  // Catalog first, like the catalog's own index, so ties resolve the same way.
  for (const def of [...EXERCISE_CATALOG, ...customs]) {
    for (const raw of [def.name, ...def.aliases, def.id]) {
      const key = foldExerciseName(raw);
      if (!key || seen.has(`${def.id}|${key}`)) continue;
      seen.add(`${def.id}|${key}`);
      const words = key.split(" ");
      const stems = words.map(stem);
      keys.push({ def, key, words, stems, squashed: stems.join(""), sorted: [...stems].sort().join(" ") });
    }
  }
  // Multi-word names are protected inside a transcript. The two extras are
  // movements whose "and" must never split even without a catalog row.
  const phrases = new Map<string, string[]>();
  for (const extra of ["clean and press", "clean and jerk"]) phrases.set(extra, extra.split(" "));
  for (const k of keys) if (k.stems.length > 1) phrases.set(k.stems.join(" "), k.stems);
  vocabPhrases = [...phrases.values()];
  vocabKeys = keys;
  vocabSource = customs;
  return keys;
}

/**
 * Lock every occurrence of a multi-word vocabulary name so "clean and press"
 * is not split on "and", "one arm swing" keeps its "one", and "remo con pesa
 * rusa" does not lose its implement to the weight phrase.
 */
function lockVocabulary(toks: Tok[]) {
  vocabulary();
  const stems = toks.map((tok) => (tok.n == null ? stem(tok.t) : "#"));
  // Every match locks, overlaps included: in "kettlebell clean and press" both
  // "kettlebell clean" and "clean and press" are names, and the "and" must hold.
  for (let i = 0; i < toks.length; i++) {
    for (const phrase of vocabPhrases) {
      if (i + phrase.length > toks.length || !phrase.every((word, j) => stems[i + j] === word)) continue;
      for (let j = 0; j < phrase.length; j++) toks[i + j].lock = true;
    }
  }
}

// ── Number words ────────────────────────────────────────────────────────

interface NumberRead {
  value: number;
  next: number;
}

const wordAt = (toks: Tok[], i: number): string | undefined => {
  const tok = toks[i];
  return tok != null && !tok.lock && tok.n == null ? tok.t : undefined;
};

/** "twenty", "twenty four", "seven" — a number below one hundred starting at `i`. */
function readSmallNumber(toks: Tok[], i: number, spanish: boolean): NumberRead | null {
  const word = wordAt(toks, i);
  if (word == null) return null;
  const next = wordAt(toks, i + 1);
  const enTens = EN_TENS.get(word);
  if (enTens != null) {
    const ones = next != null ? EN_ONES.get(next) : undefined;
    return ones != null && ones >= 1 && ones <= 9
      ? { value: enTens + ones, next: i + 2 }
      : { value: enTens, next: i + 1 };
  }
  const enOnes = EN_ONES.get(word);
  if (enOnes != null) {
    // "one arm swing", "two handed" — a limb count, not a quantity.
    if (next != null && LIMB.has(next)) return null;
    return { value: enOnes, next: i + 1 };
  }
  const esTens = ES_TENS.get(word);
  if (esTens != null) {
    const after = wordAt(toks, i + 2);
    const ones = next === "y" && after != null ? ES_ONES.get(after) : undefined;
    return ones != null && ones >= 1 && ones <= 9
      ? { value: esTens + ones, next: i + 3 }
      : { value: esTens, next: i + 1 };
  }
  const esOnes = ES_ONES.get(word);
  if (esOnes != null && (word !== "once" || spanish)) return { value: esOnes, next: i + 1 };
  return null;
}

/** After "hundred": an optional "and" plus a number below one hundred. */
function readHundredTail(toks: Tok[], i: number, base: number, spanish: boolean): NumberRead {
  const link = wordAt(toks, i);
  const tail = readSmallNumber(toks, link === "and" || link === "y" ? i + 1 : i, spanish);
  return tail && tail.value > 0 && tail.value < 100
    ? { value: base + tail.value, next: tail.next }
    : { value: base, next: i };
}

function readNumber(toks: Tok[], i: number, spanish: boolean): NumberRead | null {
  const word = wordAt(toks, i);
  if (word == null) return null;
  const next = wordAt(toks, i + 1);
  if (word === "a" || word === "an") {
    if (next === "hundred") return readHundredTail(toks, i + 2, 100, spanish);
    if (next === "dozen") return { value: 12, next: i + 2 };
    if (next === "couple") return { value: 2, next: wordAt(toks, i + 2) === "of" ? i + 3 : i + 2 };
    return null;
  }
  if (word === "hundred") return readHundredTail(toks, i + 1, 100, spanish);
  if (word === "cien" || word === "ciento") return readHundredTail(toks, i + 1, 100, spanish);
  if (word === "dozen") return { value: 12, next: i + 1 };
  if (word === "couple") return { value: 2, next: next === "of" ? i + 2 : i + 1 };
  const small = readSmallNumber(toks, i, spanish);
  if (!small) return null;
  const after = wordAt(toks, small.next);
  if (after === "hundred" && small.value >= 1 && small.value <= 9) {
    return readHundredTail(toks, small.next + 1, small.value * 100, spanish);
  }
  if (after === "dozen" && small.value >= 1 && small.value <= 9) {
    return { value: small.value * 12, next: small.next + 1 };
  }
  return small;
}

function foldNumberWords(toks: Tok[]): Tok[] {
  const spanish = toks.some((tok) => tok.n == null && SPANISH_HINT.has(tok.t));
  const out: Tok[] = [];
  let i = 0;
  while (i < toks.length) {
    const read = readNumber(toks, i, spanish);
    if (read) {
      out.push(num(read.value));
      i = read.next;
    } else {
      out.push(toks[i]);
      i++;
    }
  }
  return out;
}

/** Decimals ("22 point 5"), halves ("and a half") and a few joins that must happen before splitting. */
function refineNumbers(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    const prev = out[out.length - 1];
    const fraction = toks[i + 1];
    if (isWord(tok, "point") && isNum(prev) && Number.isInteger(prev.n) && isNum(fraction) && Number.isInteger(fraction.n)) {
      prev.n = Number(`${prev.n}.${fraction.n}`);
      i++;
      continue;
    }
    // "and a half" / "y medio": add to the number, or to the number in front of its unit.
    const halfLength =
      isWord(tok, "and") && wordAt(toks, i + 1) === "a" && wordAt(toks, i + 2) === "half"
        ? 3
        : isWord(tok, "y") && /^medi[oa]$/.test(wordAt(toks, i + 1) ?? "")
          ? 2
          : 0;
    if (halfLength > 0 && prev != null) {
      if (isNum(prev)) {
        prev.n += 0.5;
        i += halfLength - 1;
        continue;
      }
      if (free(prev, MEASURE)) {
        const before = out[out.length - 2];
        if (isNum(before)) before.n += 0.5;
        else if (free(before, ONE_ARTICLE)) out[out.length - 2] = num(1.5);
        else out.splice(out.length - 1, 0, num(1.5));
        i += halfLength - 1;
        continue;
      }
    }
    // "half a minute"
    if (isWord(tok, "half") && free(toks[i + 1], ONE_ARTICLE) && free(toks[i + 2], MEASURE)) {
      out.push(num(0.5));
      i++;
      continue;
    }
    // "1 minute and 30 seconds" is one duration, not two movements.
    if (
      isWord(tok, "and", "y", "con") &&
      free(prev, MINUTE) &&
      isNum(toks[i + 1]) &&
      (free(toks[i + 2], SECOND) || i + 2 >= toks.length)
    ) {
      continue;
    }
    // "followed by" is a separator, and its "by" must not read as "3 by 10".
    if (isWord(tok, "followed") && wordAt(toks, i + 1) === "by") {
      out.push({ t: "then" });
      i++;
      continue;
    }
    out.push(tok);
  }
  return out;
}

function normalizeTokens(transcript: string): Tok[] {
  const toks = rewriteMisheard(tokenize(transcript));
  lockVocabulary(toks);
  return refineNumbers(foldNumberWords(toks));
}

/** "10 swings, 10 push ups" — numbers as digits, sentence breaks as commas. */
const renderTokens = (toks: Tok[]): string =>
  toks
    .map((tok) => (tok.n != null ? `${tok.n}${tok.plural ? "s" : ""}` : tok.t))
    .join(" ")
    .replace(/( ,)+/g, ",")
    .replace(/^[, ]+|[, ]+$/g, "");

// ── Segments ────────────────────────────────────────────────────────────

interface SpokenWeight {
  each: number;
  count?: number;
  unit?: "kg" | "lb";
  implement?: ExerciseCategory | null;
  /** Count was not said but implied by a plural ("with 16s") — total is a pair, flagged. */
  pair?: boolean;
}

interface Segment {
  /** What is left after the quantities are peeled off — the movement name. */
  toks: Tok[];
  reps?: number;
  sets?: number;
  /** Sets came from "rounds" — they cover every movement in the clip. */
  rounds?: boolean;
  seconds?: number;
  perSide?: boolean;
  /** "24 kilos in each hand" — said of the weight, so it is two implements, not reps per side. */
  eachHand?: boolean;
  vest?: VoiceLoad;
  weight?: SpokenWeight;
  /** "…all with a vest" — the load covers every movement in the clip. */
  global?: boolean;
  /** A weight that could be read two ways, or was out of range. */
  ambiguous?: boolean;
  /** Numbers the grammar could not place. */
  stray?: boolean;
  /** "for"/"to"/"too" stripped from directly in front of the name — a possible misheard rep count. */
  leadWord?: string;
}

function splitSegments(toks: Tok[]): Tok[][] {
  const segments: Tok[][] = [[]];
  for (const tok of toks) {
    if (free(tok, SEPARATOR)) segments.push([]);
    else segments[segments.length - 1].push(tok);
  }
  return segments.filter((s) => s.length > 0).flatMap(splitRunOn);
}

/**
 * "10 swings 10 push ups" — a number-first list with no "and" between the
 * movements. Only split where a number sits between two movements, so
 * "swings 10 24", "10 swings 24 kilos" and "with one 24 kilo" are untouched.
 */
function splitRunOn(seg: Tok[]): Tok[][] {
  const first = seg.findIndex((tok) => !free(tok, EDGE_STOP) && !free(tok, FILLER));
  if (first < 0 || !isNum(seg[first])) return [seg];
  const out: Tok[][] = [];
  let start = 0;
  for (let i = first + 1; i < seg.length - 1; i++) {
    const prev = seg[i - 1];
    // The number has to follow a name word, or the tail of a weight phrase ("…24 kilos 10 squats").
    const endsMovement = isNameish(prev) || unitOf(prev) != null || free(prev, IMPLEMENT);
    if (!isNum(seg[i]) || seg[i].plural || !endsMovement) continue;
    const next = seg[i + 1];
    const startsName = isNameish(next) || (free(next, IMPLEMENT) && isNameish(seg[i + 2]));
    if (!startsName) continue;
    out.push(seg.slice(start, i));
    start = i;
  }
  out.push(seg.slice(start));
  return out;
}

function takePerSide(seg: Segment) {
  const t = seg.toks;
  for (let i = 0; i < t.length - 1; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (a.lock || b.lock || a.n != null || b.n != null) continue;
    const hit =
      (EACH.has(a.t) && SIDE.has(b.t)) ||
      (a.t === "both" && BOTH_SIDES.has(b.t)) ||
      // "10 a side" — but not "a side plank".
      (a.t === "a" && b.t === "side" && (isNum(t[i - 1]) || !(isNameish(t[i + 2]) || free(t[i + 2], IMPLEMENT))));
    if (!hit) continue;
    const lo = free(t[i - 1], SIDE_LEAD) ? i - 1 : i;
    const ofWeight = HAND.has(b.t) && (unitOf(t[lo - 1]) != null || free(t[lo - 1], IMPLEMENT));
    t.splice(lo, i + 2 - lo);
    if (ofWeight) seg.eachHand = true;
    else seg.perSide = true;
    return;
  }
}

function takeGlobalMarker(seg: Segment) {
  const t = seg.toks;
  const i = t.findIndex((tok, j) => free(tok, GLOBAL) && free(t[j + 1], LOAD_LEAD));
  if (i < 0) return;
  t.splice(i, 1);
  seg.global = true;
}

function takeVest(seg: Segment, defaultKg: number) {
  const t = seg.toks;
  const v = t.findIndex((tok) => free(tok, VEST));
  if (v < 0) return;
  let lo = v;
  let hi = v;
  let stated: { n: number; unit?: "kg" | "lb" } | undefined;
  if (t[v].t !== "vested") {
    if (isWord(t[lo - 1], "weighted", "weight")) lo--;
    const unitBefore = unitOf(t[lo - 1]);
    const unitNumber = t[lo - 2];
    const bareNumber = t[lo - 1];
    if (unitBefore && isNum(unitNumber)) {
      stated = { n: unitNumber.n, unit: unitBefore }; // "a 10 kilo vest"
      lo -= 2;
    } else if (isNum(bareNumber) && (free(t[lo - 2], ARTICLE) || free(t[lo - 2], VEST_PREP))) {
      stated = { n: bareNumber.n }; // "with a 10 vest"
      lo -= 1;
    }
    if (isWord(t[hi + 1], "on")) hi++; // "with the vest on"
    if (!stated) {
      const linked = free(t[hi + 1], VEST_LINK);
      const j = linked ? hi + 2 : hi + 1;
      const amount = t[j];
      if (isNum(amount)) {
        const unit = unitOf(t[j + 1]);
        const after = t[j + (unit ? 2 : 1)];
        // "vest 15", "vest of 10 kilos" — but "with a vest 15 swings" keeps its reps.
        if (unit || linked || !(isNameish(after) || free(after, IMPLEMENT))) {
          stated = { n: amount.n, unit };
          hi = unit ? j + 1 : j;
        }
      }
    }
  }
  if (free(t[lo - 1], ARTICLE)) lo--;
  if (free(t[lo - 1], VEST_PREP)) lo--;
  t.splice(lo, hi - lo + 1);

  if (!stated) {
    seg.vest = { type: "vest", kg: defaultKg, assumed: true };
    return;
  }
  const kg = round1(stated.unit === "lb" ? stated.n * LB_TO_KG : stated.n);
  if (kg >= VEST_MIN_KG && kg <= VEST_MAX_KG) {
    seg.vest = { type: "vest", kg };
  } else {
    seg.vest = { type: "vest", kg: defaultKg, assumed: true };
    seg.ambiguous = true;
  }
}

function takeDuration(seg: Segment) {
  const t = seg.toks;
  let lo = -1;
  let hi = -1;
  let seconds = 0;
  const m = t.findIndex((tok) => free(tok, MINUTE));
  if (m >= 0) {
    lo = m;
    hi = m;
    let minutes = 1; // "minute plank", "a minute of planks"
    const before = t[m - 1];
    if (isNum(before)) {
      minutes = before.n;
      lo = m - 1;
    } else if (free(before, ONE_ARTICLE)) {
      lo = m - 1;
    }
    // "1 minute 30", "1 minute 30 seconds"
    const extra = t[m + 1];
    if (isNum(extra) && !extra.plural && Number.isInteger(extra.n) && extra.n < 60) {
      const after = t[m + 2];
      if (free(after, SECOND)) {
        seconds = extra.n;
        hi = m + 2;
      } else if (
        // A bare number after "minute" is seconds only when it sounds like
        // seconds ("a minute thirty", "one minute 45"). "1 minute 10 push
        // ups" is ten push-ups in a minute, not a 70-second push-up.
        extra.n >= 15 &&
        extra.n % 5 === 0 &&
        !(unitOf(after) || free(after, REPS) || free(after, SETS) || free(after, ROUNDS) || free(after, TIMES))
      ) {
        seconds = extra.n;
        hi = m + 1;
      }
    }
    seconds += minutes * 60;
  } else {
    const s = t.findIndex((tok, i) => free(tok, SECOND) && isNum(t[i - 1]));
    if (s < 0) return;
    const amount = t[s - 1];
    if (!isNum(amount)) return;
    seconds = amount.n;
    lo = s - 1;
    hi = s;
  }
  if (free(t[lo - 1], DURATION_PREP)) lo--; // "plank FOR 45 seconds"
  if (free(t[hi + 1], OF)) hi++; // "90 seconds OF farmer carry"
  t.splice(lo, hi - lo + 1);
  seconds = Math.round(seconds);
  if (seconds > 0) seg.seconds = seconds;
  else seg.stray = true;
}

interface CountRead {
  count: number;
  /** Index of the first token the count phrase covers. */
  lo: number;
}

/**
 * The implement count that ends at index `j`, directly in front of the
 * per-implement number: "double", "single", "pair of", "2 x" (after a
 * preposition), or a bare 1/2 when the phrasing makes it a count.
 */
function readCount(t: Tok[], j: number, each: number, hi: number, pairCue: boolean): CountRead | null {
  const tok = t[j];
  if (tok == null || tok.lock) return null;
  if (tok.n == null) {
    const word = COUNT_WORD.get(tok.t);
    if (word != null) return { count: word, lo: j };
    if (OF.has(tok.t) && free(t[j - 1], COUNT_PAIR)) return { count: 2, lo: j - 1 };
    const multiplier = t[j - 1];
    if (
      TIMES.has(tok.t) &&
      isNum(multiplier) &&
      (multiplier.n === 1 || multiplier.n === 2) &&
      (free(t[j - 2], PREP) || free(t[j - 2], ARTICLE))
    ) {
      return { count: multiplier.n, lo: j - 1 }; // "with 2 x 16"
    }
    return null;
  }
  if (tok.plural || (tok.n !== 1 && tok.n !== 2)) return null;
  // "one 24 kilo" — a count when a preposition/article leads it, the implement
  // is plural, or another number is around to be the reps. Otherwise "2 16 kilo
  // swings" keeps its 2 as reps.
  const led = free(t[j - 1], PREP) || free(t[j - 1], ARTICLE);
  const otherNumber = t.some((other, i) => isNum(other) && i !== j && (i < each || i > hi));
  return led || pairCue || otherNumber ? { count: tok.n, lo: j } : null;
}

interface WeightHit {
  lo: number;
  hi: number;
  weight: SpokenWeight;
}

/** Grow a weight phrase outward from its per-implement number at `each` (unit, if any, at `end`). */
function spanWeight(t: Tok[], each: number, end: number, unit: "kg" | "lb" | undefined): WeightHit {
  const eachTok = t[each];
  const weight: SpokenWeight = { each: eachTok.n ?? 0 };
  if (unit) weight.unit = unit;
  let hi = end;
  let pluralImplement = false;
  let sawImplement = false;
  const right = t[hi + 1];
  if (free(right, IMPLEMENT)) {
    // "24 kilo kettlebell(s)", "pesa rusa"
    hi++;
    weight.implement = IMPLEMENT.get(right.t) ?? null;
    pluralImplement = PLURAL_IMPLEMENT.has(right.t);
    sawImplement = true;
    if (free(t[hi + 1], RUSA)) hi++;
  }
  if (isWord(t[hi + 1], "each", "apiece")) hi++; // "16 kilos each"

  let i = each - 1;
  const direct = readCount(t, i, each, hi, pluralImplement || eachTok.plural === true);
  if (direct) {
    weight.count = direct.count;
    i = direct.lo - 1;
  }
  // Glue to the left: articles, "of", the preposition, and one implement word
  // ("with a kettlebell of 24 kilos", "barbell at 60 kilos", "two kettlebells at 16 kilos").
  for (;;) {
    const tok = t[i];
    if (tok == null || tok.lock || tok.n != null) break;
    if (ARTICLE.has(tok.t)) {
      if (weight.count == null && ONE_ARTICLE.has(tok.t)) weight.count = 1;
      i--;
    } else if (OF.has(tok.t) || PREP.has(tok.t)) {
      i--;
    } else if (!sawImplement && (IMPLEMENT.has(tok.t) || (RUSA.has(tok.t) && free(t[i - 1], IMPLEMENT)))) {
      if (RUSA.has(tok.t)) i--;
      const implement = t[i];
      weight.implement = IMPLEMENT.get(implement.t) ?? null;
      pluralImplement = pluralImplement || PLURAL_IMPLEMENT.has(implement.t);
      sawImplement = true;
      i--;
      if (weight.count == null) {
        const counted = readCount(t, i, each, hi, true);
        if (counted) {
          weight.count = counted.count;
          i = counted.lo - 1;
        }
      }
    } else {
      break;
    }
  }
  // A plural with no count ("with 16s", "20 kilo dumbbells") is a pair, flagged.
  if ((eachTok.plural || pluralImplement) && weight.count == null) weight.pair = true;
  return { lo: i + 1, hi, weight };
}

function findWeight(t: Tok[]): WeightHit | null {
  // 1. A number with a unit is a weight wherever it sits.
  for (let u = 1; u < t.length; u++) {
    const unit = unitOf(t[u]);
    if (unit && isNum(t[u - 1])) return spanWeight(t, u - 1, u, unit);
  }
  // 2. Count forms with no unit: "double 16s", "two 16s", "a pair of 20s", "single 24".
  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    if (!isNum(tok)) continue;
    const before = t[i - 1];
    const counted =
      free(before, COUNT_WORD) || (free(before, OF) && free(t[i - 2], COUNT_PAIR)) || tok.plural === true;
    if (counted) return spanWeight(t, i, i, undefined);
  }
  // 3. A bare number after with/at/using: "with the 24", "at 24", "with two 16".
  for (let p = 0; p < t.length; p++) {
    if (!free(t[p], PREP)) continue;
    let i = p + 1;
    while (free(t[i], ARTICLE)) i++;
    const first = t[i];
    if (!isNum(first)) continue;
    if (isNum(t[i + 1]) && (first.n === 1 || first.n === 2)) i += 1;
    else if (free(t[i + 1], TIMES) && isNum(t[i + 2])) i += 2;
    const after = t[i + 1];
    const blocked =
      isNum(after) ||
      isNameish(after) ||
      free(after, REPS) ||
      free(after, SETS) ||
      free(after, ROUNDS) ||
      free(after, SECOND) ||
      free(after, MINUTE) ||
      free(after, TIMES);
    if (!blocked) return spanWeight(t, i, i, undefined);
  }
  return null;
}

function takeWeight(seg: Segment) {
  const hit = findWeight(seg.toks);
  if (!hit) {
    if (seg.eachHand) seg.perSide = true; // no weight after all — it was about the reps
    return;
  }
  seg.toks.splice(hit.lo, hit.hi - hit.lo + 1);
  seg.weight = hit.weight;
  if (seg.eachHand) {
    seg.weight.count = 2;
    delete seg.weight.pair;
  }
  if (seg.weight.pair) seg.ambiguous = true;
}

function takeSets(seg: Segment) {
  const t = seg.toks;
  // "3 sets of", "5 rounds of", "for 3 sets", "one more set of"
  for (let i = 0; i < t.length - 1; i++) {
    const count = t[i];
    if (!isNum(count)) continue;
    const word = isWord(t[i + 1], "more", "extra", "mas") ? i + 2 : i + 1;
    const rounds = free(t[word], ROUNDS);
    if (!rounds && !free(t[word], SETS)) continue;
    const lo = free(t[i - 1], DURATION_PREP) ? i - 1 : i;
    const hi = free(t[word + 1], OF) ? word + 1 : word;
    seg.sets = count.n;
    if (rounds) seg.rounds = true;
    t.splice(lo, hi - lo + 1);
    break;
  }
  // "3 by 10", "3 x 10", "3 times 10"
  for (let i = 0; i < t.length - 2; i++) {
    const a = t[i];
    const b = t[i + 2];
    if (!isNum(a) || !free(t[i + 1], TIMES) || !isNum(b)) continue;
    if (seg.sets == null) {
      seg.sets = a.n;
      seg.reps = b.n;
      t.splice(i, 3);
    }
    break;
  }
}

function takeReps(seg: Segment) {
  const t = seg.toks;
  // "10 reps", "10 reps of"
  for (let i = 0; i < t.length - 1; i++) {
    const count = t[i];
    if (!isNum(count) || !free(t[i + 1], REPS)) continue;
    if (seg.reps == null) seg.reps = count.n;
    else seg.stray = true;
    t.splice(i, free(t[i + 2], OF) ? 3 : 2);
    break;
  }
  // "x 10", "times 10"
  for (let i = 0; i < t.length - 1; i++) {
    const count = t[i + 1];
    if (!free(t[i], TIMES) || !isNum(count)) continue;
    if (seg.reps == null) seg.reps = count.n;
    else seg.stray = true;
    t.splice(i, 2);
    break;
  }
  // "10 times" — reps, or sets of a hold ("plank 30 seconds 3 times").
  for (let i = 0; i < t.length - 1; i++) {
    const count = t[i];
    if (!isNum(count) || !free(t[i + 1], TIMES)) continue;
    if (seg.seconds != null && seg.sets == null && seg.reps == null) seg.sets = count.n;
    else if (seg.reps == null) seg.reps = count.n;
    else seg.stray = true;
    t.splice(i, 2);
    break;
  }
  // Bare numbers: the first is the reps; a second one is an unlabelled weight
  // ("swings 10 24") — kept, but flagged.
  for (let i = 0; i < t.length; ) {
    const tok = t[i];
    if (!isNum(tok)) {
      i++;
      continue;
    }
    t.splice(i, 1);
    if (seg.reps == null && Number.isInteger(tok.n) && !tok.plural) {
      seg.reps = tok.n;
    } else if (seg.weight == null) {
      seg.weight = { each: tok.n };
      seg.ambiguous = true;
    } else {
      seg.stray = true;
    }
  }
}

/** Drop quantities that cannot be real rather than pass them on. */
function sanitize(seg: Segment) {
  if (seg.reps != null && (!Number.isInteger(seg.reps) || seg.reps < 1 || seg.reps > 5000)) {
    delete seg.reps;
    seg.stray = true;
  }
  if (seg.sets != null && (!Number.isInteger(seg.sets) || seg.sets < 1 || seg.sets > 100)) {
    delete seg.sets;
    delete seg.rounds;
    seg.stray = true;
  }
}

/** Strip filler and connective words from the edges; names keep their inner words ("clean and press"). */
function trimName(seg: Segment) {
  const t = seg.toks.filter((tok) => !free(tok, FILLER));
  let lo = 0;
  let hi = t.length;
  while (lo < hi && free(t[lo], EDGE_STOP)) lo++;
  while (hi > lo && free(t[hi - 1], EDGE_STOP)) hi--;
  const lead = lo > 0 && lo < hi ? t[lo - 1] : undefined;
  if (lead != null && HOMOPHONE.has(lead.t)) seg.leadWord = lead.t;
  seg.toks = t.slice(lo, hi);
}

function parseSegment(toks: Tok[], defaultVestKg: number): Segment {
  const seg: Segment = { toks: [...toks] };
  takeGlobalMarker(seg);
  takePerSide(seg);
  takeVest(seg, defaultVestKg);
  takeDuration(seg);
  takeWeight(seg);
  takeSets(seg);
  takeReps(seg);
  sanitize(seg);
  trimName(seg);
  return seg;
}

const hasLoad = (seg: Segment) => seg.weight != null || seg.vest != null;
const hasAnything = (seg: Segment) =>
  seg.reps != null || seg.seconds != null || seg.sets != null || hasLoad(seg) || seg.perSide === true;

/** Fold a nameless fragment's fields into `into` when none of them collide. */
function absorb(into: Segment, from: Segment): boolean {
  const collides =
    (into.reps != null && from.reps != null) ||
    (into.seconds != null && from.seconds != null) ||
    (into.sets != null && from.sets != null) ||
    (into.weight != null && from.weight != null) ||
    (into.vest != null && from.vest != null);
  if (collides) return false;
  into.reps ??= from.reps;
  into.seconds ??= from.seconds;
  into.sets ??= from.sets;
  into.weight ??= from.weight;
  into.vest ??= from.vest;
  if (from.perSide) into.perSide = true;
  if (from.rounds) into.rounds = true;
  if (from.global) into.global = true;
  if (from.ambiguous) into.ambiguous = true;
  if (from.stray) into.stray = true;
  return true;
}

/**
 * A fragment with no movement of its own ("…and a 24 kilo kettlebell",
 * "…, each side", "5 rounds:") belongs to its neighbour. Then spread what was
 * said about the whole clip: rounds, a leading load, and "all/both with…".
 */
function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  let lead: Segment | null = null;
  let rounds: number | undefined;
  for (const seg of segments) {
    if (seg.rounds && seg.sets != null) rounds ??= seg.sets;
    if (seg.toks.length > 0) {
      out.push(seg);
      continue;
    }
    if (!hasAnything(seg)) continue;
    const prev = out[out.length - 1];
    if (prev != null && absorb(prev, seg)) continue;
    if (prev == null && seg.reps == null && seg.seconds == null) {
      if (lead == null) lead = seg;
      else absorb(lead, seg);
      continue;
    }
    out.push(seg); // a quantity with no movement — surfaces as "unparsed"
  }
  // Only a load or a set count was said — nothing to attach it to.
  if (out.length === 0) return lead != null ? [lead] : [];

  const spread = (from: Segment) => {
    for (const seg of out) {
      if (seg === from) continue;
      const inherits = (seg.weight == null && from.weight != null) || (seg.vest == null && from.vest != null);
      seg.weight ??= from.weight;
      seg.vest ??= from.vest;
      if (inherits && from.ambiguous) seg.ambiguous = true;
    }
  };
  if (lead != null) {
    spread(lead);
    for (const seg of out) seg.sets ??= lead.sets;
  }
  for (const seg of out) if (seg.global) spread(seg);
  if (rounds != null) for (const seg of out) seg.sets ??= rounds;
  return out;
}

// ── Exercise matching ───────────────────────────────────────────────────

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Total edits between two names word by word, or null when any word is too far off. */
function wordEdits(spoken: string[], key: string[]): number | null {
  if (spoken.length !== key.length) return null;
  let edits = 0;
  for (let i = 0; i < spoken.length; i++) {
    if (spoken[i] === key[i]) continue;
    const shortest = Math.min(spoken[i].length, key[i].length);
    const allowed = shortest >= 8 ? 2 : shortest >= 5 ? 1 : 0;
    if (allowed === 0) return null;
    const distance = editDistance(spoken[i], key[i]);
    if (distance > allowed) return null;
    edits += distance;
  }
  return edits;
}

function indexOfWords(words: string[], phrase: string[]): number {
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((word, j) => words[i + j] === word)) return i;
  }
  return -1;
}

/**
 * Whole-word containment, with a verdict on the words the matched name did
 * not cover. `clean` means they are all harmless qualifiers — an implement
 * word counts only when it agrees with the movement's category, so
 * "kettlebell deadlifts" is not confidently the barbell Deadlift.
 *
 * The catalog's normalizer takes the longest contained key and stops, which
 * reads "kettlebell clean and press" as Kettlebell Clean ("kettlebell clean"
 * is one letter longer than "clean and press"). So the clean pass looks for
 * the longest key that explains EVERY word; only when there is none does the
 * catalog's own pick stand, as a loose match.
 */
function containment(folded: string): { def: ExerciseDef; clean: boolean } | null {
  const fallback = normalizeExerciseName(folded);
  if (!fallback) return null;
  const words = folded.split(" ");
  let best: VocabKey | null = null;
  for (const k of vocabulary()) {
    if (k.key.length < 4 || (best != null && k.key.length <= best.key.length)) continue;
    const at = indexOfWords(words, k.words);
    if (at < 0) continue;
    const extra = [...words.slice(0, at), ...words.slice(at + k.words.length)];
    const harmless = extra.every((word) => {
      if (QUALIFIER.has(word)) return true;
      if (!IMPLEMENT.has(word)) return false;
      const category = IMPLEMENT.get(word);
      return category == null || category === k.def.category;
    });
    if (harmless) best = k;
  }
  return best ? { def: best.def, clean: true } : { def: fallback, clean: false };
}

function rewriteMisheardWords(words: string[]): string[] | null {
  const toks = words.map((t): Tok => ({ t }));
  const rewritten = rewriteMisheard(toks);
  return rewritten.some((tok) => tok.heard) ? rewritten.map((tok) => tok.t) : null;
}

function fuzzyMatch(folded: string): SpokenMatch | null {
  const keys = vocabulary();
  const words = folded.split(" ");
  const stems = words.map(stem);

  // Singular/plural and spacing: "kettlebell presses", "sit ups", "dead lifts".
  const squashed = stems.join("");
  const plural = keys.find((k) => k.squashed === squashed);
  if (plural) return { def: plural.def, score: SCORE_PLURAL, by: "fuzzy" };

  // Word order: "kettlebell overhead press" is the alias "overhead press kettlebell".
  if (stems.length > 1) {
    const sorted = [...stems].sort().join(" ");
    const reordered = keys.find((k) => k.sorted === sorted);
    if (reordered) return { def: reordered.def, score: SCORE_PLURAL, by: "fuzzy" };
  }

  // Known mishearings, then the corrected text has to match cleanly.
  const heard = rewriteMisheardWords(words);
  if (heard) {
    const corrected = heard.join(" ");
    const def =
      findExerciseByExactName(corrected) ??
      keys.find((k) => k.squashed === heard.map(stem).join(""))?.def ??
      null;
    if (def) return { def, score: SCORE_MISHEARD, by: "fuzzy" };
    const contained = containment(corrected);
    if (contained?.clean) return { def: contained.def, score: SCORE_MISHEARD, by: "fuzzy" };
  }

  // Containment once plurals are folded: "double kettlebell front squats".
  const singular = containment(stems.join(" "));
  if (singular?.clean) return { def: singular.def, score: SCORE_MISHEARD, by: "fuzzy" };

  // Token-level Levenshtein: one edit for words of 5+ letters, two for 8+.
  // Shorter words must match exactly, so a lone short word never fuzzy-matches.
  let best: { def: ExerciseDef; edits: number } | null = null;
  for (const k of keys) {
    // As said and with plurals folded — whichever is closer.
    const asSaid = wordEdits(words, k.words);
    const byStem = wordEdits(stems, k.stems);
    const edits = asSaid != null && byStem != null ? Math.min(asSaid, byStem) : (asSaid ?? byStem);
    if (edits != null && edits > 0 && (best == null || edits < best.edits)) best = { def: k.def, edits };
  }
  if (best) {
    const score = best.edits === 1 ? 0.7 : best.edits === 2 ? 0.65 : 0.6;
    return { def: best.def, score, by: "fuzzy" };
  }
  return null;
}

/** Fuzzy catalog match used by the parser; exported for tests and for the LLM path to reuse. */
export function matchSpokenExercise(spoken: string): SpokenMatch {
  const folded = foldExerciseName(spoken);
  if (!folded) return NO_MATCH;

  const exact = findExerciseByExactName(folded);
  if (exact) {
    return { def: exact, score: SCORE_EXACT, by: foldExerciseName(exact.name) === folded ? "exact" : "alias" };
  }

  const contained = containment(folded);
  if (contained?.clean) return { def: contained.def, score: SCORE_CONTAINS, by: "contains" };

  const fuzzy = fuzzyMatch(folded);
  if (fuzzy) return fuzzy;

  // The catalog would call this a match, but words are left over that could
  // make it a different movement ("jump squats") — kept at a review score.
  if (contained) return { def: contained.def, score: SCORE_LOOSE, by: "contains" };
  return NO_MATCH;
}

const BARE_SQUAT = wordSet("squat squats sentadilla sentadillas");
/** Movements measured in time, where a bare number is not a rep count. */
const HOLD_NAME = /\b(plank|hold|hang|carry)\b/i;
const BODYWEIGHT_SQUAT_IDS = ["air-squat", "bodyweight-squat"];

/** The match for a segment's name, with the context only the parser has: implement, weight, rep count. */
function resolveMovement(
  words: string[],
  heard: boolean,
  hasReps: boolean,
  seg: Segment
): { match: SpokenMatch; words: string[] } {
  let name = words.join(" ");
  // "lunch"/"lunches" is "lunges" only when a rep count came with it.
  if ((name === "lunch" || name === "lunches") && hasReps) {
    name = "lunges";
    words = [name];
    heard = true;
  }
  let match = matchSpokenExercise(name);

  // The implement in the weight phrase can settle the movement: "press … with
  // a 24 kilo kettlebell" is the Kettlebell Press. Only a whole-name hit
  // counts, so "squats with a kettlebell" stays the plain Squat.
  const implement = seg.weight?.implement;
  if (implement) {
    const qualified = matchSpokenExercise(`${implement} ${name}`);
    const wholeName = qualified.by !== "contains" && qualified.score >= SCORE_PLURAL;
    if (qualified.def && wholeName && qualified.def.id !== match.def?.id) match = qualified;
  }

  // Kettlebell-first app: a bare "press" with nothing pointing at a barbell or
  // dumbbell is offered as the Kettlebell Press, for review.
  if (!match.def && /^press(es)?$/.test(name) && implement !== "barbell" && implement !== "dumbbell") {
    const press = getExerciseById("kb-press");
    if (press) match = { def: press, score: 0.6, by: "fuzzy" };
  }

  // Plain (or "bodyweight") squats with no implement are a bodyweight squat when he has minted one.
  const core = words.filter((word) => !QUALIFIER.has(word));
  if (match.def?.id === "back-squat" && seg.weight == null && core.length === 1 && BARE_SQUAT.has(core[0])) {
    const bodyweight = BODYWEIGHT_SQUAT_IDS.map((id) => getExerciseById(id)).find((def) => def != null);
    if (bodyweight) match = { ...match, def: bodyweight };
  }

  if (heard && match.def) match = { def: match.def, score: Math.min(match.score, SCORE_MISHEARD), by: "fuzzy" };
  return { match, words };
}

// ── Entries ─────────────────────────────────────────────────────────────

/** Unknown names are shown singular, like the catalog: "bear crawls" → "Bear Crawl". */
function displayName(words: string[]): string {
  const last = words[words.length - 1];
  const singular = last.length > 3 ? stem(last) : last;
  return [...words.slice(0, -1), singular]
    .map((word, i) => (i > 0 && SMALL_WORD.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * One segment → one entry, or null when there is nothing to log. `keepWeak`
 * is set once the clip is known to hold a real entry: from then on a leftover
 * fragment is surfaced for review rather than dropped, so a clip is never
 * called confident with part of it thrown away ("10 swings and bear crawls").
 */
function buildEntry(seg: Segment, keepWeak: boolean): ParsedVoiceEntry | null {
  let words = seg.toks.map((tok) => tok.t);
  const heard = seg.toks.some((tok) => tok.heard === true);
  let reps = seg.reps;
  let guessedReps = false;
  let match: SpokenMatch = NO_MATCH;

  if (words.length > 0) {
    // "for pull ups" → 4, "ate burpees" → 8: only where the rep count belongs,
    // only when nothing else supplies it, and only in front of a known movement.
    if (reps == null && seg.seconds == null) {
      const first = words[0];
      const spoken = seg.leadWord ?? (words.length > 1 && !seg.toks[0].lock && HOMOPHONE.has(first) ? first : undefined);
      const rest = seg.leadWord != null ? words : words.slice(1);
      const value = spoken != null ? HOMOPHONE.get(spoken) : undefined;
      if (value != null && matchSpokenExercise(rest.join(" ")).score >= CONFIDENT) {
        reps = value;
        words = rest;
        guessedReps = true;
      }
    }
    const resolved = resolveMovement(words, heard, reps != null, seg);
    match = resolved.match;
    words = resolved.words;
  }

  const hasQuantity = reps != null || seg.seconds != null;
  const hasNumbers = hasQuantity || seg.sets != null || hasLoad(seg);
  // No number and no solid match ("the plank is wet", "thanks for watching"):
  // chatter on its own, a fragment to review inside a real log.
  const weak = !hasNumbers && (match.def == null || match.score < SCORE_MISHEARD);
  if (weak && (!keepWeak || words.every((word) => COURTESY.has(word) || EDGE_STOP.has(word)))) return null;

  let confidence: number;
  let reason: ParsedVoiceEntry["reason"];
  if (words.length === 0) {
    confidence = 0.15;
    reason = "unparsed";
  } else if (match.def == null) {
    // A numbered unknown is a movement he has not minted yet. Without a
    // number, or when it reads like conversation, it is just unparsed.
    const chatter = !hasNumbers || words.length > 6 || words.some((word) => CHATTER.has(word));
    reason = chatter ? "unparsed" : "new_exercise";
    confidence = chatter ? 0.15 : 0.35;
  } else {
    const strong = match.score >= CONFIDENT && match.by !== "fuzzy";
    confidence = !strong ? Math.min(match.score, 0.75) : match.by === "contains" ? 0.88 : 0.95;
    if (!strong) reason = "low_match";
    // "plank 45": a count on a timed hold is far more likely seconds whose unit
    // was not said. Keep the number as spoken, but do not vouch for it.
    const unitlessHold = reps != null && seg.seconds == null && HOLD_NAME.test(match.def.name);
    if (!hasQuantity || guessedReps || unitlessHold) {
      confidence = Math.min(confidence, 0.6);
      reason ??= "no_quantity";
    }
  }

  // Total implement load. Out-of-range totals are dropped, not clamped.
  let weightKg: number | undefined;
  let ambiguous = seg.ambiguous === true;
  if (seg.weight != null) {
    const count = seg.weight.count ?? (seg.weight.pair ? 2 : 1);
    const total = round1(count * seg.weight.each * (seg.weight.unit === "lb" ? LB_TO_KG : 1));
    if (total >= WEIGHT_MIN_KG && total <= WEIGHT_MAX_KG) weightKg = total;
    else ambiguous = true;
  }
  if (ambiguous) {
    confidence = Math.min(confidence, 0.7);
    reason ??= "ambiguous_weight";
  }
  if (seg.stray) {
    confidence = Math.min(confidence, 0.5);
    reason ??= "unparsed";
  }

  const entry: ParsedVoiceEntry = {
    name: match.def?.name ?? (words.length > 0 ? displayName(words) : ""),
    confidence,
    needsReview: reason != null,
    matchedBy: match.def ? match.by : "none",
  };
  if (match.def) entry.exercise = match.def.id;
  if (reps != null) entry.reps = reps;
  if (seg.sets != null) entry.sets = seg.sets;
  if (weightKg != null) entry.weightKg = weightKg;
  if (seg.seconds != null) entry.seconds = seg.seconds;
  if (seg.perSide) entry.perSide = true;
  if (seg.vest) entry.load = { ...seg.vest };
  if (seg.weight != null) {
    entry.spoken = { each: seg.weight.each };
    if (seg.weight.unit) entry.spoken.unit = seg.weight.unit;
    if (seg.weight.count != null) entry.spoken.count = seg.weight.count;
  }
  if (reason) entry.reason = reason;
  return entry;
}

export function parseVoiceEntries(transcript: string, opts: VoiceParseOptions = {}): VoiceParseResult {
  const defaultVestKg =
    opts.defaultVestKg != null && Number.isFinite(opts.defaultVestKg) && opts.defaultVestKg > 0
      ? opts.defaultVestKg
      : DEFAULT_VEST_KG;
  const toks = normalizeTokens(typeof transcript === "string" ? transcript : "");
  const segments = splitSegments(toks).map((seg) => parseSegment(seg, defaultVestKg));
  const merged = mergeSegments(segments);
  const logged = merged.some((seg) => buildEntry(seg, false) != null);
  const entries: ParsedVoiceEntry[] = [];
  for (const seg of merged) {
    const entry = buildEntry(seg, logged);
    if (entry) entries.push(entry);
  }
  return {
    entries,
    confident: entries.length > 0 && entries.every((e) => e.confidence >= CONFIDENT && !e.needsReview),
    normalized: renderTokens(toks),
  };
}

// ── Display ─────────────────────────────────────────────────────────────

const trimKg = (kg: number) => String(round1(kg));

function clock(seconds: number): string {
  if (seconds <= 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** One short line for the watch: "KB Swing ×10 · 24 kg", "Push-Up 3×10", "Plank 45s", "Squat ×10 · vest 5 kg", "? Bear Crawl ×10". */
export function voiceDisplayLine(entry: ParsedVoiceEntry): string {
  const name = entry.name.replace(/^One-Arm Kettlebell\b/, "One-Arm KB").replace(/^Kettlebell /, "KB ");
  const sets = entry.sets != null && entry.sets > 1 ? entry.sets : null;
  const side = entry.perSide ? "/side" : "";
  const parts: string[] = [];
  if (entry.reps != null) parts.push(`${sets ? `${sets}×` : "×"}${entry.reps}${side}`);
  if (entry.seconds != null) {
    const hold = clock(entry.seconds);
    parts.push(entry.reps != null ? hold : `${sets ? `${sets}×` : ""}${hold}${side}`);
  }
  if (parts.length === 0 && sets) parts.push(`${sets} sets`);

  const chunks = [[name, ...parts].filter((part) => part.length > 0).join(" ")];
  if (entry.weightKg != null) chunks.push(`${trimKg(entry.weightKg)} kg`);
  if (entry.load) chunks.push(`vest ${trimKg(entry.load.kg)} kg`);
  const line = chunks.filter((chunk) => chunk.length > 0).join(" · ");
  return entry.needsReview ? `? ${line}` : line;
}

/**
 * Last look at a clip's entries, whichever parser produced them, before the
 * wrist is shown anything:
 *  - a fragment with no movement name ("another 10", "with a vest") is not
 *    an entry — there is nothing to show or to log;
 *  - in a clip naming several movements, an implement weight that landed on
 *    a bodyweight one ("8 swings, 8 push-ups with the 20") most likely
 *    belonged to its neighbour, so it is kept but flagged rather than
 *    trusted.
 */
export function finalizeVoiceEntries(entries: ParsedVoiceEntry[]): ParsedVoiceEntry[] {
  const named = entries.filter((e) => e.name.trim().length > 0);
  if (named.length < 2) return named;
  return named.map((e) => {
    if (e.weightKg == null || !e.exercise || e.needsReview) return e;
    if (getExerciseById(e.exercise)?.category !== "bodyweight") return e;
    return {
      ...e,
      needsReview: true,
      reason: "ambiguous_weight" as const,
      confidence: Math.min(e.confidence, 0.6),
    };
  });
}
