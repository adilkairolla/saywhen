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
