import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { us } from "../src/index.js";

const sug = createSuggest({ locale: en, holidays: [us] });
// Friday 2026-06-12, 04:00 in New York
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e with the US holiday pack", () => {
  test("the core table still tops empty input", () => {
    expect(sug.suggest("", CTX).suggestions[0]!.text).toBe("tomorrow");
  });

  test("'jun' offers the month and the nearby holiday", () => {
    const r = sug.suggest("jun", CTX);
    expect(r.suggestions[0]!.text).toBe("june");
    expect(texts(r)).toContain("juneteenth");
  });

  test("'thanks' → thanksgiving with ghost and the right date", () => {
    const r = sug.suggest("thanks", CTX);
    expect(r.suggestions[0]!.text).toBe("thanksgiving");
    expect(r.suggestions[0]!.start.date).toBe("2026-11-26");
    expect(r.ghost).toBe("giving");
  });

  test("holiday completes mid-expression: '2 days before chris'", () => {
    const r = sug.suggest("2 days before chris", CTX);
    expect(r.suggestions[0]!.text).toBe("2 days before christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-23");
  });

  test("range mode completes holiday phrases: 'christmas to new'", () => {
    const r = sug.suggest("christmas to new", CTX);
    expect(r.suggestions[0]!.text).toBe("christmas to new year");
    expect(r.suggestions[0]!.isRange).toBe(true);
    expect(r.suggestions[0]!.start.date).toBe("2026-12-25");
    expect(r.suggestions[0]!.end.date).toBe("2027-01-01");
    expect(r.ghost).toBe(" year");
  });
});
