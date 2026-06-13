import { describe, expect, test } from "vitest";
import type { HolidayPack } from "../src/types.js";
import { createSuggest, type SuggestContext, type SuggestResult } from "../src/suggest.js";
import { suggestLocale } from "./fixtures/suggest-locale.js";

const pack: HolidayPack = {
  id: "test-pack",
  entries: [
    { id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas", "xmas"] } },
    { id: "new-year", compute: () => ({ m: 0, d: 1 }), names: { test: ["new year day", "new year"] } },
  ],
};
const sug = createSuggest({ locale: suggestLocale, holidays: [pack] });
// Friday 2026-06-12, 13:00 in Almaty
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("starters — empty input (spec §6)", () => {
  const r = sug.suggest("", CTX);
  test("top five by the blended score, in order", () => {
    expect(texts(r)).toEqual(["tomorrow", "today", "next week", "this weekend", "this week"]);
  });
  test("starters carry resolved dates", () => {
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.suggestions[2]!.isRange).toBe(true); // next week
    expect(r.suggestions[2]!.start.date).toBe("2026-06-14");
    expect(r.suggestions[2]!.end.date).toBe("2026-06-20");
  });
  test("no ghost for empty input", () => {
    expect(r.ghost).toBeNull();
  });
  test("limit is honored", () => {
    expect(sug.suggest("", { ...CTX, limit: 3 }).suggestions).toHaveLength(3);
  });
});

describe("prefix completions + ghost", () => {
  test("'tom' → tomorrow, ghost 'orrow'", () => {
    const r = sug.suggest("tom", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.ghost).toBe("orrow");
  });
  test("'next w' ranks next week above next wednesday", () => {
    const r = sug.suggest("next w", CTX);
    expect(r.suggestions[0]!.text).toBe("next week");
    expect(texts(r)).toContain("next wednesday");
    expect(r.ghost).toBe("eek");
  });
  test("holiday names complete like any vocabulary", () => {
    const r = sug.suggest("chr", CTX);
    expect(r.suggestions[0]!.text).toBe("christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-25");
  });
});

describe("typo-corrected prefixes still complete (spec §6 via §5.2)", () => {
  test("'tomorow' (dropped letter) → tomorrow, but no ghost", () => {
    const r = sug.suggest("tomorow", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.ghost).toBeNull();
  });
  test("'tmrw' goes through the curated typo map", () => {
    const r = sug.suggest("tmrw", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
  });
});

describe("config errors throw (spec §8)", () => {
  test("invalid timezone", () => {
    expect(() => sug.suggest("tom", { ...CTX, timeZone: "Nope/Nope" })).toThrow(/Invalid IANA/);
  });
});
