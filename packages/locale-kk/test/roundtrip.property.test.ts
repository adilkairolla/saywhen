import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { createEngine, resolveExpr, type DateExpr, type LocaleAdapter, type ParseContext, type Wall } from "@saywhen/core";
import { kk, kkLatn } from "../src/index.js";

const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty", allowPast: true };
const RESOLVE = { now: CTX.now, timeZone: CTX.timeZone, weekStart: 1 as const, allowPast: true };
const wallDate = (w: Wall) => `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;

const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);
const relArb = fc.constantFrom("this", "next", "last");
const unitArb = fc.constantFrom("day", "week", "month", "year");

const anchorArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
  fc.record({
    m: fc.integer({ min: 0, max: 11 }), d: fc.integer({ min: 1, max: 28 }),
    y: fc.option(fc.integer({ min: 2025, max: 2030 }), { nil: undefined }),
  }).map(({ m, d, y }) => A({ kind: "calendar", m, d, ...(y !== undefined ? { y } : {}) })),
  fc.integer({ min: 1, max: 28 }).map((d) => A({ kind: "calendar", d })),
  fc.integer({ min: 0, max: 11 }).map((m) => A({ kind: "calendar", m })),
);
const periodArb: fc.Arbitrary<DateExpr> = fc.record({
  period: fc.oneof(
    fc.constantFrom({ kind: "week" }, { kind: "month" }, { kind: "year" }, { kind: "weekend" }),
    fc.integer({ min: 1, max: 4 }).map((q) => ({ kind: "quarter", q })),
    fc.integer({ min: 0, max: 3 }).map((s) => ({ kind: "season", s })),
  ),
  which: relArb,
}).map(({ period, which }) => ({ type: "period", period, which } as DateExpr));
const offsetArb: fc.Arbitrary<DateExpr> = fc.record({
  base: fc.oneof(anchorArb, fc.constant(A({ kind: "now" }))),
  n: fc.integer({ min: 1, max: 12 }), unit: unitArb, dir: fc.constantFrom(1, -1),
}).map((o) => ({ type: "offset", ...o } as DateExpr));
const rangeArb: fc.Arbitrary<DateExpr> = fc.record({ start: anchorArb, end: anchorArb })
  .map(({ start, end }) => ({ type: "range", start, end } as DateExpr));
const pointArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
);
const withTimeArb: fc.Arbitrary<DateExpr> = fc.record({
  base: pointArb, time: fc.record({ h: fc.integer({ min: 0, max: 23 }), m: fc.constantFrom(0, 15, 30, 45) }),
}).map(({ base, time }) => ({ type: "withTime", base, time } as DateExpr));

// boundaries excluded — postpositional boundaries are a deferred fast-follow (non-goals)
const exprArb = fc.oneof(anchorArb, periodArb, offsetArb, rangeArb, withTimeArb);

describe.each([["kk", kk], ["kk-latn", kkLatn]] as Array<[string, LocaleAdapter]>)(
  "round-trip property — %s",
  (_id, locale) => {
    const engine = createEngine({ locale });
    test("format → parse → identical resolved dates", () => {
      fc.assert(
        fc.property(exprArb, (expr) => {
          const expected = resolveExpr(expr, RESOLVE);
          fc.pre(expected.ok);
          const text = locale.format(expr, { now: CTX.now, timeZone: CTX.timeZone });
          const r = engine.parse(text, CTX);
          expect(r.candidates.length, `no parse for "${text}" (${JSON.stringify(expr)})`).toBeGreaterThan(0);
          const top = r.candidates[0]!;
          expect(top.start.date, `start of "${text}"`).toBe(wallDate(expected.value.start));
          expect(top.end.date, `end of "${text}"`).toBe(wallDate(expected.value.end));
        }),
        { numRuns: 300 },
      );
    });
  },
);
