import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { kk as kkLocale, kkLatn } from "@saywhen/locale-kk";
import { en } from "@saywhen/locale-en";
import { kk as kkHolidays } from "../src/index.js";

const engine = createEngine({ locale: kkLocale, holidays: [kkHolidays] });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("KK holidays resolve and roll forward (kk)", () => {
  test.each([
    ["жаңа жыл", "2027-01-01"],
    ["рождество", "2027-01-07"],
    ["наурыз", "2027-03-22"],          // Mar 22 2026 passed
    ["жеңіс күні", "2027-05-09"],
    ["тәуелсіздік күні", "2026-12-16"],
    ["құрбан айт", "2027-05-16"],       // May 27 2026 passed → 2027
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("composes with the grammar (dash range over holidays)", () => {
    // dash range uses nominative names + medial CONNECTOR (no inflected holiday forms needed;
    // postpositional holiday ranges like "жаңа жылдан рождествоға дейін" are a deferred fast-follow)
    const r = top("жаңа жыл - рождество");
    expect(r.start.date).toBe("2027-01-01");
    expect(r.end.date).toBe("2027-01-07");
  });

  test("canonical text uses the first kk alias and re-parses", () => {
    expect(top("наурыз мейрамы").text).toBe("наурыз");
    expect(top(top("наурыз").text).start.date).toBe("2027-03-22");
  });

  test("Kurban Ait outside the table → invalid with explanation", () => {
    const r = engine.parse("құрбан айт 2100", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no date for holiday/i);
  });
});

describe("region ≠ language and dual script", () => {
  const enEngine = createEngine({ locale: en, holidays: [kkHolidays] });
  const NY: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
  const latnEngine = createEngine({ locale: kkLatn, holidays: [kkHolidays] });

  test("English names on Kazakh dates", () => {
    expect(top("victory day", enEngine, NY).start.date).toBe("2027-05-09");
    expect(top("nauryz", enEngine, NY).start.date).toBe("2027-03-22");
  });

  test("Latin holiday names under kkLatn", () => {
    expect(top("jeñis küni", latnEngine).start.date).toBe("2027-05-09");
  });
});
