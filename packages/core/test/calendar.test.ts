import { describe, expect, test } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  compareWallDate,
  daysInMonth,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  weekdayOf,
  type Wall,
} from "../src/zoned-date.js";

const w = (y: number, m: number, d: number): Wall => ({ y, m, d, h: 0, mi: 0 });

describe("addDays", () => {
  test("crosses month and year ends", () => {
    expect(addDays(w(2026, 11, 30), 3)).toEqual(w(2027, 0, 2));
    expect(addDays(w(2026, 0, 1), -1)).toEqual(w(2025, 11, 31));
  });
  test("preserves time fields", () => {
    expect(addDays({ y: 2026, m: 5, d: 10, h: 17, mi: 30 }, 1)).toEqual({
      y: 2026, m: 5, d: 11, h: 17, mi: 30,
    });
  });
});

describe("addMonths — month-end clamping (spec §5.5)", () => {
  test("Jan 31 + 1 month clamps to Feb 28 in a non-leap year", () => {
    expect(addMonths(w(2026, 0, 31), 1)).toEqual(w(2026, 1, 28));
  });
  test("Jan 31 + 1 month clamps to Feb 29 in a leap year", () => {
    expect(addMonths(w(2028, 0, 31), 1)).toEqual(w(2028, 1, 29));
  });
  test("crosses year boundaries backwards", () => {
    expect(addMonths(w(2026, 1, 15), -3)).toEqual(w(2025, 10, 15));
  });
});

describe("addYears", () => {
  test("Feb 29 + 1 year clamps to Feb 28", () => {
    expect(addYears(w(2028, 1, 29), 1)).toEqual(w(2029, 1, 28));
  });
});

describe("week math", () => {
  test("weekdayOf: 2026-06-12 is a Friday (5)", () => {
    expect(weekdayOf(w(2026, 5, 12))).toBe(5);
  });
  test("startOfWeek respects weekStart", () => {
    // Friday 2026-06-12: Sunday-start week begins Sun 06-07; Monday-start begins Mon 06-08
    expect(startOfWeek(w(2026, 5, 12), 0)).toEqual(w(2026, 5, 7));
    expect(startOfWeek(w(2026, 5, 12), 1)).toEqual(w(2026, 5, 8));
    // A Sunday with weekStart=1 belongs to the week starting the previous Monday
    expect(startOfWeek(w(2026, 5, 14), 1)).toEqual(w(2026, 5, 8));
  });
});

describe("month boundaries", () => {
  test("startOfMonth / endOfMonth / daysInMonth", () => {
    expect(startOfMonth(w(2026, 1, 15))).toEqual(w(2026, 1, 1));
    expect(endOfMonth(w(2026, 1, 15))).toEqual(w(2026, 1, 28));
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("compareWallDate", () => {
  test("orders by calendar date, ignoring time", () => {
    expect(compareWallDate({ ...w(2026, 5, 12), h: 23 }, w(2026, 5, 12))).toBe(0);
    expect(compareWallDate(w(2026, 5, 11), w(2026, 5, 12))).toBeLessThan(0);
    expect(compareWallDate(w(2027, 0, 1), w(2026, 11, 31))).toBeGreaterThan(0);
  });
});
