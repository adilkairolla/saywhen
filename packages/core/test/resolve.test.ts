import { describe, expect, test } from "vitest";
import { resolveExpr, type ResolveOptions } from "../src/resolve.js";
import type { DateExpr } from "../src/types.js";

// Fixed clock: 2026-06-12T15:00:00Z = Friday 2026-06-12 20:00 in Asia/Almaty (UTC+5)
const OPTS: ResolveOptions = {
  now: new Date("2026-06-12T15:00:00Z"),
  timeZone: "Asia/Almaty",
  weekStart: 1,
  allowPast: false,
  holidays: new Map([
    ["christmas", () => ({ m: 11, d: 25 })],
    ["new-year", () => ({ m: 0, d: 1 })],
  ]),
};

const anchor = (a: object): DateExpr => ({ type: "anchor", anchor: a } as DateExpr);
const day = (r: ReturnType<typeof resolveExpr>) => {
  if (!r.ok) throw new Error(r.error);
  const f = (w: { y: number; m: number; d: number }) =>
    `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
  return { start: f(r.value.start), end: f(r.value.end) };
};

describe("anchors", () => {
  test("relday: tomorrow", () => {
    expect(day(resolveExpr(anchor({ kind: "relday", offset: 1 }), OPTS)).start).toBe("2026-06-13");
  });

  test("bare weekday: today counts ('friday' on a Friday is today)", () => {
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5 }), OPTS)).start).toBe("2026-06-12");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 1 }), OPTS)).start).toBe("2026-06-15");
  });

  test("this/next/last weekday are week-relative", () => {
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 1, which: "this" }), OPTS)).start).toBe("2026-06-08");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5, which: "next" }), OPTS)).start).toBe("2026-06-19");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5, which: "last" }), OPTS)).start).toBe("2026-06-05");
  });

  test("calendar {m,d}: rolls to next year when past (unless allowPast)", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 0, d: 5 }), OPTS)).start).toBe("2027-01-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 0, d: 5 }), { ...OPTS, allowPast: true })).start).toBe("2026-01-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", y: 2026, m: 0, d: 5 }), OPTS)).start).toBe("2026-01-05");
  });

  test("calendar-invalid dates error: Feb 30", () => {
    const r = resolveExpr(anchor({ kind: "calendar", y: 2026, m: 1, d: 30 }), OPTS);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no day 30/i) });
  });

  test("bare ordinal day rolls to next month when past", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", d: 5 }), OPTS)).start).toBe("2026-07-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", d: 20 }), OPTS)).start).toBe("2026-06-20");
  });

  test("month-only is a range; past month rolls a year", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 2 }), OPTS))).toEqual({
      start: "2027-03-01", end: "2027-03-31",
    });
  });

  test("bare year is a range", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", y: 2027 }), OPTS))).toEqual({
      start: "2027-01-01", end: "2027-12-31",
    });
  });

  test("holiday rolls forward; explicit year pins it", () => {
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "christmas" }), OPTS)).start).toBe("2026-12-25");
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "new-year" }), OPTS)).start).toBe("2027-01-01");
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "christmas", year: 2028 }), OPTS)).start).toBe("2028-12-25");
    expect(resolveExpr(anchor({ kind: "holiday", id: "nope" }), OPTS).ok).toBe(false);
  });
});

describe("periods (weekStart=1)", () => {
  const period = (period: object, which: string): DateExpr =>
    ({ type: "period", period, which } as DateExpr);

  test("next week", () => {
    expect(day(resolveExpr(period({ kind: "week" }, "next"), OPTS))).toEqual({
      start: "2026-06-15", end: "2026-06-21",
    });
  });
  test("this weekend is the upcoming Sat–Sun", () => {
    expect(day(resolveExpr(period({ kind: "weekend" }, "this"), OPTS))).toEqual({
      start: "2026-06-13", end: "2026-06-14",
    });
  });
  test("weekend with weekStart=0 still lands on Sat–Sun", () => {
    expect(day(resolveExpr(period({ kind: "weekend" }, "this"), { ...OPTS, weekStart: 0 }))).toEqual({
      start: "2026-06-13", end: "2026-06-14",
    });
  });
  test("last quarter (today is Q2) → Q1", () => {
    expect(day(resolveExpr(period({ kind: "quarter" }, "last"), OPTS))).toEqual({
      start: "2026-01-01", end: "2026-03-31",
    });
  });
  test("quarter index: 'Q1' + which=next shifts the year", () => {
    expect(day(resolveExpr(period({ kind: "quarter", q: 1 }, "next"), OPTS))).toEqual({
      start: "2027-01-01", end: "2027-03-31",
    });
  });
  test("this season (June) is summer; winter spans the year boundary", () => {
    expect(day(resolveExpr(period({ kind: "season" }, "this"), OPTS))).toEqual({
      start: "2026-06-01", end: "2026-08-31",
    });
    expect(day(resolveExpr(period({ kind: "season", s: 3 }, "this"), OPTS))).toEqual({
      start: "2026-12-01", end: "2027-02-28",
    });
  });
});

describe("compound expressions", () => {
  test("boundary: end of this month", () => {
    const e: DateExpr = {
      type: "boundary",
      of: { type: "period", period: { kind: "month" }, which: "this" },
      edge: "end",
    };
    expect(day(resolveExpr(e, OPTS))).toEqual({ start: "2026-06-30", end: "2026-06-30" });
  });

  test("offset: tomorrow + 2 weeks", () => {
    const e: DateExpr = {
      type: "offset",
      base: anchor({ kind: "relday", offset: 1 }),
      n: 2, unit: "week", dir: 1,
    };
    expect(day(resolveExpr(e, OPTS)).start).toBe("2026-06-27");
  });

  test("offset month-end clamp: Jan 31 + 1 month → Feb 28", () => {
    const e: DateExpr = {
      type: "offset",
      base: anchor({ kind: "calendar", y: 2026, m: 0, d: 31 }),
      n: 1, unit: "month", dir: 1,
    };
    expect(day(resolveExpr(e, OPTS)).start).toBe("2026-02-28");
  });

  test("range end resolves relative to the start: friday to monday crosses the week", () => {
    const e: DateExpr = {
      type: "range",
      start: anchor({ kind: "weekday", day: 5 }),
      end: anchor({ kind: "weekday", day: 1 }),
    };
    expect(day(resolveExpr(e, OPTS))).toEqual({ start: "2026-06-12", end: "2026-06-15" });
  });

  test("range that ends before it starts errors", () => {
    const e: DateExpr = {
      type: "range",
      start: anchor({ kind: "calendar", y: 2026, m: 5, d: 20 }),
      end: anchor({ kind: "calendar", y: 2026, m: 5, d: 10 }),
    };
    expect(resolveExpr(e, OPTS)).toMatchObject({ ok: false, error: expect.stringMatching(/ends before/i) });
  });

  test("withTime sets wall time and hasExplicitTime", () => {
    const e: DateExpr = {
      type: "withTime",
      base: anchor({ kind: "weekday", day: 5 }),
      time: { h: 17, m: 0 },
    };
    const r = resolveExpr(e, OPTS);
    expect(r.ok && r.value.start).toMatchObject({ d: 12, h: 17, mi: 0 });
    expect(r.ok && r.value.hasExplicitTime).toBe(true);
  });

  test("withTime on a multi-day range errors", () => {
    const e: DateExpr = {
      type: "withTime",
      base: { type: "period", period: { kind: "week" }, which: "next" },
      time: { h: 9, m: 0 },
    };
    expect(resolveExpr(e, OPTS).ok).toBe(false);
  });
});
