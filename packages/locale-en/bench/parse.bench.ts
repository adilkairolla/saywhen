import { bench, describe } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const PHRASES = [
  "tomorrow", "next friday", "next friday + 2 weeks", "the twenty first of march",
  "monday to friday", "this weekend", "end of next month", "friday at 5pm",
  "3/4", "in 2 weeks", "3 days b4 march 4", "fridya",
];

describe("engine.parse", () => {
  bench("challenge set (12 phrases)", () => {
    for (const p of PHRASES) engine.parse(p, CTX);
  });
  bench("ambiguity worst case: '3/4 to 5/6'", () => {
    engine.parse("3/4 to 5/6", CTX);
  });
  bench("typo worst case: 'tomorow at fiev pm'", () => {
    engine.parse("tomorow at fiev pm", CTX);
  });
});
