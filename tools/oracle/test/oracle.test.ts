import { describe, expect, test } from "vitest";
import { createEngine } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { generatePhrases } from "../src/templates.js";
import { compareOne } from "../src/compare.js";
import { renderReport } from "../src/report.js";

const engine = createEngine({ locale: en });

describe("templates", () => {
  test("generates a broad fixed corpus", () => {
    const phrases = generatePhrases();
    expect(phrases.length).toBeGreaterThan(100);
    expect(phrases).toContain("next friday");
    expect(phrases).toContain("in 2 weeks");
    expect(new Set(phrases).size).toBe(phrases.length); // no duplicates
  });
});

describe("compareOne", () => {
  test("agreement on an absolute date", () => {
    const r = compareOne(engine, "june 1 2027");
    expect(r).toMatchObject({ ours: "2027-06-01", chrono: "2027-06-01", agree: true });
  });
  test("records disagreement rather than throwing", () => {
    const r = compareOne(engine, "zorp blarg");
    expect(r.agree).toBe(false);
    expect(r.ours).toBeNull();
  });
});

describe("renderReport", () => {
  test("lists only disagreements with a summary", () => {
    const md = renderReport([
      { text: "a", ours: "2026-01-01", chrono: "2026-01-01", agree: true },
      { text: "b", ours: "2026-01-02", chrono: "2026-01-03", agree: false },
    ]);
    expect(md).toContain("Agreement: 1/2");
    expect(md).toContain("| b | 2026-01-02 | 2026-01-03 |");
    expect(md).not.toContain("| a |");
  });
});

// Disagreement on any of these means WE broke something (or a chrono major changed):
// simple absolutes and unambiguous relatives both engines define identically.
const MUST_AGREE = [
  "today", "tomorrow", "yesterday",
  "in 3 days", "in 2 weeks",
  "june 15", "june 1 2027", "december 25 2026",
  "3/4/2026", "next monday",
];

describe("must-agree gate", () => {
  test.each(MUST_AGREE)("'%s'", (phrase) => {
    const r = compareOne(engine, phrase);
    expect(r, JSON.stringify(r)).toMatchObject({ agree: true });
  });
});
