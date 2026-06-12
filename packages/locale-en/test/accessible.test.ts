import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { en } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const acc = (expr: DateExpr) => en.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("formatAccessible", () => {
  test("anchors", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("tomorrow");
    expect(acc(A({ kind: "relday", offset: 3 }))).toBe("3 days from today");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("next Friday");
    expect(acc(A({ kind: "weekday", day: 1 }))).toBe("Monday");
    expect(acc(A({ kind: "calendar", m: 2, d: 21, y: 2027 }))).toBe("March 21st, 2027");
    expect(acc(A({ kind: "calendar", m: 2, d: 21 }))).toBe("March 21st");
    expect(acc(A({ kind: "calendar", d: 21 }))).toBe("the 21st");
    expect(acc(A({ kind: "calendar", m: 8 }))).toBe("September");
    expect(acc(A({ kind: "calendar", y: 2027 }))).toBe("the year 2027");
  });

  test("offsets", () => {
    expect(acc({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("2 weeks after next Friday");
    expect(acc({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("3 days before March 4th");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("in 2 weeks");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "day", dir: -1 })).toBe("1 day ago");
  });

  test("ranges, periods, boundaries", () => {
    expect(acc({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("from Monday to Friday");
    expect(acc({ type: "period", period: { kind: "week" }, which: "next" })).toBe("next week");
    expect(acc({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("this weekend");
    expect(acc({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" }))
      .toBe("the first quarter of next year");
    expect(acc({ type: "period", period: { kind: "season", s: 3 }, which: "this" })).toBe("this winter");
    expect(acc({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("the end of this month");
  });

  test("with time", () => {
    expect(acc({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("Friday at 5 PM");
    expect(acc({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("tomorrow at 9:30 AM");
  });
});
