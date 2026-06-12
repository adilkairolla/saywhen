import { describe, expect, test } from "vitest";
import { buildKeyboardAdjacency, correctToken, weightedDamerau } from "../src/typo.js";
import { buildLattice } from "../src/lattice.js";
import { testLocale } from "./fixtures/test-locale.js";

const adj = buildKeyboardAdjacency(testLocale.keyboard!);

describe("buildKeyboardAdjacency", () => {
  test("neighbors on QWERTY", () => {
    expect(adj.get("s")!.has("a")).toBe(true);  // same row
    expect(adj.get("s")!.has("w")).toBe(true);  // row above
    expect(adj.get("s")!.has("x")).toBe(true);  // row below
    expect(adj.get("s")!.has("p")).toBe(false);
  });
});

describe("weightedDamerau", () => {
  test("substitution of adjacent key costs 0.5", () => {
    expect(weightedDamerau("fridat", "friday", adj)).toBe(0.5); // t↔y adjacent
  });
  test("substitution of distant key costs 1", () => {
    expect(weightedDamerau("fridaq", "friday", adj)).toBe(1);
  });
  test("transposition costs 0.5", () => {
    expect(weightedDamerau("firday", "friday", adj)).toBe(0.5);
  });
  test("insert/delete cost 1 each", () => {
    expect(weightedDamerau("fridayy", "friday", adj)).toBe(1);
    expect(weightedDamerau("frida", "friday", adj)).toBe(1);
  });
});

describe("correctToken", () => {
  const lexKeys = Object.keys(testLocale.lexicon);

  test("curated typoMap wins before edit distance", () => {
    expect(correctToken("tmrw", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "tomorrow", cost: 0,
    });
  });
  test("edit-distance correction within threshold", () => {
    expect(correctToken("fridat", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "friday", cost: 0.5,
    });
    expect(correctToken("tomorow", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "tomorrow", cost: 1,
    });
  });
  test("two edits allowed only for length ≥ 8", () => {
    expect(correctToken("tomorroww", lexKeys, testLocale.typoMap, adj)?.to).toBe("tomorrow");
    // weighted cost 1.5 (q→a adjacent 0.5, q→y distant 1) exceeds the len-6 threshold of 1
    expect(correctToken("fridqq", lexKeys, testLocale.typoMap, adj)).toBeNull();
  });
  test("never corrects short tokens or digits", () => {
    expect(correctToken("mn", lexKeys, testLocale.typoMap, adj)).toBeNull();
    expect(correctToken("123", lexKeys, testLocale.typoMap, adj)).toBeNull();
  });
});

describe("lattice integration", () => {
  test("corrected token enters the lattice with reduced confidence", () => {
    const corrections: Array<{ span: [number, number]; from: string; to: string }> = [];
    const cells = buildLattice(testLocale.tokenize("fridat"), testLocale.lexicon, {
      correct: (raw) => {
        const c = correctToken(raw.text, Object.keys(testLocale.lexicon), testLocale.typoMap, adj);
        if (c) corrections.push({ span: raw.span, from: raw.text, to: c.to });
        return c;
      },
    });
    const tok = cells[0]!.alternatives[0]![0]!;
    expect(tok).toMatchObject({ kind: "WEEKDAY", day: 5 });
    expect(tok.confidence).toBeLessThan(1);
    expect(corrections).toEqual([{ span: [0, 6], from: "fridat", to: "friday" }]);
  });
});
