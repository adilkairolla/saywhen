import { describe, expect, test } from "vitest";
import { createEngine, type DateExpr, type ParseContext } from "@saywhen/core";
import { kk, kkLatn } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const CTX: ParseContext = { now: OPTS.now, timeZone: "Asia/Almaty" };
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);
const latnEngine = createEngine({ locale: kkLatn });

describe("kkLatn — Latin canonical output", () => {
  test("distinct id", () => {
    expect(kkLatn.id).toBe("kk-latn");
  });

  test("format emits Latin (= transliteration of the Cyrillic form)", () => {
    const nextFri = A({ kind: "weekday", day: 5, which: "next" });
    expect(kk.format(nextFri, OPTS)).toBe("келесі жұма");           // Cyrillic adapter
    expect(kkLatn.format(A({ kind: "relday", offset: 1 }), OPTS)).toBe("erteñ");
    expect(kkLatn.format(nextFri, OPTS)).toBe("kelesi jūma");       // Latin adapter (ұ → ū)
    expect(kkLatn.format(A({ kind: "calendar", d: 21 }), OPTS)).toBe("21-i"); // day-only ordinal = cyrToLat("21-і")
  });

  test("its own canonical output re-parses (round-trip)", () => {
    const text = kkLatn.format(A({ kind: "weekday", day: 1, which: "next" }), OPTS); // "kelesi düısenbi"
    const r = latnEngine.parse(text, CTX);
    expect(r.candidates[0]!.start.date).toBe("2026-06-15");
  });

  test("accepts Cyrillic input too (union lexicon)", () => {
    expect(latnEngine.parse("ертең", CTX).candidates[0]!.start.date).toBe("2026-06-13");
    expect(latnEngine.parse("erteñ", CTX).candidates[0]!.start.date).toBe("2026-06-13");
  });
});
