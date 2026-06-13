import { describe, expect, test } from "vitest";
import { cyrToLat } from "../src/translit.js";

describe("cyrToLat — Kazakh Cyrillic → 2021 Latin", () => {
  test("core date vocabulary transliterates with the expected glyphs", () => {
    expect(cyrToLat("ертең")).toBe("erteñ");
    expect(cyrToLat("апта")).toBe("apta");
    expect(cyrToLat("дүйсенбі")).toBe("düısenbi");
    expect(cyrToLat("наурыз")).toBe("nauryz");
    expect(cyrToLat("жұма")).toBe("jūma"); // ұ → ū (2021 diacritic)
    expect(cyrToLat("қыркүйек")).toBe("qyrküıek");
  });

  test("is idempotent on already-Latin input (no Cyrillic to map)", () => {
    expect(cyrToLat("apta")).toBe("apta");
  });

  test("passes through digits, spaces, and hyphens", () => {
    expect(cyrToLat("21 наурыз")).toBe("21 nauryz");
  });
});
