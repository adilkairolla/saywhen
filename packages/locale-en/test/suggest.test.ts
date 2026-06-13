import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { en } from "../src/index.js";

const sug = createSuggest({ locale: en });
// Friday 2026-06-12, 04:00 in New York
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (en)", () => {
  test("starters: the blended-score top five", () => {
    expect(texts(sug.suggest("", CTX)))
      .toEqual(["tomorrow", "today", "next week", "this weekend", "this week"]);
  });

  test("'tom' → tomorrow with ghost", () => {
    const r = sug.suggest("tom", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.ghost).toBe("orrow");
  });

  test("'next w' → next week first, next wednesday offered", () => {
    const r = sug.suggest("next w", CTX);
    expect(r.suggestions[0]!.text).toBe("next week");
    expect(texts(r)).toContain("next wednesday");
  });

  test("'in a w' → in a week (canonical unit only)", () => {
    const r = sug.suggest("in a w", CTX);
    expect(r.suggestions[0]!.text).toBe("in a week");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-19");
  });

  test("fallbacks: bare number, weekday prefix, time", () => {
    expect(texts(sug.suggest("15", CTX))).toEqual(expect.arrayContaining(["the 15th", "july 15"]));
    expect(texts(sug.suggest("fri", CTX))).toEqual(expect.arrayContaining(["friday", "next friday"]));
    expect(texts(sug.suggest("5pm", CTX)))
      .toEqual(expect.arrayContaining(["today at 5pm", "tomorrow at 5pm"]));
  });

  test("opener no longer blanks typeahead: 'from feb 24 to ' completes", () => {
    expect(sug.suggest("from feb 24 to ", CTX).suggestions.length).toBeGreaterThan(0);
  });
});
