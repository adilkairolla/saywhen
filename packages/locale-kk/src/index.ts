import type {
  Anchor, DateExpr, FormatOptions, Lexicon, LocaleAdapter, LocaleRule, RawToken, SemPayload, Unit,
} from "@saywhen/core";
import { cyrToLat } from "./translit.js";
import {
  CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS, MERIDIEMS, MONTH_ABBR,
  MONTHS_LOC, MONTHS_NOM, ORDINALS, PERIOD_NOUNS, QUARTER_FORMS, RELDAYS, REL_FORMS,
  REL_NOM, SEASONS, TENS, TYPO_MAP, UNIT_ABL, UNIT_FORMS, UNIT_NOM, WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";

export { cyrToLat } from "./translit.js"; // re-exported for consumers (e.g. holidays-kk, dist smoke)

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  // register every Cyrillic surface form AND its Latin transliteration → same payload
  const add = (forms: string[], payload: SemPayload) => {
    const json = JSON.stringify(payload);
    for (const f of forms) {
      for (const g of new Set([f, cyrToLat(f)])) {
        const list = (lex[g] ??= []);
        if (!list.some((p) => JSON.stringify(p) === json)) list.push(payload);
      }
    }
  };

  WEEKDAYS.forEach((w, day) => add([w.nom, w.abl, w.dat, w.abbr], { kind: "WEEKDAY", day }));
  MONTHS_NOM.forEach((nom, month) =>
    add([nom, MONTHS_LOC[month]!, ...MONTH_ABBR[month]!], { kind: "MONTH", month }));

  for (const [form, offset] of RELDAYS) add([form], { kind: "RELDAY", offset });
  for (const which of ["this", "next", "last"] as const) add(REL_FORMS[which], { kind: "REL", which });

  for (const [unit, forms] of Object.entries(UNIT_FORMS) as Array<[Unit, string[]]>) {
    add(forms, { kind: "UNIT", unit });
  }

  for (const [word, n] of Object.entries(CARDINALS)) add([word], { kind: "NUMBER", n });
  for (const [word, n] of Object.entries(ORDINALS)) add([word], { kind: "NUMBER", n, ordinal: true });
  for (let d = 1; d <= 31; d++) add([`${d}-і`, `${d}-ші`], { kind: "NUMBER", n: d, ordinal: true });

  add(WEEKEND_FORMS, { kind: "PERIOD", period: { kind: "weekend" } });
  add(QUARTER_FORMS, { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1; q <= 4; q++) add([`тоқсан${q}`, `q${q}`], { kind: "PERIOD", period: { kind: "quarter", q: q as 1 | 2 | 3 | 4 } });
  SEASONS.forEach((s, i) => add(s.lexicon, { kind: "PERIOD", period: { kind: "season", s: i as 0 | 1 | 2 | 3 } }));

  for (const [dir, forms] of DIRECTIONS) add(forms, { kind: "DIRECTION", dir });
  add(CONNECTORS, { kind: "CONNECTOR" });
  add(["-"], { kind: "CONNECTOR" });
  add(["+", "плюс"], { kind: "OP", op: 1 });
  add(["-", "минус"], { kind: "OP", op: -1 });

  for (const [value, forms] of MERIDIEMS) add(forms, { kind: "MERIDIEM", value });
  add(["түс", "түскі"], { kind: "TIME", h: 12, m: 0 });

  add(FILLERS, { kind: "FILLER" });
  return lex;
}

const lexicon = buildLexicon();

const CYR = "а-яёәғқңөұүһі";
const LAT = "a-zäöüūıïñğşç"; // includes ï (cyrToLat of и) so Latin runs tokenize whole
const TOKEN_RE = new RegExp(
  `\\d{1,4}/\\d{1,2}(?:/\\d{1,4})?|\\d{1,2}:\\d{2}|\\d+-[${CYR}${LAT}]+|\\d+[${CYR}${LAT}]+|\\d+|[${CYR}${LAT}]+\\d+|[${CYR}${LAT}]+|[+\\-]|\\S`,
  "g",
);

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (t: string, s: number) => out.push({ text: t, span: [s, s + t.length] });
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    if (!(raw in lexicon) && !(raw in TYPO_MAP)) {
      const dh = new RegExp(`^(\\d+)-([${CYR}${LAT}]+)$`).exec(raw); // "21-і" → "21" + "і"
      if (dh) { push(dh[1]!, start); push(dh[2]!, start + dh[1]!.length + 1); continue; }
      const dl = new RegExp(`^(\\d+)([${CYR}${LAT}]+)$`).exec(raw);
      const ld = new RegExp(`^([${CYR}${LAT}]+)(\\d+)$`).exec(raw);
      const split = dl ?? ld;
      if (split) { push(split[1]!, start); push(split[2]!, start + split[1]!.length); continue; }
    }
    push(raw, start);
  }
  return out;
}

