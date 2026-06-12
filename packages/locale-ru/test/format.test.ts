import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const fmt = (expr: DateExpr) => ru.format(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("canonical format (always re-parseable)", () => {
  test("reldays and weekdays", () => {
    expect(fmt(A({ kind: "relday", offset: 2 }))).toBe("послезавтра");
    expect(fmt(A({ kind: "relday", offset: -2 }))).toBe("позавчера");
    expect(fmt(A({ kind: "relday", offset: 5 }))).toBe("через 5 дней");
    expect(fmt(A({ kind: "weekday", day: 5, which: "next" }))).toBe("следующая пятница");
    expect(fmt(A({ kind: "weekday", day: 0, which: "next" }))).toBe("следующее воскресенье");
    expect(fmt(A({ kind: "weekday", day: 1 }))).toBe("понедельник");
  });

  test("calendar anchors", () => {
    expect(fmt(A({ kind: "calendar", y: 2027, m: 0, d: 5 }))).toBe("5 января 2027");
    expect(fmt(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 марта");
    expect(fmt(A({ kind: "calendar", d: 21 }))).toBe("21-е");
    expect(fmt(A({ kind: "calendar", m: 8 }))).toBe("сентябрь");
    expect(fmt(A({ kind: "calendar", y: 2027 }))).toBe("2027");
  });

  test("offsets", () => {
    expect(fmt({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("следующая пятница + 2 недели");
    expect(fmt({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("4 марта - 3 дня");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("через 2 недели");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "week", dir: 1 })).toBe("через 1 неделю");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 3, unit: "day", dir: -1 })).toBe("3 дня назад");
  });

  test("ranges, periods, boundaries, time", () => {
    expect(fmt({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("понедельник - пятница");
    expect(fmt({ type: "period", period: { kind: "week" }, which: "this" })).toBe("эта неделя");
    expect(fmt({ type: "period", period: { kind: "month" }, which: "next" })).toBe("следующий месяц");
    expect(fmt({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("эти выходные");
    expect(fmt({ type: "period", period: { kind: "quarter" }, which: "last" })).toBe("прошлый квартал");
    expect(fmt({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" })).toBe("следующий кв1");
    expect(fmt({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("это лето");
    expect(fmt({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("конец этого месяца");
    expect(fmt({
      type: "boundary", of: { type: "period", period: { kind: "week" }, which: "next" }, edge: "start",
    })).toBe("начало следующей недели");
    expect(fmt({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("пятница в 17:00");
    expect(fmt({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("завтра в 9:30");
  });
});
