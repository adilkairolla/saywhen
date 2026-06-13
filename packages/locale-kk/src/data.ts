// Kazakh date morphology, enumerated as data (spec §4 — no stemmer; agglutinative case
// suffixes are listed surface forms). Kazakh has NO grammatical gender and keeps nouns
// singular after numerals, so this is simpler than ru: this/next/last are invariant, and
// counted units take no plural. The formatter reads the *_NOM/_ABL tables.
import type { Unit } from "@saywhen/core";

// ---------- weekdays (index 0 Sunday … 6 Saturday) ----------
// nom = canonical; abl = "-DEN" (range "from", offsets); dat = "-GE" (range "to") — all
// registered as WEEKDAY input aliases. The formatter emits nom only.
export const WEEKDAYS: Array<{ nom: string; abl: string; dat: string; abbr: string }> = [
  { nom: "жексенбі", abl: "жексенбіден", dat: "жексенбіге", abbr: "жс" },
  { nom: "дүйсенбі", abl: "дүйсенбіден", dat: "дүйсенбіге", abbr: "дс" },
  { nom: "сейсенбі", abl: "сейсенбіден", dat: "сейсенбіге", abbr: "сс" },
  { nom: "сәрсенбі", abl: "сәрсенбіден", dat: "сәрсенбіге", abbr: "ср" },
  { nom: "бейсенбі", abl: "бейсенбіден", dat: "бейсенбіге", abbr: "бс" },
  { nom: "жұма", abl: "жұмадан", dat: "жұмаға", abbr: "жм" },
  { nom: "сенбі", abl: "сенбіден", dat: "сенбіге", abbr: "сб" },
];

// ---------- months (index 0 Jan … 11 Dec) ----------
export const MONTHS_NOM = [
  "қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
  "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан",
];
/** locative "in <month>" — vowel/consonant harmony (verify against a reference) */
export const MONTHS_LOC = [
  "қаңтарда", "ақпанда", "наурызда", "сәуірде", "мамырда", "маусымда",
  "шілдеде", "тамызда", "қыркүйекте", "қазанда", "қарашада", "желтоқсанда",
];
export const MONTH_ABBR: string[][] = [
  ["қаң"], ["ақп"], ["нау"], ["сәу"], ["мам"], ["мау"],
  ["шіл"], ["там"], ["қыр"], ["қаз"], ["қар"], ["жел"],
];

// ---------- relative days ----------
// (-2 "day before yesterday" is multi-word in Kazakh — omitted in v1, see plan non-goals)
export const RELDAYS: Array<[string, number]> = [
  ["бүгін", 0], ["ертең", 1], ["бүрсігүні", 2], ["кеше", -1],
];

// ---------- this / next / last (invariant — no gender/case agreement) ----------
export const REL_FORMS: Record<"this" | "next" | "last", string[]> = {
  this: ["осы", "бұл", "мына"],
  next: ["келесі", "алдағы", "келер"],
  last: ["өткен", "былтырғы"],
};
/** formatter picks the canonical form per which */
export const REL_NOM: Record<"this" | "next" | "last", string> = {
  this: "осы", next: "келесі", last: "өткен",
};

// ---------- units ----------
// all surface forms registered as UNIT input aliases; the formatter uses NOM (and ABL for
// the forward offset "N <unit-ABL> кейін").
export const UNIT_FORMS: Record<Unit, string[]> = {
  day: ["күн", "күні", "күнде", "күннен"],
  week: ["апта", "аптада", "аптадан"],
  month: ["ай", "айда", "айдан"],
  year: ["жыл", "жылы", "жылда", "жылдан"],
  hour: ["сағат", "сағатта", "сағаттан"],
  minute: ["минут", "минутта", "минуттан"],
};
export const UNIT_NOM: Record<Unit, string> = {
  day: "күн", week: "апта", month: "ай", year: "жыл", hour: "сағат", minute: "минут",
};
export const UNIT_ABL: Record<Unit, string> = {
  day: "күннен", week: "аптадан", month: "айдан", year: "жылдан", hour: "сағаттан", minute: "минуттан",
};

// ---------- periods / seasons ----------
export const WEEKEND_FORMS = ["демалыс", "демалыста"];
export const QUARTER_FORMS = ["тоқсан", "тоқсанда", "квартал"]; // тоқсан is also "90" — legal homonym
/** formatter period nouns (REL + noun) */
export const PERIOD_NOUNS: Record<"week" | "month" | "year" | "weekend" | "quarter", string> = {
  week: "апта", month: "ай", year: "жыл", weekend: "демалыс", quarter: "тоқсан",
};
export const SEASONS: Array<{ nom: string; lexicon: string[] }> = [
  { nom: "көктем", lexicon: ["көктем", "көктемде", "көктемгі"] },
  { nom: "жаз", lexicon: ["жаз", "жазда", "жазғы"] },
  { nom: "күз", lexicon: ["күз", "күзде", "күзгі"] },
  { nom: "қыс", lexicon: ["қыс", "қыста", "қысқы"] },
];

// ---------- function words ----------
// кейін (after) and бұрын (before) are postpositional → DIRECTION; the kk forward-offset
// rule + the core relOffsetP consume them. дейін/шейін (until) → CONNECTOR (range, via the
// core rangePostfixP). "-" is also a CONNECTOR (medial dash, the canonical range form).
export const DIRECTIONS: Array<["after" | "before", string[]]> = [
  ["after", ["кейін", "соң"]],
  ["before", ["бұрын"]],
];
export const CONNECTORS = ["дейін", "шейін"];

export const MERIDIEMS: Array<["am" | "pm", string[]]> = [
  ["am", ["таңғы", "таңертеңгі"]],
  ["pm", ["кешкі", "түнгі"]],
];

/** сағат/жыл also map to UNIT — the FILLER reading lets "сағат 5", "2027 жылы" consume fully */
export const FILLERS = ["сағат", "жыл", "жылы", "күні", "де", "да"];

// ---------- numbers ----------
export const TENS: Record<string, number> = {
  жиырма: 20, отыз: 30, қырық: 40, елу: 50, алпыс: 60, жетпіс: 70, сексен: 80, тоқсан: 90,
};
export const CARDINALS: Record<string, number> = {
  бір: 1, екі: 2, үш: 3, төрт: 4, бес: 5, алты: 6, жеті: 7, сегіз: 8, тоғыз: 9, он: 10,
  ...TENS, жүз: 100,
};
export const ORDINALS: Record<string, number> = {
  бірінші: 1, екінші: 2, үшінші: 3, төртінші: 4, бесінші: 5, алтыншы: 6, жетінші: 7,
  сегізінші: 8, тоғызыншы: 9, оныншы: 10, жиырмасыншы: 20, отызыншы: 30,
};

// ---------- typing ----------
/** Kazakh Cyrillic ЙЦУКЕН rows (Kazakh letters on the number row) */
export const KEYBOARD_ROWS = ["әіңғүұқөһ", "йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];
export const TYPO_MAP: Record<string, string> = {
  ертен: "ертең", бугін: "бүгін", дуйсенбі: "дүйсенбі",
};
