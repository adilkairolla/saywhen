# saywhen Plan 05 — Suggestions & Ghost Completion (@saywhen/core/suggest) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@saywhen/core/suggest` per spec §6 — generated (not curated) suggestions: starters from a semantic popularity table, prefix/ghost completions, grammar-expectation continuations ("2 days before chr" → "2 days before christmas"), range-building mode after a CONNECTOR, and fallbacks — all language-free, rendered per-locale, with holiday packs contributing automatically.

**Architecture:** A separate subpath export (`packages/core/src/suggest.ts`) so `parse()`-only consumers never load it. Suggestions are *correct by construction*: catalog entries are language-free `DateExpr`s rendered with `locale.format` (the round-trip property guarantees they re-parse); grammar-path completions are validated by re-parsing through a private engine instance. The grammar's `Expectations` hook (frontier + expected kinds) was landed in plan 01 exactly for this. A small refactor extracts the engine's holiday-vocabulary merge into `vocab.ts` so suggest and engine share it (DRY).

**Tech Stack:** existing pnpm/TS/Vitest 3 monorepo; zero new dependencies. `moduleResolution: "bundler"` already resolves `exports` subpaths, so workspace tests can `import { createSuggest } from "@saywhen/core/suggest"` once the export map gains the entry.

**This is plan 5 of 6** (series in `2026-06-12-saywhen-01-core-engine.md`; 01–04 executed and merged — 555 tests + 1 ORACLE-gated skip green). Plan 06 = controller/react/registry/playground.

**Conventions (same as plans 01–04):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- Standard clock: **Friday `2026-06-12T08:00:00Z`**. Core suggest tests use `Asia/Almaty` (13:00 local), EN tests `America/New_York`, RU tests `Europe/Moscow`. `m` is 0-based month everywhere.
- Env quirk on this machine: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## Core facts the engineer needs (verified against current main)

- `packages/core/src/combinators.ts` already exports `Expectations { frontier: number; kinds: Set<SemKind> }` — every failed `tok()` records the expected kind at the furthest failure index (the comment says "suggest-engine hook, plan 05"). `grammar.parseStream(stream)` returns `{ parses, expectations }`. **A head that can be continued fails exactly at `frontier === stream.length`** — e.g. stream `[RELDAY, CONNECTOR]` yields frontier 2 with anchor-ish kinds (there is an existing grammar test proving this).
- `createEngine` (engine.ts:22–55) builds `lexicon` (locale + single-word holiday aliases), `phrases` (multi-word aliases as `PhraseEntry[]`), `holidayNames` (id → first alias), `holidayComputes` (id → compute) — Task 0 extracts this block verbatim into `vocab.ts`.
- `resolveExpr(expr, { now, timeZone, weekStart, allowPast, holidays? })` → `{ ok, value: { start: Wall, end: Wall, hasExplicitTime } } | { ok: false, error }`. With `allowPast: false` (the engine default) anchors roll forward: bare weekday → `(day - weekdayOf(today) + 7) % 7` (**today counts** — bare "friday" on a Friday is today); month+day and bare-day roll to the next occurrence; month-only rolls to next year when `m < today.m`. Inverted ranges **throw** "Range ends before it starts" — so degenerate completions like "tomorrow to yesterday" are dropped for free by the validating re-parse.
- Period resolution (resolve.ts:197): week = `startOfWeek(today, weekStart) + off*7`, 7 days; weekend = Sat..Sun of the `which` week. With the standard clock (Fri 2026-06-12) and weekStart 0: this week 06-07..06-13, next week 06-14..06-20, this weekend 06-13..06-14.
- `FormatOptions` is `{ now, timeZone, holidayNames? }` (plan 04). Both real locale formatters render holiday anchors via the names table. **`testLocale.format` is `JSON.stringify`** — a structural placeholder — so suggest behavior tests need a fixture with a real formatter (Task 2 creates `suggest-locale.ts`).
- locale-en data order puts canonical forms first: `WEEKDAYS` before `WEEKDAY_ABBR`, `UNITS` lists `"week"` before `"weeks"/"wk"`; locale-ru lists nominative before genitive. "First data-order form per payload" is therefore a sound canonical-spelling rule.
- `normalizeText` lowercases + folds dashes/quotes; it does NOT trim. Suggest trims and operates on the trimmed normalized input.
- `typo.ts` exports `buildKeyboardAdjacency`, `weightedDamerau(a, b, adjacency)` (substitution 0.5 for adjacent keys, transposition 0.5), and `correctToken(text, lexiconKeys, typoMap, adjacency)`.
- `tsconfig.base.json` uses `moduleResolution: "bundler"` → package.json `exports` subpaths resolve in tsc and Vitest.
- Root `typecheck`/`build` scripts already glob `./packages/*` — no root script changes needed.
- Engine option type: `CreateEngineOptions = { locale: LocaleAdapter; holidays?: HolidayPack[] }` (exported).

## Hand-verified scoring table (used by the exact-order tests)

`score = 0.4·prefixRatio + 0.25·categoryWeight + 0.2·proximity + 0.15·popularity` with `proximity = max(0, 1 − daysUntilStart/60)`. Empty input → prefixRatio 0. Standard clock, weekStart 0:

| entry | category | daysUntil | proximity | popularity | score |
|---|---|---|---|---|---|
| tomorrow | 1.0 | 1 | 0.9833 | 0.95 | **0.5892** |
| today | 1.0 | 0 | 1.0 | 0.85 | **0.5775** |
| next week | 0.9 | 2 | 0.9667 | 0.9 | **0.5533** |
| this weekend | 0.9 | 1 | 0.9833 | 0.8 | **0.5417** |
| this week | 0.9 | 0 (start past) | 1.0 | 0.65 | **0.5225** |
| saturday (best weekday) | 0.8 | 1 | 0.9833 | 0.55 | 0.4792 |

So the empty-input top-5 is exactly `[tomorrow, today, next week, this weekend, this week]` — deterministic, asserted in Tasks 2 and 5. (Date-dedupe drops "friday"→today and "saturday"→tomorrow duplicates below rank 5; nothing in the top 5 collides.)

## File structure (created/modified by this plan)

```
packages/core/src/vocab.ts                  CREATE  buildVocabulary extracted from engine (Task 0)
packages/core/src/engine.ts                 MODIFY  use buildVocabulary (Task 0, refactor)
packages/core/src/suggest-catalog.ts        CREATE  semantic catalog + category weights + surface index (Task 1)
packages/core/test/suggest-catalog.test.ts  CREATE  (Task 1)
packages/core/src/suggest.ts                CREATE  createSuggest — catalog path (Task 2), grammar path (Task 3), fallbacks (Task 4)
packages/core/test/fixtures/suggest-locale.ts CREATE testLocale + a REAL formatter (Task 2)
packages/core/test/suggest.test.ts          CREATE  (Tasks 2–4 append describes)
packages/core/package.json                  MODIFY  "./suggest" subpath export (Task 2)
packages/locale-en/test/suggest.test.ts     CREATE  (Task 5)
packages/locale-ru/test/suggest.test.ts     CREATE  (Task 5)
packages/holidays-us/test/suggest.test.ts   CREATE  (Task 6)
packages/core/tsdown.config.ts              MODIFY  second entry (Task 7)
```

