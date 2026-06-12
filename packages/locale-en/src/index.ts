import type {
  DateExpr, Anchor, Lexicon, LocaleAdapter, PeriodRef, RawToken, Unit,
} from "@saywhen/core";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const UNITS: Array<[Unit, string[]]> = [
  ["day", ["day", "days"]],
  ["week", ["week", "weeks", "wk", "wks"]],
  ["month", ["month", "months", "mo"]],
  ["year", ["year", "years", "yr", "yrs"]],
  ["hour", ["hour", "hours", "hr", "hrs"]],
  ["minute", ["minute", "minutes", "min", "mins"]],
];
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const SEASONS: Array<[number, string[]]> = [
  [0, ["spring"]], [1, ["summer"]], [2, ["autumn", "fall"]], [3, ["winter"]],
];

function ordinalSuffix(d: number): string {
  if (d % 10 === 1 && d !== 11) return "st";
  if (d % 10 === 2 && d !== 12) return "nd";
  if (d % 10 === 3 && d !== 13) return "rd";
  return "th";
}

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  const add = (forms: string[], payload: Lexicon[string][number]) => {
    for (const f of forms) lex[f] = [...(lex[f] ?? []), payload];
  };

  WEEKDAYS.forEach((name, day) => add([name, WEEKDAY_ABBR[day]!], { kind: "WEEKDAY", day }));
  MONTHS.forEach((name, month) => add([name], { kind: "MONTH", month }));
  MONTH_ABBR.forEach((abbr, month) => { if (abbr !== MONTHS[month]) add([abbr], { kind: "MONTH", month }); });
  add(["sept"], { kind: "MONTH", month: 8 });

  add(["today", "tonight"], { kind: "RELDAY", offset: 0 });
  add(["tomorrow"], { kind: "RELDAY", offset: 1 });
  add(["yesterday"], { kind: "RELDAY", offset: -1 });

  add(["this"], { kind: "REL", which: "this" });
  add(["next"], { kind: "REL", which: "next" });
  add(["last"], { kind: "REL", which: "last" });

  for (const [unit, forms] of UNITS) add(forms, { kind: "UNIT", unit });
  for (const [word, n] of Object.entries(NUMBER_WORDS)) add([word], { kind: "NUMBER", n });
  for (let d = 1; d <= 31; d++) add([`${d}${ordinalSuffix(d)}`], { kind: "NUMBER", n: d, ordinal: true });

  add(["weekend"], { kind: "PERIOD", period: { kind: "weekend" } });
  add(["quarter"], { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q++) add([`q${q}`], { kind: "PERIOD", period: { kind: "quarter", q } });
  for (const [s, forms] of SEASONS) add(forms, { kind: "PERIOD", period: { kind: "season", s: s as 0 | 1 | 2 | 3 } });

  add(["start", "beginning"], { kind: "BOUNDARY", edge: "start" });
  add(["end"], { kind: "BOUNDARY", edge: "end" });

  add(["before"], { kind: "DIRECTION", dir: "before" });
  add(["after"], { kind: "DIRECTION", dir: "after" });
  add(["from"], { kind: "DIRECTION", dir: "from" });
  add(["ago"], { kind: "DIRECTION", dir: "ago" });
  add(["in"], { kind: "DIRECTION", dir: "in" });

  add(["to", "until", "till", "through", "thru"], { kind: "CONNECTOR" });
  add(["+", "plus"], { kind: "OP", op: 1 });
  add(["minus"], { kind: "OP", op: -1 });
  add(["-"], { kind: "OP", op: -1 });
  add(["-"], { kind: "CONNECTOR" }); // "jun 10 - jun 12" — lattice carries both readings

  add(["am"], { kind: "MERIDIEM", value: "am" });
  add(["pm"], { kind: "MERIDIEM", value: "pm" });

  add(["on", "at", "the", "of", "a", "an", "for"], { kind: "FILLER" });

  return lex;
}

const lexicon = buildLexicon();

const TOKEN_RE = /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+[a-z]+|\d+|[a-z]+(?:'[a-z]+)?|[+\-]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    const dl = /^(\d+)([a-z]+)$/.exec(raw);
    if (dl && !(raw in lexicon)) {
      // "5pm" → "5" + "pm"; "21st" stays whole (known ordinal)
      out.push({ text: dl[1]!, span: [start, start + dl[1]!.length] });
      out.push({ text: dl[2]!, span: [start + dl[1]!.length, start + raw.length] });
    } else {
      out.push({ text: raw, span: [start, start + raw.length] });
    }
  }
  return out;
}

// ---------- formatting (canonical, re-parseable) ----------

function formatTime(t: { h: number; m: number }): string {
  const mer = t.h >= 12 ? "pm" : "am";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return t.m === 0 ? `${h12}${mer}` : `${h12}:${String(t.m).padStart(2, "0")}${mer}`;
}

function periodName(p: PeriodRef): string {
  switch (p.kind) {
    case "week": case "month": case "year": return p.kind;
    case "weekend": return "weekend";
    case "quarter": return p.q ? `q${p.q}` : "quarter";
    case "season": return p.s !== undefined ? SEASONS[p.s]![1][0]! : "season";
  }
}

function formatAnchor(a: Anchor): string {
  switch (a.kind) {
    case "now": return "today";
    case "relday":
      if (a.offset === 0) return "today";
      if (a.offset === 1) return "tomorrow";
      if (a.offset === -1) return "yesterday";
      return a.offset > 0 ? `in ${a.offset} days` : `${-a.offset} days ago`;
    case "weekday": {
      const name = WEEKDAYS[a.day]!;
      return a.which ? `${a.which} ${name}` : name;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) {
        return `${MONTHS[m]} ${d}${y !== undefined ? ` ${y}` : ""}`;
      }
      if (d !== undefined) return `the ${d}${ordinalSuffix(d)}`;
      if (m !== undefined) return `${MONTHS[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id; // names: plan 04
  }
}

function format(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `in ${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`}`
          : `${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`} ago`;
      }
      const unit = expr.n === 1 ? expr.unit : `${expr.unit}s`;
      return `${format(expr.base)} ${expr.dir === 1 ? "+" : "-"} ${expr.n} ${unit}`;
    }
    case "range": return `${format(expr.start)} to ${format(expr.end)}`;
    case "period": return `${expr.which} ${periodName(expr.period)}`;
    case "boundary": return `${expr.edge === "start" ? "start" : "end"} of ${format(expr.of)}`;
    case "withTime": return `${format(expr.base)} at ${formatTime(expr.time)}`;
  }
}

export const en: LocaleAdapter = {
  id: "en",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    if (words.length !== 1) return null; // compounds ("twenty one"): plan 02
    const w = words[0]!;
    if (/^\d+$/.test(w)) return Number(w);
    return NUMBER_WORDS[w] ?? null;
  },
  format: (expr) => format(expr),
  formatAccessible: (expr) => format(expr), // dedicated phrasing: plan 02
  keyboard: { rows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"] },
  typoMap: {
    tmrw: "tomorrow", tmr: "tomorrow", tdy: "today", b4: "before",
    nxt: "next", wknd: "weekend",
  },
  defaults: { weekStart: 0, dateOrder: "MDY" },
};
