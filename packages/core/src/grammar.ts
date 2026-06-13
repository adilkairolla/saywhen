import {
  alt, filter, lazy, many, map, newExpectations, opt, seq, skipFiller, tok,
  type Expectations, type Parser,
} from "./combinators.js";
import type { Anchor, DateExpr, LocaleRule, PeriodRef, SemToken } from "./types.js";

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

function applyMeridiem(h: number, m: number, mer?: "am" | "pm"): { h: number; m: number } {
  if (!mer || h > 12) return { h, m };
  if (mer === "pm") return { h: h === 12 ? 12 : h + 12, m };
  return { h: h === 12 ? 0 : h, m };
}

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

  // ---- time ----
  const timeP: Parser<{ h: number; m: number }> = alt(
    map(seq(tok("TIME"), opt(tok("MERIDIEM"))), ([t, mer]) => applyMeridiem(t.h, t.m, mer?.value)),
    map(
      seq(tok("NUMBER", (t) => !t.ordinal && t.n >= 1 && t.n <= 12), tok("MERIDIEM")),
      ([n, mer]) => applyMeridiem(n.n, 0, mer.value),
    ),
  );

  // ---- periods ----
  const periodRefP = alt(
    map(tok("PERIOD"), (t) => t.period),
    map(
      tok("UNIT", (u) => u.unit === "week" || u.unit === "month" || u.unit === "year"),
      (u) => ({ kind: u.unit }) as PeriodRef,
    ),
  );
  const relPeriodP: P = map(seq(tok("REL"), periodRefP), ([rel, p]) =>
    A({ type: "period", period: p, which: rel.which }, 1),
  );
  const barePeriodP: P = map(tok("PERIOD"), (t) =>
    A({ type: "period", period: t.period, which: "this" }, 0.8),
  );

  // ---- now-relative ----
  const NOW: DateExpr = anchor({ kind: "now" });
  const numUnit = seq(tok("NUMBER", (t) => !t.ordinal), tok("UNIT"));

  const inP: P = map(seq(tok("DIRECTION", (d) => d.dir === "in"), numUnit), ([, [n, u]]) =>
    A({ type: "offset", base: NOW, n: n.n, unit: u.unit, dir: 1 }, 1),
  );
  // "in a week" / "через месяц" — bare unit, n = 1 (the article is FILLER)
  const inBareP: P = map(seq(tok("DIRECTION", (d) => d.dir === "in"), tok("UNIT")), ([, u]) =>
    A({ type: "offset", base: NOW, n: 1, unit: u.unit, dir: 1 }, 0.9),
  );
  const agoP: P = map(seq(numUnit, tok("DIRECTION", (d) => d.dir === "ago")), ([[n, u]]) =>
    A({ type: "offset", base: NOW, n: n.n, unit: u.unit, dir: -1 }, 1),
  );

  // "last 2 weeks" / "next 2 weeks" → spans anchored at now
  const lookP: P = map(seq(tok("REL", (r) => r.which !== "this"), numUnit), ([rel, [n, u]]) => {
    const off: DateExpr = {
      type: "offset", base: NOW, n: n.n, unit: u.unit, dir: rel.which === "last" ? -1 : 1,
    };
    return A(
      rel.which === "last"
        ? { type: "range", start: off, end: NOW }
        : { type: "range", start: NOW, end: off },
      1,
    );
  });

  // "2 weeks after/before/from X"
  const relOffsetP: P = map(
    seq(
      numUnit,
      tok("DIRECTION", (d) => d.dir === "after" || d.dir === "before" || d.dir === "from"),
      lazy(() => exprP),
    ),
    ([[n, u], d, base]) =>
      A(
        { type: "offset", base: base.expr, n: n.n, unit: u.unit, dir: d.dir === "before" ? -1 : 1 },
        base.specificity,
      ),
  );

  // "end of X" — bare UNIT target reads as this-period ("end of month")
  const boundaryTarget: P = alt(
    lazy(() => exprP),
    map(
      tok("UNIT", (u) => u.unit === "week" || u.unit === "month" || u.unit === "year"),
      (u) => A({ type: "period", period: { kind: u.unit } as PeriodRef, which: "this" }, 0.9),
    ),
  );
  const boundaryP: P = map(seq(tok("BOUNDARY"), boundaryTarget), ([b, t]) =>
    A({ type: "boundary", of: t.expr, edge: b.edge }, t.specificity),
  );

  const primaryP: P = alt(
    anchorP, relPeriodP, barePeriodP, lookP, inP, inBareP, agoP, relOffsetP, boundaryP,
  );

  // postfix arithmetic: X (+|-) n UNIT, repeatable, left-folded
  const offsetTail = seq(tok("OP"), numUnit);
  const withOffsets: P = map(seq(primaryP, many(offsetTail)), ([base, tails]) =>
    tails.reduce<GrammarParse>(
      (acc, [op, [n, u]]) =>
        A({ type: "offset", base: acc.expr, n: n.n, unit: u.unit, dir: op.op }, acc.specificity),
      base,
    ),
  );

  // optional time attachment: "X at 5pm" ("at" is FILLER)
  const exprP: P = map(seq(withOffsets, opt(timeP)), ([base, time]) =>
    time ? A({ type: "withTime", base: base.expr, time }, base.specificity) : base,
  );

  const buildRange = (a: GrammarParse, b: GrammarParse): GrammarParse =>
    A({ type: "range", start: a.expr, end: b.expr }, a.specificity * b.specificity);

  // explicit range, optionally introduced by a leading opener (from / between / с / между).
  // opt consumes the opener when present; with no opener the empty branch reproduces the
  // prior behaviour, and a present opener cannot also match the empty branch because the
  // following exprP rejects a RANGE_OPEN token — so no duplicate parse.
  const rangeP: P = map(
    seq(opt(tok("RANGE_OPEN")), exprP, tok("CONNECTOR"), exprP),
    ([, a, , b]) => buildRange(a, b),
  );

  // a bare cardinal day 1–31 as a range endpoint (ordinals like "the 21st" already parse via exprP)
  const bareDayP: P = map(
    tok("NUMBER", (n) => !n.ordinal && n.n >= 1 && n.n <= 31),
    (n) => A(anchor({ kind: "calendar", d: n.n }), 0.3),
  );
  const rangeEndpoint: P = alt(exprP, bareDayP);

  const endpointMonth = (e: DateExpr): boolean =>
    e.type === "anchor" && e.anchor.kind === "calendar" && e.anchor.m !== undefined;
  const rangeHasMonth = (e: DateExpr): boolean =>
    e.type === "range" && (endpointMonth(e.start) || endpointMonth(e.end));

  // elided range: admits a bare-day endpoint, but only when SOME endpoint carries an explicit
  // month — so "3 to 5" (no month) yields no candidate. The all-exprP overlap with rangeP dedupes.
  const elidedRangeP: P = filter(
    map(
      seq(opt(tok("RANGE_OPEN")), rangeEndpoint, tok("CONNECTOR"), rangeEndpoint),
      ([, a, , b]) => buildRange(a, b),
    ),
    (r) => rangeHasMonth(r.expr),
  );

  // postpositional range: "X Y CONNECTOR" — the connector trails both endpoints
  // (Kazakh "дүйсенбіден жұмаға дейін"). Locale-neutral and safe for medial-connector
  // locales: after the first exprP the second would have to start on a CONNECTOR token,
  // which exprP rejects — so en/ru "X CONNECTOR Y" never reaches this rule.
  const rangePostfixP: P = map(seq(exprP, exprP, tok("CONNECTOR")), ([a, b]) =>
    A({ type: "range", start: a.expr, end: b.expr }, a.specificity * b.specificity),
  );

  const topP: P = alt(rangeP, rangePostfixP, elidedRangeP, exprP, ...exprRules);

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
