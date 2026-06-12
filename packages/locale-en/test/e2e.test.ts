import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
// Friday 2026-06-12, 04:00 in New York (EDT, UTC-4); weekStart 0, dateOrder MDY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates", () => {
  test.each([
    ["today", "2026-06-12"],
    ["tomorrow", "2026-06-13"],
    ["friday", "2026-06-12"],
    ["next friday", "2026-06-19"],
    ["march 21st", "2027-03-21"],
    ["the 21st of march", "2027-03-21"],
    ["march 4 2026", "2026-03-04"],
    ["the 21st", "2026-06-21"],
    ["in 2 weeks", "2026-06-26"],
    ["3 days ago", "2026-06-09"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});

describe("the acid test (spec §2)", () => {
  test("'next friday + 2 weeks' ≡ '2 weeks after next friday' → 2026-07-03", () => {
    const a = top("next friday + 2 weeks");
    const b = top("2 weeks after next friday");
    expect(a.start.date).toBe("2026-07-03");
    expect(b.start.date).toBe(a.start.date);
    expect(b.expr).toEqual(a.expr); // same AST, not just same date
  });
  test("word numbers: 'two weeks from tomorrow' → 2026-06-27", () => {
    expect(top("two weeks from tomorrow").start.date).toBe("2026-06-27");
  });
});

describe("ranges & periods (weekStart=0 for en)", () => {
  test("'monday to friday'", () => {
    const c = top("monday to friday");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-15", "2026-06-19"]);
  });
  test("'next week' → Sun..Sat", () => {
    const c = top("next week");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-14", "2026-06-20"]);
  });
  test("'this weekend' → Sat–Sun", () => {
    const c = top("this weekend");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-13", "2026-06-14"]);
  });
  test("'end of next month'", () => {
    expect(top("end of next month").start.date).toBe("2026-07-31");
  });
  test("'last 2 weeks' with allowPast", () => {
    const c = top("last 2 weeks", { ...CTX, allowPast: true });
    expect([c.start.date, c.end.date]).toEqual(["2026-05-29", "2026-06-12"]);
  });
});

describe("time of day", () => {
  test("'friday at 5pm' → 21:00Z (EDT)", () => {
    const c = top("friday at 5pm");
    expect(c.hasExplicitTime).toBe(true);
    expect(c.start.utcIso).toBe("2026-06-12T21:00:00.000Z");
  });
  test("'tomorrow at 9:30am'", () => {
    expect(top("tomorrow at 9:30am").start.utcIso).toBe("2026-06-13T13:30:00.000Z");
  });
});

describe("ambiguity & typo correction", () => {
  test("'3/4' is ambiguous; MDY ranks March 4 first", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.map((c) => c.start.date)).toEqual(["2027-03-04", "2027-04-03"]);
  });
  test("'tmrw' and 'tomorow' both correct to tomorrow", () => {
    expect(top("tmrw").start.date).toBe("2026-06-13");
    expect(top("tomorow").start.date).toBe("2026-06-13");
    expect(engine.parse("tomorow", CTX).corrections).toHaveLength(1);
  });
});

describe("round-trip: candidate.text re-parses to the same dates (spec §9.3 seed)", () => {
  test.each([
    "tomorrow", "next friday", "march 21st", "next friday + 2 weeks",
    "monday to friday", "next week", "this weekend", "end of next month",
    "friday at 5pm", "in 2 weeks",
  ])("'%s'", (text) => {
    const first = top(text);
    const second = top(first.text);
    expect(second.start.date).toBe(first.start.date);
    expect(second.end.date).toBe(first.end.date);
  });
});

describe("complete vocabulary (plan 02)", () => {
  test.each([
    ["the twenty first of march", "2027-03-21"],
    ["march twenty first", "2027-03-21"],
    ["the third", "2026-07-03"],            // bare word ordinal rolls past 06-12 → next month
    ["seventeen days from today", "2026-06-29"],
    ["twenty one days from tomorrow", "2026-07-04"],
    ["tues", "2026-06-16"],
    ["thurs", "2026-06-18"],
    ["weds", "2026-06-17"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("'tomorrow at noon' → 16:00Z (EDT)", () => {
    expect(top("tomorrow at noon").start.utcIso).toBe("2026-06-13T16:00:00.000Z");
  });
  test("'tomorrow at midnight' → 04:00Z", () => {
    expect(top("tomorrow at midnight").start.utcIso).toBe("2026-06-13T04:00:00.000Z");
  });

  test("curated abbreviations with digits: '2moro', '3 days b4 march 4'", () => {
    expect(top("2moro").start.date).toBe("2026-06-13");
    expect(top("3 days b4 march 4").start.date).toBe("2027-03-01");
  });
  test("'yest' corrects to yesterday", () => {
    expect(top("yest").start.date).toBe("2026-06-11");
  });
});
