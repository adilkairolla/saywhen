import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { ru as ruLocale } from "@saywhen/locale-ru";
import { us } from "../src/index.js";

const engine = createEngine({ locale: en, holidays: [us] });
// Friday 2026-06-12, 04:00 in New York
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("US holidays resolve and roll forward (en)", () => {
  test.each([
    ["christmas", "2026-12-25"],
    ["xmas", "2026-12-25"],
    ["christmas day", "2026-12-25"],
    ["thanksgiving", "2026-11-26"],   // 4th Thursday of November
    ["turkey day", "2026-11-26"],
    ["halloween", "2026-10-31"],
    ["independence day", "2026-07-04"],
    ["fourth of july", "2026-07-04"],
    ["4th of july", "2026-07-04"],
    ["juneteenth", "2026-06-19"],
    ["father's day", "2026-06-21"],
    ["labor day", "2026-09-07"],
    ["veterans day", "2026-11-11"],
    ["new year's day", "2027-01-01"], // Jan 1 2026 already passed
    ["new years day", "2027-01-01"],
    ["easter", "2027-03-28"],         // Apr 5 2026 already passed
    ["good friday", "2027-03-26"],
    ["mlk day", "2027-01-18"],
    ["memorial day", "2027-05-31"],
    ["mother's day", "2027-05-09"],
    ["xmas 2027", "2027-12-25"],      // explicit year pins it
    ["easter 2028", "2028-04-16"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("holidays compose with the grammar", () => {
    expect(top("2 days before christmas").start.date).toBe("2026-12-23");
    expect(top("christmas + 1 week").start.date).toBe("2027-01-01");
    const r = top("christmas to new year");
    expect(r.start.date).toBe("2026-12-25");
    expect(r.end.date).toBe("2027-01-01"); // range end re-anchors to Dec 25
  });

  test("canonical text uses the first alias and re-parses", () => {
    expect(top("xmas").text).toBe("christmas");
    expect(top("turkey day 2027").text).toBe("thanksgiving 2027");
    expect(top(top("xmas").text).start.date).toBe("2026-12-25");
  });

  test("single-word names get typo correction for free", () => {
    const r = engine.parse("christms", CTX);
    expect(r.corrections).toHaveLength(1);
    expect(r.candidates[0]!.start.date).toBe("2026-12-25");
  });
});

describe("region ≠ language: US dates with Russian names (spec §3)", () => {
  const ruEngine = createEngine({ locale: ruLocale, holidays: [us] });
  const MOSCOW: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

  test.each([
    ["день благодарения", "2026-11-26"],
    ["рождество", "2026-12-25"],      // WESTERN christmas — the us pack computed it
    ["хэллоуин", "2026-10-31"],
    ["день независимости", "2026-07-04"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text, ruEngine, MOSCOW).start.date).toBe(date);
  });

  test("canonical text is the Russian name", () => {
    expect(top("день благодарения", ruEngine, MOSCOW).text).toBe("день благодарения");
  });
});
