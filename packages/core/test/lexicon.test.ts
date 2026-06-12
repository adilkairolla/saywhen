import { describe, expect, test } from "vitest";
import { normalizeText } from "../src/normalize.js";
import { lookupLexicon, validateLocale } from "../src/lexicon.js";
import type { Lexicon, LocaleAdapter } from "../src/types.js";
import { testLocale } from "./fixtures/test-locale.js";
import { toks } from "./fixtures/toks.js";

describe("normalizeText", () => {
  test("lowercases and NFKC-folds", () => {
    expect(normalizeText("Next FRIDAY")).toBe("next friday");
    expect(normalizeText("ﬁve")).toBe("five"); // ﬁ ligature folds under NFKC
  });
  test("normalizes unicode dashes and quotes", () => {
    expect(normalizeText("mon — fri")).toBe("mon - fri");
    expect(normalizeText("’til")).toBe("'til");
  });
});

const lex: Lexicon = {
  friday: [{ kind: "WEEKDAY", day: 5 }],
  may: [{ kind: "MONTH", month: 4 }],
};

describe("lookupLexicon", () => {
  test("returns payloads for a known form", () => {
    expect(lookupLexicon(lex, "friday")).toEqual([{ kind: "WEEKDAY", day: 5 }]);
  });
  test("returns null for unknown forms", () => {
    expect(lookupLexicon(lex, "zzz")).toBeNull();
  });
});

describe("validateLocale", () => {
  const base: LocaleAdapter = {
    id: "xx",
    tokenize: (t) => (t ? [{ text: t, span: [0, t.length] }] : []),
    lexicon: {},
    parseNumber: () => null,
    format: () => "",
    formatAccessible: () => "",
    defaults: { weekStart: 0, dateOrder: "MDY" },
  };

  test("rejects a locale missing weekdays", () => {
    expect(() => validateLocale(base)).toThrow(/weekday/i);
  });

  test("rejects duplicate forms mapping to different meanings", () => {
    const dupe: LocaleAdapter = {
      ...base,
      lexicon: {
        ...fullMinimalLexicon(),
        x: [{ kind: "WEEKDAY", day: 1 }, { kind: "WEEKDAY", day: 2 }],
      },
    };
    expect(() => validateLocale(dupe)).toThrow(/conflicting/i);
  });

  test("accepts a complete lexicon", () => {
    expect(() => validateLocale({ ...base, lexicon: fullMinimalLexicon() })).not.toThrow();
  });

  /** all 7 weekdays, 12 months, all 6 units, this/next/last, a RELDAY — the completeness floor */
  function fullMinimalLexicon(): Lexicon {
    const l: Lexicon = {};
    for (let d = 0; d < 7; d++) l[`wd${d}`] = [{ kind: "WEEKDAY", day: d }];
    for (let m = 0; m < 12; m++) l[`mo${m}`] = [{ kind: "MONTH", month: m }];
    for (const unit of ["day", "week", "month", "year", "hour", "minute"] as const)
      l[`u-${unit}`] = [{ kind: "UNIT", unit }];
    for (const which of ["this", "next", "last"] as const)
      l[`r-${which}`] = [{ kind: "REL", which }];
    l["today"] = [{ kind: "RELDAY", offset: 0 }];
    return l;
  }
});

describe("fixtures", () => {
  test("testLocale passes validateLocale and tokenizes '5pm'", () => {
    expect(() => validateLocale(testLocale)).not.toThrow();
    expect(testLocale.tokenize("friday 5pm").map((t) => t.text)).toEqual(["friday", "5", "pm"]);
    expect(testLocale.tokenize("the 21st").map((t) => t.text)).toEqual(["the", "21st"]);
  });
  test("toks factory stamps spans and confidence", () => {
    toks.reset();
    const w = toks.weekday(5);
    expect(w).toMatchObject({ kind: "WEEKDAY", day: 5, confidence: 1 });
    expect(w.span[1]).toBeGreaterThan(w.span[0]);
  });
});