// ---- Kazakh forward offset: "N <unit> кейін/бұрын" (postpositional, from now) ----
// The core has prepositional `in` and postpositional `ago` only; this supplies the missing
// postpositional forward/backward offset. Hand-written walk (core exports no combinators);
// it wins only when nothing follows the direction word — otherwise relOffsetP takes a base.
const NOW: DateExpr = { type: "anchor", anchor: { kind: "now" } };
const kkOffsetRule: LocaleRule = {
  name: "kk-postfix-offset",
  at: "expression",
  match(toks, i) {
    const skip = (j: number) => { while (j < toks.length && toks[j]?.kind === "FILLER") j++; return j; };
    let j = skip(i);
    let n = 1; // bare "аптадан кейін" (in a week) → n = 1; "2 аптадан кейін" → n = 2
    const num = toks[j];
    if (num && num.kind === "NUMBER" && !num.ordinal) { n = num.n; j = skip(j + 1); }
    const unit = toks[j];
    if (!unit || unit.kind !== "UNIT") return null;
    j = skip(j + 1);
    const dir = toks[j];
    if (!dir || dir.kind !== "DIRECTION" || (dir.dir !== "after" && dir.dir !== "before")) return null;
    return {
      expr: { type: "offset", base: NOW, n, unit: unit.unit, dir: dir.dir === "after" ? 1 : -1 },
      next: j + 1,
    };
  },
};

// ---------- formatting (canonical = Cyrillic, always re-parseable) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const count = (unit: Unit, n: number) => `${n} ${UNIT_NOM[unit]}`; // nouns stay singular
type Names = Record<string, string>;
const RELDAY_WORDS: Record<number, string> = { 0: "бүгін", 1: "ертең", 2: "бүрсігүні", [-1]: "кеше" };

function formatAnchor(a: Anchor, names: Names): string {
  switch (a.kind) {
    case "now": return "бүгін";
    case "relday": {
      const w = RELDAY_WORDS[a.offset];
      if (w) return w;
      return a.offset > 0 ? `${count("day", a.offset)} кейін` : `${count("day", -a.offset)} бұрын`;
    }
    case "weekday": {
      const w = WEEKDAYS[a.day]!;
      return a.which ? `${REL_NOM[a.which]} ${w.nom}` : w.nom;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${d} ${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `${d}-і`;
      if (m !== undefined) return `${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function format(expr: DateExpr, names: Names): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor, names);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `${expr.n} ${UNIT_ABL[expr.unit]} кейін`
          : `${count(expr.unit, expr.n)} бұрын`;
      }
      return `${format(expr.base, names)} ${expr.dir === 1 ? "+" : "-"} ${count(expr.unit, expr.n)}`;
    }
    case "range": return `${format(expr.start, names)} - ${format(expr.end, names)}`; // medial dash (rangeP)
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `${REL_NOM[expr.which]} тоқсан${p.q}`;
      if (p.kind === "season") {
        if (p.s === undefined) return `${REL_NOM[expr.which]} маусым`;
        return `${REL_NOM[expr.which]} ${SEASONS[p.s]!.nom}`;
      }
      return `${REL_NOM[expr.which]} ${PERIOD_NOUNS[p.kind]}`;
    }
    case "boundary": return `${format(expr.of, names)} ${expr.edge === "start" ? "басы" : "соңы"}`;
    case "withTime": return `${format(expr.base, names)} сағат ${expr.time.h}:${pad(expr.time.m)}`;
  }
}

// accessible phrasing (natural; need not re-parse) — postpositional, declined endpoints
function accessible(expr: DateExpr, names: Names): string {
  switch (expr.type) {
    case "range": {
      const abl = (e: DateExpr) =>
        e.type === "anchor" && e.anchor.kind === "weekday" ? WEEKDAYS[e.anchor.day]!.abl : accessible(e, names);
      const dat = (e: DateExpr) =>
        e.type === "anchor" && e.anchor.kind === "weekday" ? WEEKDAYS[e.anchor.day]!.dat : accessible(e, names);
      return `${abl(expr.start)} ${dat(expr.end)} дейін`;
    }
    case "offset":
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1 ? `${expr.n} ${UNIT_ABL[expr.unit]} кейін` : `${count(expr.unit, expr.n)} бұрын`;
      }
      return `${accessible(expr.base, names)} ${expr.dir === 1 ? "кейін" : "бұрын"} ${count(expr.unit, expr.n)}`;
    case "withTime": return `${accessible(expr.base, names)} сағат ${expr.time.h}:${pad(expr.time.m)}`;
    default: return format(expr, names);
  }
}

function parseNumber(words: string[]): number | null {
  const value = (w: string): number | null =>
    CARDINALS[w] ?? ORDINALS[w] ?? (/^\d+$/.test(w) ? Number(w) : null);
  if (words.length === 1) return value(words[0]!);
  if (words.length === 2) {
    const tens = TENS[words[0]!];
    const unit = CARDINALS[words[1]!] ?? ORDINALS[words[1]!];
    if (tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9) return tens + unit;
  }
  return null;
}

export const kk: LocaleAdapter = {
  id: "kk",
  tokenize,
  lexicon,
  parseNumber,
  rules: [kkOffsetRule],
  format: (expr, opts: FormatOptions) => format(expr, opts.holidayNames ?? {}),
  formatAccessible: (expr, opts: FormatOptions) => accessible(expr, opts.holidayNames ?? {}),
  keyboard: { rows: KEYBOARD_ROWS },
  typoMap: TYPO_MAP,
  defaults: { weekStart: 1, dateOrder: "DMY" },
};
