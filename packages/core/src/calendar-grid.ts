import { addDays, startOfWeek, type Wall } from "./zoned-date.js";

/** one cell of a month grid */
export interface MonthCell {
  y: number;
  m: number; // 0-based
  d: number;
  inMonth: boolean; // false for spill-over days from the adjacent month
}

/**
 * A 6-row × 7-column calendar grid for month (y, m), weeks starting `weekStart`.
 * Always 42 cells; leading/trailing cells come from the neighbouring months
 * (`inMonth: false`). Pure — no clock reads.
 */
export function getMonthGrid(y: number, m: number, weekStart: 0 | 1): MonthCell[][] {
  const first: Wall = { y, m, d: 1, h: 0, mi: 0 };
  let cursor = startOfWeek(first, weekStart);
  const rows: MonthCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: MonthCell[] = [];
    for (let c = 0; c < 7; c++) {
      row.push({ y: cursor.y, m: cursor.m, d: cursor.d, inMonth: cursor.y === y && cursor.m === m });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

/** clamp a wall-clock time into [00:00, 23:59], truncating fractional fields */
export function clampTime(t: { h: number; m: number }): { h: number; m: number } {
  return {
    h: Math.min(23, Math.max(0, Math.trunc(t.h))),
    m: Math.min(59, Math.max(0, Math.trunc(t.m))),
  };
}
