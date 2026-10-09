// Rule-based parser for the watch's mid-workout voice clips ("10 kettlebell
// swings", "10 squats with a vest"). Transcript in, structured exercise
// entries out — no LLM, no I/O, no Prisma. The LLM only sees transcripts this
// parser is NOT confident about, so the contract is asymmetric on purpose:
//   - when `confident` is true the entries must be right;
//   - anything shaky is kept but flagged (needsReview + reason), never dropped
//     and never padded with numbers that were not said.
//
// Pipeline: tokenize → fold number words (EN/ES) → fold on/off intervals and
// restatements ("which are…") → split into movements → peel quantities off
// each segment (per-side, vest, interval, duration, weight, sets, reps) →
// whatever words remain are the movement name → match the catalog.
//
// Weights are reported PER IMPLEMENT, as spoken: "two 16s" is weightKg 16 with
// implements 2, never 32. Nothing here sums a pair.
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
  /** Weight of ONE implement in kg, as spoken, rounded to 0.1. Never a total — see `implements`. */
  weightKg?: number;
  /** 2 when he used a pair — two bells/dumbbells, "double", "in each hand", "N kilos on each side". Absent = one implement. */
  implements?: 2;
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
  /** Kettlebells he owns, in kg, from the watch's rack. Absent/empty = unknown. */
  bells?: number[];
  /** The entry logged just before this clip in the same session, if any. */
  previous?: VoicePrevious;
}

/** What a clip with no movement of its own ("another 8", "same again") refers back to. */
export interface VoicePrevious {
  name: string;
  exercise?: string;
  reps?: number;
  sets?: number;
  seconds?: number;
  weightKg?: number;
  implements?: 2;
  perSide?: boolean;
  load?: VoiceLoad;
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
/** Heaviest single kettlebell that is believable. Above it the number was most likely misheard ("sixteen" → "60"). */
const KETTLEBELL_MAX_KG = 48;

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
const HAND = wordSet("hand hands mano manos");
/** Side words that, said of a WEIGHT, mean one implement per hand ("16 kilos each side"). Arm/leg/way stay reps per side. */
const PAIR_SIDE = wordSet("side sides hand hands lado lados mano manos");
/** "ON each side", "IN each hand" — where the weight is, as opposed to "per side". */
const LOCATIVE = wordSet("on in en");
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
    "weighted once finished completed last were"
);
/** Words for how a block was run, never the movement itself ("EMOMs", "intervals"). */
const DESCRIPTOR = wordSet("emom emoms interval intervals");
/** The token an "N on, M off" phrase is folded into. */
const INTERVAL = "<interval>";
/** Says "the same again" all by itself. */
const REPEAT_CUE = wordSet("again same repeat ditto mismo misma igual");
/** Says it only with something to count: "another SET", "ONE more", "otra VEZ". Alone ("More.") it is as likely noise. */
const REPEAT_MORE = wordSet("another more otra otro mas");
const REPEAT_UNIT = wordSet("set sets round rounds time vez serie ronda vuelta");
/** What is left of a name once a repeat phrase is trimmed ("same THING", "did IT again", "same AS BEFORE"). */
const REPEAT_NAME = wordSet(
  "same thing it as before time repeat ditto exactly again but weight vez mismo misma igual lo"
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
  ...DESCRIPTOR,
  INTERVAL,
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
  /** "30 seconds on, 30 seconds off", in seconds (t is INTERVAL). */
  interval?: { work: number; rest: number };
  /**
   * A separator that says the next part is the SAME thing said another way
   * ("which are", "that is", "aka") or a correction of it ("or rather").
   */
  restate?: "same" | "fix";
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
    .replace(/\bi\.\s?e\./g, " ie ") // "i.e." would otherwise read as two sentence breaks
    .replace(/\ba\.\s?k\.\s?a\.?/g, " aka ")
    // "30/30", "20/10" — work/rest. Small numbers ("5/3/1") are something else.
    .replace(/(^|[^\d/.])(\d+)\s?\/\s?(\d+)(?![\d/.])/g, (whole, lead: string, a: string, b: string) =>
      Number(a) >= 5 && Number(a) <= 600 && Number(b) >= 5 && Number(b) <= 600 ? `${lead}${a} on ${b} off` : whole
    )
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
  /** Stems word for word — "clean and jerks" and "cleans and jerk" both read "clean and jerk". */
  stemmed: string;
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
      keys.push({
        def,
        key,
        words,
        stems,
        stemmed: stems.join(" "),
        squashed: stems.join(""),
        sorted: [...stems].sort().join(" "),
      });
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

interface IntervalPart {
  n: number;
  /** Seconds per unit said — 0 when no unit was said. */
  unit: 0 | 1 | 60;
  next: number;
}

/** "30 seconds on", "30 on", "1 minute off" — one half of a work/rest pattern. */
function readIntervalPart(toks: Tok[], i: number, word: "on" | "off"): IntervalPart | null {
  const amount = toks[i];
  if (!isNum(amount) || amount.plural || amount.n <= 0) return null;
  const unit = free(toks[i + 1], SECOND) ? 1 : free(toks[i + 1], MINUTE) ? 60 : 0;
  const at = unit > 0 ? i + 2 : i + 1;
  if (!isWord(toks[at], word)) return null;
  return { n: amount.n, unit, next: at + 1 };
}

/**
 * Work/rest patterns become one token before the clip is split, because the
 * recogniser puts a comma in the middle of them ("30 second on, 30 second
 * off"). A half with no unit takes the other half's; with none said at all
 * they are seconds. "Every minute on the minute" is just the long way to say EMOM.
 */
function foldIntervals(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < toks.length) {
    // "every minute on the minute", or just "on the minute"
    const every = isWord(toks[i], "every") && free(toks[i + 1], MINUTE) ? 2 : 0;
    if (isWord(toks[i + every], "on") && isWord(toks[i + every + 1], "the") && free(toks[i + every + 2], MINUTE)) {
      out.push({ t: "emom" });
      i += every + 3;
      continue;
    }
    const work = readIntervalPart(toks, i, "on");
    if (work) {
      let j = work.next;
      if (toks[j]?.t === "," && toks[j].restate == null) j++;
      if (isWord(toks[j], "and", "then", "y")) j++;
      const rest = readIntervalPart(toks, j, "off");
      if (rest) {
        const workSeconds = Math.round(work.n * (work.unit || rest.unit || 1));
        const restSeconds = Math.round(rest.n * (rest.unit || work.unit || 1));
        if (workSeconds > 0 && restSeconds > 0) {
          out.push({ t: INTERVAL, interval: { work: workSeconds, rest: restSeconds } });
          i = rest.next;
          continue;
        }
      }
    }
    out.push(toks[i]);
    i++;
  }
  return out;
}

