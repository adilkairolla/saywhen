import { beforeEach, describe, expect, test } from "vitest";
import {
  alt, many, map, newExpectations, opt, seq, tok, type Expectations,
} from "../src/combinators.js";
import { toks } from "./fixtures/toks.js";

let ex: Expectations;
beforeEach(() => {
  toks.reset();
  ex = newExpectations();
});

describe("tok", () => {
  test("matches a kind and consumes one token", () => {
    const s = [toks.weekday(5)];
    const r = tok("WEEKDAY")(s, 0, ex);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ i: 1, v: { kind: "WEEKDAY", day: 5 } });
  });

  test("skips FILLER before matching", () => {
    const s = [toks.filler(), toks.filler(), toks.weekday(2)];
    const r = tok("WEEKDAY")(s, 0, ex);
    expect(r[0]).toMatchObject({ i: 3, v: { day: 2 } });
  });

  test("on failure records the expectation at the frontier", () => {
    const s = [toks.weekday(5)];
    expect(tok("MONTH")(s, 0, ex)).toHaveLength(0);
    expect(ex.frontier).toBe(0);
    expect([...ex.kinds]).toContain("MONTH");
  });

  test("predicate filters matches", () => {
    const s = [toks.unit("hour")];
    expect(tok("UNIT", (t) => t.unit === "week")(s, 0, ex)).toHaveLength(0);
    expect(tok("UNIT", (t) => t.unit === "hour")(s, 0, ex)).toHaveLength(1);
  });
});

describe("seq / map", () => {
  test("threads positions and collects values", () => {
    const s = [toks.rel("next"), toks.weekday(5)];
    const p = map(seq(tok("REL"), tok("WEEKDAY")), ([r, w]) => `${r.which}-${w.day}`);
    expect(p(s, 0, ex)).toEqual([{ v: "next-5", i: 2 }]);
  });
});

describe("alt — returns ALL parses", () => {
  test("both branches succeed → both results", () => {
    const s = [toks.num(5)];
    const p = alt(
      map(tok("NUMBER"), () => "a"),
      map(tok("NUMBER", (t) => t.n === 5), () => "b"),
    );
    expect(p(s, 0, ex).map((r) => r.v).sort()).toEqual(["a", "b"]);
  });
});

describe("opt", () => {
  test("with the optional present: only the consuming branch completes the seq", () => {
    const s = [toks.rel("next"), toks.weekday(5)];
    const r = seq(opt(tok("REL")), tok("WEEKDAY"))(s, 0, ex);
    expect(r).toHaveLength(1);
    expect(r[0]!.i).toBe(2);
  });
  test("with the optional absent: the skip branch completes", () => {
    const s = [toks.weekday(5)];
    const r = seq(opt(tok("REL")), tok("WEEKDAY"))(s, 0, ex);
    expect(r).toEqual([{ v: [null, expect.objectContaining({ day: 5 })], i: 1 }]);
  });
});

describe("many", () => {
  test("returns every prefix length (0..n)", () => {
    const s = [toks.num(1), toks.num(2), toks.num(3)];
    const r = many(tok("NUMBER"))(s, 0, ex);
    expect(r.map((x) => x.i).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("expectation frontier", () => {
  test("keeps only the furthest failure point", () => {
    const s = [toks.rel("next"), toks.num(9)];
    seq(tok("REL"), tok("WEEKDAY"))(s, 0, ex); // fails at index 1 expecting WEEKDAY
    tok("MONTH")(s, 0, ex);                    // fails at index 0 — must NOT overwrite
    expect(ex.frontier).toBe(1);
    expect([...ex.kinds]).toEqual(["WEEKDAY"]);
  });
});
