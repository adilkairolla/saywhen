import { describe, expect, test } from "vitest";
import {
  assertValidTimeZone,
  offsetAt,
  utcToWall,
  wallToUtc,
} from "../src/zoned-date.js";

describe("utcToWall", () => {
  test("converts a UTC instant to New York wall time", () => {
    // 2026-06-15T16:30:00Z is 12:30 EDT (-4)
    const w = utcToWall(new Date("2026-06-15T16:30:00Z"), "America/New_York");
    expect(w).toEqual({ y: 2026, m: 5, d: 15, h: 12, mi: 30 });
  });

  test("handles UTC+5 Almaty (no DST since 2024)", () => {
    const w = utcToWall(new Date("2026-01-10T22:00:00Z"), "Asia/Almaty");
    expect(w).toEqual({ y: 2026, m: 0, d: 11, h: 3, mi: 0 });
  });
});

describe("offsetAt", () => {
  test("Moscow is fixed +180 minutes", () => {
    expect(offsetAt(new Date("2026-01-01T00:00:00Z"), "Europe/Moscow")).toBe(180);
    expect(offsetAt(new Date("2026-07-01T00:00:00Z"), "Europe/Moscow")).toBe(180);
  });

  test("New York flips -300 ↔ -240 across DST", () => {
    expect(offsetAt(new Date("2026-01-01T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(offsetAt(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-240);
  });

  test("Lord Howe has a 30-minute DST shift (+630 ↔ +660)", () => {
    expect(offsetAt(new Date("2026-07-01T00:00:00Z"), "Australia/Lord_Howe")).toBe(630);
    expect(offsetAt(new Date("2026-01-01T00:00:00Z"), "Australia/Lord_Howe")).toBe(660);
  });
});

describe("wallToUtc — plain cases", () => {
  test("round-trips an unambiguous wall time", () => {
    const utc = wallToUtc({ y: 2026, m: 5, d: 15, h: 12, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-06-15T16:30:00.000Z");
  });
});

describe("wallToUtc — DST gap (spring forward)", () => {
  test("NY 2026-03-08 02:30 does not exist → shifts forward to 03:30 EDT", () => {
    const utc = wallToUtc({ y: 2026, m: 2, d: 8, h: 2, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(utcToWall(utc, "America/New_York")).toEqual({ y: 2026, m: 2, d: 8, h: 3, mi: 30 });
  });

  test("Lord Howe 2026-10-04 02:15 (gap is 02:00–02:30) → shifts to 02:45", () => {
    const utc = wallToUtc({ y: 2026, m: 9, d: 4, h: 2, mi: 15 }, "Australia/Lord_Howe");
    expect(utcToWall(utc, "Australia/Lord_Howe")).toEqual({ y: 2026, m: 9, d: 4, h: 2, mi: 45 });
  });
});

describe("wallToUtc — DST overlap (fall back)", () => {
  test("NY 2026-11-01 01:30 occurs twice → earlier instant (EDT, 05:30Z)", () => {
    const utc = wallToUtc({ y: 2026, m: 10, d: 1, h: 1, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("assertValidTimeZone", () => {
  test("accepts valid IANA names", () => {
    expect(() => assertValidTimeZone("Asia/Almaty")).not.toThrow();
  });
  test("throws an actionable error on garbage", () => {
    expect(() => assertValidTimeZone("Mars/Olympus")).toThrow(/Invalid IANA time zone/);
  });
});
