import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { kk } from "../src/index.js";

const sug = createSuggest({ locale: kk });
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (kk)", () => {
  test("starters render in Kazakh, tomorrow first", () => {
    const r = sug.suggest("", CTX);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions[0]!.text).toBe("ертең");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
  });

  test("'ер' → ертең with ghost", () => {
    const r = sug.suggest("ер", CTX);
    expect(r.suggestions[0]!.text).toBe("ертең");
    expect(r.ghost).toBe("тең");
  });

  test("weekday prefix completes: 'келесі ж' → келесі жұма", () => {
    expect(texts(sug.suggest("келесі ж", CTX))).toContain("келесі жұма");
  });
});
