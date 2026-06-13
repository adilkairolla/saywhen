import type { Anchor, DateExpr, FormatOptions, Lexicon, LocaleAdapter } from "../../src/types.js";
import { testLocale } from "./test-locale.js";

const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MO = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const suffix = (d: number) =>
  d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
const time = (t: { h: number; m: number }) => {
  const mer = t.h >= 12 ? "pm" : "am";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return t.m === 0 ? `${h12}${mer}` : `${h12}:${String(t.m).padStart(2, "0")}${mer}`;
};

function anchorText(a: Anchor, names: Record<string, string>): string {
  switch (a.kind) {
    case "now": return "today";
    case "relday":
      if (a.offset === 0) return "today";
      if (a.offset === 1) return "tomorrow";
      if (a.offset === -1) return "yesterday";
      return `in ${a.offset} days`;
    case "weekday": return a.which ? `${a.which} ${WD[a.day]!}` : WD[a.day]!;
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${MO[m]} ${d}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `the ${d}${suffix(d)}`;
      if (m !== undefined) return `${MO[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function fmt(e: DateExpr, names: Record<string, string>): string {
  switch (e.type) {
    case "anchor": return anchorText(e.anchor, names);
    case "offset": {
      const unit = e.n === 1 ? e.unit : `${e.unit}s`;
      if (e.base.type === "anchor" && e.base.anchor.kind === "now") {
        return e.dir === 1 ? `in ${e.n} ${unit}` : `${e.n} ${unit} ago`;
      }
      return `${fmt(e.base, names)} ${e.dir === 1 ? "+" : "-"} ${e.n} ${unit}`;
    }
    case "range": return `${fmt(e.start, names)} to ${fmt(e.end, names)}`;
    case "period": {
      const p = e.period;
      const noun =
        p.kind === "quarter" ? (p.q ? `q${p.q}` : "quarter") : p.kind === "season" ? "season" : p.kind;
      return `${e.which} ${noun}`;
    }
    case "boundary": return `${e.edge} of ${fmt(e.of, names)}`;
    case "withTime": return `${fmt(e.base, names)} at ${time(e.time)}`;
  }
}

// articles read as FILLER (mirrors locale-en, which lists "a"/"an" as fillers) so that
// "in a week" parses as DIRECTION(in) + UNIT — the inBare rule. testLocale leaves them
// out (its parser tests want "a" as a LITERAL), so the suggest fixture adds them here.
const lexicon: Lexicon = {
  ...testLocale.lexicon,
  a: [{ kind: "FILLER" }],
  an: [{ kind: "FILLER" }],
};

/** testLocale with a REAL formatter — suggest renders entries via locale.format */
export const suggestLocale: LocaleAdapter = {
  ...testLocale,
  lexicon,
  format: (expr: DateExpr, opts: FormatOptions) => fmt(expr, opts.holidayNames ?? {}),
};
