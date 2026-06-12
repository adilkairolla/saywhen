import { describe, expect, test } from "vitest";
import {
  createEngine, resolveExpr,
  type HolidayPack, type LocaleAdapter, type ParseContext, type Wall,
} from "@saywhen/core";
import { SEMANTIC_CASES } from "./cases.js";

export { SEMANTIC_CASES } from "./cases.js";

export interface ConformanceSeed {
  /** a natural phrase in the locale's language */
  text: string;
  /** expected local calendar dates under the fixed conformance clock */
  start: string;
  end?: string; // defaults to start
}

export interface ConformanceConfig {
  locale: LocaleAdapter;
  holidays?: HolidayPack[];
  /** ≥ 10 phrases; drives the Task-5 variation matrix */
  seeds: ConformanceSeed[];
  /** pass-rate threshold for the fuzzy (typo) tier; default 0.7 */
  fuzzyPassRate?: number;
}

/** Fixed conformance clock: Friday 2026-06-12, 04:00 in New York. */
export const CONFORMANCE_CTX: ParseContext = {
  now: new Date("2026-06-12T08:00:00Z"),
  timeZone: "America/New_York",
};

function wallDate(w: Wall): string {
  return `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

export function runLocaleConformance(config: ConformanceConfig): void {
  const { locale, holidays = [], seeds } = config;
  if (seeds.length < 10) {
    throw new Error(`Conformance config for "${locale.id}" needs ≥ 10 seeds, got ${seeds.length}.`);
  }
  const engine = createEngine({ locale, holidays });
  const fmtOpts = { now: CONFORMANCE_CTX.now, timeZone: CONFORMANCE_CTX.timeZone };
  const resolveOpts = {
    now: CONFORMANCE_CTX.now,
    timeZone: CONFORMANCE_CTX.timeZone,
    weekStart: locale.defaults.weekStart,
    allowPast: false,
  };

  describe(`locale conformance: ${locale.id}`, () => {
    describe("semantic contract (format → parse → same dates)", () => {
      for (const c of SEMANTIC_CASES) {
        test(c.name, () => {
          const expected = resolveExpr(c.expr, resolveOpts);
          if (!expected.ok) throw new Error(`contract case "${c.name}" does not resolve: ${expected.error}`);
          const text = locale.format(c.expr, fmtOpts);
          const r = engine.parse(text, CONFORMANCE_CTX);
          expect(r.status, `"${text}" must parse`).not.toBe("invalid");
          expect(r.corrections, `canonical text "${text}" must not need correction`).toEqual([]);
          const top = r.candidates[0]!;
          expect(top.start.date, `"${text}" start`).toBe(wallDate(expected.value.start));
          expect(top.end.date, `"${text}" end`).toBe(wallDate(expected.value.end));
        });
      }
    });
  });
}
