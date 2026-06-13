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

describe("grammar continuations (expectation frontier → concrete completions)", () => {
  test("'2 days before chr' completes the holiday and keeps the typed shape", () => {
    const r = sug.suggest("2 days before chr", CTX);
    expect(r.suggestions[0]!.text).toBe("2 days before christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-23");
    expect(r.ghost).toBe("istmas");
  });

  test("multi-word phrase completion across the fragment boundary", () => {
    const r = sug.suggest("tomorrow to new ye", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow to new year"); // shortest matching alias wins on ratio
    expect(r.suggestions[0]!.isRange).toBe(true);
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.suggestions[0]!.end.date).toBe("2027-01-01");
    expect(r.ghost).toBe("ar");
  });

  test("expected kinds filter the surfaces: after 'in a' only units complete", () => {
    const r = sug.suggest("in a w", CTX);
    expect(r.suggestions[0]!.text).toBe("in a week");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-19");
    expect(texts(r)).not.toContain("in a wednesday"); // WEEKDAY is not expected after DIRECTION(in)
  });
});

describe("range-building mode after a CONNECTOR (spec §6)", () => {
  test("'tomorrow to' suggests only real range ends", () => {
    const r = sug.suggest("tomorrow to", CTX);
    expect(r.suggestions.length).toBeGreaterThan(0);
    for (const s of r.suggestions) {
      expect(s.text.startsWith("tomorrow to ")).toBe(true);
      expect(s.isRange).toBe(true); // degenerate ends ("tomorrow to tomorrow") are filtered
    }
  });
  test("clean period ends get the boost", () => {
    const r = sug.suggest("tomorrow to", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow to weekend");
  });
});

describe("fallbacks when completions run dry (spec §6)", () => {
  test("bare day number: '15' → the 15th and next month's 15th", () => {
    const r = sug.suggest("15", CTX);
    expect(texts(r)).toContain("the 15th");
    expect(texts(r)).toContain("july 15");
    expect(r.suggestions.find((s) => s.text === "the 15th")!.start.date).toBe("2026-06-15");
    expect(r.suggestions.find((s) => s.text === "july 15")!.start.date).toBe("2026-07-15");
  });

  test("weekday prefix: 'fri' → friday and next friday", () => {
    const r = sug.suggest("fri", CTX);
    expect(texts(r)).toContain("friday");
    expect(texts(r)).toContain("next friday");
  });

  test("month prefix: 'ja' → january and january 1", () => {
    const r = sug.suggest("ja", CTX);
    expect(texts(r)).toContain("january");
    expect(texts(r)).toContain("january 1");
  });

  test("time-like: '5pm' → today/tomorrow at 5pm", () => {
    const r = sug.suggest("5pm", CTX);
    expect(texts(r)).toEqual(expect.arrayContaining(["today at 5pm", "tomorrow at 5pm"]));
    expect(r.suggestions.find((s) => s.text === "today at 5pm")!.start.date).toBe("2026-06-12");
  });
});