/** How many tokens at `i` say "the same thing, put another way" — and whether it is a correction. */
function readRestatement(toks: Tok[], i: number): { length: number; kind: "same" | "fix" } | null {
  const a = wordAt(toks, i);
  const b = wordAt(toks, i + 1);
  if (a == null) return null;
  if (a === "which" && (b === "is" || b === "are" || b === "was" || b === "were")) return { length: 2, kind: "same" };
  if (a === "that" && b === "is") return { length: 2, kind: "same" };
  if (a === "also" && b === "known" && wordAt(toks, i + 2) === "as") return { length: 3, kind: "same" };
  if ((a === "o" && b === "sea") || (a === "es" && b === "decir")) return { length: 2, kind: "same" };
  if (a === "or" && b === "rather") return { length: 2, kind: "fix" };
  if (a === "thats" || a === "aka" || a === "ie" || a === "meaning") return { length: 1, kind: "same" };
  return null;
}

/** Restatement phrases become a separator that remembers what it was. */
function markRestatements(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; ) {
    const hit = readRestatement(toks, i);
    if (hit) {
      out.push({ t: ",", restate: hit.kind });
      i += hit.length;
    } else {
      out.push(toks[i]);
      i++;
    }
  }
  return out;
}

function normalizeTokens(transcript: string): Tok[] {
  const toks = rewriteMisheard(tokenize(transcript));
  lockVocabulary(toks);
  return foldIntervals(markRestatements(refineNumbers(foldNumberWords(toks))));
}

/** "10 swings, 10 push ups" — numbers as digits, sentence breaks as commas. */
const renderTokens = (toks: Tok[]): string =>
  toks
    .map((tok) =>
      tok.interval != null
        ? `${tok.interval.work}s on ${tok.interval.rest}s off`
        : tok.n != null
          ? `${tok.n}${tok.plural ? "s" : ""}`
          : tok.t
    )
    .join(" ")
    .replace(/( ,)+/g, ",")
    .replace(/^[, ]+|[, ]+$/g, "");

// ── Segments ────────────────────────────────────────────────────────────

