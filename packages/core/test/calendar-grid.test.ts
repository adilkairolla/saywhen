import { describe, expect, test } from "vitest";
import { clampTime, getMonthGrid } from "../src/calendar-grid.js";

describe("getMonthGrid", () => {
  // June 2026 (m = 5); June 1 2026 is a Monday.
  const grid = getMonthGrid(2026, 5, 0); // weekStart Sunday

  test("is a 6×7 grid", () => {
    expect(grid).toHaveLength(6);
    for (const row of grid) expect(row).toHaveLength(7);
  });

  test("leads with the trailing days of May, then June 1", () => {
    expect(grid[0]![0]).toEqual({ y: 2026, m: 4, d: 31, inMonth: false }); // Sun May 31
    expect(grid[0]![1]).toEqual({ y: 2026, m: 5, d: 1, inMonth: true });   // Mon Jun 1
  });

  test("flags in-month days and spills into July", () => {
    expect(grid[4]![2]).toEqual({ y: 2026, m: 5, d: 30, inMonth: true });  // Tue Jun 30
    expect(grid[5]![6]).toEqual({ y: 2026, m: 6, d: 11, inMonth: false }); // last cell Jul 11
  });

  test("weekStart Monday shifts the leading column", () => {
    const mon = getMonthGrid(2026, 5, 1);
    expect(mon[0]![0]).toEqual({ y: 2026, m: 5, d: 1, inMonth: true });    // Mon Jun 1 first
  });
});

describe("clampTime", () => {
  test("clamps hours and minutes into range", () => {
    expect(clampTime({ h: 25, m: 70 })).toEqual({ h: 23, m: 59 });
    expect(clampTime({ h: -3, m: -1 })).toEqual({ h: 0, m: 0 });
    expect(clampTime({ h: 13, m: 30 })).toEqual({ h: 13, m: 30 });
    expect(clampTime({ h: 9.7, m: 5.9 })).toEqual({ h: 9, m: 5 }); // truncates
  });
});
