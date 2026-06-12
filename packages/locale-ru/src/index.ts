import type {
  Anchor, DateExpr, Lexicon, LocaleAdapter, RawToken, Unit,
} from "@saywhen/core";
import {
  BOUNDARIES, CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS,
  MERIDIEMS, MONTH_ABBR, MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, ORDINALS,
  PERIOD_NOUNS, QUARTER_FORMS, RELDAYS, REL_FORMS, REL_GEN, REL_NOM,
  SEASONS, TENS, TYPO_MAP, UNIT_COUNT, UNIT_FORMS, WEEKDAYS, WEEKEND_FORMS,
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

// ---------- canonical formatting (re-parseable: every emitted form is lexicon data) ----------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Russian plural selection: 1 день / 2 дня / 5 дней (11–14 always take the third form). */
export function ruPlural(n: number, [one, few, many]: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const count = (unit: Unit, n: number) => `${n} ${ruPlural(n, UNIT_COUNT[unit])}`;

const RELDAY_WORDS: Record<number, string> = {
  0: "сегодня", 1: "завтра", 2: "послезавтра", [-1]: "вчера", [-2]: "позавчера",
};

function formatAnchor(a: Anchor): string {
  switch (a.kind) {
    case "now": return "сегодня";
    case "relday": {
      const word = RELDAY_WORDS[a.offset];
      if (word) return word;
      return a.offset > 0 ? `через ${count("day", a.offset)}` : `${count("day", -a.offset)} назад`;
    }
    case "weekday": {
      const w = WEEKDAYS[a.day]!;
      return a.which ? `${REL_NOM[a.which][w.gender]} ${w.nom}` : w.nom;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${d} ${MONTHS_GEN[m]}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `${d}-е`;
      if (m !== undefined) return `${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id; // names: plan 04
  }
}

/** genitive rendering for boundary targets ("конец этого месяца"); falls back to nominative */
function formatGen(of: DateExpr): string {
  if (of.type === "period") {
    const p = of.period;
    if (p.kind === "quarter" && p.q) return `${REL_GEN[of.which].m} кв${p.q}`;
    if (p.kind === "season") {
      if (p.s === undefined) return format(of);
      const s = SEASONS[p.s]!;
      return `${REL_GEN[of.which][s.gender]} ${s.gen}`;
    }
    const noun = PERIOD_NOUNS[p.kind];
    return `${REL_GEN[of.which][noun.gender]} ${noun.gen}`;
  }
  if (of.type === "anchor" && of.anchor.kind === "calendar"
      && of.anchor.m !== undefined && of.anchor.d === undefined && of.anchor.y === undefined) {
    return MONTHS_GEN[of.anchor.m]!; // "конец марта"
  }
  return format(of);
}

function format(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `через ${count(expr.unit, expr.n)}`
          : `${count(expr.unit, expr.n)} назад`;
      }
      return `${format(expr.base)} ${expr.dir === 1 ? "+" : "-"} ${count(expr.unit, expr.n)}`;
    }
    case "range": return `${format(expr.start)} - ${format(expr.end)}`;
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `${REL_NOM[expr.which].m} кв${p.q}`;
      if (p.kind === "season") {
        if (p.s === undefined) return `${REL_NOM[expr.which].m} сезон`; // not vocabulary; arbs always index seasons
        const s = SEASONS[p.s]!;
        return `${REL_NOM[expr.which][s.gender]} ${s.nom}`;
      }
      const noun = PERIOD_NOUNS[p.kind];
      return `${REL_NOM[expr.which][noun.gender]} ${noun.nom}`;
    }
    case "boundary": return `${expr.edge === "start" ? "начало" : "конец"} ${formatGen(expr.of)}`;
    case "withTime": return `${format(expr.base)} в ${expr.time.h}:${pad(expr.time.m)}`;
  }
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
  format: (expr) => format(expr),
  formatAccessible: (expr: DateExpr) => JSON.stringify(expr), // replaced in Task 4
  keyboard: { rows: KEYBOARD_ROWS },
  typoMap: TYPO_MAP,
  defaults: { weekStart: 1, dateOrder: "DMY" },
};
