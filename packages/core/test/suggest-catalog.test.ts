import { describe, expect, test } from "vitest";
import type { HolidayPack } from "../src/types.js";
import { buildVocabulary } from "../src/vocab.js";
import { buildCatalog, buildSurfaceIndex, categoryWeight } from "../src/suggest-catalog.js";
import { testLocale } from "./fixtures/test-locale.js";

const pack: HolidayPack = {
  id: "test-pack",
  entries: [
    { id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas", "xmas"] } },
    { id: "new-year", compute: () => ({ m: 0, d: 1 }), names: { test: ["new year day", "new year"] } },
  ],
};
const vocab = buildVocabulary(testLocale, [pack]);

describe("buildCatalog (spec §6 semantic popularity table)", () => {
  const catalog = buildCatalog(vocab);

  test("spec popularity anchors: RELDAY(+1) 0.95, PERIOD(week, next) 0.9", () => {
    const tomorrow = catalog.find(
      (e) => e.expr.type === "anchor" && e.expr.anchor.kind === "relday" && e.expr.anchor.offset === 1,
    );
    expect(tomorrow!.popularity).toBe(0.95);
    const nextWeek = catalog.find(
      (e) => e.expr.type === "period" && e.expr.period.kind === "week" && e.expr.which === "next",
    );
    expect(nextWeek!.popularity).toBe(0.9);
  });

  test("generated families: 14 weekday entries, 12 month entries", () => {
    expect(catalog.filter((e) => e.expr.type === "anchor" && e.expr.anchor.kind === "weekday"))
      .toHaveLength(14);
    expect(catalog.filter((e) => e.expr.type === "anchor" && e.expr.anchor.kind === "calendar"))
      .toHaveLength(12);
  });

  test("holiday packs contribute automatically", () => {
    const ids = catalog.flatMap((e) =>
      e.expr.type === "anchor" && e.expr.anchor.kind === "holiday" ? [e.expr.anchor.id] : [],
    );
    expect(ids.sort()).toEqual(["christmas", "new-year"]);
  });
});

describe("categoryWeight", () => {
  test("relday > period > weekday > boundary > holiday > offset > calendar", () => {
    expect(categoryWeight({ type: "anchor", anchor: { kind: "relday", offset: 1 } })).toBe(1);
    expect(categoryWeight({ type: "period", period: { kind: "week" }, which: "next" })).toBe(0.9);
    expect(categoryWeight({ type: "anchor", anchor: { kind: "weekday", day: 5 } })).toBe(0.8);
    expect(categoryWeight({
      type: "boundary", edge: "end",
      of: { type: "period", period: { kind: "month" }, which: "this" },
    })).toBe(0.75);
    expect(categoryWeight({ type: "anchor", anchor: { kind: "holiday", id: "x" } })).toBe(0.7);
    expect(categoryWeight({
      type: "offset", base: { type: "anchor", anchor: { kind: "now" } }, n: 1, unit: "week", dir: 1,
    })).toBe(0.6);
    expect(categoryWeight({ type: "anchor", anchor: { kind: "calendar", m: 5 } })).toBe(0.55);
  });
});

describe("buildSurfaceIndex", () => {
  const idx = buildSurfaceIndex(vocab);

  test("matchable keeps canonical spellings and every phrase, skips function words", () => {
    const texts = idx.matchable.map((s) => s.text);
    expect(texts).toContain("friday");
    expect(texts).not.toContain("fri");          // same payload — canonical form wins
    expect(texts).toContain("christmas");
    expect(texts).toContain("new year day");     // phrases are all kept (inflected forms matter)
    expect(texts).toContain("new year");
    expect(texts).not.toContain("on");           // FILLER
    expect(texts).not.toContain("to");           // CONNECTOR
    expect(texts).not.toContain("before");       // DIRECTION
  });

  test("canonicalByKind enumerates closed classes only", () => {
    const wd = idx.canonicalByKind.get("WEEKDAY")!;
    expect(wd).toHaveLength(7);
    expect(wd.map((s) => s.text)).toContain("friday");
    expect(idx.canonicalByKind.has("NUMBER")).toBe(false);
  });
});
