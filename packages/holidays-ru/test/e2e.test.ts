import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { ru as ruLocale } from "@saywhen/locale-ru";
import { en } from "@saywhen/locale-en";
import { ru as ruHolidays } from "../src/index.js";

const engine = createEngine({ locale: ruLocale, holidays: [ruHolidays] });
// Friday 2026-06-12, 11:00 in Moscow
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("RU holidays resolve and roll forward (ru)", () => {
  test.each([
    ["день россии", "2026-06-12"],            // today counts
    ["день народного единства", "2026-11-04"],
    ["новый год", "2027-01-01"],
    ["рождество", "2027-01-07"],              // Orthodox christmas, Jan 7
    ["старый новый год", "2027-01-14"],
    ["день защитника отечества", "2027-02-23"],
    ["женский день", "2027-03-08"],
    ["пасха", "2027-05-02"],                  // Orthodox Easter; Apr 12 2026 already passed
    ["первомай", "2027-05-01"],
    ["праздник весны и труда", "2027-05-01"],
    ["день победы", "2027-05-09"],
    ["пасха 2028", "2028-04-16"],             // explicit year pins it
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("holidays compose with the grammar (inflected aliases)", () => {
    expect(top("2 недели после дня победы").start.date).toBe("2027-05-23");
    const r = top("с нового года по рождество");
    expect(r.start.date).toBe("2027-01-01");
    expect(r.end.date).toBe("2027-01-07");
  });

  test("canonical text uses the first Russian alias and re-parses", () => {
    expect(top("пасху").text).toBe("пасха");
    expect(top("дня победы").text).toBe("день победы");
    expect(top(top("дня победы").text).start.date).toBe("2027-05-09");
  });

  test("computus outside its covered range → invalid with explanation", () => {
    const r = engine.parse("пасха 2100", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no date for holiday/i);
  });
});

describe("region ≠ language: RU dates with English names (spec §3)", () => {
  const enEngine = createEngine({ locale: en, holidays: [ruHolidays] });
  const NY: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

  test.each([
    ["orthodox easter", "2027-05-02"],
    ["victory day", "2027-05-09"],
    ["russia day", "2026-06-12"],
    ["unity day", "2026-11-04"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text, enEngine, NY).start.date).toBe(date);
  });
});
