import { describe, expect, test } from "vitest";
import { buildGrammar } from "../src/grammar.js";
import type { SemToken } from "../src/types.js";

// minimal SemToken builder — payload + required meta
const t = (p: object): SemToken => ({ ...p, span: [0, 1], source: "x", confidence: 1 } as SemToken);
const g = buildGrammar();
const rangeOf = (stream: SemToken[]) =>
  g.parseStream(stream).parses.find((p) => p.expr.type === "range")?.expr;

describe("rangePostfixP — postpositional range (connector trails)", () => {
  test("WEEKDAY WEEKDAY CONNECTOR → range(start, end)", () => {
    const r = rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "WEEKDAY", day: 5 }), t({ kind: "CONNECTOR" })]);
    expect(r).toMatchObject({
      type: "range",
      start: { type: "anchor", anchor: { kind: "weekday", day: 1 } },
      end: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
    });
  });

  test("medial connector still works (no regression): WEEKDAY CONNECTOR WEEKDAY", () => {
    const r = rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 })]);
    expect(r).toMatchObject({ type: "range", start: { anchor: { day: 1 } }, end: { anchor: { day: 5 } } });
  });

  test("two endpoints with no connector do NOT form a range", () => {
    expect(rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "WEEKDAY", day: 5 })])).toBeUndefined();
  });
});

describe("prepositional opener (opt RANGE_OPEN on rangeP)", () => {
  test("RANGE_OPEN WEEKDAY CONNECTOR WEEKDAY → range", () => {
    const r = rangeOf([
      t({ kind: "RANGE_OPEN" }), t({ kind: "WEEKDAY", day: 1 }),
      t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "weekday", day: 1 } },
      end: { anchor: { kind: "weekday", day: 5 } },
    });
  });

  test("no opener still parses exactly one range (no duplicate)", () => {
    const parses = g.parseStream([
      t({ kind: "WEEKDAY", day: 1 }), t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 }),
    ]).parses.filter((p) => p.expr.type === "range");
    expect(parses).toHaveLength(1);
  });
});

describe("month elision (bare-day endpoint, gated on an explicit month)", () => {
  // "march 1 to 15": MONTH NUMBER CONNECTOR NUMBER  (march=2, 0-indexed)
  test("back-elision: end bare day inherits nothing at parse time (month copied in resolve)", () => {
    const r = rangeOf([
      t({ kind: "MONTH", month: 2 }), t({ kind: "NUMBER", n: 1 }),
      t({ kind: "CONNECTOR" }), t({ kind: "NUMBER", n: 15 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "calendar", m: 2, d: 1 } },
      end: { anchor: { kind: "calendar", d: 15 } },
    });
  });

  // "1 to 15 march": NUMBER CONNECTOR NUMBER MONTH
  test("front-elision: start is a bare day, end carries the month", () => {
    const r = rangeOf([
      t({ kind: "NUMBER", n: 1 }), t({ kind: "CONNECTOR" }),
      t({ kind: "NUMBER", n: 15 }), t({ kind: "MONTH", month: 2 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "calendar", d: 1 } },
      end: { anchor: { kind: "calendar", m: 2, d: 15 } },
    });
  });

  test("'3 to 5' (no month anywhere) yields no range", () => {
    expect(rangeOf([
      t({ kind: "NUMBER", n: 3 }), t({ kind: "CONNECTOR" }), t({ kind: "NUMBER", n: 5 }),
    ])).toBeUndefined();
  });
});
