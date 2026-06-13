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
