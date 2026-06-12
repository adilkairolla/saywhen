import { beforeEach, describe, expect, test } from "vitest";
import { buildGrammar } from "../src/grammar.js";
import { toks } from "./fixtures/toks.js";
import type { SemToken } from "../src/types.js";

const g = buildGrammar();

function exprs(stream: SemToken[]) {
  return g.parseStream(stream).parses.map((p) => p.expr);
}

beforeEach(() => toks.reset());

describe("anchor: relday", () => {
  test("tomorrow", () => {
    expect(exprs([toks.relday(1)])).toEqual([
      { type: "anchor", anchor: { kind: "relday", offset: 1 } },
    ]);
  });
});

describe("anchor: weekday", () => {
  test("bare weekday has no which", () => {
    expect(exprs([toks.weekday(5)])).toEqual([
      { type: "anchor", anchor: { kind: "weekday", day: 5 } },
    ]);
  });
  test("REL weekday carries which", () => {
    expect(exprs([toks.rel("next"), toks.weekday(5)])).toEqual([
      { type: "anchor", anchor: { kind: "weekday", day: 5, which: "next" } },
    ]);
  });
  test("filler is skipped: 'on the friday'", () => {
    expect(exprs([toks.filler(), toks.filler(), toks.weekday(5)])).toHaveLength(1);
  });
});

describe("anchor: calendar", () => {
  test("MONTH NUMBER → {m, d}", () => {
    expect(exprs([toks.month(2), toks.num(4)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 4 } },
    );
  });
  test("NUMBER MONTH YEAR → {y, m, d}", () => {
    expect(exprs([toks.num(4), toks.month(2), toks.year(2027)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2027, m: 2, d: 4 } },
    );
  });
  test("YEAR MONTH NUMBER → {y, m, d}", () => {
    expect(exprs([toks.year(2026), toks.month(2), toks.num(4)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2026, m: 2, d: 4 } },
    );
  });
  test("ordinal works as the day: 'march 21st' and 'the 21st of march'", () => {
    expect(exprs([toks.month(2), toks.num(21, true)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 21 } },
    );
    expect(exprs([toks.filler(), toks.num(21, true), toks.filler(), toks.month(2)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 21 } },
    );
  });
  test("day out of range fails: 'march 45'", () => {
    expect(exprs([toks.month(2), toks.num(45)])).toHaveLength(0);
  });
  test("month alone → {m}, lower specificity than full date", () => {
    const r = g.parseStream([toks.month(2)]).parses;
    expect(r[0]!.expr).toEqual({ type: "anchor", anchor: { kind: "calendar", m: 2 } });
    const full = g.parseStream([toks.month(2), toks.num(4)]).parses;
    expect(r[0]!.specificity).toBeLessThan(full[0]!.specificity);
  });
  test("bare ordinal → {d}: 'the 21st'", () => {
    expect(exprs([toks.filler(), toks.num(21, true)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", d: 21 } },
    );
  });
  test("bare year → {y}", () => {
    expect(exprs([toks.year(2027)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2027 } },
    );
  });
});

describe("anchor: holiday", () => {
  test("HOLIDAY with optional YEAR", () => {
    expect(exprs([toks.holiday("christmas")])).toEqual([
      { type: "anchor", anchor: { kind: "holiday", id: "christmas" } },
    ]);
    expect(exprs([toks.holiday("christmas"), toks.year(2027)])).toEqual([
      { type: "anchor", anchor: { kind: "holiday", id: "christmas", year: 2027 } },
    ]);
  });
});

describe("full-input filter", () => {
  test("unconsumed non-filler token kills the parse", () => {
    expect(exprs([toks.weekday(5), toks.literal("zorp")])).toHaveLength(0);
  });
  test("trailing filler is fine", () => {
    expect(exprs([toks.weekday(5), toks.filler()])).toHaveLength(1);
  });
  test("empty stream parses to nothing", () => {
    expect(exprs([])).toHaveLength(0);
  });
});

describe("locale escape-hatch rules", () => {
  test("an anchor-position rule adds an alternative", () => {
    const custom = buildGrammar([{
      name: "test-rule",
      at: "anchor",
      match: (s, i) =>
        s[i]?.kind === "LITERAL" && s[i]!.source === "doomsday"
          ? { expr: { type: "anchor", anchor: { kind: "calendar", m: 11, d: 31 } }, next: i + 1 }
          : null,
    }]);
    expect(custom.parseStream([toks.literal("doomsday")]).parses[0]!.expr).toEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 11, d: 31 } },
    );
  });
});

describe("expectations surface from parseStream", () => {
  test("after REL, a WEEKDAY is among expected kinds", () => {
    const { expectations } = g.parseStream([toks.rel("next")]);
    expect(expectations.frontier).toBe(1);
    expect([...expectations.kinds]).toContain("WEEKDAY");
  });
});

