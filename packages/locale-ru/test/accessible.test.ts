import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const acc = (expr: DateExpr) => ru.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("formatAccessible (natural phrasing, case agreement)", () => {
  test("anchors", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("завтра");
    expect(acc(A({ kind: "relday", offset: 3 }))).toBe("через 3 дня");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("следующая пятница");
    expect(acc(A({ kind: "weekday", day: 1 }))).toBe("понедельник");
    expect(acc(A({ kind: "calendar", m: 2, d: 21, y: 2027 }))).toBe("21 марта 2027 года");
    expect(acc(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 марта");
    expect(acc(A({ kind: "calendar", d: 21 }))).toBe("21-е число");
    expect(acc(A({ kind: "calendar", m: 8 }))).toBe("сентябрь");
    expect(acc(A({ kind: "calendar", y: 2027 }))).toBe("2027 год");
  });

  test("offsets decline the base after после/до", () => {
    expect(acc({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("2 недели после следующей пятницы");
    expect(acc({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("3 дня до 4 марта");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("через 2 недели");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "day", dir: -1 })).toBe("1 день назад");
  });

  test("ranges use с + genitive … по + accusative", () => {
    expect(acc({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("с понедельника по пятницу");
    expect(acc({
      type: "range",
      start: A({ kind: "calendar", m: 2, d: 21 }),
      end: A({ kind: "calendar", m: 0, d: 5, y: 2027 }),
    })).toBe("с 21 марта по 5 января 2027 года");
  });

  test("periods and boundaries", () => {
    expect(acc({ type: "period", period: { kind: "week" }, which: "next" })).toBe("следующая неделя");
    expect(acc({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("эти выходные");
    expect(acc({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" }))
      .toBe("первый квартал следующего года");
    expect(acc({ type: "period", period: { kind: "season", s: 3 }, which: "this" })).toBe("этой зимой");
    expect(acc({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("этим летом");
    expect(acc({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("конец этого месяца");
  });

  test("with time", () => {
    expect(acc({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("пятница в 17:00");
    expect(acc({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("завтра в 9:30");
  });
});
