import { describe, expect, test } from "vitest";
import { scoreAndRank, statusFor, type ScoreInput } from "../src/score.js";
import type { Wall } from "../src/zoned-date.js";

const today: Wall = { y: 2026, m: 5, d: 12, h: 0, mi: 0 };
const w = (y: number, m: number, d: number): Wall => ({ y, m, d, h: 0, mi: 0 });
const expr = { type: "anchor", anchor: { kind: "now" } } as ScoreInput["expr"];

function input(partial: Partial<ScoreInput>): ScoreInput {
  return {
    expr,
    specificity: 1,
    tokenConfidence: 1,
    resolved: { start: w(2026, 5, 20), end: w(2026, 5, 20), hasExplicitTime: false },
    ...partial,
  };
}

describe("scoreAndRank", () => {
  test("confidence is the product of the three factors", () => {
    const [r] = scoreAndRank([input({ tokenConfidence: 0.9, specificity: 0.8 })], { today, allowPast: false });
    expect(r!.confidence).toBeCloseTo(0.72);
  });

  test("past candidates are penalized unless allowPast", () => {
    const past = input({ resolved: { start: w(2026, 5, 1), end: w(2026, 5, 1), hasExplicitTime: false } });
    expect(scoreAndRank([past], { today, allowPast: false })[0]!.confidence).toBeCloseTo(0.6);
    expect(scoreAndRank([past], { today, allowPast: true })[0]!.confidence).toBe(1);
  });

  test("ranks descending and dedupes identical (start, end), keeping the best", () => {
    const a = input({ specificity: 0.7 });
    const b = input({ specificity: 1 }); // same resolved dates
    const c = input({ specificity: 0.9, resolved: { start: w(2026, 6, 1), end: w(2026, 6, 1), hasExplicitTime: false } });
    const ranked = scoreAndRank([a, b, c], { today, allowPast: false });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.confidence).toBe(1);
    expect(ranked[1]!.confidence).toBe(0.9);
  });
});

describe("statusFor", () => {
  test("empty → invalid; one → valid", () => {
    expect(statusFor([])).toBe("invalid");
    expect(statusFor([{ confidence: 0.4 } as never])).toBe("valid");
  });
  test("two near-scored survivors → ambiguous (ratio > 0.8)", () => {
    expect(statusFor([{ confidence: 1 }, { confidence: 0.95 }] as never)).toBe("ambiguous");
    expect(statusFor([{ confidence: 1 }, { confidence: 0.5 }] as never)).toBe("valid");
  });
});