`packages/core/src/index.ts` is deliberately NOT modified — suggest stays off the main entry (spec §6: "parse()-only consumers never load it").

---

### Task 0: Extract `buildVocabulary` (refactor, no behavior change)

The engine's holiday-merge block becomes a shared module so `createSuggest` can build the same lexicon/phrases/names without duplicating the logic. No new tests — the existing 555-test suite is the regression net.

**Files:**
- Create: `packages/core/src/vocab.ts`
- Modify: `packages/core/src/engine.ts`

- [ ] **Step 1: Write `packages/core/src/vocab.ts`** (complete file)

```ts
import type { HolidayPack, Lexicon, LocaleAdapter } from "./types.js";
import type { PhraseEntry } from "./lattice.js";
import { normalizeText } from "./normalize.js";

export interface Vocabulary {
  lexicon: Lexicon;
  phrases: PhraseEntry[];
  /** holiday id → canonical display name for the active locale (first alias, normalized) */
  holidayNames: Record<string, string>;
  holidayComputes: Map<string, (y: number) => { m: number; d: number } | null>;
}

/**
 * Merge holiday vocabulary for ONE locale (spec §4.5): single-word aliases become
 * lexicon entries (and get typo correction for free); multi-word aliases become
 * phrase entries merged in the lattice. Aliases are tokenized with the locale
 * tokenizer so phrase tokens match user input exactly ("new year's day" →
 * ["new","year's","day"]). Throws on malformed packs (spec §8: config throws).
 */
export function buildVocabulary(locale: LocaleAdapter, holidays: HolidayPack[]): Vocabulary {
  const lexicon: Lexicon = { ...locale.lexicon };
  const phrases: PhraseEntry[] = [];
  const holidayNames: Record<string, string> = {};
  const holidayComputes = new Map<string, (y: number) => { m: number; d: number } | null>();
  for (const pack of holidays) {
    if (!pack.id || !Array.isArray(pack.entries)) {
      throw new Error(`Malformed holiday pack: expected { id, entries[] }.`);
    }
    for (const entry of pack.entries) {
      holidayComputes.set(entry.id, entry.compute);
      for (const alias of entry.names[locale.id] ?? []) {
        const words = locale.tokenize(normalizeText(alias)).map((t) => t.text);
        if (words.length === 1) {
          const form = words[0]!;
          lexicon[form] = [...(lexicon[form] ?? []), { kind: "HOLIDAY", id: entry.id }];
        } else if (words.length > 1) {
          phrases.push({ tokens: words, payload: { kind: "HOLIDAY", id: entry.id } });
        }
      }
      const canonical = (entry.names[locale.id] ?? [])[0];
      if (canonical !== undefined) holidayNames[entry.id] = normalizeText(canonical);
    }
  }
  return { lexicon, phrases, holidayNames, holidayComputes };
}
```

- [ ] **Step 2: Use it in `packages/core/src/engine.ts`**

Replace the two import lines:
```ts
import { buildLattice, expandStreams, type PhraseEntry } from "./lattice.js";
```
with
```ts
import { buildLattice, expandStreams } from "./lattice.js";
import { buildVocabulary } from "./vocab.js";
```
Remove `Lexicon` from the `./types.js` type-import list (no longer referenced).

Replace the whole vocabulary block — everything from `// merge holiday vocabulary for THIS locale …` down to the closing `}` of the `for (const pack of holidays)` loop (engine.ts lines 25–51) — with:
```ts
  const { lexicon, phrases, holidayNames, holidayComputes } = buildVocabulary(locale, holidays);
```

- [ ] **Step 3: Verify no behavior change**

Run: `pnpm vitest run && pnpm typecheck`
Expected: 555 passed + 1 skipped, typecheck clean — identical to before.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/vocab.ts packages/core/src/engine.ts
git commit -m "refactor(core): extract holiday vocabulary merge into vocab.ts"
```

---

### Task 1: Semantic catalog, category weights, surface index

The language-free heart of suggest: `SemanticEntry` (a `DateExpr` + popularity — spec §6's "semantic popularity table"), `categoryWeight` (the 25% term), and `SurfaceIndex` (concrete words/phrases the grammar path completes with).

**Files:**
- Create: `packages/core/src/suggest-catalog.ts`
- Test: `packages/core/test/suggest-catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/suggest-catalog.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/suggest-catalog.test.ts`
Expected: FAIL — `../src/suggest-catalog.js` does not exist.

- [ ] **Step 3: Write `packages/core/src/suggest-catalog.ts`** (complete file)

```ts
import type { DateExpr, PeriodRef, Rel, SemKind, SemPayload, Unit } from "./types.js";
import type { Vocabulary } from "./vocab.js";

/** one suggestible meaning — language-free; rendered per-locale with locale.format */
export interface SemanticEntry {
  expr: DateExpr;
  /** 0..1 — how often humans mean this (spec §6 semantic popularity table) */
  popularity: number;
}

const relday = (offset: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "relday", offset } });
const period = (p: PeriodRef, which: Rel): DateExpr => ({ type: "period", period: p, which });
const inUnits = (n: number, unit: Unit): DateExpr =>
  ({ type: "offset", base: { type: "anchor", anchor: { kind: "now" } }, n, unit, dir: 1 });
const endOf = (of: DateExpr): DateExpr => ({ type: "boundary", of, edge: "end" });

export function buildCatalog(vocab: Vocabulary): SemanticEntry[] {
  const entries: SemanticEntry[] = [
    { expr: relday(1), popularity: 0.95 },                          // spec: RELDAY(+1) 0.95
    { expr: period({ kind: "week" }, "next"), popularity: 0.9 },    // spec: PERIOD(week, next) 0.9
    { expr: relday(0), popularity: 0.85 },
    { expr: period({ kind: "weekend" }, "this"), popularity: 0.8 },
    { expr: period({ kind: "month" }, "next"), popularity: 0.7 },
    { expr: period({ kind: "week" }, "this"), popularity: 0.65 },
    { expr: inUnits(1, "week"), popularity: 0.6 },
    { expr: inUnits(2, "week"), popularity: 0.55 },
    { expr: endOf(period({ kind: "month" }, "this")), popularity: 0.55 },
    { expr: endOf(period({ kind: "week" }, "this")), popularity: 0.5 },
    { expr: period({ kind: "month" }, "this"), popularity: 0.5 },
  ];
  for (let day = 0; day <= 6; day++) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "weekday", day } }, popularity: 0.55 });
    entries.push({
      expr: { type: "anchor", anchor: { kind: "weekday", day, which: "next" } },
      popularity: 0.45,
    });
  }
  for (let m = 0; m <= 11; m++) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "calendar", m } }, popularity: 0.35 });
  }
  // holiday packs contribute automatically (spec §6)
  for (const id of Object.keys(vocab.holidayNames)) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "holiday", id } }, popularity: 0.55 });
  }
  return entries;
}

