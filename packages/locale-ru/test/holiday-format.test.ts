import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const H = (id: string, year?: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "holiday", id, ...(year !== undefined ? { year } : {}) } });

describe("holiday display names (ru)", () => {
  const names = { "victory-day": "день победы", "orthodox-easter": "пасха" };

  test("format uses the engine-provided name", () => {
    expect(ru.format(H("victory-day"), { ...OPTS, holidayNames: names })).toBe("день победы");
    expect(ru.format(H("victory-day", 2030), { ...OPTS, holidayNames: names })).toBe("день победы 2030");
  });

  test("falls back to the id without a name table", () => {
    expect(ru.format(H("victory-day"), OPTS)).toBe("victory-day");
  });

  test("accessible adds the year noun", () => {
    expect(ru.formatAccessible(H("victory-day", 2030), { ...OPTS, holidayNames: names }))
      .toBe("день победы 2030 года");
    expect(ru.formatAccessible(H("orthodox-easter"), { ...OPTS, holidayNames: names })).toBe("пасха");
  });

  test("names thread through nested expressions", () => {
    expect(ru.format(
      { type: "offset", base: H("orthodox-easter"), n: 2, unit: "week", dir: 1 },
      { ...OPTS, holidayNames: names },
    )).toBe("пасха + 2 недели");
  });
});
