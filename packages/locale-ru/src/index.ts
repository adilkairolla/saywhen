import type {
  DateExpr, Lexicon, LocaleAdapter, RawToken, Unit,
} from "@saywhen/core";
import {
  BOUNDARIES, CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS,
  MERIDIEMS, MONTH_ABBR, MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, ORDINALS,
  QUARTER_FORMS, RELDAYS, REL_FORMS, SEASONS, TENS, TYPO_MAP, UNIT_FORMS,
  WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  // dedupe-aware add: many inflections collide ("май" abbr = nominative)
  const add = (forms: string[], payload: Lexicon[string][number]) => {
    const json = JSON.stringify(payload);
    for (const f of forms) {
      const list = (lex[f] ??= []);
      if (!list.some((p) => JSON.stringify(p) === json)) list.push(payload);
    }
  };

  WEEKDAYS.forEach((w, day) => add([w.nom, w.gen, w.acc, w.abbr], { kind: "WEEKDAY", day }));
  MONTHS_NOM.forEach((nom, month) =>
    add([nom, MONTHS_GEN[month]!, MONTHS_PREP[month]!, ...MONTH_ABBR[month]!], { kind: "MONTH", month }));

  for (const [form, offset] of RELDAYS) add([form], { kind: "RELDAY", offset });
  for (const which of ["this", "next", "last"] as const) add(REL_FORMS[which], { kind: "REL", which });

  for (const [unit, forms] of Object.entries(UNIT_FORMS) as Array<[Unit, readonly string[]]>) {
    add([...forms], { kind: "UNIT", unit });
  }

  for (const [word, n] of Object.entries(CARDINALS)) add([word], { kind: "NUMBER", n });
  for (const [word, n] of Object.entries(ORDINALS)) add([word], { kind: "NUMBER", n, ordinal: true });
  for (let d = 1; d <= 31; d++) {
    add([`${d}-е`, `${d}-ое`, `${d}-го`, `${d}-ого`], { kind: "NUMBER", n: d, ordinal: true });
  }

  add(WEEKEND_FORMS, { kind: "PERIOD", period: { kind: "weekend" } });
  add(QUARTER_FORMS, { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1; q <= 4; q++) {
    add([`кв${q}`, `q${q}`], { kind: "PERIOD", period: { kind: "quarter", q: q as 1 | 2 | 3 | 4 } });
  }
  SEASONS.forEach((s, i) => add(s.lexicon, { kind: "PERIOD", period: { kind: "season", s: i as 0 | 1 | 2 | 3 } }));

  add(BOUNDARIES.start, { kind: "BOUNDARY", edge: "start" });
  add(BOUNDARIES.end, { kind: "BOUNDARY", edge: "end" });

  for (const [dir, forms] of DIRECTIONS) add(forms, { kind: "DIRECTION", dir });
  add(CONNECTORS, { kind: "CONNECTOR" });
  add(["-"], { kind: "CONNECTOR" }); // "пн - пт" — lattice carries both OP and CONNECTOR readings
  add(["+", "плюс"], { kind: "OP", op: 1 });
  add(["-", "минус"], { kind: "OP", op: -1 });

  for (const [value, forms] of MERIDIEMS) add(forms, { kind: "MERIDIEM", value });
  add(["полдень"], { kind: "TIME", h: 12, m: 0 });
  add(["полночь"], { kind: "TIME", h: 0, m: 0 });

  add(FILLERS, { kind: "FILLER" });

  return lex;
}

const lexicon = buildLexicon();

const TOKEN_RE =
  /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+-[а-яё]+|\d+[а-яё]+|\d+|[а-яё]+\d+|[а-яё]+|[a-z]+\d*|[+\-]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (t: string, s: number) => out.push({ text: t, span: [s, s + t.length] });
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    // mixed digit/letter runs split unless the whole token is known ("21-е", "кв1")
    if (!(raw in lexicon) && !(raw in TYPO_MAP)) {
      const dh = /^(\d+)-([а-яё]+)$/.exec(raw); // "32-е" → "32" + "е"
      if (dh) {
        push(dh[1]!, start);
        push(dh[2]!, start + dh[1]!.length + 1);
        continue;
      }
      const dl = /^(\d+)([а-яё]+)$/.exec(raw);  // "17часов" → "17" + "часов"
      const ld = /^([а-яё]+)(\d+)$/.exec(raw);  // unknown Cyrillic+digit run
      const split = dl ?? ld;
      if (split) {
        push(split[1]!, start);
        push(split[2]!, start + split[1]!.length);
        continue;
      }
    }
    push(raw, start);
  }
  return out;
}

export const ru: LocaleAdapter = {
  id: "ru",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    const value = (w: string): number | null =>
      CARDINALS[w] ?? ORDINALS[w] ?? (/^\d+$/.test(w) ? Number(w) : null);
    if (words.length === 1) return value(words[0]!);
    if (words.length === 2) {
      const tens = TENS[words[0]!];
      const unit = CARDINALS[words[1]!] ?? ORDINALS[words[1]!];
      if (tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9) return tens + unit;
    }
    return null;
  },
  format: (expr: DateExpr) => JSON.stringify(expr), // replaced in Task 2
  formatAccessible: (expr: DateExpr) => JSON.stringify(expr), // replaced in Task 4
  keyboard: { rows: KEYBOARD_ROWS },
  typoMap: TYPO_MAP,
  defaults: { weekStart: 1, dateOrder: "DMY" },
};
