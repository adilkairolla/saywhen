import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { en } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const H = (id: string, year?: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "holiday", id, ...(year !== undefined ? { year } : {}) } });

describe("holiday display names (en)", () => {
  const names = { christmas: "christmas", "new-year": "new year's day" };

  test("format uses the engine-provided name", () => {
    expect(en.format(H("christmas"), { ...OPTS, holidayNames: names })).toBe("christmas");
    expect(en.format(H("christmas", 2027), { ...OPTS, holidayNames: names })).toBe("christmas 2027");
    expect(en.format(H("new-year"), { ...OPTS, holidayNames: names })).toBe("new year's day");
  });

  test("falls back to the id without a name table", () => {
    expect(en.format(H("victory-day"), OPTS)).toBe("victory-day");
  });

  test("accessible capitalizes the name", () => {
    expect(en.formatAccessible(H("christmas", 2027), { ...OPTS, holidayNames: names })).toBe("Christmas 2027");
  });

  test("names thread through nested expressions", () => {
    expect(en.format(
      { type: "offset", base: H("christmas"), n: 2, unit: "day", dir: -1 },
      { ...OPTS, holidayNames: names },
    )).toBe("christmas - 2 days");
  });
});