/** category weight (the 25% score term) — how "suggestion-shaped" a meaning is */
export function categoryWeight(expr: DateExpr): number {
  switch (expr.type) {
    case "anchor": {
      const k = expr.anchor.kind;
      if (k === "relday") return 1.0;
      if (k === "weekday") return 0.8;
      if (k === "holiday") return 0.7;
      if (k === "calendar") return 0.55;
      return 0.5; // now
    }
    case "period": return 0.9;
    case "boundary": return 0.75;
    case "offset": return 0.6;
    case "range": return 0.5;
    case "withTime": return 0.5;
  }
}

// ---- surfaces (concrete words/phrases) for grammar-continuation completions ----

export interface Surface {
  text: string;
  payload: SemPayload;
}

export interface SurfaceIndex {
  /** canonical lexicon surfaces (first data-order form per payload) + EVERY phrase —
   *  matched against typed fragments */
  matchable: Surface[];
  /** canonical surfaces grouped by kind — enumerated after a complete word */
  canonicalByKind: Map<SemKind, Surface[]>;
}

/** kinds that never stand alone as a suggestion surface */
const SKIP_KINDS = new Set<SemKind>(["FILLER", "LITERAL", "OP", "CONNECTOR", "MERIDIEM", "DIRECTION"]);

/** closed-class kinds whose surfaces can be enumerated as continuations; the order is the
 *  enumeration priority — small, high-signal families first, because the try budget is capped */
export const CLOSED_KINDS: SemKind[] = [
  "RELDAY", "WEEKDAY", "PERIOD", "BOUNDARY", "HOLIDAY", "UNIT", "REL", "MONTH",
];

