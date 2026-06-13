import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import type { HolidayPack } from "@saywhen/core";
import { ru } from "../src/index.js";

const pack: HolidayPack = {
  id: "ru-test",
  entries: [{
    id: "victory-day",
    compute: () => ({ m: 4, d: 9 }),
    names: { ru: ["день победы", "дня победы"] }, // nominative + genitive, like holidays-ru
  }],
};
const sug = createSuggest({ locale: ru, holidays: [pack] });
// Friday 2026-06-12, 11:00 in Moscow
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (ru)", () => {
  test("starters render in Russian, tomorrow first", () => {
    const r = sug.suggest("", CTX);
    expect(r.suggestions).toHaveLength(5);
    expect(r.suggestions[0]!.text).toBe("завтра");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
  });

  test("'за' → завтра with ghost", () => {
    const r = sug.suggest("за", CTX);
    expect(r.suggestions[0]!.text).toBe("завтра");
    expect(r.ghost).toBe("втра");
  });

  test("'следующая н' → следующая неделя", () => {
    const r = sug.suggest("следующая н", CTX);
    expect(r.suggestions[0]!.text).toBe("следующая неделя");
    expect(r.ghost).toBe("еделя");
  });

  test("holiday starter by prefix: 'день п' → день победы", () => {
    const r = sug.suggest("день п", CTX);
    expect(r.suggestions[0]!.text).toBe("день победы");
    expect(r.suggestions[0]!.start.date).toBe("2027-05-09"); // May 9 2026 already passed
    expect(r.ghost).toBe("обеды");
  });

  test("inflected phrase alias completes mid-expression", () => {
    const r = sug.suggest("2 недели после дня п", CTX);
    expect(r.suggestions[0]!.text).toBe("2 недели после дня победы");
    expect(r.suggestions[0]!.start.date).toBe("2027-05-23");
  });
});
