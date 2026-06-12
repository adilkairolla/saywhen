import { describe, expect, test } from "vitest";
import { orthodoxEaster, ru } from "../src/index.js";

describe("orthodoxEaster (Julian Meeus + 13-day Gregorian shift)", () => {
  test.each([
    [2024, 4, 5],  // May 5
    [2025, 3, 20], // Apr 20 (coincides with Western that year)
    [2026, 3, 12], // Apr 12
    [2027, 4, 2],  // May 2
    [2028, 3, 16], // Apr 16
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(orthodoxEaster(y)).toEqual({ m, d });
  });

  test("null outside 1900–2099 (the +13-day shift stops being valid)", () => {
    expect(orthodoxEaster(1899)).toBeNull();
    expect(orthodoxEaster(2100)).toBeNull();
  });
});

describe("entries", () => {
  const get = (id: string) => ru.entries.find((e) => e.id === id)!;

  test("victory day is May 9 every year", () => {
    expect(get("victory-day").compute(2026)).toEqual({ m: 4, d: 9 });
  });

  test("every entry has a Russian and an English name", () => {
    for (const e of ru.entries) {
      expect(e.names.ru?.length, e.id).toBeGreaterThan(0);
      expect(e.names.en?.length, e.id).toBeGreaterThan(0);
    }
  });
});
