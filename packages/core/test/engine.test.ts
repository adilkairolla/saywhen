import { describe, expect, test } from "vitest";
import { createEngine } from "../src/engine.js";
import { testLocale } from "./fixtures/test-locale.js";
import type { HolidayPack, ParseContext } from "../src/types.js";

const engine = createEngine({ locale: testLocale });
// Friday 2026-06-12 in Almaty
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };

describe("createEngine config errors (spec §8: config always throws)", () => {
  test("invalid locale throws at creation", () => {
    expect(() => createEngine({ locale: { ...testLocale, lexicon: {} } })).toThrow(/incomplete/);
  });
  test("invalid timezone throws at parse-context use", () => {
    expect(() => engine.parse("tomorrow", { ...CTX, timeZone: "Nope/Nope" })).toThrow(/Invalid IANA/);
  });
});

describe("parse — happy paths", () => {
  test("'tomorrow' → valid single candidate", () => {
    const r = engine.parse("tomorrow", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]).toMatchObject({
      start: { date: "2026-06-13" },
      end: { date: "2026-06-13" },
      isRange: false,
      hasExplicitTime: false,
    });
  });

  test("'next friday + 2 weeks' → 2026-07-03", () => {
    const r = engine.parse("next friday + 2 weeks", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.start.date).toBe("2026-07-03");
  });

  test("filler words are skipped: 'on the next friday'", () => {
    expect(engine.parse("on the next friday", CTX).status).toBe("valid");
  });

  test("'monday to friday' → range", () => {
    const r = engine.parse("monday to friday", CTX);
    expect(r.candidates[0]).toMatchObject({
      isRange: true,
      start: { date: "2026-06-15" },
      end: { date: "2026-06-19" },
    });
  });

  test("'friday at 5pm' → explicit time, correct UTC instant", () => {
    const r = engine.parse("friday at 5pm", CTX);
    expect(r.candidates[0]).toMatchObject({ hasExplicitTime: true, start: { date: "2026-06-12" } });
    // 17:00 Almaty (UTC+5) = 12:00Z
    expect(r.candidates[0]!.start.utcIso).toBe("2026-06-12T12:00:00.000Z");
  });
});

describe("parse — ambiguity (spec acid case '3/4')", () => {
  test("two candidates, MDY default ranks March 4 first", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.map((c) => c.start.date)).toEqual(["2027-03-04", "2027-04-03"]);
  });
  test("dateOrder override flips the ranking", () => {
    const r = engine.parse("3/4", { ...CTX, dateOrder: "DMY" });
    expect(r.candidates[0]!.start.date).toBe("2027-04-03");
  });
});

describe("parse — typo correction", () => {
  test("'fridat' corrects to friday, reports the correction, lowers confidence", () => {
    const r = engine.parse("fridat", CTX);
    expect(r.status).toBe("valid");
    expect(r.corrections).toEqual([{ span: [0, 6], from: "fridat", to: "friday" }]);
    expect(r.candidates[0]!.confidence).toBeLessThan(1);
  });
});

describe("parse — failure modes never throw (spec §8)", () => {
  test("gibberish → invalid with an error message", () => {
    const r = engine.parse("zorp blarg", CTX);
    expect(r.status).toBe("invalid");
    expect(r.candidates).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  test("empty / whitespace → idle", () => {
    expect(engine.parse("", CTX).status).toBe("idle");
    expect(engine.parse("   ", CTX).status).toBe("idle");
  });
  test("calendar-impossible input → invalid with explanation", () => {
    const r = engine.parse("february 30", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no day 30/i);
  });
});

describe("holiday packs merge into the lexicon", () => {
  const pack: HolidayPack = {
    id: "test-pack",
    entries: [{
      id: "christmas",
      compute: () => ({ m: 11, d: 25 }),
      names: { test: ["christmas", "xmas"], ru: ["рождество"] },
    }],
  };
  const withHolidays = createEngine({ locale: testLocale, holidays: [pack] });

  test("holiday by name resolves and rolls forward", () => {
    const r = withHolidays.parse("xmas", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.start.date).toBe("2026-12-25");
  });
  test("names for other locales are not merged", () => {
    expect(withHolidays.parse("рождество", CTX).status).toBe("invalid");
  });
});
