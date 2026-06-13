import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { kk } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const acc = (expr: DateExpr) => kk.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("kk formatAccessible (natural, postpositional)", () => {
  test("offsets and ranges decline endpoints", () => {
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("2 аптадан кейін");
    expect(acc({
      type: "range",
      start: A({ kind: "weekday", day: 1 }),
      end: A({ kind: "weekday", day: 5 }),
    })).toBe("дүйсенбіден жұмаға дейін");
  });

  test("anchors read naturally", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("ертең");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("келесі жұма");
  });
});
