import { describe, expect, test } from "vitest";
import { buildLattice, expandStreams } from "../src/lattice.js";
import { testLocale } from "./fixtures/test-locale.js";

function latticeFor(text: string) {
  return buildLattice(testLocale.tokenize(text), testLocale.lexicon);
}

describe("buildLattice — words via lexicon", () => {
  test("known word → its payloads as a single-token alternative", () => {
    const cells = latticeFor("friday");
    expect(cells).toHaveLength(1);
    expect(cells[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "WEEKDAY", day: 5, source: "friday", confidence: 1 })],
    ]);
  });

  test("unknown word → LITERAL", () => {
    const cells = latticeFor("zorp");
    expect(cells[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "LITERAL", source: "zorp" })],
    ]);
  });
});

describe("buildLattice — digit shapes (core responsibility)", () => {
  test("small integer → NUMBER", () => {
    expect(latticeFor("15")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "NUMBER", n: 15 })],
    ]);
  });
  test("4-digit integer in 1900–2100 → YEAR", () => {
    expect(latticeFor("2026")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "YEAR", year: 2026 })],
    ]);
  });
  test("h:mm → TIME (24h)", () => {
    expect(latticeFor("17:30")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "TIME", h: 17, m: 30 })],
    ]);
  });
  test("invalid time digits → LITERAL", () => {
    expect(latticeFor("29:99")[0]!.alternatives[0]![0]!.kind).toBe("LITERAL");
  });
});

describe("buildLattice — slash dates carry ambiguity (spec §5.1)", () => {
  test("'3/4' → MONTH(2)+NUMBER(4) and NUMBER(3)+MONTH(3)", () => {
    const alts = latticeFor("3/4")[0]!.alternatives;
    expect(alts).toHaveLength(2);
    expect(alts[0]).toEqual([
      expect.objectContaining({ kind: "MONTH", month: 2 }),
      expect.objectContaining({ kind: "NUMBER", n: 4 }),
    ]);
    expect(alts[1]).toEqual([
      expect.objectContaining({ kind: "NUMBER", n: 3 }),
      expect.objectContaining({ kind: "MONTH", month: 3 }),
    ]);
  });

  test("'13/4' is unambiguous (13 can't be a month) → one alternative", () => {
    const alts = latticeFor("13/4")[0]!.alternatives;
    expect(alts).toHaveLength(1);
    expect(alts[0]).toEqual([
      expect.objectContaining({ kind: "NUMBER", n: 13 }),
      expect.objectContaining({ kind: "MONTH", month: 3 }),
    ]);
  });

  test("'3/4/2026' appends YEAR to both readings", () => {
    const alts = latticeFor("3/4/2026")[0]!.alternatives;
    expect(alts).toHaveLength(2);
    for (const alt of alts) expect(alt[2]).toEqual(expect.objectContaining({ kind: "YEAR", year: 2026 }));
  });

  test("'2026/3/4' → YMD single reading", () => {
    const alts = latticeFor("2026/3/4")[0]!.alternatives;
    expect(alts).toEqual([[
      expect.objectContaining({ kind: "YEAR", year: 2026 }),
      expect.objectContaining({ kind: "MONTH", month: 2 }),
      expect.objectContaining({ kind: "NUMBER", n: 4 }),
    ]]);
  });
});

describe("expandStreams", () => {
  test("flattens single-alternative cells into one stream", () => {
    const streams = expandStreams(latticeFor("next friday"));
    expect(streams).toHaveLength(1);
    expect(streams[0]!.map((t) => t.kind)).toEqual(["REL", "WEEKDAY"]);
  });
  test("multiplies alternatives and caps at 16", () => {
    const streams = expandStreams(latticeFor("3/4 to 5/6"));
    expect(streams).toHaveLength(4); // 2 × 1 × 2
    const big = expandStreams(latticeFor("1/2 1/2 1/2 1/2 1/2"));
    expect(big.length).toBeLessThanOrEqual(16); // 2^5=32 capped
  });
});
