import { describe, expect, test } from "vitest";
import { us, westernEaster } from "../src/index.js";

const get = (id: string) => us.entries.find((e) => e.id === id)!;

describe("westernEaster (Meeus/Jones/Butcher)", () => {
  test.each([
    [2024, 2, 31], // Mar 31
    [2025, 3, 20], // Apr 20
    [2026, 3, 5],  // Apr 5
    [2027, 2, 28], // Mar 28
    [2028, 3, 16], // Apr 16
    [2030, 3, 21], // Apr 21
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(westernEaster(y)).toEqual({ m, d });
  });
});

describe("nth/last weekday rules", () => {
  test.each([
    ["thanksgiving", 2025, { m: 10, d: 27 }],
    ["thanksgiving", 2026, { m: 10, d: 26 }],
    ["thanksgiving", 2027, { m: 10, d: 25 }],
    ["mlk-day", 2027, { m: 0, d: 18 }],
    ["presidents-day", 2026, { m: 1, d: 16 }],
    ["mothers-day", 2026, { m: 4, d: 10 }],
    ["memorial-day", 2026, { m: 4, d: 25 }],
    ["memorial-day", 2027, { m: 4, d: 31 }],
    ["fathers-day", 2026, { m: 5, d: 21 }],
    ["labor-day", 2026, { m: 8, d: 7 }],
    ["columbus-day", 2026, { m: 9, d: 12 }],
  ])("%s %i", (id, y, expected) => {
    expect(get(id).compute(y)).toEqual(expected);
  });

  test("good friday is 2 days before easter, across a month boundary", () => {
    expect(get("good-friday").compute(2026)).toEqual({ m: 3, d: 3 });  // Easter Apr 5
    expect(get("good-friday").compute(2029)).toEqual({ m: 2, d: 30 }); // Easter Apr 1 → Mar 30
  });

  test("every entry has at least one English name", () => {
    for (const e of us.entries) expect(e.names.en?.length, e.id).toBeGreaterThan(0);
  });
});