interface SpokenWeight {
  each: number;
  count?: number;
  unit?: "kg" | "lb";
  implement?: ExerciseCategory | null;
  /** Count was not said but implied by a plural ("with 16s") — read as a pair, flagged unless something confirms it. */
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
  /** "24 kilos in each hand", "16 kilos each side" — said of the weight, so it is two implements, not reps per side. */
  eachHand?: boolean;
  /** That phrase was a bare "each side" / "per side" (no hand word, no "on"/"in") — it loses to an explicit single. */
  eachLoose?: boolean;
  /** The whole fragment was a side phrase ("…, on each side") — how it reads depends on what it follows. */
  sideOnly?: { loose: boolean };
  /** The weight phrase ended the segment, so a side phrase after the comma is still about the weight. */
  tailWeight?: boolean;
  /** "double-handed", "double" in front of the movement: a pair unless a single was said outright. */
  pairCue?: boolean;
  /** "30 on, 30 off" — `seconds` holds the work half. */
  interval?: { work: number; rest: number };
  /** Said to be every minute on the minute. */
  emom?: boolean;
  /** Length of the whole interval/EMOM block in seconds ("for 10 minutes"). */
  total?: number;
  /** Introduced by "which are…", "or rather…": the same movement as the segment before it. */
  restate?: "same" | "fix";
  /** Leans on the previous entry ("another", "same again") — only read when the caller passed one. */
  repeat?: boolean;
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

interface RawSegment {
  toks: Tok[];
  restate?: "same" | "fix";
}

function splitSegments(toks: Tok[]): RawSegment[] {
  const segments: RawSegment[] = [];
  let current: RawSegment = { toks: [] };
  for (const tok of toks) {
    if (!free(tok, SEPARATOR)) {
      current.toks.push(tok);
      continue;
    }
    if (current.toks.length > 0) {
      segments.push(current);
      current = { toks: [] };
    }
    // The flag waits on the still-empty segment, so "…, which are, …" keeps it.
    if (tok.restate) current.restate = tok.restate;
  }
  if (current.toks.length > 0) segments.push(current);
  return segments.flatMap((segment) =>
    splitRunOn(segment.toks).map((piece, i): RawSegment => (i === 0 && segment.restate ? { toks: piece, restate: segment.restate } : { toks: piece }))
  );
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

/**
 * Does the token at `j` end a weight phrase that the side phrase after it is
 * about? A unit ("16 kilos"), the implement after it ("16 kilo kettlebells")
 * or a plural ("16s") always. A bare number that only a preposition makes a
 * weight ("with 16", "with the 20") only when the phrase says WHERE the
 * weight is — "in each hand", "on each side" — because "with the 20 each
 * side" is one bell, reps per side. A hand word also takes a bare implement
 * ("a kettlebell in each hand").
 */
function endsWeight(t: Tok[], j: number, hand: boolean, loose: boolean): boolean {
  let tok = t[j];
  if (tok == null || tok.lock) return false;
  if (unitOf(tok) != null) return true;
  if (tok.n == null) {
    if (RUSA.has(tok.t) && free(t[j - 1], IMPLEMENT)) tok = t[--j];
    if (!IMPLEMENT.has(tok.t)) return false;
    return hand || unitOf(t[j - 1]) != null || isNum(t[j - 1]);
  }
  if (tok.plural) return true;
  if (loose) return false;
  let p = j - 1;
  const count = t[p];
  if (isNum(count) && !count.plural && (count.n === 1 || count.n === 2)) p--;
  while (free(t[p], ARTICLE)) p--;
  return free(t[p], PREP);
}

/**
 * A side phrase means one of two things, and where it sits decides which:
 * straight after a WEIGHT it is one implement per hand ("16 kilograms on each
 * side" — a pair); after the reps or the movement it is reps per side ("8
 * snatches each side with a 20").
 */
function takePerSide(seg: Segment) {
  const t = seg.toks;
  for (let i = 0; i < t.length - 1; ) {
    const a = t[i];
    const b = t[i + 1];
    const hit =
      !a.lock &&
      !b.lock &&
      a.n == null &&
      b.n == null &&
      ((EACH.has(a.t) && SIDE.has(b.t)) ||
        (a.t === "both" && BOTH_SIDES.has(b.t)) ||
        // "10 a side", "16 kilos a side" — but not "a side plank".
        (a.t === "a" &&
          b.t === "side" &&
          (isNum(t[i - 1]) || unitOf(t[i - 1]) != null || !(isNameish(t[i + 2]) || free(t[i + 2], IMPLEMENT)))));
    if (!hit) {
      i++;
      continue;
    }
    const led = free(t[i - 1], SIDE_LEAD);
    const lo = led ? i - 1 : i;
    const hand = HAND.has(b.t);
    const loose = !hand && !(led && LOCATIVE.has(t[i - 1].t));
    const pairWord = PAIR_SIDE.has(b.t);
    const whole = lo === 0 && i + 2 === t.length;
    const ofWeight = pairWord && endsWeight(t, lo - 1, hand, loose);
    t.splice(lo, i + 2 - lo);
    if (ofWeight) {
      seg.eachHand = true;
      if (loose) seg.eachLoose = true;
    } else {
      seg.perSide = true;
      if (pairWord && whole) seg.sideOnly = { loose };
    }
    i = lo;
  }
}

/**
 * The side phrase was about the weight: two implements. The one exception is
 * an explicit single with a bare "each side" ("with a 16 kilo kettlebell each
 * side") — there the single stands, it is read as reps per side, and it is
 * flagged, because the two cues disagree.
 */
function pairFromSide(seg: Segment, loose: boolean) {
  const weight = seg.weight;
  if (weight == null) return;
  if (weight.count === 1 && loose) {
    seg.perSide = true;
    seg.ambiguous = true;
    return;
  }
  seg.weight = { ...weight, count: 2 };
  delete seg.weight.pair;
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

/** A whole-block length: "for 10 minutes", "the last 10 minutes were", "10 minutes of". Removed from `t`. */
function takeTotal(t: Tok[], allowSeconds: boolean): number | undefined {
  let unit = t.findIndex((tok, i) => free(tok, MINUTE) && isNum(t[i - 1]));
  let scale = 60;
  if (unit < 0 && allowSeconds) {
    unit = t.findIndex((tok, i) => free(tok, SECOND) && isNum(t[i - 1]));
    scale = 1;
  }
  if (unit < 0) return undefined;
  const amount = t[unit - 1];
  if (!isNum(amount)) return undefined;
  let lo = unit - 1;
  let hi = unit;
  while (lo > 0 && (free(t[lo - 1], DURATION_PREP) || isWord(t[lo - 1], "last", "the", "of", "a", "total"))) lo--;
  while (free(t[hi + 1], OF) || isWord(t[hi + 1], "were", "was", "is", "are", "total", "long", "straight")) hi++;
  t.splice(lo, hi - lo + 1);
  const seconds = Math.round(amount.n * scale);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Sets from a block length: total ÷ (work + rest), or one per minute for an
 * EMOM. Stated sets/rounds win. An EMOM's minutes are rounds — they cover
 * every movement in the clip ("5 pull-ups and 10 push-ups every minute on the
 * minute for 10 minutes"); an on/off pattern belongs to its own movement.
 */
function settleInterval(seg: Segment) {
  if (seg.total == null || seg.sets != null) return;
  const cycle = seg.interval != null ? seg.interval.work + seg.interval.rest : seg.emom ? 60 : 0;
  if (cycle <= 0) return;
  const sets = Math.round(seg.total / cycle);
  if (sets < 1) return;
  seg.sets = sets;
  if (seg.interval == null) seg.rounds = true;
}

/**
 * "30 seconds on, 30 seconds off" (already one token) gives the seconds per
 * set; with a block length it gives the sets too. "EMOM" with a block length
 * is one set a minute. The words themselves never reach the movement name.
 */
function takeInterval(seg: Segment) {
  const t = seg.toks;
  for (let i = t.length - 1; i >= 0; i--) {
    if (!free(t[i], DESCRIPTOR)) continue;
    if (t[i].t.startsWith("emom")) seg.emom = true;
    t.splice(i, 1);
  }
  const at = t.findIndex((tok) => tok.interval != null);
  if (at >= 0) {
    seg.interval = t[at].interval;
    t.splice(at, 1);
  }
  if (seg.interval == null && !seg.emom) return;
  // An EMOM's length is said in minutes; a seconds phrase next to it is the hold ("EMOM, 30 second plank").
  const total = takeTotal(t, seg.interval != null);
  if (total != null) seg.total = total;
  if (seg.interval != null) seg.seconds = seg.interval.work;
  settleInterval(seg);
}

function takeDuration(seg: Segment) {
  if (seg.interval != null) return; // the work half already is the duration
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
  // A plural with no count ("with 16s", "20 kilo dumbbells") is a pair — a guess until something else says so.
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
  seg.tailWeight = hit.hi === seg.toks.length - 1;
  seg.toks.splice(hit.lo, hit.hi - hit.lo + 1);
  seg.weight = hit.weight;
  if (seg.eachHand) pairFromSide(seg, seg.eachLoose === true);
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

/**
 * "double-handed" / "double" in front of the movement is how he says two
 * bells. It comes off the name; whether it makes the weight a pair is settled
 * in buildEntry (an explicit "a 24" / "one 24" still wins).
 *  - "double-handed" is never part of a name, so it always comes off;
 *  - a bare "double" only when what is left is a movement we know, so "double
 *    unders" keeps its name;
 *  - a locked "double" ("double front squat") is the name, and still a cue.
 * "Two-handed", "single-hand", "one-arm" and "hand-to-hand" are other
 * movements and are not touched.
 */
function takePairCue(seg: Segment) {
  const t = seg.toks;
  for (let i = 0; i < t.length; i++) {
    if (t[i].n != null || t[i].t !== "double") continue;
    if (t[i].lock) {
      seg.pairCue = true;
      continue;
    }
    const handed = isWord(t[i + 1], "handed", "hand");
    const rest = [...t.slice(0, i), ...t.slice(i + (handed ? 2 : 1))];
    if (!handed && (rest.length === 0 || matchSpokenExercise(rest.map((tok) => tok.t).join(" ")).def == null)) continue;
    seg.toks = rest;
    seg.pairCue = true;
    return;
  }
}

/**
 * Only when the caller passed the previous entry. Marks a segment that leans
 * on it ("same again", "another set"), and reads "one more" / "another one"
 * as one more SET — nobody logs a single extra rep that way — by taking the
 * 1 back out of the numbers. Whether the mark is used is decided later: it
 * only matters when the clip names no movement.
 */
function takeRepeat(seg: Segment) {
  const t = seg.toks;
  const more = t.some((tok) => free(tok, REPEAT_MORE));
  if (t.some((tok) => free(tok, REPEAT_CUE)) || (more && t.some((tok) => free(tok, REPEAT_UNIT)))) seg.repeat = true;
  const numbers = t.filter(isNum);
  if (!more || numbers.length !== 1 || numbers[0].n !== 1 || numbers[0].plural) return;
  const grammarOnly = t.every(
    (tok) => isNum(tok) || free(tok, FILLER) || (free(tok, EDGE_STOP) && !REPS.has(tok.t)) || isWord(tok, "time")
  );
  if (!grammarOnly) return;
  t.splice(t.indexOf(numbers[0]), 1);
  seg.repeat = true;
}

/** "same thing", "did it again", "same as before" — what is left is not a movement name. */
function settleRepeat(seg: Segment) {
  if (seg.repeat && seg.toks.length > 0 && seg.toks.every((tok) => free(tok, REPEAT_NAME))) seg.toks = [];
}

function parseSegment(raw: RawSegment, defaultVestKg: number, carry: boolean): Segment {
  const seg: Segment = { toks: [...raw.toks] };
  if (raw.restate) seg.restate = raw.restate;
  if (carry) takeRepeat(seg);
  takeGlobalMarker(seg);
  takePerSide(seg);
  takeVest(seg, defaultVestKg);
  takeInterval(seg);
  takeDuration(seg);
  takeWeight(seg);
  takeSets(seg);
  takeReps(seg);
  sanitize(seg);
  trimName(seg);
  takePairCue(seg);
  if (carry) settleRepeat(seg);
  return seg;
}

const hasLoad = (seg: Segment) => seg.weight != null || seg.vest != null;
const hasAnything = (seg: Segment) =>
  seg.reps != null ||
  seg.seconds != null ||
  seg.sets != null ||
  hasLoad(seg) ||
  seg.perSide === true ||
  seg.emom === true ||
  seg.repeat === true;
/**
 * Is `length` — a plain duration — the whole-block time for `block`? Next to
 * an on/off pattern, yes ("jump rope 30 on 30 off, for 10 minutes"). Next to
 * a bare EMOM only when it is a fragment of its own and at least a minute:
 * "EMOM, 10 minutes, 5 burpees", but not the hold in "30 second plank, EMOM".
 */
function blockTotal(block: Segment, length: Segment): boolean {
  if (block.total != null || length.total != null || length.interval != null) return false;
  if (length.seconds == null || length.reps != null) return false;
  if (block.interval != null) return true;
  return block.emom === true && length.toks.length === 0 && length.sets == null && length.seconds >= 60;
}

/** Fold a nameless fragment's fields into `into` when none of them collide. */
function absorb(into: Segment, from: Segment): boolean {
  // A plain duration next to an on/off pattern or an EMOM is the block's
  // length ("jump rope 30 on 30 off, for 10 minutes"), not a second hold.
  const totalFromFrom = blockTotal(into, from);
  const totalFromInto = !totalFromFrom && blockTotal(from, into);
  const collides =
    (into.reps != null && from.reps != null) ||
    (into.seconds != null && from.seconds != null && !totalFromFrom && !totalFromInto) ||
    (into.sets != null && from.sets != null) ||
    (into.weight != null && from.weight != null) ||
    (into.vest != null && from.vest != null);
  if (collides) return false;
  if (totalFromFrom) {
    into.total = from.seconds;
  } else if (totalFromInto) {
    into.total = into.seconds;
    into.seconds = from.seconds;
  } else {
    into.seconds ??= from.seconds;
  }
  into.interval ??= from.interval;
  into.total ??= from.total;
  if (from.emom) into.emom = true;
  into.reps ??= from.reps;
  into.sets ??= from.sets;
  const tookWeight = into.weight == null && from.weight != null;
  into.weight ??= from.weight;
  into.vest ??= from.vest;
  if (from.perSide) {
    // "…16 kilograms, on each side": the comma is the recogniser's, the phrase is still about the weight.
    if (from.sideOnly != null && into.tailWeight && into.weight != null && !into.perSide) {
      pairFromSide(into, from.sideOnly.loose);
    } else {
      into.perSide = true;
    }
  }
  // The weight is still the last thing said only if this fragment was the weight.
  into.tailWeight = tookWeight && from.tailWeight === true;
  if (from.pairCue) into.pairCue = true;
  if (from.rounds) into.rounds = true;
  if (from.global) into.global = true;
  if (from.ambiguous) into.ambiguous = true;
  if (from.stray) into.stray = true;
  if (from.repeat) into.repeat = true;
  settleInterval(into);
  return true;
}

/** The segment's name as the matcher sees it (no reps context — only good for comparing two names). */
const nameMatch = (seg: Segment): SpokenMatch =>
  seg.toks.length > 0 ? matchSpokenExercise(seg.toks.map((tok) => tok.t).join(" ")) : NO_MATCH;

/**
 * "four long cycles, which are four clean and jerks with two 16s" is ONE
 * entry said twice. The name is the one we know (the better match when both
 * are known, the first when neither is); each quantity comes from whichever
 * side said it. When the two sides disagree on a number, a correction ("or
 * rather") takes the later one cleanly; a plain restatement keeps the first
 * and is flagged, because one of them was misheard.
 */
function mergeRestatement(into: Segment, from: Segment) {
  const fix = from.restate === "fix";
  if (from.toks.length > 0) {
    const before = nameMatch(into);
    const after = nameMatch(from);
    const takeLater =
      into.toks.length === 0 ||
      fix ||
      (after.def != null && (before.def == null || after.score > before.score));
    if (takeLater) {
      into.toks = from.toks;
      into.leadWord = from.leadWord;
    }
  }
  const settle = <T>(first: T | undefined, later: T | undefined, same: (a: T, b: T) => boolean): T | undefined => {
    if (first == null || later == null) return first ?? later;
    if (same(first, later)) return first;
    if (fix) return later;
    into.stray = true;
    return first;
  };
  const sameNumber = (a: number, b: number) => a === b;
  into.reps = settle(into.reps, from.reps, sameNumber);
  into.sets = settle(into.sets, from.sets, sameNumber);
  into.seconds = settle(into.seconds, from.seconds, sameNumber);
  into.weight = settle(
    into.weight,
    from.weight,
    (a, b) => a.each === b.each && (a.unit ?? "kg") === (b.unit ?? "kg") && (a.count == null || b.count == null || a.count === b.count)
  );
  into.vest = settle(into.vest, from.vest, (a, b) => a.kg === b.kg);
  for (const key of ["reps", "sets", "seconds", "weight", "vest"] as const) if (into[key] == null) delete into[key];
  into.interval ??= from.interval;
  into.total ??= from.total;
  if (from.emom) into.emom = true;
  if (from.perSide) into.perSide = true;
  if (from.pairCue) into.pairCue = true;
  if (from.rounds) into.rounds = true;
  if (from.global) into.global = true;
  if (from.ambiguous) into.ambiguous = true;
  if (from.stray) into.stray = true;
  settleInterval(into);
}

/**
 * A fragment with no movement of its own ("…and a 24 kilo kettlebell",
 * "…, each side", "5 rounds:") belongs to its neighbour. Then spread what was
 * said about the whole clip: rounds, a leading load, and "all/both with…".
 *
 * A quantity said BEFORE any movement ("Eight. Clean and press…", "The last
 * 10 minutes were 30 on, 30 off… jumping rope") waits for the movement that
 * follows it; if that movement brings its own, the fragment stands alone.
 */
function mergeSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  let lead: Segment | null = null;
  let pending: Segment | null = null;
  let rounds: number | undefined;
  for (const seg of segments) {
    if (seg.rounds && seg.sets != null) rounds ??= seg.sets;
    const said: Segment | null = out.length > 0 ? out[out.length - 1] : pending;
    if (seg.restate && said != null) {
      // Two movements we know to be different are not one thing said twice
      // ("10 swings, that is 10 push-ups"): keep both, and do not vouch for the second.
      const first = nameMatch(said).def;
      const second = nameMatch(seg).def;
      if (seg.restate === "same" && first != null && second != null && first.id !== second.id) {
        seg.stray = true;
        out.push(seg);
        continue;
      }
      mergeRestatement(said, seg);
      if (said === pending && said.toks.length > 0) {
        out.push(said);
        pending = null;
      }
      continue;
    }
    if (seg.toks.length > 0) {
      // What was said before the movement joins it; what the movement itself ended on is unchanged.
      const tailWeight = seg.tailWeight;
      if (pending != null && !absorb(seg, pending)) out.push(pending);
      seg.tailWeight = tailWeight;
      pending = null;
      out.push(seg);
      continue;
    }
    if (!hasAnything(seg)) continue;
    const prev = out[out.length - 1];
    if (prev != null) {
      if (!absorb(prev, seg)) out.push(seg); // a quantity with no movement — surfaces as "unparsed"
      continue;
    }
    // Nothing has been named yet.
    const counts = seg.reps != null || seg.seconds != null;
    // "EMOM, 10 minutes, …": the length belongs to the block said before it.
    if (counts && lead != null && blockTotal(lead, seg) && absorb(lead, seg)) continue;
    if (pending != null) {
      // More about the count just said: "Eight. 16 kilograms on each side. …", "another 8, each side".
      if (absorb(pending, seg)) continue;
      if (counts) {
        out.push(pending, seg); // two counts and no movement — both surface as "unparsed"
        pending = null;
        continue;
      }
    }
    if (counts) {
      pending = seg;
    } else if (lead == null) {
      lead = seg;
    } else {
      absorb(lead, seg);
    }
  }
  if (pending != null) out.push(pending);
  // Only a load or a set count was said — nothing to attach it to.
  if (out.length === 0) return lead != null ? [lead] : [];
  // Rounds that only became known while merging ("5 burpees EMOM, 10 minutes").
  rounds ??= out.find((seg) => seg.rounds && seg.sets != null)?.sets;

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
    for (const seg of out) {
      seg.sets ??= lead.sets;
      if (lead.pairCue) seg.pairCue = true;
      if (lead.repeat) seg.repeat = true;
    }
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

/** The name with its last word made singular ("clean and jerks" → "clean and jerk"), or null when nothing changes. */
function singularLast(folded: string): string | null {
  const words = folded.split(" ");
  const last = words[words.length - 1];
  const singular = stem(last);
  if (singular === last) return null;
  return [...words.slice(0, -1), singular].join(" ");
}

/**
 * A plural is the same movement, not a guess: "jerks" is Jerk, "clean and
 * jerks" is the alias "clean and jerk", "half snatches" is Half Snatch. Tried
 * only when the name as said is not a key — first the usual way people
 * pluralise (the last word), then every word ("cleans and jerks"). Word
 * boundaries have to line up, so "dead lifts" is still a fuzzy match.
 */
function pluralExact(folded: string): ExerciseDef | null {
  const singular = singularLast(folded);
  const direct = singular != null ? findExerciseByExactName(singular) : null;
  if (direct) return direct;
  const stemmed = folded.split(" ").map(stem).join(" ");
  return vocabulary().find((k) => k.stemmed === stemmed)?.def ?? null;
}

/** Fuzzy catalog match used by the parser; exported for tests and for the LLM path to reuse. */
export function matchSpokenExercise(spoken: string): SpokenMatch {
  const folded = foldExerciseName(spoken);
  if (!folded) return NO_MATCH;

  const exact = findExerciseByExactName(folded);
  if (exact) {
    return { def: exact, score: SCORE_EXACT, by: foldExerciseName(exact.name) === folded ? "exact" : "alias" };
  }
  const plural = pluralExact(folded);
  if (plural) {
    const stems = (name: string) => name.split(" ").map(stem).join(" ");
    return {
      def: plural,
      score: SCORE_EXACT,
      by: stems(foldExerciseName(plural.name)) === stems(folded) ? "exact" : "alias",
    };
  }

  // As said, then with the last word singular: "kettlebell jerks", "heavy half snatches".
  const singular = singularLast(folded);
  const contained = containment(folded);
  if (contained?.clean) return { def: contained.def, score: SCORE_CONTAINS, by: "contains" };
  const containedSingular = singular != null ? containment(singular) : null;
  if (containedSingular?.clean) return { def: containedSingular.def, score: SCORE_CONTAINS, by: "contains" };

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

/** The movement a carried-over clip refers to: its id when that still resolves, else its name read exactly. */
function carriedMatch(previous: VoicePrevious): SpokenMatch {
  const byId = previous.exercise ? getExerciseById(previous.exercise) : null;
  if (byId) return { def: byId, score: SCORE_EXACT, by: "exact" };
  const byName = matchSpokenExercise(previous.name);
  return byName.def != null && byName.score >= SCORE_EXACT ? byName : NO_MATCH;
}

/**
 * One segment → one entry, or null when there is nothing to log. `keepWeak`
 * is set once the clip is known to hold a real entry: from then on a leftover
 * fragment is surfaced for review rather than dropped, so a clip is never
 * called confident with part of it thrown away ("10 swings and bear crawls").
 *
 * `carry` is the previous entry, given only for a clip that names no movement
 * at all ("another 8", "same again"): the segment is then that movement again,
 * with whatever it did not restate taken from the previous entry.
 */
function buildEntry(seg: Segment, keepWeak: boolean, carry?: VoicePrevious): ParsedVoiceEntry | null {
  let words = seg.toks.map((tok) => tok.t);
  const heard = seg.toks.some((tok) => tok.heard === true);
  const carried = words.length === 0 ? carry : undefined;
  let reps = seg.reps;
  let seconds = seg.seconds;
  let guessedReps = false;
  let match: SpokenMatch = NO_MATCH;

  if (words.length > 0) {
    // "for pull ups" → 4, "ate burpees" → 8: only where the rep count belongs,
    // only when nothing else supplies it, and only in front of a known movement.
    if (reps == null && seconds == null) {
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
  } else if (carried) {
    match = carriedMatch(carried);
    // "another 45" after a 45-second plank is seconds again, not 45 reps.
    if (carried.seconds != null && carried.reps == null && reps != null && seconds == null) {
      seconds = reps;
      reps = undefined;
    }
    // Whatever he did not restate is the same as last time. A restated count
    // replaces the old one outright unless the last entry carried both kinds.
    if ((reps == null && seconds == null) || (carried.reps != null && carried.seconds != null)) {
      reps ??= carried.reps;
      seconds ??= carried.seconds;
    }
  }

  const hasQuantity = reps != null || seconds != null;
  const hasNumbers = hasQuantity || seg.sets != null || hasLoad(seg);
  // No number and no solid match ("the plank is wet", "thanks for watching"):
  // chatter on its own, a fragment to review inside a real log.
  const weak = !hasNumbers && (match.def == null || match.score < SCORE_MISHEARD);
  if (weak && (!keepWeak || words.every((word) => COURTESY.has(word) || EDGE_STOP.has(word)))) return null;

  let confidence: number;
  let reason: ParsedVoiceEntry["reason"];
  if (words.length === 0 && !carried) {
    confidence = 0.15;
    reason = "unparsed";
  } else if (match.def == null) {
    // A numbered unknown is a movement he has not minted yet. Without a
    // number, or when it reads like conversation, it is just unparsed.
    const chatter = !carried && (!hasNumbers || words.length > 6 || words.some((word) => CHATTER.has(word)));
    reason = chatter ? "unparsed" : "new_exercise";
    confidence = chatter ? 0.15 : 0.35;
  } else {
    const strong = match.score >= CONFIDENT && match.by !== "fuzzy";
    confidence = !strong ? Math.min(match.score, 0.75) : match.by === "contains" ? 0.88 : carried ? 0.9 : 0.95;
    if (!strong) reason = "low_match";
    // "plank 45": a count on a timed hold is far more likely seconds whose unit
    // was not said. Keep the number as spoken, but do not vouch for it.
    const unitlessHold = reps != null && seconds == null && HOLD_NAME.test(match.def.name);
    if (!hasQuantity || guessedReps || unitlessHold) {
      confidence = Math.min(confidence, 0.6);
      reason ??= "no_quantity";
    }
  }

  // The weight of ONE implement, as spoken — a pair is `implements: 2`, never
  // a sum. Out-of-range weights are dropped, not clamped.
  let weightKg: number | undefined;
  let pair = false;
  let saidCount: number | undefined;
  let ambiguous = seg.ambiguous === true;
  if (seg.weight != null) {
    // How many: said outright ("two 16s", "one 24", "in each hand"), else the
    // "double-handed" cue, else what the previous entry used, else a plural's guess.
    saidCount = seg.weight.count ?? (seg.pairCue ? 2 : undefined);
    const count = saidCount ?? (carried?.implements === 2 ? 2 : undefined);
    if (count == null && seg.weight.pair) ambiguous = true;
    const each = round1(seg.weight.each * (seg.weight.unit === "lb" ? LB_TO_KG : 1));
    if (each >= WEIGHT_MIN_KG && each <= WEIGHT_MAX_KG) {
      weightKg = each;
      pair = (count ?? (seg.weight.pair ? 2 : 1)) === 2;
    } else {
      ambiguous = true;
    }
  } else if (carried?.weightKg != null) {
    weightKg = carried.weightKg;
    pair = carried.implements === 2;
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
    name: match.def?.name ?? (words.length > 0 ? displayName(words) : (carried?.name ?? "")),
    confidence,
    needsReview: reason != null,
    matchedBy: match.def ? match.by : "none",
  };
  if (match.def) entry.exercise = match.def.id;
  if (reps != null) entry.reps = reps;
  if (seg.sets != null) entry.sets = seg.sets;
  if (weightKg != null) entry.weightKg = weightKg;
  if (weightKg != null && pair) entry.implements = 2;
  if (seconds != null) entry.seconds = seconds;
  if (seg.perSide || carried?.perSide) entry.perSide = true;
  const vest = seg.vest ?? carried?.load;
  if (vest) entry.load = { ...vest };
  if (seg.weight != null) {
    entry.spoken = { each: seg.weight.each };
    if (seg.weight.unit) entry.spoken.unit = seg.weight.unit;
    if (saidCount != null) entry.spoken.count = saidCount;
  }
  if (reason) entry.reason = reason;
  return entry;
}

const positive = (value: unknown, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max ? value : undefined;

/** The caller's previous entry, with anything unusable left out. Null when there is nothing to refer back to. */
function cleanPrevious(previous: VoicePrevious | undefined): VoicePrevious | null {
  if (previous == null || typeof previous !== "object") return null;
  const name = typeof previous.name === "string" ? previous.name.trim() : "";
  if (!name) return null;
  const out: VoicePrevious = { name };
  if (typeof previous.exercise === "string" && previous.exercise) out.exercise = previous.exercise;
  const reps = positive(previous.reps, 5000);
  const sets = positive(previous.sets, 100);
  const seconds = positive(previous.seconds, 86400);
  const weightKg = positive(previous.weightKg, WEIGHT_MAX_KG);
  if (reps != null) out.reps = Math.round(reps);
  if (sets != null) out.sets = Math.round(sets);
  if (seconds != null) out.seconds = Math.round(seconds);
  if (weightKg != null) out.weightKg = round1(weightKg);
  if (weightKg != null && previous.implements === 2) out.implements = 2;
  if (previous.perSide === true) out.perSide = true;
  const vestKg = previous.load?.type === "vest" ? positive(previous.load.kg, VEST_MAX_KG) : undefined;
  if (vestKg != null) {
    out.load = { type: "vest", kg: round1(vestKg) };
    if (previous.load?.assumed) out.load.assumed = true;
  }
  return out;
}

const cleanBells = (bells: unknown): number[] =>
  Array.isArray(bells) ? bells.filter((kg): kg is number => typeof kg === "number" && Number.isFinite(kg) && kg > 0) : [];

/**
 * Could this be a real kettlebell? Asked of an entry matched to a kettlebell
 * movement, or one where he named the implement as a kettlebell. Not if one
 * bell is over 48 kg, and not if it is a size he does not own. A pound figure
 * gets a little slack — a "35 pound" bell is his 16.
 */
function implausibleBell(entry: ParsedVoiceEntry, bells: number[], saidKettlebell: boolean): boolean {
  const kg = entry.weightKg;
  if (kg == null) return false;
  const kettlebell =
    saidKettlebell || (entry.exercise != null && getExerciseById(entry.exercise)?.category === "kettlebell");
  if (!kettlebell) return false;
  if (kg > KETTLEBELL_MAX_KG) return true;
  if (bells.length === 0) return false;
  const slack = entry.spoken?.unit === "lb" ? 0.3 : 0.05;
  return !bells.some((bell) => Math.abs(bell - kg) <= slack);
}

/**
 * Flag an unbelievable kettlebell weight. The number is NEVER changed — "60
 * kilograms" was very likely "sixteen", but what was heard is what is shown,
 * with a "?" so he fixes it himself.
 */
function checkBell(entry: ParsedVoiceEntry, bells: number[], saidKettlebell: boolean): ParsedVoiceEntry {
  if (!implausibleBell(entry, bells, saidKettlebell)) return entry;
  return {
    ...entry,
    needsReview: true,
    // A doubtful name match with an impossible weight is, first of all, a weight to check.
    reason: entry.reason == null || entry.reason === "low_match" ? "ambiguous_weight" : entry.reason,
    confidence: Math.min(entry.confidence, 0.6),
  };
}

export function parseVoiceEntries(transcript: string, opts: VoiceParseOptions = {}): VoiceParseResult {
  const defaultVestKg =
    opts.defaultVestKg != null && Number.isFinite(opts.defaultVestKg) && opts.defaultVestKg > 0
      ? opts.defaultVestKg
      : DEFAULT_VEST_KG;
  const bells = cleanBells(opts.bells);
  const previous = cleanPrevious(opts.previous);
  const toks = normalizeTokens(typeof transcript === "string" ? transcript : "");
  const segments = splitSegments(toks).map((seg) => parseSegment(seg, defaultVestKg, previous != null));
  const merged = mergeSegments(segments);
  // Carry-over: the clip names no movement at all, so what it does say — a
  // count, "another", "same again" — is about the entry before it.
  const carries = (seg: Segment) =>
    previous != null &&
    seg.toks.length === 0 &&
    (seg.reps != null || seg.seconds != null || seg.sets != null || seg.repeat === true);
  const carry = previous != null && merged.length > 0 && merged.every((seg) => seg.toks.length === 0) ? previous : null;
  const build = (seg: Segment, keepWeak: boolean) =>
    buildEntry(seg, keepWeak, carry != null && carries(seg) ? carry : undefined);
  const logged = merged.some((seg) => build(seg, false) != null);
  const entries: ParsedVoiceEntry[] = [];
  for (const seg of merged) {
    const entry = build(seg, logged);
    if (entry) entries.push(checkBell(entry, bells, seg.weight?.implement === "kettlebell"));
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

/** One short line for the watch: "KB Swing ×10 · 24 kg", "Clean and Press ×6 · 2×16 kg", "Push-Up 3×10", "Plank 45s", "Squat ×10 · vest 5 kg", "? Bear Crawl ×10". */
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
  if (entry.weightKg != null) chunks.push(`${entry.implements === 2 ? "2×" : ""}${trimKg(entry.weightKg)} kg`);
  if (entry.load) chunks.push(`vest ${trimKg(entry.load.kg)} kg`);
  const line = chunks.filter((chunk) => chunk.length > 0).join(" · ");
  return entry.needsReview ? `? ${line}` : line;
}

/**
 * Last look at a clip's entries, whichever parser produced them, before the
 * wrist is shown anything:
 *  - a fragment with no movement name ("another 10", "with a vest") is not
 *    an entry — there is nothing to show or to log;
 *  - a kettlebell weight that cannot be right — one bell over 48 kg, or a
 *    size missing from his rack when the rack is known — is flagged, with
 *    the number left exactly as heard;
 *  - in a clip naming several movements, an implement weight that landed on
 *    a bodyweight one ("8 swings, 8 push-ups with the 20") most likely
 *    belonged to its neighbour, so it is kept but flagged rather than
 *    trusted.
 */
export function finalizeVoiceEntries(
  entries: ParsedVoiceEntry[],
  opts: { bells?: number[] } = {}
): ParsedVoiceEntry[] {
  const bells = cleanBells(opts.bells);
  const named = entries.filter((e) => e.name.trim().length > 0).map((e) => checkBell(e, bells, false));
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
