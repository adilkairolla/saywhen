import type { DateExpr, Lexicon, LocaleAdapter, RawToken } from "../../src/types.js";

const lexicon: Lexicon = {
  // weekdays (sun..sat) — two forms each to exercise multi-form lookup
  sunday: [{ kind: "WEEKDAY", day: 0 }], sun: [{ kind: "WEEKDAY", day: 0 }],
  monday: [{ kind: "WEEKDAY", day: 1 }], mon: [{ kind: "WEEKDAY", day: 1 }],
  tuesday: [{ kind: "WEEKDAY", day: 2 }], tue: [{ kind: "WEEKDAY", day: 2 }],
  wednesday: [{ kind: "WEEKDAY", day: 3 }], wed: [{ kind: "WEEKDAY", day: 3 }],
  thursday: [{ kind: "WEEKDAY", day: 4 }], thu: [{ kind: "WEEKDAY", day: 4 }],
  friday: [{ kind: "WEEKDAY", day: 5 }], fri: [{ kind: "WEEKDAY", day: 5 }],
  saturday: [{ kind: "WEEKDAY", day: 6 }], sat: [{ kind: "WEEKDAY", day: 6 }],
  // months — "may" is deliberately ambiguous with a LITERAL reading
  january: [{ kind: "MONTH", month: 0 }],
  february: [{ kind: "MONTH", month: 1 }],
  march: [{ kind: "MONTH", month: 2 }],
  april: [{ kind: "MONTH", month: 3 }],
  may: [{ kind: "MONTH", month: 4 }],
  june: [{ kind: "MONTH", month: 5 }],
  july: [{ kind: "MONTH", month: 6 }],
  august: [{ kind: "MONTH", month: 7 }],
  september: [{ kind: "MONTH", month: 8 }],
  october: [{ kind: "MONTH", month: 9 }],
  november: [{ kind: "MONTH", month: 10 }],
  december: [{ kind: "MONTH", month: 11 }],
  // reldays
  today: [{ kind: "RELDAY", offset: 0 }],
  tomorrow: [{ kind: "RELDAY", offset: 1 }],
  yesterday: [{ kind: "RELDAY", offset: -1 }],
  // number words for compound-merging tests
  one: [{ kind: "NUMBER", n: 1 }],
  two: [{ kind: "NUMBER", n: 2 }],
  twenty: [{ kind: "NUMBER", n: 20 }],
  thirty: [{ kind: "NUMBER", n: 30 }],
  first: [{ kind: "NUMBER", n: 1, ordinal: true }],
  third: [{ kind: "NUMBER", n: 3, ordinal: true }],
  // rel / units / periods / boundaries
  this: [{ kind: "REL", which: "this" }],
  next: [{ kind: "REL", which: "next" }],
  last: [{ kind: "REL", which: "last" }],
  day: [{ kind: "UNIT", unit: "day" }], days: [{ kind: "UNIT", unit: "day" }],
  week: [{ kind: "UNIT", unit: "week" }], weeks: [{ kind: "UNIT", unit: "week" }],
  month: [{ kind: "UNIT", unit: "month" }], months: [{ kind: "UNIT", unit: "month" }],
  year: [{ kind: "UNIT", unit: "year" }], years: [{ kind: "UNIT", unit: "year" }],
  hour: [{ kind: "UNIT", unit: "hour" }], hours: [{ kind: "UNIT", unit: "hour" }],
  minute: [{ kind: "UNIT", unit: "minute" }], minutes: [{ kind: "UNIT", unit: "minute" }],
  weekend: [{ kind: "PERIOD", period: { kind: "weekend" } }],
  start: [{ kind: "BOUNDARY", edge: "start" }],
  beginning: [{ kind: "BOUNDARY", edge: "start" }],
  end: [{ kind: "BOUNDARY", edge: "end" }],
  // direction / op / connector / meridiem
  before: [{ kind: "DIRECTION", dir: "before" }],
  after: [{ kind: "DIRECTION", dir: "after" }],
  from: [{ kind: "DIRECTION", dir: "from" }],
  ago: [{ kind: "DIRECTION", dir: "ago" }],
  in: [{ kind: "DIRECTION", dir: "in" }],
  to: [{ kind: "CONNECTOR" }],
  until: [{ kind: "CONNECTOR" }],
  through: [{ kind: "CONNECTOR" }],
  am: [{ kind: "MERIDIEM", value: "am" }],
  pm: [{ kind: "MERIDIEM", value: "pm" }],
  "+": [{ kind: "OP", op: 1 }],
  "-": [{ kind: "OP", op: -1 }, { kind: "CONNECTOR" }], // "jun 10 - jun 12" stays ambiguous
  // filler
  on: [{ kind: "FILLER" }],
  at: [{ kind: "FILLER" }],
  the: [{ kind: "FILLER" }],
  of: [{ kind: "FILLER" }],
};

// 1st..31st ordinals, generated
for (let d = 1; d <= 31; d++) {
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  lexicon[`${d}${suffix}`] = [{ kind: "NUMBER", n: d, ordinal: true }];
}

const TOKEN_RE = /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+[a-z]+|\d+|[a-z]+(?:'[a-z]+)?|[+\-—]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = m.index ?? 0;
    // split digit+letter runs ("5pm" → "5","pm"; "21st" stays whole if it's a known ordinal)
    const dl = /^(\d+)([a-z]+)$/.exec(raw);
    if (dl && !(raw in lexicon)) {
      out.push({ text: dl[1]!, span: [start, start + dl[1]!.length] });
      out.push({ text: dl[2]!, span: [start + dl[1]!.length, start + raw.length] });
    } else {
      out.push({ text: raw, span: [start, start + raw.length] });
    }
  }
  return out;
}

export const testLocale: LocaleAdapter = {
  id: "test",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    const NUMS: Record<string, number> = { one: 1, two: 2, twenty: 20, thirty: 30 };
    const ORDS: Record<string, number> = { first: 1, third: 3 };
    if (words.length === 1) {
      const w = words[0]!;
      if (/^\d+$/.test(w)) return Number(w);
      return NUMS[w] ?? ORDS[w] ?? null;
    }
    if (words.length === 2) {
      const tens = NUMS[words[0]!];
      const unit = NUMS[words[1]!] ?? ORDS[words[1]!];
      if (tens !== undefined && tens >= 20 && tens % 10 === 0 && unit !== undefined && unit >= 1 && unit <= 9) {
        return tens + unit;
      }
    }
    return null;
  },
  format: (expr: DateExpr) => JSON.stringify(expr), // structural placeholder for unit tests only
  formatAccessible: (expr: DateExpr) => JSON.stringify(expr),
  keyboard: { rows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"] },
  typoMap: { tmrw: "tomorrow", b4: "before" },
  defaults: { weekStart: 0, dateOrder: "MDY" },
};
