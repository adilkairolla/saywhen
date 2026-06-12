import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

export const CHALLENGE_PHRASES = [
  "tomorrow", "next friday", "next friday + 2 weeks", "the twenty first of march",
  "monday to friday", "this weekend", "end of next month", "friday at 5pm",
  "3/4", "in 2 weeks", "3 days b4 march 4", "fridya",
];

describe("parse latency", () => {
  test("p99 within budget (1ms target, 5ms hard cap)", () => {
    for (const p of CHALLENGE_PHRASES) engine.parse(p, CTX); // warm-up
    const samples: number[] = [];
    for (let round = 0; round < 50; round++) {
      for (const p of CHALLENGE_PHRASES) {
        const t0 = performance.now();
        engine.parse(p, CTX);
        samples.push(performance.now() - t0);
      }
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    console.log(`parse p99: ${p99.toFixed(3)}ms over ${samples.length} samples (budget 1ms, cap 5ms)`);
    expect(p99).toBeLessThan(5);
  });
});
