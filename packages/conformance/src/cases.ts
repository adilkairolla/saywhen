import type { DateExpr } from "@saywhen/core";

// test-support cast: cases below are hand-written valid anchors
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

export interface SemanticCase {
  name: string;
  expr: DateExpr;
}

/**
 * The shared behavioral contract (spec §9.2): every locale must format each of
 * these ASTs to text its own engine re-parses to the same resolved dates.
 */
export const SEMANTIC_CASES: SemanticCase[] = [
  { name: "relday +1 (tomorrow-equivalent)", expr: A({ kind: "relday", offset: 1 }) },
  { name: "relday 0 (today-equivalent)", expr: A({ kind: "relday", offset: 0 }) },
  { name: "relday -1 (yesterday-equivalent)", expr: A({ kind: "relday", offset: -1 }) },
  { name: "bare weekday", expr: A({ kind: "weekday", day: 1 }) },
  { name: "next weekday", expr: A({ kind: "weekday", day: 5, which: "next" }) },
  { name: "last weekday", expr: A({ kind: "weekday", day: 3, which: "last" }) },
  { name: "calendar month+day", expr: A({ kind: "calendar", m: 2, d: 21 }) },
  { name: "calendar full date", expr: A({ kind: "calendar", y: 2027, m: 0, d: 5 }) },
  { name: "bare ordinal day", expr: A({ kind: "calendar", d: 21 }) },
  { name: "month only", expr: A({ kind: "calendar", m: 8 }) },
  { name: "year only", expr: A({ kind: "calendar", y: 2027 }) },
  {
    name: "offset after anchor (the acid test)",
    expr: { type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1 },
  },
  {
    name: "offset before anchor",
    expr: { type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1 },
  },
  { name: "in N units", expr: { type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 } },
  { name: "N units ago", expr: { type: "offset", base: A({ kind: "now" }), n: 3, unit: "day", dir: -1 } },
  {
    name: "weekday range",
    expr: { type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }) },
  },
  {
    name: "lookback span",
    expr: {
      type: "range",
      start: { type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: -1 },
      end: A({ kind: "now" }),
    },
  },
  { name: "this week", expr: { type: "period", period: { kind: "week" }, which: "this" } },
  { name: "next month period", expr: { type: "period", period: { kind: "month" }, which: "next" } },
  { name: "weekend", expr: { type: "period", period: { kind: "weekend" }, which: "this" } },
  { name: "last quarter", expr: { type: "period", period: { kind: "quarter" }, which: "last" } },
  { name: "season", expr: { type: "period", period: { kind: "season", s: 1 }, which: "this" } },
  {
    name: "boundary: end of this month",
    expr: { type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end" },
  },
  {
    name: "boundary: start of next week",
    expr: { type: "boundary", of: { type: "period", period: { kind: "week" }, which: "next" }, edge: "start" },
  },
  {
    name: "with time of day",
    expr: { type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 } },
  },
];