describe("offset arithmetic", () => {
  const nextFriday = { type: "anchor", anchor: { kind: "weekday", day: 5, which: "next" } };

  test("acid-test shape: 'next friday + 2 weeks'", () => {
    expect(exprs([toks.rel("next"), toks.weekday(5), toks.op(1), toks.num(2), toks.unit("week")]))
      .toContainEqual({ type: "offset", base: nextFriday, n: 2, unit: "week", dir: 1 });
  });

  test("'2 weeks after next friday' produces the SAME AST", () => {
    expect(exprs([toks.num(2), toks.unit("week"), toks.dir("after"), toks.rel("next"), toks.weekday(5)]))
      .toContainEqual({ type: "offset", base: nextFriday, n: 2, unit: "week", dir: 1 });
  });

  test("'3 days before march 4' negates direction", () => {
    expect(exprs([toks.num(3), toks.unit("day"), toks.dir("before"), toks.month(2), toks.num(4)]))
      .toContainEqual({
        type: "offset",
        base: { type: "anchor", anchor: { kind: "calendar", m: 2, d: 4 } },
        n: 3, unit: "day", dir: -1,
      });
  });

  test("chained postfix ops fold left: 'tomorrow + 2 weeks - 3 days'", () => {
    expect(exprs([toks.relday(1), toks.op(1), toks.num(2), toks.unit("week"), toks.op(-1), toks.num(3), toks.unit("day")]))
      .toContainEqual({
        type: "offset",
        base: { type: "offset", base: { type: "anchor", anchor: { kind: "relday", offset: 1 } }, n: 2, unit: "week", dir: 1 },
        n: 3, unit: "day", dir: -1,
      });
  });
});

describe("now-relative", () => {
  const NOW = { type: "anchor", anchor: { kind: "now" } };
  test("'in 2 weeks'", () => {
    expect(exprs([toks.dir("in"), toks.num(2), toks.unit("week")]))
      .toContainEqual({ type: "offset", base: NOW, n: 2, unit: "week", dir: 1 });
  });
  test("'3 days ago'", () => {
    expect(exprs([toks.num(3), toks.unit("day"), toks.dir("ago")]))
      .toContainEqual({ type: "offset", base: NOW, n: 3, unit: "day", dir: -1 });
  });
  test("lookback span: 'last 2 weeks' → range ending now", () => {
    expect(exprs([toks.rel("last"), toks.num(2), toks.unit("week")]))
      .toContainEqual({
        type: "range",
        start: { type: "offset", base: NOW, n: 2, unit: "week", dir: -1 },
        end: NOW,
      });
  });
  test("lookahead span: 'next 2 weeks' → range starting now", () => {
    expect(exprs([toks.rel("next"), toks.num(2), toks.unit("week")]))
      .toContainEqual({
        type: "range",
        start: NOW,
        end: { type: "offset", base: NOW, n: 2, unit: "week", dir: 1 },
      });
  });
});

describe("periods", () => {
  test("'next week' (REL + UNIT-as-period)", () => {
    expect(exprs([toks.rel("next"), toks.unit("week")]))
      .toContainEqual({ type: "period", period: { kind: "week" }, which: "next" });
  });
  test("'this weekend' and bare 'weekend'", () => {
    const expected = { type: "period", period: { kind: "weekend" }, which: "this" };
    expect(exprs([toks.rel("this"), toks.period({ kind: "weekend" })])).toContainEqual(expected);
    expect(exprs([toks.period({ kind: "weekend" })])).toContainEqual(expected);
  });
  test("'last quarter'", () => {
    expect(exprs([toks.rel("last"), toks.period({ kind: "quarter" })]))
      .toContainEqual({ type: "period", period: { kind: "quarter" }, which: "last" });
  });
});

describe("boundary", () => {
  test("'end of month' → boundary of this-month period", () => {
    expect(exprs([toks.boundary("end"), toks.filler(), toks.unit("month")]))
      .toContainEqual({
        type: "boundary",
        of: { type: "period", period: { kind: "month" }, which: "this" },
        edge: "end",
      });
  });
  test("'start of next week'", () => {
    expect(exprs([toks.boundary("start"), toks.filler(), toks.rel("next"), toks.unit("week")]))
      .toContainEqual({
        type: "boundary",
        of: { type: "period", period: { kind: "week" }, which: "next" },
        edge: "start",
      });
  });
});

describe("with-time", () => {
  test("'friday at 5pm' → withTime 17:00", () => {
    expect(exprs([toks.weekday(5), toks.filler(), toks.num(5), toks.meridiem("pm")]))
      .toContainEqual({
        type: "withTime",
        base: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
        time: { h: 17, m: 0 },
      });
  });
  test("'tomorrow 17:30' uses 24h TIME token directly", () => {
    expect(exprs([toks.relday(1), toks.time(17, 30)]))
      .toContainEqual({
        type: "withTime",
        base: { type: "anchor", anchor: { kind: "relday", offset: 1 } },
        time: { h: 17, m: 30 },
      });
  });
  test("'12am' is midnight, '12pm' is noon", () => {
    expect(exprs([toks.relday(0), toks.num(12), toks.meridiem("am")]))
      .toContainEqual(expect.objectContaining({ time: { h: 0, m: 0 } }));
    expect(exprs([toks.relday(0), toks.num(12), toks.meridiem("pm")]))
      .toContainEqual(expect.objectContaining({ time: { h: 12, m: 0 } }));
  });
});

describe("ranges", () => {
  test("'monday to friday'", () => {
    expect(exprs([toks.weekday(1), toks.connector(), toks.weekday(5)]))
      .toContainEqual({
        type: "range",
        start: { type: "anchor", anchor: { kind: "weekday", day: 1 } },
        end: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
      });
  });
  test("range of compound ends: 'tomorrow to end of month'", () => {
    expect(exprs([toks.relday(1), toks.connector(), toks.boundary("end"), toks.filler(), toks.unit("month")]))
      .toHaveLength(1);
  });
  test("after a CONNECTOR the parser expects anchor-ish kinds (range-building hook)", () => {
    const { expectations } = g.parseStream([toks.weekday(1), toks.connector()]);
    expect(expectations.frontier).toBe(2);
    expect([...expectations.kinds]).toEqual(expect.arrayContaining(["WEEKDAY", "RELDAY", "MONTH"]));
  });
});
