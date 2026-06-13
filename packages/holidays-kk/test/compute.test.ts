import { describe, expect, test } from "vitest";
import { cyrToLat } from "@saywhen/locale-kk";
import { kk, kurbanAit } from "../src/index.js";

describe("kurbanAit (bounded lookup)", () => {
  test.each([
    [2026, 4, 27],
    [2027, 4, 16],
    [2030, 3, 13],
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(kurbanAit(y)).toEqual({ m, d });
  });
  test("null outside the tabulated range", () => {
    expect(kurbanAit(2019)).toBeNull();
    expect(kurbanAit(2100)).toBeNull();
  });
});

describe("entries", () => {
  const get = (id: string) => kk.entries.find((e) => e.id === id)!;
  test("fixed dates", () => {
    expect(get("victory-day").compute(2026)).toEqual({ m: 4, d: 9 });
    expect(get("nauryz").compute(2026)).toEqual({ m: 2, d: 22 });
    expect(get("independence-day").compute(2026)).toEqual({ m: 11, d: 16 });
  });
  test("every entry has kk, kk-latn, ru, en names", () => {
    for (const e of kk.entries) {
      expect(e.names.kk?.length, e.id).toBeGreaterThan(0);
      expect(e.names["kk-latn"]?.length, e.id).toBeGreaterThan(0);
      expect(e.names.ru?.length, e.id).toBeGreaterThan(0);
      expect(e.names.en?.length, e.id).toBeGreaterThan(0);
    }
  });
  test("kk-latn canonical name = cyrToLat(kk canonical name)", () => {
    for (const e of kk.entries) {
      expect(e.names["kk-latn"]![0], e.id).toBe(cyrToLat(e.names.kk![0]!));
    }
  });
});
