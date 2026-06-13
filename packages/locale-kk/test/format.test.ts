import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { kk } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const fmt = (expr: DateExpr) => kk.format(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("kk canonical format (re-parseable)", () => {
  test("anchors", () => {
    expect(fmt(A({ kind: "relday", offset: 2 }))).toBe("бүрсігүні");
    expect(fmt(A({ kind: "relday", offset: -1 }))).toBe("кеше");
    expect(fmt(A({ kind: "relday", offset: 5 }))).toBe("5 күн кейін");
    expect(fmt(A({ kind: "weekday", day: 5, which: "next" }))).toBe("келесі жұма");
    expect(fmt(A({ kind: "weekday", day: 1 }))).toBe("дүйсенбі");
    expect(fmt(A({ kind: "calendar", y: 2027, m: 2, d: 21 }))).toBe("21 наурыз 2027");
    expect(fmt(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 наурыз");
    expect(fmt(A({ kind: "calendar", d: 21 }))).toBe("21-і");
    expect(fmt(A({ kind: "calendar", m: 8 }))).toBe("қыркүйек");
  });

  test("offsets, periods, ranges, time", () => {
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("2 аптадан кейін");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 3, unit: "day", dir: -1 })).toBe("3 күн бұрын");
    expect(fmt({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("келесі жұма + 2 апта");
    expect(fmt({ type: "period", period: { kind: "week" }, which: "next" })).toBe("келесі апта");
    expect(fmt({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("осы демалыс");
    expect(fmt({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("осы жаз");
    expect(fmt({
      type: "range",
      start: A({ kind: "weekday", day: 1 }),
      end: A({ kind: "weekday", day: 5 }),
    })).toBe("дүйсенбі - жұма");
    expect(fmt({ type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 30 } }))
      .toBe("жұма сағат 17:30");
  });
});