export function buildSurfaceIndex(vocab: Vocabulary): SurfaceIndex {
  const matchable: Surface[] = [];
  const seen = new Set<string>();
  for (const [text, payloads] of Object.entries(vocab.lexicon)) {
    for (const payload of payloads) {
      if (SKIP_KINDS.has(payload.kind)) continue;
      const key = JSON.stringify(payload);
      if (seen.has(key)) continue; // first data-order form is the canonical spelling
      seen.add(key);
      matchable.push({ text, payload });
    }
  }
  const canonical = [...matchable];
  for (const ph of vocab.phrases) {
    const surface: Surface = { text: ph.tokens.join(" "), payload: ph.payload };
    matchable.push(surface); // ALL phrases stay matchable — inflected aliases are distinct surfaces
    const key = JSON.stringify(ph.payload);
    if (!seen.has(key)) {
      seen.add(key);
      canonical.push(surface);
    }
  }
  const canonicalByKind = new Map<SemKind, Surface[]>();
  for (const s of canonical) {
    if (!CLOSED_KINDS.includes(s.payload.kind)) continue;
    const list = canonicalByKind.get(s.payload.kind) ?? [];
    list.push(s);
    canonicalByKind.set(s.payload.kind, list);
  }
  return { matchable, canonicalByKind };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/suggest-catalog.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/suggest-catalog.ts packages/core/test/suggest-catalog.test.ts
git commit -m "feat(core): semantic suggestion catalog, category weights, surface index"
```

---

### Task 2: `createSuggest` — catalog path (starters, prefix completions, ghost)

The suggest engine with the catalog-matching path: empty input → starters ranked by the blended score; typed input → catalog entries whose rendered text extends it (exact prefix, curated typo map, fuzzy keyboard-distance prefix); scoring; date-level dedupe; ghost text. The grammar path (Task 3) and fallbacks (Task 4) slot into marked positions.

**Files:**
- Create: `packages/core/src/suggest.ts`, `packages/core/test/fixtures/suggest-locale.ts`
- Modify: `packages/core/package.json`
- Test: `packages/core/test/suggest.test.ts`

- [ ] **Step 1: Write the fixture** — `packages/core/test/fixtures/suggest-locale.ts` (complete file)

`testLocale.format` is `JSON.stringify`; suggestions render through `locale.format`, so the suggest tests need a real (re-parseable, en-like) formatter over the same lexicon:

```ts
import type { Anchor, DateExpr, FormatOptions, LocaleAdapter } from "../../src/types.js";
import { testLocale } from "./test-locale.js";

const WD = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MO = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const suffix = (d: number) =>
  d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
const time = (t: { h: number; m: number }) => {
  const mer = t.h >= 12 ? "pm" : "am";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return t.m === 0 ? `${h12}${mer}` : `${h12}:${String(t.m).padStart(2, "0")}${mer}`;
};

function anchorText(a: Anchor, names: Record<string, string>): string {
  switch (a.kind) {
    case "now": return "today";
    case "relday":
      if (a.offset === 0) return "today";
      if (a.offset === 1) return "tomorrow";
      if (a.offset === -1) return "yesterday";
      return `in ${a.offset} days`;
    case "weekday": return a.which ? `${a.which} ${WD[a.day]!}` : WD[a.day]!;
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${MO[m]} ${d}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `the ${d}${suffix(d)}`;
      if (m !== undefined) return `${MO[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function fmt(e: DateExpr, names: Record<string, string>): string {
  switch (e.type) {
    case "anchor": return anchorText(e.anchor, names);
    case "offset": {
      const unit = e.n === 1 ? e.unit : `${e.unit}s`;
      if (e.base.type === "anchor" && e.base.anchor.kind === "now") {
        return e.dir === 1 ? `in ${e.n} ${unit}` : `${e.n} ${unit} ago`;
      }
      return `${fmt(e.base, names)} ${e.dir === 1 ? "+" : "-"} ${e.n} ${unit}`;
    }
    case "range": return `${fmt(e.start, names)} to ${fmt(e.end, names)}`;
    case "period": {
      const p = e.period;
      const noun =
        p.kind === "quarter" ? (p.q ? `q${p.q}` : "quarter") : p.kind === "season" ? "season" : p.kind;
      return `${e.which} ${noun}`;
    }
    case "boundary": return `${e.edge} of ${fmt(e.of, names)}`;
    case "withTime": return `${fmt(e.base, names)} at ${time(e.time)}`;
  }
}

/** testLocale with a REAL formatter — suggest renders entries via locale.format */
export const suggestLocale: LocaleAdapter = {
  ...testLocale,
  format: (expr: DateExpr, opts: FormatOptions) => fmt(expr, opts.holidayNames ?? {}),
};
```

- [ ] **Step 2: Write the failing tests** — `packages/core/test/suggest.test.ts` (new file)

```ts
import { describe, expect, test } from "vitest";
import type { HolidayPack } from "../src/types.js";
import { createSuggest, type SuggestContext, type SuggestResult } from "../src/suggest.js";
import { suggestLocale } from "./fixtures/suggest-locale.js";

const pack: HolidayPack = {
  id: "test-pack",
  entries: [
    { id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas", "xmas"] } },
    { id: "new-year", compute: () => ({ m: 0, d: 1 }), names: { test: ["new year day", "new year"] } },
  ],
};
const sug = createSuggest({ locale: suggestLocale, holidays: [pack] });
// Friday 2026-06-12, 13:00 in Almaty
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("starters — empty input (spec §6)", () => {
  const r = sug.suggest("", CTX);
  test("top five by the blended score, in order", () => {
    expect(texts(r)).toEqual(["tomorrow", "today", "next week", "this weekend", "this week"]);
  });
  test("starters carry resolved dates", () => {
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.suggestions[2]!.isRange).toBe(true); // next week
    expect(r.suggestions[2]!.start.date).toBe("2026-06-14");
    expect(r.suggestions[2]!.end.date).toBe("2026-06-20");
  });
  test("no ghost for empty input", () => {
    expect(r.ghost).toBeNull();
  });
  test("limit is honored", () => {
    expect(sug.suggest("", { ...CTX, limit: 3 }).suggestions).toHaveLength(3);
  });
});

describe("prefix completions + ghost", () => {
  test("'tom' → tomorrow, ghost 'orrow'", () => {
    const r = sug.suggest("tom", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.ghost).toBe("orrow");
  });
  test("'next w' ranks next week above next wednesday", () => {
    const r = sug.suggest("next w", CTX);
    expect(r.suggestions[0]!.text).toBe("next week");
    expect(texts(r)).toContain("next wednesday");
    expect(r.ghost).toBe("eek");
  });
  test("holiday names complete like any vocabulary", () => {
    const r = sug.suggest("chr", CTX);
    expect(r.suggestions[0]!.text).toBe("christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-25");
  });
});

describe("typo-corrected prefixes still complete (spec §6 via §5.2)", () => {
  test("'tomorow' (dropped letter) → tomorrow, but no ghost", () => {
    const r = sug.suggest("tomorow", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.ghost).toBeNull();
  });
  test("'tmrw' goes through the curated typo map", () => {
    const r = sug.suggest("tmrw", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
  });
});

describe("config errors throw (spec §8)", () => {
  test("invalid timezone", () => {
    expect(() => sug.suggest("tom", { ...CTX, timeZone: "Nope/Nope" })).toThrow(/Invalid IANA/);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/core/test/suggest.test.ts`
Expected: FAIL — `../src/suggest.js` does not exist.

- [ ] **Step 4: Write `packages/core/src/suggest.ts`** (complete file as of this task; Tasks 3–4 insert blocks at the marked seam)

```ts
import type { DateExpr, ParseContext } from "./types.js";
import { createEngine, type CreateEngineOptions } from "./engine.js";
import { buildVocabulary } from "./vocab.js";
import { buildCatalog, buildSurfaceIndex, categoryWeight } from "./suggest-catalog.js";
import { normalizeText } from "./normalize.js";
import { buildKeyboardAdjacency, weightedDamerau } from "./typo.js";
import { resolveExpr } from "./resolve.js";
import { validateLocale } from "./lexicon.js";
import { assertValidTimeZone, utcToWall, wallToUtc, type Wall } from "./zoned-date.js";

export interface SuggestContext extends ParseContext {
  /** max suggestions returned (default 5) */
  limit?: number;
}

export interface Suggestion {
  /** full replacement text — canonical where possible, always re-parseable */
  text: string;
  expr: DateExpr;
  start: { utcIso: string; date: string };
  end: { utcIso: string; date: string };
  isRange: boolean;
  score: number;
}

export interface SuggestResult {
  suggestions: Suggestion[];
  /** remaining characters of the top suggestion when it extends the typed input */
  ghost: string | null;
}

export interface SuggestEngine {
  suggest(text: string, ctx: SuggestContext): SuggestResult;
}

// scoring weights (spec §6): prefix 40% + category 25% + proximity 20% + popularity 15%
const W_PREFIX = 0.4;
const W_CATEGORY = 0.25;
const W_PROXIMITY = 0.2;
const W_POPULARITY = 0.15;
const PROXIMITY_HORIZON_DAYS = 60;
const FUZZY_RATIO_PENALTY = 0.7; // typo-matched prefixes count less than typed ones
const DEFAULT_LIMIT = 5;

interface Hit {
  expr: DateExpr;
  text: string;
  /** typed-prefix ratio, already penalized for fuzzy matches; 0 when not a prefix */
  ratio: number;
  popularity: number;
  /** additive boost (range-end bonus) */
  bonus: number;
  resolved: { start: Wall; end: Wall };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (w: Wall) => `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`;
const dayNumber = (w: Wall) => Date.UTC(w.y, w.m, w.d) / 86_400_000;

export function createSuggest(options: CreateEngineOptions): SuggestEngine {
  const { locale, holidays = [] } = options;
  validateLocale(locale);
  const vocab = buildVocabulary(locale, holidays);
  const catalog = buildCatalog(vocab);
  const surfaces = buildSurfaceIndex(vocab);
  const adjacency = locale.keyboard ? buildKeyboardAdjacency(locale.keyboard) : null;
  const engine = createEngine(options); // validates grammar-path completions by re-parsing

  function suggest(text: string, ctx: SuggestContext): SuggestResult {
    assertValidTimeZone(ctx.timeZone); // config error → throws (spec §8)
    const input = normalizeText(text).trim();
    const weekStart = ctx.weekStart ?? locale.defaults.weekStart;
    const dateOrder = ctx.dateOrder ?? locale.defaults.dateOrder;
    const allowPast = ctx.allowPast ?? false;
    const limit = ctx.limit ?? DEFAULT_LIMIT;
    const fmtOpts = { now: ctx.now, timeZone: ctx.timeZone, holidayNames: vocab.holidayNames };
    const resOpts = {
      now: ctx.now, timeZone: ctx.timeZone, weekStart, allowPast,
      holidays: vocab.holidayComputes,
    };
    const today: Wall = { ...utcToWall(ctx.now, ctx.timeZone), h: 0, mi: 0 };
    const resolveOk = (expr: DateExpr) => {
      const r = resolveExpr(expr, resOpts);
      return r.ok ? r.value : null;
    };

    const hits: Hit[] = [];

    // ---- catalog matching: starters (empty input) + typed-prefix completions ----
    const typoExpansion = input === "" ? undefined : locale.typoMap?.[input];
    for (const entry of catalog) {
      const t = locale.format(entry.expr, fmtOpts);
      let ratio: number | null = null;
      if (input === "") ratio = 0;
      else if (t.startsWith(input) && t !== input) ratio = input.length / t.length;
      else if (typoExpansion !== undefined && t === typoExpansion) {
        ratio = (input.length / t.length) * FUZZY_RATIO_PENALTY;
      }
      if (ratio === null) continue;
      const resolved = resolveOk(entry.expr);
      if (!resolved) continue;
      hits.push({ expr: entry.expr, text: t, ratio, popularity: entry.popularity, bonus: 0, resolved });
    }
    // typo-corrected prefixes still complete: weighted keyboard distance against the
    // target's prefixes at input length ±1 (a dropped letter — "tomorow" — is distance 1
    // from the full "tomorrow" but distance 2 from its same-length slice "tomorro")
    if (hits.length === 0 && input.length >= 3 && adjacency) {
      for (const entry of catalog) {
        const t = locale.format(entry.expr, fmtOpts);
        if (t.length <= input.length) continue;
        let dist = Infinity;
        for (const len of [input.length - 1, input.length, input.length + 1]) {
          if (len < 1 || len > t.length) continue;
          dist = Math.min(dist, weightedDamerau(input, t.slice(0, len), adjacency));
        }
        if (dist > 1) continue;
        const resolved = resolveOk(entry.expr);
        if (!resolved) continue;
        hits.push({
          expr: entry.expr, text: t, ratio: (input.length / t.length) * FUZZY_RATIO_PENALTY,
          popularity: entry.popularity, bonus: 0, resolved,
        });
      }
    }

    // [Task 3 inserts the grammar-continuation block here; Task 4 appends fallbacks inside it]

    // ---- score, dedupe, rank ----
    const scored: Suggestion[] = hits.map((h) => {
      const days = Math.max(0, dayNumber(h.resolved.start) - dayNumber(today));
      const proximity = Math.max(0, 1 - days / PROXIMITY_HORIZON_DAYS);
      const score =
        W_PREFIX * h.ratio + W_CATEGORY * categoryWeight(h.expr) +
        W_PROXIMITY * proximity + W_POPULARITY * h.popularity + h.bonus;
      const startDate = dateStr(h.resolved.start);
      const endDate = dateStr(h.resolved.end);
      return {
        text: h.text,
        expr: h.expr,
        start: { utcIso: wallToUtc(h.resolved.start, ctx.timeZone).toISOString(), date: startDate },
        end: { utcIso: wallToUtc(h.resolved.end, ctx.timeZone).toISOString(), date: endDate },
        isRange: startDate !== endDate,
        score,
      };
    });
    scored.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    const seenText = new Set<string>();
    const seenDates = new Set<string>();
    const suggestions: Suggestion[] = [];
    for (const s of scored) {
      const dates = `${s.start.date}|${s.end.date}|${s.isRange}`;
      if (seenText.has(s.text) || seenDates.has(dates)) continue; // one suggestion per meaning
      seenText.add(s.text);
      seenDates.add(dates);
      suggestions.push(s);
      if (suggestions.length >= limit) break;
    }
    const top = suggestions[0];
    const ghost =
      top !== undefined && input !== "" && top.text.startsWith(input) && top.text !== input
        ? top.text.slice(input.length)
        : null;
    return { suggestions, ghost };
  }

  return { suggest };
}
```

(`surfaces` is unused until Task 3 — that's fine, `noUnusedLocals` is not enabled; it becomes load-bearing two commits later.)

- [ ] **Step 5: Add the subpath export to `packages/core/package.json`**

Replace the `exports` and `publishConfig` blocks:
```json
  "exports": {
    ".": "./src/index.ts",
    "./suggest": "./src/suggest.ts"
  },
```
```json
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      },
      "./suggest": {
        "types": "./dist/suggest.d.ts",
        "import": "./dist/suggest.js"
      }
    }
  },
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/core`
Expected: PASS — all core tests including the new suggest file (the grammar-path tests don't exist yet).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): @saywhen/core/suggest — starters, prefix completions, ghost text"
```

---

### Task 3: Grammar continuations + range-building mode

When the catalog can't match ("2 days before chr"), parse the input's head, read the expectation frontier, and complete the trailing fragment with concrete vocabulary surfaces of the expected kinds. Every completion is validated by re-parsing through the private engine — invalid texts (dangling connectors, inverted ranges) drop out for free. After a CONNECTOR only end-anchor kinds are suggested, with a boost for clean period/boundary ends (spec §6 range-building mode).

**Files:**
- Modify: `packages/core/src/suggest.ts`
- Test: `packages/core/test/suggest.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/suggest.test.ts`:
```ts
describe("grammar continuations (expectation frontier → concrete completions)", () => {
  test("'2 days before chr' completes the holiday and keeps the typed shape", () => {
    const r = sug.suggest("2 days before chr", CTX);
    expect(r.suggestions[0]!.text).toBe("2 days before christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-23");
    expect(r.ghost).toBe("istmas");
  });

  test("multi-word phrase completion across the fragment boundary", () => {
    const r = sug.suggest("tomorrow to new ye", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow to new year"); // shortest matching alias wins on ratio
    expect(r.suggestions[0]!.isRange).toBe(true);
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.suggestions[0]!.end.date).toBe("2027-01-01");
    expect(r.ghost).toBe("ar");
  });

  test("expected kinds filter the surfaces: after 'in a' only units complete", () => {
    const r = sug.suggest("in a w", CTX);
    expect(r.suggestions[0]!.text).toBe("in a week");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-19");
    expect(texts(r)).not.toContain("in a wednesday"); // WEEKDAY is not expected after DIRECTION(in)
  });
});

describe("range-building mode after a CONNECTOR (spec §6)", () => {
  test("'tomorrow to' suggests only real range ends", () => {
    const r = sug.suggest("tomorrow to", CTX);
    expect(r.suggestions.length).toBeGreaterThan(0);
    for (const s of r.suggestions) {
      expect(s.text.startsWith("tomorrow to ")).toBe(true);
      expect(s.isRange).toBe(true); // degenerate ends ("tomorrow to tomorrow") are filtered
    }
  });
  test("clean period ends get the boost", () => {
    const r = sug.suggest("tomorrow to", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow to weekend");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/suggest.test.ts`
Expected: FAIL — the new describes get zero suggestions (no grammar path yet).

- [ ] **Step 3: Implement**

In `packages/core/src/suggest.ts`, extend the imports:
```ts
import type { DateExpr, ParseContext, SemKind, SemToken } from "./types.js";
import { buildCatalog, buildSurfaceIndex, categoryWeight, CLOSED_KINDS } from "./suggest-catalog.js";
import { buildGrammar } from "./grammar.js";
import { buildLattice, expandStreams } from "./lattice.js";
import { buildKeyboardAdjacency, correctToken, weightedDamerau } from "./typo.js";
```
(only the named additions change: `SemKind`, `SemToken`, `CLOSED_KINDS`, the two new module imports, `correctToken`.)

Add next to the other scoring constants:
```ts
const RANGE_END_BONUS = 0.1;       // range mode: clean ends (periods, boundaries)
const COMPLETION_POPULARITY = 0.5; // grammar-path completions have no table entry
const MAX_FRAGMENT_MATCHES = 12;   // surface matches tried per fragment split
const MAX_K0_CONTINUATIONS = 24;   // continuations tried after a complete word
const MAX_REPARSE = 24;            // total validation parses per suggest() call

const RANGE_END_KINDS = new Set<SemKind>([
  "WEEKDAY", "RELDAY", "MONTH", "HOLIDAY", "PERIOD", "BOUNDARY", "REL",
]);
```

Add to the `createSuggest` setup, after the `adjacency` line:
```ts
  const grammar = buildGrammar(locale.rules ?? []);
  const lexiconKeys = Object.keys(vocab.lexicon);
```

Replace the seam comment line
```ts
    // [Task 3 inserts the grammar-continuation block here; Task 4 appends fallbacks inside it]
```
with this block:
```ts
    if (input !== "") {
      // ---- grammar continuations: parse the head, complete at the expectation frontier ----
      const tokens = locale.tokenize(input);
      const correct = adjacency
        ? (raw: { text: string; span: [number, number] }) =>
            correctToken(raw.text, lexiconKeys, locale.typoMap, adjacency)
        : undefined;
      let parses = 0;
      const tryCompletion = (completion: string, bonus: number, requireRange: boolean) => {
        if (parses >= MAX_REPARSE) return;
        parses++;
        const r = engine.parse(completion, {
          now: ctx.now, timeZone: ctx.timeZone, weekStart, dateOrder, allowPast,
        });
        const cand = r.candidates[0];
        if (!cand) return;
        if (requireRange && cand.start.date === cand.end.date) return;
        const resolved = resolveOk(cand.expr);
        if (!resolved) return;
        // prefer the locale's canonical rendering when it still completes the typed input
        const canon = locale.format(cand.expr, fmtOpts);
        const final = canon.startsWith(input) ? canon : completion;
        hits.push({
          expr: cand.expr, text: final, ratio: input.length / final.length,
          popularity: COMPLETION_POPULARITY, bonus, resolved,
        });
      };

      const lastToken = tokens[tokens.length - 1];
      const startK = lastToken !== undefined && lastToken.text in vocab.lexicon ? 0 : 1;
      const maxK = Math.min(3, tokens.length - 1);
      for (let k = startK; k <= maxK; k++) {
        const head = tokens.slice(0, tokens.length - k);
        if (k > 0 && head.length === 0) break; // whole-input fragments are the catalog's job
        const cells = buildLattice(head, vocab.lexicon, {
          dateOrder,
          parseNumber: (words: string[]) => locale.parseNumber(words),
          phrases: vocab.phrases,
          ...(correct ? { correct } : {}),
        });
        const kinds = new Set<SemKind>();
        let rangeMode = false;
        for (const stream of expandStreams(cells)) {
          const { expectations } = grammar.parseStream(stream);
          if (expectations.frontier !== stream.length) continue; // this reading broke earlier
          for (const kk of expectations.kinds) kinds.add(kk);
          const lastSem = [...stream].reverse().find((tk: SemToken) => tk.kind !== "FILLER");
          if (lastSem?.kind === "CONNECTOR") rangeMode = true;
        }
        if (kinds.size === 0) continue;
        const isEndKind = (kind: SemKind) => !rangeMode || RANGE_END_KINDS.has(kind);
        const endBonus = (kind: SemKind) =>
          rangeMode && (kind === "PERIOD" || kind === "BOUNDARY") ? RANGE_END_BONUS : 0;
        if (k === 0) {
          let tried = 0;
          for (const kind of CLOSED_KINDS) {
            if (!kinds.has(kind) || !isEndKind(kind)) continue;
            for (const s of surfaces.canonicalByKind.get(kind) ?? []) {
              if (tried >= MAX_K0_CONTINUATIONS) break;
              tried++;
              tryCompletion(`${input} ${s.text}`, endBonus(kind), rangeMode);
            }
          }
        } else {
          const fragment = input.slice(tokens[tokens.length - k]!.span[0]);
          const headText = input.slice(0, tokens[tokens.length - k]!.span[0]);
          let tried = 0;
          for (const s of surfaces.matchable) {
            if (tried >= MAX_FRAGMENT_MATCHES) break;
            if (!kinds.has(s.payload.kind) || !isEndKind(s.payload.kind)) continue;
            if (!s.text.startsWith(fragment) || s.text === fragment) continue;
            tried++;
            tryCompletion(headText + s.text, endBonus(s.payload.kind), rangeMode);
          }
        }
      }

      // [Task 4 appends the fallback block here, inside this if]
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/suggest.test.ts`
Expected: PASS. Why the tricky ones hold:
1. "tomorrow to new ye" — the k=2 split's head `[tomorrow, to]` fails exactly at frontier 2 with anchor kinds and a trailing CONNECTOR (range mode). Both phrases "new year day" and "new year" match the fragment; they resolve to the same dates, so the date-dedupe keeps the higher-scored one — "tomorrow to new year" wins on prefix ratio (18/20 vs 18/24).
2. "in a w" — the head `[in, a]` expects only NUMBER/UNIT, so "wednesday" (WEEKDAY) never fires; "weeks"/"wk" lost canonical-spelling selection to "week" in the surface index, so no plural/abbreviation noise.
3. "tomorrow to" — `requireRange` drops "tomorrow to tomorrow" (start === end), the resolver's "Range ends before it starts" throw drops "tomorrow to today"/"yesterday", and "tomorrow to weekend" tops the list: range category 0.5 for every completion, but the PERIOD end carries the +0.1 bonus (0.4·11/19 + 0.125 + 0.197 + 0.075 + 0.1 ≈ 0.728 vs ≈0.62 for weekday ends).

- [ ] **Step 5: Run the full core suite (no regressions)**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): suggest grammar continuations and range-building mode"
```

---

### Task 4: Fallbacks (bare number, weekday/month prefix, time-like)

Spec §6: when fewer than 2 hits — bare number → "Nth" + next month's Nth; weekday prefix → this AND next weekday; month prefix → "Month 1"; time-like token → "today/tomorrow at T".

**Files:**
- Modify: `packages/core/src/suggest.ts`
- Test: `packages/core/test/suggest.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/suggest.test.ts`:
```ts
describe("fallbacks when completions run dry (spec §6)", () => {
  test("bare day number: '15' → the 15th and next month's 15th", () => {
    const r = sug.suggest("15", CTX);
    expect(texts(r)).toContain("the 15th");
    expect(texts(r)).toContain("july 15");
    expect(r.suggestions.find((s) => s.text === "the 15th")!.start.date).toBe("2026-06-15");
    expect(r.suggestions.find((s) => s.text === "july 15")!.start.date).toBe("2026-07-15");
  });

  test("weekday prefix: 'fri' → friday and next friday", () => {
    const r = sug.suggest("fri", CTX);
    expect(texts(r)).toContain("friday");
    expect(texts(r)).toContain("next friday");
  });

  test("month prefix: 'ja' → january and january 1", () => {
    const r = sug.suggest("ja", CTX);
    expect(texts(r)).toContain("january");
    expect(texts(r)).toContain("january 1");
  });

  test("time-like: '5pm' → today/tomorrow at 5pm", () => {
    const r = sug.suggest("5pm", CTX);
    expect(texts(r)).toEqual(expect.arrayContaining(["today at 5pm", "tomorrow at 5pm"]));
    expect(r.suggestions.find((s) => s.text === "today at 5pm")!.start.date).toBe("2026-06-12");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/suggest.test.ts`
Expected: FAIL — '15' and '5pm' produce no suggestions; 'fri'/'ja' miss the second variant.

- [ ] **Step 3: Implement**

In `packages/core/src/suggest.ts`, replace the seam comment
```ts
      // [Task 4 appends the fallback block here, inside this if]
```
with:
```ts
      // ---- fallbacks (spec §6) — only when completions ran dry ----
      if (hits.length < 2) {
        const addExpr = (expr: DateExpr, popularity: number) => {
          const resolved = resolveOk(expr);
          if (!resolved) return;
          const t = locale.format(expr, fmtOpts);
          if (t === input) return;
          const ratio = t.startsWith(input) ? input.length / t.length : 0;
          hits.push({ expr, text: t, ratio, popularity, bonus: 0, resolved });
        };
        // bare day-of-month → this occurrence + next month's
        if (/^\d{1,2}$/.test(input)) {
          const n = Number(input);
          if (n >= 1 && n <= 31) {
            addExpr({ type: "anchor", anchor: { kind: "calendar", d: n } }, 0.45);
            addExpr({ type: "anchor", anchor: { kind: "calendar", m: (today.m + 1) % 12, d: n } }, 0.4);
          }
        }
        // weekday prefix → this AND next weekday; month prefix → "Month 1"
        if (/^[^\s\d]{2,}$/.test(input)) {
          for (const s of surfaces.matchable) {
            if (!s.text.startsWith(input)) continue;
            if (s.payload.kind === "WEEKDAY") {
              addExpr({ type: "anchor", anchor: { kind: "weekday", day: s.payload.day } }, 0.45);
              addExpr(
                { type: "anchor", anchor: { kind: "weekday", day: s.payload.day, which: "next" } },
                0.45,
              );
            } else if (s.payload.kind === "MONTH") {
              addExpr({ type: "anchor", anchor: { kind: "calendar", m: s.payload.month, d: 1 } }, 0.4);
            }
          }
        }
        // time-like input → today/tomorrow at that time
        let time: { h: number; m: number } | null = null;
        const hm = /^(\d{1,2}):(\d{2})$/.exec(input);
        const first = tokens[0];
        const second = tokens[1];
        if (hm) {
          time = { h: Number(hm[1]), m: Number(hm[2]) };
        } else if (tokens.length === 1 && first) {
          const p = (vocab.lexicon[first.text] ?? []).find((pl) => pl.kind === "TIME");
          if (p && p.kind === "TIME") time = { h: p.h, m: p.m };
        } else if (tokens.length === 2 && first && second && /^\d{1,2}$/.test(first.text)) {
          const mer = (vocab.lexicon[second.text] ?? []).find((pl) => pl.kind === "MERIDIEM");
          const h = Number(first.text);
          if (mer && mer.kind === "MERIDIEM" && h >= 1 && h <= 12) {
            time = mer.value === "pm"
              ? { h: h === 12 ? 12 : h + 12, m: 0 }
              : { h: h === 12 ? 0 : h, m: 0 };
          }
        }
        if (time !== null && time.h <= 23 && time.m <= 59) {
          const t = time;
          const at = (offset: number): DateExpr =>
            ({ type: "withTime", base: { type: "anchor", anchor: { kind: "relday", offset } }, time: t });
          addExpr(at(0), 0.45);
          addExpr(at(1), 0.45);
        }
      }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core`
Expected: PASS — full core suite. Notes: "fri" matches only the canonical surface "friday" (the "fri" key lost canonical selection), and the catalog's own "friday" hit dedupes with the fallback's by text. "5pm" tokenizes to `["5","pm"]`, the grammar path finds no completion (MERIDIEM surfaces are skipped), so the time fallback fires.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): suggest fallbacks — bare numbers, weekday/month prefixes, times"
```

---

### Task 5: Real-locale e2e — locale-en and locale-ru

Prove the engine-locale contract end-to-end: the same semantic catalog renders as English and Russian, the subpath import works from workspace packages, and inflected Russian phrase aliases complete mid-expression.

**Files:**
- Test: `packages/locale-en/test/suggest.test.ts`, `packages/locale-ru/test/suggest.test.ts`

- [ ] **Step 1: Write the EN tests**

`packages/locale-en/test/suggest.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { en } from "../src/index.js";

const sug = createSuggest({ locale: en });
// Friday 2026-06-12, 04:00 in New York
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (en)", () => {
  test("starters: the blended-score top five", () => {
    expect(texts(sug.suggest("", CTX)))
      .toEqual(["tomorrow", "today", "next week", "this weekend", "this week"]);
  });

  test("'tom' → tomorrow with ghost", () => {
    const r = sug.suggest("tom", CTX);
    expect(r.suggestions[0]!.text).toBe("tomorrow");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
    expect(r.ghost).toBe("orrow");
  });

  test("'next w' → next week first, next wednesday offered", () => {
    const r = sug.suggest("next w", CTX);
    expect(r.suggestions[0]!.text).toBe("next week");
    expect(texts(r)).toContain("next wednesday");
  });

  test("'in a w' → in a week (canonical unit only)", () => {
    const r = sug.suggest("in a w", CTX);
    expect(r.suggestions[0]!.text).toBe("in a week");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-19");
  });

  test("fallbacks: bare number, weekday prefix, time", () => {
    expect(texts(sug.suggest("15", CTX))).toEqual(expect.arrayContaining(["the 15th", "july 15"]));
    expect(texts(sug.suggest("fri", CTX))).toEqual(expect.arrayContaining(["friday", "next friday"]));
    expect(texts(sug.suggest("5pm", CTX)))
      .toEqual(expect.arrayContaining(["today at 5pm", "tomorrow at 5pm"]));
  });
});
```

- [ ] **Step 2: Write the RU tests**

`packages/locale-ru/test/suggest.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import type { HolidayPack } from "@saywhen/core";
import { ru } from "../src/index.js";

const pack: HolidayPack = {
  id: "ru-test",
  entries: [{
    id: "victory-day",
    compute: () => ({ m: 4, d: 9 }),
    names: { ru: ["день победы", "дня победы"] }, // nominative + genitive, like holidays-ru
  }],
};
const sug = createSuggest({ locale: ru, holidays: [pack] });
// Friday 2026-06-12, 11:00 in Moscow
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (ru)", () => {
  test("starters render in Russian, tomorrow first", () => {
    const r = sug.suggest("", CTX);
    expect(r.suggestions).toHaveLength(5);
    expect(r.suggestions[0]!.text).toBe("завтра");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
  });

  test("'за' → завтра with ghost", () => {
    const r = sug.suggest("за", CTX);
    expect(r.suggestions[0]!.text).toBe("завтра");
    expect(r.ghost).toBe("втра");
  });

  test("'следующая н' → следующая неделя", () => {
    const r = sug.suggest("следующая н", CTX);
    expect(r.suggestions[0]!.text).toBe("следующая неделя");
    expect(r.ghost).toBe("еделя");
  });

  test("holiday starter by prefix: 'день п' → день победы", () => {
    const r = sug.suggest("день п", CTX);
    expect(r.suggestions[0]!.text).toBe("день победы");
    expect(r.suggestions[0]!.start.date).toBe("2027-05-09"); // May 9 2026 already passed
    expect(r.ghost).toBe("обеды");
  });

  test("inflected phrase alias completes mid-expression", () => {
    const r = sug.suggest("2 недели после дня п", CTX);
    expect(r.suggestions[0]!.text).toBe("2 недели после дня победы");
    expect(r.suggestions[0]!.start.date).toBe("2027-05-23");
  });
});
```

- [ ] **Step 3: Run to verify**

Run: `pnpm vitest run packages/locale-en/test/suggest.test.ts packages/locale-ru/test/suggest.test.ts`
Expected: PASS. (These need no implementation work — they prove the Task 2–4 engine against real locales. If the subpath import fails to resolve, re-run `pnpm install` so the workspace re-links the new export.)

- [ ] **Step 4: Commit**

```bash
git add packages/locale-en/test/suggest.test.ts packages/locale-ru/test/suggest.test.ts
git commit -m "test(locales): suggest e2e for en and ru"
```

---

### Task 6: Holiday-pack e2e — suggestions over @saywhen/holidays-us

Holiday packs contribute starters and completions automatically (spec §6) — proven against the real US pack.

**Files:**
- Test: `packages/holidays-us/test/suggest.test.ts`

- [ ] **Step 1: Write the tests**

`packages/holidays-us/test/suggest.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { us } from "../src/index.js";

const sug = createSuggest({ locale: en, holidays: [us] });
// Friday 2026-06-12, 04:00 in New York
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e with the US holiday pack", () => {
  test("the core table still tops empty input", () => {
    expect(sug.suggest("", CTX).suggestions[0]!.text).toBe("tomorrow");
  });

  test("'jun' offers the month and the nearby holiday", () => {
    const r = sug.suggest("jun", CTX);
    expect(r.suggestions[0]!.text).toBe("june");
    expect(texts(r)).toContain("juneteenth");
  });

  test("'thanks' → thanksgiving with ghost and the right date", () => {
    const r = sug.suggest("thanks", CTX);
    expect(r.suggestions[0]!.text).toBe("thanksgiving");
    expect(r.suggestions[0]!.start.date).toBe("2026-11-26");
    expect(r.ghost).toBe("giving");
  });

  test("holiday completes mid-expression: '2 days before chris'", () => {
    const r = sug.suggest("2 days before chris", CTX);
    expect(r.suggestions[0]!.text).toBe("2 days before christmas");
    expect(r.suggestions[0]!.start.date).toBe("2026-12-23");
  });

  test("range mode completes holiday phrases: 'christmas to new'", () => {
    const r = sug.suggest("christmas to new", CTX);
    expect(r.suggestions[0]!.text).toBe("christmas to new year");
    expect(r.suggestions[0]!.isRange).toBe(true);
    expect(r.suggestions[0]!.start.date).toBe("2026-12-25");
    expect(r.suggestions[0]!.end.date).toBe("2027-01-01");
    expect(r.ghost).toBe(" year");
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `pnpm vitest run packages/holidays-us/test/suggest.test.ts`
Expected: PASS. ("christmas to new" range-resolves exactly like plan 04's "christmas to new year" e2e; the completion path adds the new-year's-eve variants too, but "christmas to new year" wins on prefix ratio.)

- [ ] **Step 3: Commit**

```bash
git add packages/holidays-us/test/suggest.test.ts
git commit -m "test(holidays-us): holiday starters and completions through suggest"
```

---

### Task 7: Build wiring + full verification

**Files:**
- Modify: `packages/core/tsdown.config.ts`

- [ ] **Step 1: Add the second build entry**

`packages/core/tsdown.config.ts` becomes:
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/suggest.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  fixedExtension: false, // package is type:module → emit .js/.d.ts
});
```

- [ ] **Step 2: Full verification**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected:
- vitest: all suites pass (≈615 tests) + 1 ORACLE-gated skip.
- typecheck: clean across `packages/*` and `tools/*`.
- build: core dist now contains `index.js`, `suggest.js` (+ shared chunks), and both `.d.ts` files.

- [ ] **Step 3: Dist smoke checks**

```bash
node --input-type=module -e "const m = await import('./packages/core/dist/index.js'); if (typeof m.createEngine !== 'function') throw new Error('dist missing createEngine'); console.log('core dist OK');"
node --input-type=module -e "const m = await import('./packages/core/dist/suggest.js'); if (typeof m.createSuggest !== 'function') throw new Error('dist missing createSuggest'); console.log('core/suggest dist OK');"
```
Expected: both print OK.

- [ ] **Step 4: Commit**

```bash
git add packages/core/tsdown.config.ts
git commit -m "build(core): emit the ./suggest subpath entry"
git status --short   # should be clean; commit anything left over with an appropriate message
```

---

## Done — definition of success for plan 05

- `@saywhen/core/suggest` ships as a separate subpath export (spec §6: parse-only consumers never load it); dist emits both entries.
- **Starters** come from a language-free semantic popularity table (spec's example values: RELDAY(+1) 0.95, PERIOD(week, next) 0.9), rendered per-locale via `locale.format`, with holiday packs contributing automatically — proven in en, ru, and against the real US pack.
- **Completions are grammar expectations**: the head parses up to the frontier, expected kinds filter concrete vocabulary surfaces, and every completion is validated by re-parsing — correct by construction. Typo-corrected prefixes still complete (curated map + weighted keyboard distance).
- **Ghost text** = remaining characters of the top-ranked suggestion when it literally extends the input.
- **Scoring** is the spec blend: prefix 40% + category 25% + proximity 20% + popularity 15% — with the empty-input ordering hand-verified against the standard clock.
- **Range-building mode** after a CONNECTOR restricts to end anchors, filters degenerate/inverted ranges, and boosts clean period/boundary ends.
- **Fallbacks** cover bare numbers ("15" → the 15th / july 15), weekday prefixes (this + next), month prefixes ("Month 1"), and time-like input ("today/tomorrow at 5pm").
- Inflected Russian phrase aliases complete mid-expression ("2 недели после дня п" → "…дня победы"), and the canonical-polish rule rewrites completions to the formatter's spelling whenever that still extends the typed input.

**Known gaps, deliberate (record, don't fix here):**
- Ghost text only appears for literal prefix extensions — a typo-corrected match suggests the right text but ghosts nothing (can't splice corrected characters into the user's raw input).
- Non-canonical single-word aliases don't complete as fragments ("xm" won't offer "xmas" — but "chr" offers "christmas"); canonical spellings won the surface index on purpose to avoid plural/abbreviation noise ("in a wk").
- The k=0 continuation budget (24 tries, small families first) can cut MONTH and large holiday enumerations after a complete word; catalog prefix matching covers holidays in practice.
- Range mode enumerates single-word ends at k=0 ("tomorrow to end" can't produce "end of month"); typed prefixes complete fine ("tomorrow to end of mo" → "…end of month").
- `suggest()` re-parses up to 24 candidate completions per call (≈10 ms worst case on this machine's 0.43 ms p99 parse) — debouncing is the controller's job (plan 06).
- The popularity table is static v1 — no usage learning, no per-app overrides (a future `CreateSuggestOptions` extension point).

**Out of scope (later plans):** controller/react/registry/playground (06) — including wiring `SuggestEngine` into the input state machine and ghost-text UI.
