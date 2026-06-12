import {
  alt, map, newExpectations, opt, seq, skipFiller, tok,
  type Expectations, type Parser,
} from "./combinators.js";
import type { Anchor, DateExpr, LocaleRule, SemToken } from "./types.js";

export interface GrammarParse {
  expr: DateExpr;
  specificity: number;
}

export interface StreamResult {
  parses: GrammarParse[];
  expectations: Expectations;
}

export interface Grammar {
  parseStream(stream: SemToken[]): StreamResult;
}

type P = Parser<GrammarParse>;

const A = (expr: DateExpr, specificity: number): GrammarParse => ({ expr, specificity });
const anchor = (a: Anchor): DateExpr => ({ type: "anchor", anchor: a });

function localeRuleParser(rule: LocaleRule): P {
  return (s, i) => {
    const j = skipFiller(s, i);
    const r = rule.match(s, j);
    return r ? [{ v: A(r.expr, 1), i: r.next }] : [];
  };
}

export function buildGrammar(localeRules: LocaleRule[] = []): Grammar {
  const anchorRules = localeRules.filter((r) => r.at === "anchor").map(localeRuleParser);
  const exprRules = localeRules.filter((r) => r.at === "expression").map(localeRuleParser);

  // ---- anchors ----
  const dayNum = tok("NUMBER", (t) => t.n >= 1 && t.n <= 31);

  const reldayA: P = map(tok("RELDAY"), (t) => A(anchor({ kind: "relday", offset: t.offset }), 1));

  const weekdayA: P = map(seq(opt(tok("REL")), tok("WEEKDAY")), ([rel, wd]) =>
    A(anchor({ kind: "weekday", day: wd.day, ...(rel ? { which: rel.which } : {}) }), rel ? 1 : 0.9),
  );

  const calMD: P = map(seq(tok("MONTH"), dayNum, opt(tok("YEAR"))), ([mo, d, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, d: d.n, ...(y ? { y: y.year } : {}) }), 1),
  );
  const calDM: P = map(seq(dayNum, tok("MONTH"), opt(tok("YEAR"))), ([d, mo, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, d: d.n, ...(y ? { y: y.year } : {}) }), 1),
  );
  const calYMD: P = map(seq(tok("YEAR"), tok("MONTH"), dayNum), ([y, mo, d]) =>
    A(anchor({ kind: "calendar", y: y.year, m: mo.month, d: d.n }), 1),
  );
  const calMonthOnly: P = map(seq(tok("MONTH"), opt(tok("YEAR"))), ([mo, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, ...(y ? { y: y.year } : {}) }), 0.6),
  );
  const ordinalDayA: P = map(tok("NUMBER", (t) => t.ordinal === true && t.n >= 1 && t.n <= 31), (t) =>
    A(anchor({ kind: "calendar", d: t.n }), 0.8),
  );
  const bareYearA: P = map(tok("YEAR"), (t) => A(anchor({ kind: "calendar", y: t.year }), 0.7));

  const holidayA: P = map(seq(tok("HOLIDAY"), opt(tok("YEAR"))), ([h, y]) =>
    A(anchor({ kind: "holiday", id: h.id, ...(y ? { year: y.year } : {}) }), 1),
  );

  const anchorP: P = alt(
    reldayA, weekdayA, calYMD, calMD, calDM, calMonthOnly, ordinalDayA, bareYearA, holidayA,
    ...anchorRules,
  );

  // Task 10 replaces this with the full compound-expression grammar.
  const topP: P = alt(anchorP, ...exprRules);

  function parseStream(stream: SemToken[]): StreamResult {
    const expectations = newExpectations();
    if (stream.length === 0) return { parses: [], expectations };
    const all = topP(stream, 0, expectations);
    const complete = all.filter((r) => skipFiller(stream, r.i) === stream.length);
    // dedupe structurally identical ASTs, keeping the highest specificity
    const byKey = new Map<string, GrammarParse>();
    for (const { v } of complete) {
      const key = JSON.stringify(v.expr);
      const prior = byKey.get(key);
      if (!prior || v.specificity > prior.specificity) byKey.set(key, v);
    }
    return { parses: [...byKey.values()], expectations };
  }

  return { parseStream };
}
