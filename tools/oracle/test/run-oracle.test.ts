import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { createEngine } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { generatePhrases } from "../src/templates.js";
import { compareOne } from "../src/compare.js";
import { renderReport } from "../src/report.js";

describe.runIf(process.env.ORACLE === "1")("full differential run (ORACLE=1)", () => {
  test("sweeps the corpus and writes results/diffs.md", () => {
    const engine = createEngine({ locale: en });
    const results = generatePhrases().map((p) => compareOne(engine, p));
    const dir = join(dirname(fileURLToPath(import.meta.url)), "../results");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "diffs.md"), renderReport(results));
    const rate = results.filter((r) => r.agree).length / results.length;
    console.log(`oracle agreement: ${(rate * 100).toFixed(1)}% over ${results.length} phrases`);
    expect(rate).toBeGreaterThan(0.5); // sanity floor only; triage owns the real number
  });
});
