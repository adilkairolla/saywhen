# saywhen Plan 04 — Holiday Packs (@saywhen/holidays-us, @saywhen/holidays-ru) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two v1 holiday packs (US and RU) per spec §4.5 — date rules + per-language name lexicons — so "thanksgiving", "день победы", "пасха 2028", and "день благодарения" (Russian speaker, US holidays) all parse, resolve, roll forward, and round-trip through `candidate.text`.

**Architecture:** Packs are ~95% data: each entry is `{ id, compute(year), names: { localeId: aliases[] } }`. The engine already merges names into the lexicon and the resolver already computes + rolls forward (plan 01). What's missing in core is small and this plan adds it: (1) **multi-word name support** — the lexicon is keyed per raw token, so "день победы" / "new year's day" need a lattice *phrase merge* (same pattern as plan 02's compound-number merge); (2) **display names in formatters** — `candidate.text` must say "thanksgiving"/"день победы", not the AST id, or holiday candidates break the round-trip contract; (3) the **bare-unit offset rule** ("in a week", "через месяц") promised "alongside plan 04" in the plan-02/03 known-gaps notes.

**Tech Stack:** existing pnpm/TS/Vitest 3 monorepo; no new dependencies anywhere. New packages mirror locale-ru's scaffold (peer-dep on core, tsdown build). Computus (Easter) algorithms are pure arithmetic; `Date.UTC` is used only for weekday/overflow math inside packs (built-in, zero-dep).

**This is plan 4 of 6** (series in `2026-06-12-saywhen-01-core-engine.md`; 01–03 executed and merged — 454 tests green). Plan 05 = core/suggest, 06 = controller/react/registry/playground.

**Conventions (same as plans 01–03):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- Standard clock: Friday `2026-06-12T08:00:00Z`. EN tests use `America/New_York` (04:00 EDT), RU tests `Europe/Moscow` (11:00 MSK). `m` is 0-based month everywhere (entry `compute` returns 0-based `m` too).
- Env quirk on this machine: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## Core facts the engineer needs (verified against current main)

- `packages/core/src/engine.ts` already: validates pack shape (throws on malformed), collects `entry.compute` into a `Map` passed to the resolver, and merges `entry.names[locale.id]` into a lexicon copy. **Bug this plan fixes:** it merges every alias as ONE lexicon key — `lexicon["день победы"]` — which the tokenizer can never produce (it emits per-word tokens), so only single-word names currently work.
- `packages/core/src/resolve.ts` `case "holiday"`: explicit year → `compute(year)`, throws "No date for holiday …" when compute returns null; no year → tries `today.y` then `today.y + 1`, returns the first computed date `>= today` (today itself counts). Range ends re-anchor `today`, so "christmas to new year" lands on Jan 1 *after* Dec 25.
- `packages/core/src/grammar.ts` `holidayA` = `HOLIDAY + opt(YEAR)`, specificity 1. Grammar requires full stream consumption; FILLER is skippable between elements. `inP` = `DIRECTION(in) + NUMBER + UNIT` — there is NO bare-unit variant yet (that's Task 1).
- `classifyDigits` (lattice.ts) reads a 4-digit integer 1900–2100 as YEAR. So "пасха 2100" produces `HOLIDAY YEAR(2100)` — and 2100 is exactly where the Orthodox computus's +13-day shift stops being valid → the null path is reachable end-to-end.
- `buildLattice(rawTokens, lexicon, opts)` builds one cell per raw token (digit shapes → lexicon → typo-correct → LITERAL), then `mergeNumberWords` when `opts.parseNumber` is set. Phrase merging (Task 2) slots in right before number merging. `LatticeCell = { raw: RawToken, alternatives: SemToken[][] }`; `sem(payload, raw, confidence)` is the cell-token helper already in that file.
- Typo correction (engine) matches unknown tokens against `Object.keys(lexicon)` — single-word holiday aliases get typo correction for free once merged; multi-word phrases do NOT (documented gap).
- `FormatOptions` is `{ now: Date; timeZone: string }` — Task 3 adds optional `holidayNames`. Both locale formatters currently emit the raw id for holiday anchors with a `// names: plan 04` comment at the `case "holiday"` lines.
- `normalizeText` does NFKC + lowercase + dash/quote folding (’ → '). locale-en's TOKEN_RE keeps apostrophe words whole (`[a-z]+(?:'[a-z]+)?` → "year's" is one token). Phrase token lists must therefore be built with `locale.tokenize(normalizeText(alias))` — never `.split(" ")`.
- locale-en FILLERS include "a"/"an" (so "in a week" is `DIRECTION FILLER UNIT`); locale-ru UNIT_FORMS week = `["неделя","недели","неделю","недель","неделе","нед"]`, month = `["месяц","месяца","месяцев","месяце","мес"]`; ru "год/года/году/г" carry UNIT **and** FILLER payloads (lattice streams both; the FILLER stream dies on the dangling "через", so "через год" parses exactly once).
- `packages/core/test/fixtures/test-locale.ts` (`testLocale`, id `"test"`): "new" is unknown (LITERAL), "year"/"week" are UNITs, "before" is DIRECTION — good raw material for phrase tests. `toks` fixture (grammar tests) has `dir(...)`, `unit(...)`, `num(...)`, `filler()`.
- Engine entry-id rule (document, don't enforce): `entry.id` is global across packs — `holidayComputes` is last-write-wins. Two packs may share an id ONLY when the rule is identical (both packs define `new-year` = Jan 1, deliberately); otherwise ids must differ (`christmas` Dec 25 vs `orthodox-christmas` Jan 7).

## File structure (created/modified by this plan)

```
packages/holidays-us/package.json        CREATE  scaffold (Task 0)
packages/holidays-us/tsconfig.json       CREATE  (Task 0)
packages/holidays-us/tsdown.config.ts    CREATE  (Task 0)
packages/holidays-us/src/index.ts        CREATE  date rules + entries + names (Task 4)
packages/holidays-us/test/compute.test.ts CREATE pure rule tests incl. computus table (Task 4)
packages/holidays-us/test/e2e.test.ts    CREATE  en engine + ru-cross-language e2e (Task 4)
packages/holidays-ru/package.json        CREATE  scaffold (Task 0)
packages/holidays-ru/tsconfig.json       CREATE  (Task 0)
packages/holidays-ru/tsdown.config.ts    CREATE  (Task 0)
packages/holidays-ru/src/index.ts        CREATE  rules + Orthodox computus (Task 5)
packages/holidays-ru/test/compute.test.ts CREATE (Task 5)
packages/holidays-ru/test/e2e.test.ts    CREATE  ru engine + en-cross-language e2e (Task 5)
packages/core/src/grammar.ts             MODIFY  bare-unit offset rule (Task 1)
packages/core/test/grammar.test.ts       MODIFY  append describe (Task 1)
packages/locale-en/test/e2e.test.ts      MODIFY  append describe (Task 1)
packages/locale-ru/test/e2e.test.ts      MODIFY  append describe (Task 1)
packages/core/src/lattice.ts             MODIFY  PhraseEntry + mergePhrases (Task 2)
packages/core/test/lattice.test.ts       MODIFY  append describe (Task 2)
packages/core/src/engine.ts              MODIFY  phrase/lexicon split + holidayNames (Tasks 2–3)
packages/core/test/engine.test.ts        MODIFY  append describe (Task 2)
packages/core/src/types.ts               MODIFY  FormatOptions.holidayNames (Task 3)
packages/locale-en/src/index.ts          MODIFY  thread holiday names (Task 3)
packages/locale-ru/src/index.ts          MODIFY  thread holiday names (Task 3)
packages/locale-en/test/holiday-format.test.ts CREATE (Task 3)
packages/locale-ru/test/holiday-format.test.ts CREATE (Task 3)
packages/core/test/deps.test.ts          MODIFY  guard covers holiday packs (Task 6)
```

---

### Task 0: Scaffold both packages

**Files:**
- Create: `packages/holidays-us/package.json`, `packages/holidays-us/tsconfig.json`, `packages/holidays-us/tsdown.config.ts`
- Create: `packages/holidays-ru/package.json`, `packages/holidays-ru/tsconfig.json`, `packages/holidays-ru/tsdown.config.ts`

- [ ] **Step 1: Write the six files**

`packages/holidays-us/package.json`:
```json
{
  "name": "@saywhen/holidays-us",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  },
  "peerDependencies": {
    "@saywhen/core": "workspace:*"
  },
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/locale-en": "workspace:*",
    "@saywhen/locale-ru": "workspace:*"
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/holidays-ru/package.json` — identical except `"name": "@saywhen/holidays-ru"`.

Both `tsconfig.json` files (identical):
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Both `tsdown.config.ts` files (identical):
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  fixedExtension: false, // package is type:module → emit .js/.d.ts
});
```

- [ ] **Step 2: Link the workspace**

Run: `pnpm install`
Expected: both packages appear in the workspace; no errors. (Root `build`/`typecheck` scripts pick them up automatically via the `./packages/*` filters.)

- [ ] **Step 3: Commit**

```bash
git add packages/holidays-us packages/holidays-ru pnpm-lock.yaml
git commit -m "chore(holidays): scaffold holidays-us and holidays-ru packages"
```

---

### Task 1: Core grammar — bare-unit offsets ("in a week", "через месяц")

Closes the gap recorded in plans 02 and 03: `inP` requires an explicit NUMBER, so "in a week" / "через месяц" don't parse. New rule: `DIRECTION(in) + UNIT` → `offset n=1 from now` (FILLER between them is already skippable, which is what absorbs English "a"). No formatter change needed — both locales already emit "in 1 week" / "через 1 неделю" for n=1, which re-parses via the existing numbered rule.

**Files:**
- Modify: `packages/core/src/grammar.ts`
- Test: `packages/core/test/grammar.test.ts`, `packages/locale-en/test/e2e.test.ts`, `packages/locale-ru/test/e2e.test.ts`

- [ ] **Step 1: Write the failing grammar tests**

Append to `packages/core/test/grammar.test.ts`:
```ts
describe("bare-unit offset: 'in a week' (no explicit number)", () => {
  test("DIRECTION(in) + UNIT → offset n=1 from now", () => {
    expect(exprs([toks.dir("in"), toks.unit("week")])).toEqual([
      { type: "offset", base: { type: "anchor", anchor: { kind: "now" } }, n: 1, unit: "week", dir: 1 },
    ]);
  });
  test("filler between is skipped: 'in a week'", () => {
    expect(exprs([toks.dir("in"), toks.filler(), toks.unit("week")])).toHaveLength(1);
  });
  test("does not double-fire when a number is present", () => {
    expect(exprs([toks.dir("in"), toks.num(2), toks.unit("week")])).toEqual([
      { type: "offset", base: { type: "anchor", anchor: { kind: "now" } }, n: 2, unit: "week", dir: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar.test.ts`
Expected: FAIL — the first test returns `[]` (no parse).

- [ ] **Step 3: Implement the rule**

In `packages/core/src/grammar.ts`, directly below the `inP` definition, add:
```ts
  // "in a week" / "через месяц" — bare unit, n = 1 (the article is FILLER)
  const inBareP: P = map(seq(tok("DIRECTION", (d) => d.dir === "in"), tok("UNIT")), ([, u]) =>
    A({ type: "offset", base: NOW, n: 1, unit: u.unit, dir: 1 }, 0.9),
  );
```
and add `inBareP` to the `primaryP` alternatives, right after `inP`:
```ts
  const primaryP: P = alt(
    anchorP, relPeriodP, barePeriodP, lookP, inP, inBareP, agoP, relOffsetP, boundaryP,
  );
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core`
Expected: PASS — new tests green, no regressions (the numbered case keeps exactly one parse because `inBareP` demands UNIT immediately after the direction and fails on NUMBER).

- [ ] **Step 5: Add the locale e2e coverage**

Append to `packages/locale-en/test/e2e.test.ts`:
```ts
describe("bare-unit offsets (plan 04 closes the plan-02 gap)", () => {
  test.each([
    ["in a week", "2026-06-19"],
    ["in a month", "2026-07-12"],
    ["in a year", "2027-06-12"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});
```

Append to `packages/locale-ru/test/e2e.test.ts`:
```ts
describe("bare-unit offsets (plan 04 closes the plan-03 gap)", () => {
  test.each([
    ["через неделю", "2026-06-19"],
    ["через месяц", "2026-07-12"],
    ["через год", "2027-06-12"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/locale-en/test/e2e.test.ts packages/locale-ru/test/e2e.test.ts`
Expected: PASS. ("через год" parses exactly once: the FILLER reading of "год" leaves "через" unconsumed and dies; the UNIT reading matches `inBareP`.)

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/locale-en packages/locale-ru
git commit -m "feat(core): bare-unit offsets — 'in a week' / 'через месяц'"
```

---

### Task 2: Core lattice — multi-word lexicon phrases (holiday names)

The engine merges holiday aliases for the active locale into the lexicon, but multi-word aliases need to match a SEQUENCE of raw tokens. Mirror of plan 02's `mergeNumberWords`: a phrase table is matched greedily (longest first) against consecutive raw-token texts, and a match replaces those cells with one merged cell carrying the phrase payload. Replacement (not an added alternative) is deliberate — the lattice is linear, and every realistic alias contains at least one word that would otherwise be LITERAL and kill the parse anyway. Where an alias is made entirely of vocabulary ("fourth of july" = ordinal + filler + month), the phrase wins and resolves to the same date the calendar reading would have.

**Files:**
- Modify: `packages/core/src/lattice.ts`, `packages/core/src/engine.ts`
- Test: `packages/core/test/lattice.test.ts`, `packages/core/test/engine.test.ts`

- [ ] **Step 1: Write the failing lattice tests**

Append to `packages/core/test/lattice.test.ts`:
```ts
describe("mergePhrases — multi-word lexicon phrases (holiday names)", () => {
  const phrases = [
    { tokens: ["new", "year"], payload: { kind: "HOLIDAY", id: "new-year" } as const },
    { tokens: ["new", "year", "day"], payload: { kind: "HOLIDAY", id: "new-year" } as const },
  ];

  test("a matching run merges into one HOLIDAY cell with a joined span", () => {
    const cells = buildLattice(testLocale.tokenize("new year"), testLocale.lexicon, { phrases });
    expect(cells).toHaveLength(1);
    expect(cells[0]!.raw.span).toEqual([0, 8]);
    expect(cells[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "HOLIDAY", id: "new-year", source: "new year", confidence: 1 })],
    ]);
  });

  test("longest phrase wins at a position", () => {
    const cells = buildLattice(testLocale.tokenize("new year day"), testLocale.lexicon, { phrases });
    expect(cells).toHaveLength(1);
    expect(cells[0]!.alternatives[0]![0]!).toMatchObject({ kind: "HOLIDAY", source: "new year day" });
  });

  test("non-matching neighbors keep their own cells", () => {
    const cells = buildLattice(testLocale.tokenize("before new year"), testLocale.lexicon, { phrases });
    expect(cells).toHaveLength(2);
    expect(cells[0]!.alternatives[0]![0]!.kind).toBe("DIRECTION");
    expect(cells[1]!.alternatives[0]![0]!).toMatchObject({ kind: "HOLIDAY", id: "new-year" });
  });

  test("no phrases option → unchanged behavior", () => {
    const cells = buildLattice(testLocale.tokenize("new year"), testLocale.lexicon);
    expect(cells).toHaveLength(2); // "new" LITERAL + "year" UNIT
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/lattice.test.ts`
Expected: FAIL — TS error: `phrases` is not a known option (run via vitest; it surfaces as a transform/type failure) or the first assertion sees 2 cells.

- [ ] **Step 3: Implement in `packages/core/src/lattice.ts`**

Add to `LatticeOptions`:
```ts
export interface PhraseEntry {
  /** raw-token texts produced by the locale tokenizer for the phrase, in order */
  tokens: string[];
  payload: SemPayload;
}

export interface LatticeOptions {
  /** returns a corrected lexicon key for an unknown word, or null */
  correct?: (raw: RawToken) => CorrectionHit | null;
  dateOrder?: "MDY" | "DMY" | "YMD";
  /** locale compound-number reader; enables merging adjacent number-word cells */
  parseNumber?: (words: string[]) => number | null;
  /** multi-word surface phrases (holiday names) merged into single cells before number merging */
  phrases?: PhraseEntry[];
}
```

Replace the final return of `buildLattice` (currently `return opts.parseNumber ? mergeNumberWords(cells, opts.parseNumber) : cells;`) with:
```ts
  const phrased = opts.phrases?.length ? mergePhrases(cells, opts.phrases) : cells;
  return opts.parseNumber ? mergeNumberWords(phrased, opts.parseNumber) : phrased;
```

Add below `buildLattice`:
```ts
/**
 * Merge runs of cells whose raw texts match a phrase (longest match wins).
 * The merged cell REPLACES the run — phrases are expected to contain at least
 * one word that has no standalone vocabulary meaning, so no reading is lost.
 */
export function mergePhrases(cells: LatticeCell[], phrases: PhraseEntry[]): LatticeCell[] {
  const out: LatticeCell[] = [];
  let i = 0;
  while (i < cells.length) {
    let best: PhraseEntry | null = null;
    for (const ph of phrases) {
      if (ph.tokens.length < 2 || i + ph.tokens.length > cells.length) continue;
      if (!ph.tokens.every((t, k) => cells[i + k]!.raw.text === t)) continue;
      if (!best || ph.tokens.length > best.tokens.length) best = ph;
    }
    if (best) {
      const slice = cells.slice(i, i + best.tokens.length);
      const raw: RawToken = {
        text: slice.map((c) => c.raw.text).join(" "),
        span: [slice[0]!.raw.span[0], slice[slice.length - 1]!.raw.span[1]],
      };
      out.push({ raw, alternatives: [[sem(best.payload, raw)]] });
      i += best.tokens.length;
    } else {
      out.push(cells[i]!);
      i++;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify the lattice tests pass**

Run: `pnpm vitest run packages/core/test/lattice.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing engine test**

Append to `packages/core/test/engine.test.ts`:
```ts
describe("multi-word holiday names (phrase merge)", () => {
  const pack: HolidayPack = {
    id: "phrase-pack",
    entries: [{
      id: "new-year",
      compute: () => ({ m: 0, d: 1 }),
      names: { test: ["new year day", "new year"] },
    }],
  };
  const eng = createEngine({ locale: testLocale, holidays: [pack] });

  test("a multi-word name parses as one holiday anchor and rolls forward", () => {
    const r = eng.parse("new year day", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.expr).toEqual({ type: "anchor", anchor: { kind: "holiday", id: "new-year" } });
    expect(r.candidates[0]!.start.date).toBe("2027-01-01"); // Jan 1 2026 already passed
  });

  test("phrases compose with the grammar: year pin and range end", () => {
    expect(eng.parse("new year 2030", CTX).candidates[0]!.start.date).toBe("2030-01-01");
    const range = eng.parse("tomorrow to new year", CTX);
    expect(range.candidates[0]!.start.date).toBe("2026-06-13");
    expect(range.candidates[0]!.end.date).toBe("2027-01-01");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm vitest run packages/core/test/engine.test.ts`
Expected: FAIL — "new year day" is invalid (three separate tokens; "new" is LITERAL).

- [ ] **Step 7: Wire phrases through `packages/core/src/engine.ts`**

Update the import from lattice:
```ts
import { buildLattice, expandStreams, type PhraseEntry } from "./lattice.js";
```

Replace the holiday-merge block in `createEngine` (the `const lexicon … }` loop) with:
```ts
  // merge holiday vocabulary for THIS locale (spec §4.5): single-word aliases become
  // lexicon entries (and get typo correction for free); multi-word aliases become
  // phrase entries merged in the lattice. Tokenize aliases with the locale tokenizer
  // so phrase tokens match user input exactly ("new year's day" → ["new","year's","day"]).
  const lexicon: Lexicon = { ...locale.lexicon };
  const phrases: PhraseEntry[] = [];
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
    }
  }
```

Then add `phrases,` to the `buildLattice` options object inside `parse` (next to `dateOrder` and `parseNumber`).

- [ ] **Step 8: Run to verify pass**

Run: `pnpm vitest run packages/core`
Expected: PASS — including the pre-existing "holiday packs merge into the lexicon" block (its aliases are single-word, behavior unchanged).

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): multi-word lexicon phrases in the lattice for holiday names"
```

---

### Task 3: Holiday display names in formatters (round-trip for `candidate.text`)

`candidate.text` is the canonical round-trip text. For holiday anchors both locale formatters emit the raw id today ("victory-day"), which is not lexicon vocabulary → the text would not re-parse. Fix: `FormatOptions` gains `holidayNames?: Record<string, string>` (id → canonical display name = the FIRST alias for the active locale, normalized); the engine builds the map at `createEngine` and passes it when formatting candidates; both locale formatters thread a `names` table down to their anchor cases and fall back to the id when no table is provided (direct adapter calls in tests, round-trip property, conformance — all unaffected).

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/engine.ts`
- Modify: `packages/locale-en/src/index.ts`, `packages/locale-ru/src/index.ts`
- Test: `packages/locale-en/test/holiday-format.test.ts`, `packages/locale-ru/test/holiday-format.test.ts`

- [ ] **Step 1: Write the failing formatter tests**

`packages/locale-en/test/holiday-format.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { en } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const H = (id: string, year?: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "holiday", id, ...(year !== undefined ? { year } : {}) } });

describe("holiday display names (en)", () => {
  const names = { christmas: "christmas", "new-year": "new year's day" };

  test("format uses the engine-provided name", () => {
    expect(en.format(H("christmas"), { ...OPTS, holidayNames: names })).toBe("christmas");
    expect(en.format(H("christmas", 2027), { ...OPTS, holidayNames: names })).toBe("christmas 2027");
    expect(en.format(H("new-year"), { ...OPTS, holidayNames: names })).toBe("new year's day");
  });

  test("falls back to the id without a name table", () => {
    expect(en.format(H("victory-day"), OPTS)).toBe("victory-day");
  });

  test("accessible capitalizes the name", () => {
    expect(en.formatAccessible(H("christmas", 2027), { ...OPTS, holidayNames: names })).toBe("Christmas 2027");
  });

  test("names thread through nested expressions", () => {
    expect(en.format(
      { type: "offset", base: H("christmas"), n: 2, unit: "day", dir: -1 },
      { ...OPTS, holidayNames: names },
    )).toBe("christmas - 2 days");
  });
});
```

`packages/locale-ru/test/holiday-format.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const H = (id: string, year?: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "holiday", id, ...(year !== undefined ? { year } : {}) } });

describe("holiday display names (ru)", () => {
  const names = { "victory-day": "день победы", "orthodox-easter": "пасха" };

  test("format uses the engine-provided name", () => {
    expect(ru.format(H("victory-day"), { ...OPTS, holidayNames: names })).toBe("день победы");
    expect(ru.format(H("victory-day", 2030), { ...OPTS, holidayNames: names })).toBe("день победы 2030");
  });

  test("falls back to the id without a name table", () => {
    expect(ru.format(H("victory-day"), OPTS)).toBe("victory-day");
  });

  test("accessible adds the year noun", () => {
    expect(ru.formatAccessible(H("victory-day", 2030), { ...OPTS, holidayNames: names }))
      .toBe("день победы 2030 года");
    expect(ru.formatAccessible(H("orthodox-easter"), { ...OPTS, holidayNames: names })).toBe("пасха");
  });

  test("names thread through nested expressions", () => {
    expect(ru.format(
      { type: "offset", base: H("orthodox-easter"), n: 2, unit: "week", dir: 1 },
      { ...OPTS, holidayNames: names },
    )).toBe("пасха + 2 недели");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-en/test/holiday-format.test.ts packages/locale-ru/test/holiday-format.test.ts`
Expected: FAIL — TS rejects `holidayNames` in `FormatOptions`, and/or output is the raw id.

- [ ] **Step 3: Extend `FormatOptions` in `packages/core/src/types.ts`**

```ts
export interface FormatOptions {
  now: Date;
  timeZone: string;
  /** holiday id → canonical display name for the active locale (engine-provided) */
  holidayNames?: Record<string, string>;
}
```

- [ ] **Step 4: Build and pass the map in `packages/core/src/engine.ts`**

In the holiday-merge loop from Task 2, add a `holidayNames` record. Declare next to `phrases`:
```ts
  const holidayNames: Record<string, string> = {};
```
and inside the `for (const entry of pack.entries)` loop, after the alias loop:
```ts
      const canonical = (entry.names[locale.id] ?? [])[0];
      if (canonical !== undefined) holidayNames[entry.id] = normalizeText(canonical);
```

Change `toCandidate` to accept and use it — new signature and text line:
```ts
function toCandidate(
  s: ScoredParse, ctx: ParseContext, locale: LocaleAdapter, holidayNames: Record<string, string>,
): Candidate {
```
```ts
    text: locale.format(s.expr, { now: ctx.now, timeZone: ctx.timeZone, holidayNames }),
```
and update the call site in `parse`:
```ts
    const candidates = ranked.map((s) => toCandidate(s, ctx, locale, holidayNames));
```

- [ ] **Step 5: Thread names through `packages/locale-en/src/index.ts`**

Add near the formatting section:
```ts
type HolidayNames = Record<string, string>;
```

Replace `formatAnchor`, `format`, `accessibleAnchor`, `accessible` with these versions (same logic, `names` threaded; only the `case "holiday"` bodies are new):
```ts
function formatAnchor(a: Anchor, names: HolidayNames): string {
  switch (a.kind) {
    case "now": return "today";
    case "relday":
      if (a.offset === 0) return "today";
      if (a.offset === 1) return "tomorrow";
      if (a.offset === -1) return "yesterday";
      return a.offset > 0 ? `in ${a.offset} days` : `${-a.offset} days ago`;
    case "weekday": {
      const name = WEEKDAYS[a.day]!;
      return a.which ? `${a.which} ${name}` : name;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) {
        return `${MONTHS[m]} ${d}${y !== undefined ? ` ${y}` : ""}`;
      }
      if (d !== undefined) return `the ${d}${ordinalSuffix(d)}`;
      if (m !== undefined) return `${MONTHS[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function format(expr: DateExpr, names: HolidayNames): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor, names);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `in ${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`}`
          : `${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`} ago`;
      }
      const unit = expr.n === 1 ? expr.unit : `${expr.unit}s`;
      return `${format(expr.base, names)} ${expr.dir === 1 ? "+" : "-"} ${expr.n} ${unit}`;
    }
    case "range": return `${format(expr.start, names)} to ${format(expr.end, names)}`;
    case "period": return `${expr.which} ${periodName(expr.period)}`;
    case "boundary": return `${expr.edge === "start" ? "start" : "end"} of ${format(expr.of, names)}`;
    case "withTime": return `${format(expr.base, names)} at ${formatTime(expr.time)}`;
  }
}
```
```ts
function accessibleAnchor(a: Anchor, names: HolidayNames): string {
  switch (a.kind) {
    case "now": return "today";
    case "relday":
      if (a.offset === 0) return "today";
      if (a.offset === 1) return "tomorrow";
      if (a.offset === -1) return "yesterday";
      return a.offset > 0 ? `${a.offset} days from today` : `${-a.offset} days ago`;
    case "weekday": {
      const name = cap(WEEKDAYS[a.day]!);
      return a.which ? `${a.which} ${name}` : name;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) {
        return `${cap(MONTHS[m]!)} ${d}${ordinalSuffix(d)}${y !== undefined ? `, ${y}` : ""}`;
      }
      if (d !== undefined) return `the ${d}${ordinalSuffix(d)}`;
      if (m !== undefined) return `${cap(MONTHS[m]!)}${y !== undefined ? ` ${y}` : ""}`;
      return `the year ${y}`;
    }
    case "holiday": {
      const name = cap(names[a.id] ?? a.id);
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function accessible(expr: DateExpr, names: HolidayNames): string {
  switch (expr.type) {
    case "anchor": return accessibleAnchor(expr.anchor, names);
    case "offset": {
      const unit = expr.n === 1 ? expr.unit : `${expr.unit}s`;
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1 ? `in ${expr.n} ${unit}` : `${expr.n} ${unit} ago`;
      }
      return `${expr.n} ${unit} ${expr.dir === 1 ? "after" : "before"} ${accessible(expr.base, names)}`;
    }
    case "range": return `from ${accessible(expr.start, names)} to ${accessible(expr.end, names)}`;
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `the ${QUARTER_NAMES[p.q - 1]} quarter of ${expr.which} year`;
      if (p.kind === "season" && p.s !== undefined) return `${expr.which} ${SEASONS[p.s]![1][0]}`;
      const noun = p.kind === "quarter" ? "quarter" : p.kind === "season" ? "season" : p.kind;
      return `${expr.which} ${noun}`;
    }
    case "boundary": return `the ${expr.edge} of ${accessible(expr.of, names)}`;
    case "withTime": return `${accessible(expr.base, names)} at ${accessibleTime(expr.time)}`;
  }
}
```

And the adapter lines:
```ts
  format: (expr, opts) => format(expr, opts.holidayNames ?? {}),
  formatAccessible: (expr, opts) => accessible(expr, opts.holidayNames ?? {}),
```

- [ ] **Step 6: Thread names through `packages/locale-ru/src/index.ts`**

Add `type HolidayNames = Record<string, string>;` near the formatting section, then update the seven formatter functions. Signatures change as follows; every internal recursive call gains `, names` (the complete updated bodies are below for the functions whose logic changes; for the rest, mechanically append the parameter and thread it):

- `formatAnchor(a: Anchor, names: HolidayNames)` — new holiday case:
```ts
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
```
- `formatGen(of: DateExpr, names: HolidayNames)` — its two `format(of)` fallbacks become `format(of, names)`.
- `format(expr: DateExpr, names: HolidayNames)` — recursive calls: `formatAnchor(expr.anchor, names)`, `format(expr.base, names)`, `format(expr.start, names)`, `format(expr.end, names)`, `formatGen(expr.of, names)`.
- `accAnchorGen(a: Anchor, names: HolidayNames)` / `accAnchorAcc(a: Anchor, names: HolidayNames)` — their `accessibleAnchor(a)` fallbacks become `accessibleAnchor(a, names)`.
- `accGen` / `accAcc`:
```ts
const accGen = (e: DateExpr, names: HolidayNames): string =>
  (e.type === "anchor" ? accAnchorGen(e.anchor, names) : accessible(e, names));
const accAcc = (e: DateExpr, names: HolidayNames): string =>
  (e.type === "anchor" ? accAnchorAcc(e.anchor, names) : accessible(e, names));
```
- `accessibleAnchor(a: Anchor, names: HolidayNames)` — new holiday case:
```ts
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year} года` : name;
    }
```
- `accessible(expr: DateExpr, names: HolidayNames)` — recursive calls gain `, names`, including the two canonical fallbacks `return format(expr, names);` in the period and boundary cases.

And the adapter lines:
```ts
  format: (expr, opts) => format(expr, opts.holidayNames ?? {}),
  formatAccessible: (expr, opts) => accessible(expr, opts.holidayNames ?? {}),
```

- [ ] **Step 7: Run to verify pass**

Run: `pnpm vitest run packages/locale-en packages/locale-ru packages/core packages/conformance`
Expected: PASS everywhere — existing format/accessible/round-trip/conformance suites are unaffected (no holiday anchors in them; `holidayNames` is optional).

- [ ] **Step 8: Commit**

```bash
git add packages/core packages/locale-en packages/locale-ru
git commit -m "feat(core,locales): holiday display names in canonical and accessible formatting"
```

---

### Task 4: @saywhen/holidays-us — rules, names, e2e

US holidays: fixed dates, nth/last-weekday rules, and Western Easter via the anonymous Meeus/Jones/Butcher computus. Names in en AND ru (spec §3: region and language are independent axes). All entries return 0-based `m`.

**Files:**
- Create: `packages/holidays-us/src/index.ts`
- Test: `packages/holidays-us/test/compute.test.ts`, `packages/holidays-us/test/e2e.test.ts`

- [ ] **Step 1: Write the failing compute tests**

`packages/holidays-us/test/compute.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { us, westernEaster } from "../src/index.js";

const get = (id: string) => us.entries.find((e) => e.id === id)!;

describe("westernEaster (Meeus/Jones/Butcher)", () => {
  test.each([
    [2024, 2, 31], // Mar 31
    [2025, 3, 20], // Apr 20
    [2026, 3, 5],  // Apr 5
    [2027, 2, 28], // Mar 28
    [2028, 3, 16], // Apr 16
    [2030, 3, 21], // Apr 21
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(westernEaster(y)).toEqual({ m, d });
  });
});

describe("nth/last weekday rules", () => {
  test.each([
    ["thanksgiving", 2025, { m: 10, d: 27 }],
    ["thanksgiving", 2026, { m: 10, d: 26 }],
    ["thanksgiving", 2027, { m: 10, d: 25 }],
    ["mlk-day", 2027, { m: 0, d: 18 }],
    ["presidents-day", 2026, { m: 1, d: 16 }],
    ["mothers-day", 2026, { m: 4, d: 10 }],
    ["memorial-day", 2026, { m: 4, d: 25 }],
    ["memorial-day", 2027, { m: 4, d: 31 }],
    ["fathers-day", 2026, { m: 5, d: 21 }],
    ["labor-day", 2026, { m: 8, d: 7 }],
    ["columbus-day", 2026, { m: 9, d: 12 }],
  ])("%s %i", (id, y, expected) => {
    expect(get(id).compute(y)).toEqual(expected);
  });

  test("good friday is 2 days before easter, across a month boundary", () => {
    expect(get("good-friday").compute(2026)).toEqual({ m: 3, d: 3 });  // Easter Apr 5
    expect(get("good-friday").compute(2029)).toEqual({ m: 2, d: 30 }); // Easter Apr 1 → Mar 30
  });

  test("every entry has at least one English name", () => {
    for (const e of us.entries) expect(e.names.en?.length, e.id).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/holidays-us`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `packages/holidays-us/src/index.ts`** (complete file)

```ts
import type { HolidayPack } from "@saywhen/core";

// ---------- date rules (0-based month; Date.UTC only for weekday/overflow math) ----------

const fixed = (m: number, d: number) => () => ({ m, d });

/** nth <weekday> of a month: nthWeekday(2026, 10, 4, 4) = 4th Thursday of November */
function nthWeekday(y: number, m: number, weekday: number, nth: number): { m: number; d: number } {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return { m, d: 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7 };
}

function lastWeekday(y: number, m: number, weekday: number): { m: number; d: number } {
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(y, m, lastDay)).getUTCDay();
  return { m, d: lastDay - ((lastDow - weekday + 7) % 7) };
}

/** Western (Gregorian) Easter Sunday — anonymous Meeus/Jones/Butcher algorithm. */
export function westernEaster(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based: 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month - 1, d: day };
}

const easterOffset = (days: number) => (year: number) => {
  const e = westernEaster(year);
  const dt = new Date(Date.UTC(year, e.m, e.d + days)); // Date.UTC absorbs month under/overflow
  return { m: dt.getUTCMonth(), d: dt.getUTCDate() };
};

export const us: HolidayPack = {
  id: "us",
  entries: [
    { id: "new-year", compute: fixed(0, 1),
      names: { en: ["new year's day", "new years day", "new year"], ru: ["новый год"] } },
    { id: "mlk-day", compute: (y) => nthWeekday(y, 0, 1, 3),
      names: { en: ["mlk day", "martin luther king day"], ru: ["день мартина лютера кинга"] } },
    { id: "valentines-day", compute: fixed(1, 14),
      names: { en: ["valentine's day", "valentines day", "valentines"],
               ru: ["день святого валентина", "день влюблённых", "день влюбленных"] } },
    { id: "presidents-day", compute: (y) => nthWeekday(y, 1, 1, 3),
      names: { en: ["presidents day", "presidents' day", "president's day"], ru: ["день президентов"] } },
    { id: "good-friday", compute: easterOffset(-2),
      names: { en: ["good friday"], ru: ["страстная пятница"] } },
    { id: "easter", compute: westernEaster,
      names: { en: ["easter", "easter sunday"], ru: ["пасха"] } },
    { id: "mothers-day", compute: (y) => nthWeekday(y, 4, 0, 2),
      names: { en: ["mother's day", "mothers day"], ru: ["день матери"] } },
    { id: "memorial-day", compute: (y) => lastWeekday(y, 4, 1),
      names: { en: ["memorial day"], ru: ["день памяти"] } },
    { id: "fathers-day", compute: (y) => nthWeekday(y, 5, 0, 3),
      names: { en: ["father's day", "fathers day"], ru: ["день отца"] } },
    { id: "juneteenth", compute: fixed(5, 19),
      names: { en: ["juneteenth"] } },
    { id: "independence-day", compute: fixed(6, 4),
      names: { en: ["independence day", "fourth of july", "4th of july"], ru: ["день независимости"] } },
    { id: "labor-day", compute: (y) => nthWeekday(y, 8, 1, 1),
      names: { en: ["labor day"], ru: ["день труда"] } },
    { id: "columbus-day", compute: (y) => nthWeekday(y, 9, 1, 2),
      names: { en: ["columbus day", "indigenous peoples day"] } },
    { id: "halloween", compute: fixed(9, 31),
      names: { en: ["halloween"], ru: ["хэллоуин", "хеллоуин"] } },
    { id: "veterans-day", compute: fixed(10, 11),
      names: { en: ["veterans day", "veteran's day"], ru: ["день ветеранов"] } },
    { id: "thanksgiving", compute: (y) => nthWeekday(y, 10, 4, 4),
      names: { en: ["thanksgiving", "thanksgiving day", "turkey day"], ru: ["день благодарения"] } },
    { id: "christmas-eve", compute: fixed(11, 24),
      names: { en: ["christmas eve"] } },
    { id: "christmas", compute: fixed(11, 25),
      names: { en: ["christmas", "christmas day", "xmas"], ru: ["рождество"] } },
    { id: "new-years-eve", compute: fixed(11, 31),
      names: { en: ["new year's eve", "new years eve", "nye"], ru: ["канун нового года"] } },
  ],
};
```

- [ ] **Step 4: Run to verify the compute tests pass**

Run: `pnpm vitest run packages/holidays-us/test/compute.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the e2e tests**

`packages/holidays-us/test/e2e.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { ru as ruLocale } from "@saywhen/locale-ru";
import { us } from "../src/index.js";

const engine = createEngine({ locale: en, holidays: [us] });
// Friday 2026-06-12, 04:00 in New York
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("US holidays resolve and roll forward (en)", () => {
  test.each([
    ["christmas", "2026-12-25"],
    ["xmas", "2026-12-25"],
    ["christmas day", "2026-12-25"],
    ["thanksgiving", "2026-11-26"],   // 4th Thursday of November
    ["turkey day", "2026-11-26"],
    ["halloween", "2026-10-31"],
    ["independence day", "2026-07-04"],
    ["fourth of july", "2026-07-04"],
    ["4th of july", "2026-07-04"],
    ["juneteenth", "2026-06-19"],
    ["father's day", "2026-06-21"],
    ["labor day", "2026-09-07"],
    ["veterans day", "2026-11-11"],
    ["new year's day", "2027-01-01"], // Jan 1 2026 already passed
    ["new years day", "2027-01-01"],
    ["easter", "2027-03-28"],         // Apr 5 2026 already passed
    ["good friday", "2027-03-26"],
    ["mlk day", "2027-01-18"],
    ["memorial day", "2027-05-31"],
    ["mother's day", "2027-05-09"],
    ["xmas 2027", "2027-12-25"],      // explicit year pins it
    ["easter 2028", "2028-04-16"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("holidays compose with the grammar", () => {
    expect(top("2 days before christmas").start.date).toBe("2026-12-23");
    expect(top("christmas + 1 week").start.date).toBe("2027-01-01");
    const r = top("christmas to new year");
    expect(r.start.date).toBe("2026-12-25");
    expect(r.end.date).toBe("2027-01-01"); // range end re-anchors to Dec 25
  });

  test("canonical text uses the first alias and re-parses", () => {
    expect(top("xmas").text).toBe("christmas");
    expect(top("turkey day 2027").text).toBe("thanksgiving 2027");
    expect(top(top("xmas").text).start.date).toBe("2026-12-25");
  });

  test("single-word names get typo correction for free", () => {
    const r = engine.parse("christms", CTX);
    expect(r.corrections).toHaveLength(1);
    expect(r.candidates[0]!.start.date).toBe("2026-12-25");
  });
});

describe("region ≠ language: US dates with Russian names (spec §3)", () => {
  const ruEngine = createEngine({ locale: ruLocale, holidays: [us] });
  const MOSCOW: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

  test.each([
    ["день благодарения", "2026-11-26"],
    ["рождество", "2026-12-25"],      // WESTERN christmas — the us pack computed it
    ["хэллоуин", "2026-10-31"],
    ["день независимости", "2026-07-04"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text, ruEngine, MOSCOW).start.date).toBe(date);
  });

  test("canonical text is the Russian name", () => {
    expect(top("день благодарения", ruEngine, MOSCOW).text).toBe("день благодарения");
  });
});
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/holidays-us`
Expected: PASS — both files. Debugging guide if an e2e row fails:
1. Multi-word name not parsing → log `engine.parse(text, CTX).errors`; if the words come back LITERAL the phrase didn't match — check the alias tokenizes to exactly the same texts (`en.tokenize("new year's day")` → `["new","year's","day"]`).
2. Wrong date → check the compute table row for that id in compute.test.ts first; if compute is right, the roll-forward in resolve.ts is using `>= today` (today counts).
3. Wrong `text` → the first alias for the locale is the canonical name; reorder aliases, never patch the formatter.

- [ ] **Step 7: Commit**

```bash
git add packages/holidays-us
git commit -m "feat(holidays-us): US holiday pack with en/ru names"
```

---

### Task 5: @saywhen/holidays-ru — rules, names, e2e

RU holidays are all fixed dates except Orthodox Easter (Julian-calendar Meeus computus + the 13-day Julian→Gregorian shift, which is only valid 1900–2099 → `null` outside — this exercises the resolver's null path end-to-end). Inflected aliases (genitive "дня победы", "нового года") are plain data entries, same philosophy as the locale packages.

**Files:**
- Create: `packages/holidays-ru/src/index.ts`
- Test: `packages/holidays-ru/test/compute.test.ts`, `packages/holidays-ru/test/e2e.test.ts`

- [ ] **Step 1: Write the failing compute tests**

`packages/holidays-ru/test/compute.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { orthodoxEaster, ru } from "../src/index.js";

describe("orthodoxEaster (Julian Meeus + 13-day Gregorian shift)", () => {
  test.each([
    [2024, 4, 5],  // May 5
    [2025, 3, 20], // Apr 20 (coincides with Western that year)
    [2026, 3, 12], // Apr 12
    [2027, 4, 2],  // May 2
    [2028, 3, 16], // Apr 16
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(orthodoxEaster(y)).toEqual({ m, d });
  });

  test("null outside 1900–2099 (the +13-day shift stops being valid)", () => {
    expect(orthodoxEaster(1899)).toBeNull();
    expect(orthodoxEaster(2100)).toBeNull();
  });
});

describe("entries", () => {
  const get = (id: string) => ru.entries.find((e) => e.id === id)!;

  test("victory day is May 9 every year", () => {
    expect(get("victory-day").compute(2026)).toEqual({ m: 4, d: 9 });
  });

  test("every entry has a Russian and an English name", () => {
    for (const e of ru.entries) {
      expect(e.names.ru?.length, e.id).toBeGreaterThan(0);
      expect(e.names.en?.length, e.id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/holidays-ru`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `packages/holidays-ru/src/index.ts`** (complete file)

```ts
import type { HolidayPack } from "@saywhen/core";

const fixed = (m: number, d: number) => () => ({ m, d });

/**
 * Orthodox Easter Sunday as a Gregorian-calendar date.
 * Meeus' Julian-calendar algorithm + the 13-day Julian→Gregorian offset, which is
 * only correct for 1900–2099 → null outside that range (spec §4.5: entries return
 * null when uncovered; the engine drops the candidate with an explanatory error).
 */
export function orthodoxEaster(year: number): { m: number; d: number } | null {
  if (year < 1900 || year > 2099) return null;
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // Julian-calendar month (1-based: 3 or 4)
  const day = ((d + e + 114) % 31) + 1;
  const dt = new Date(Date.UTC(year, month - 1, day + 13)); // shift to Gregorian; overflow absorbed
  return { m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export const ru: HolidayPack = {
  id: "ru",
  entries: [
    // same rule as holidays-us "new-year" — sharing the id is deliberate (identical date)
    { id: "new-year", compute: fixed(0, 1),
      names: { ru: ["новый год", "нового года", "новым годом"], en: ["new year's day", "new year"] } },
    { id: "orthodox-christmas", compute: fixed(0, 7),
      names: { ru: ["рождество", "рождества", "рождество христово"], en: ["orthodox christmas"] } },
    { id: "old-new-year", compute: fixed(0, 14),
      names: { ru: ["старый новый год"], en: ["old new year"] } },
    { id: "defender-day", compute: fixed(1, 23),
      names: { ru: ["день защитника отечества"], en: ["defender of the fatherland day"] } },
    { id: "womens-day", compute: fixed(2, 8),
      names: { ru: ["международный женский день", "женский день"],
               en: ["international women's day", "women's day"] } },
    { id: "orthodox-easter", compute: orthodoxEaster,
      names: { ru: ["пасха", "пасхи", "пасху"], en: ["orthodox easter"] } },
    { id: "spring-labor-day", compute: fixed(4, 1),
      names: { ru: ["праздник весны и труда", "первомай"], en: ["may day"] } },
    { id: "victory-day", compute: fixed(4, 9),
      names: { ru: ["день победы", "дня победы", "днём победы", "днем победы"], en: ["victory day"] } },
    { id: "russia-day", compute: fixed(5, 12),
      names: { ru: ["день россии", "дня россии"], en: ["russia day"] } },
    { id: "unity-day", compute: fixed(10, 4),
      names: { ru: ["день народного единства"], en: ["unity day"] } },
  ],
};
```

- [ ] **Step 4: Run to verify the compute tests pass**

Run: `pnpm vitest run packages/holidays-ru/test/compute.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the e2e tests**

`packages/holidays-ru/test/e2e.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { ru as ruLocale } from "@saywhen/locale-ru";
import { en } from "@saywhen/locale-en";
import { ru as ruHolidays } from "../src/index.js";

const engine = createEngine({ locale: ruLocale, holidays: [ruHolidays] });
// Friday 2026-06-12, 11:00 in Moscow
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("RU holidays resolve and roll forward (ru)", () => {
  test.each([
    ["день россии", "2026-06-12"],            // today counts
    ["день народного единства", "2026-11-04"],
    ["новый год", "2027-01-01"],
    ["рождество", "2027-01-07"],              // Orthodox christmas, Jan 7
    ["старый новый год", "2027-01-14"],
    ["день защитника отечества", "2027-02-23"],
    ["женский день", "2027-03-08"],
    ["пасха", "2027-05-02"],                  // Orthodox Easter; Apr 12 2026 already passed
    ["первомай", "2027-05-01"],
    ["праздник весны и труда", "2027-05-01"],
    ["день победы", "2027-05-09"],
    ["пасха 2028", "2028-04-16"],             // explicit year pins it
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("holidays compose with the grammar (inflected aliases)", () => {
    expect(top("2 недели после дня победы").start.date).toBe("2027-05-23");
    const r = top("с нового года по рождество");
    expect(r.start.date).toBe("2027-01-01");
    expect(r.end.date).toBe("2027-01-07");
  });

  test("canonical text uses the first Russian alias and re-parses", () => {
    expect(top("пасху").text).toBe("пасха");
    expect(top("дня победы").text).toBe("день победы");
    expect(top(top("дня победы").text).start.date).toBe("2027-05-09");
  });

  test("computus outside its covered range → invalid with explanation", () => {
    const r = engine.parse("пасха 2100", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no date for holiday/i);
  });
});

describe("region ≠ language: RU dates with English names (spec §3)", () => {
  const enEngine = createEngine({ locale: en, holidays: [ruHolidays] });
  const NY: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

  test.each([
    ["orthodox easter", "2027-05-02"],
    ["victory day", "2027-05-09"],
    ["russia day", "2026-06-12"],
    ["unity day", "2026-11-04"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text, enEngine, NY).start.date).toBe(date);
  });
});
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/holidays-ru`
Expected: PASS. Same debugging guide as Task 4 Step 6. Note "рождество" here is Jan 7 — when BOTH packs are loaded with a ru locale the word is genuinely ambiguous (two HOLIDAY payloads, two candidates); these tests load one pack at a time, so each is unambiguous.

- [ ] **Step 7: Commit**

```bash
git add packages/holidays-ru
git commit -m "feat(holidays-ru): RU holiday pack with ru/en names"
```

---

### Task 6: Dependency guard + full verification

**Files:**
- Modify: `packages/core/test/deps.test.ts`

- [ ] **Step 1: Extend the peer-dependency guard**

In `packages/core/test/deps.test.ts`, change the parametrized list:
```ts
  test.each(["locale-en", "locale-ru", "holidays-us", "holidays-ru"])(
    "%s depends on core as a peer only",
    (name) => {
      const p = pkg(`packages/${name}`);
      expect(Object.keys(p.dependencies ?? {})).toEqual([]);
      expect(Object.keys(p.peerDependencies ?? {})).toEqual(["@saywhen/core"]);
    },
  );
```

- [ ] **Step 2: Run the guard**

Run: `pnpm vitest run packages/core/test/deps.test.ts`
Expected: PASS — 6 tests (core zero-dep, 4 peer-only packages, no cross-package imports in core src).

- [ ] **Step 3: Full verification**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected:
- vitest: all suites pass — core, conformance, locale-en, locale-ru, holidays-us, holidays-ru, oracle units; the ORACLE-gated sweep skipped.
- typecheck: clean across `packages/*` and `tools/*`.
- build: dist emitted for core, locale-en, locale-ru, holidays-us, holidays-ru.

Run the dist smoke checks:
```bash
node --input-type=module -e "const m = await import('./packages/holidays-us/dist/index.js'); if (m.us?.id !== 'us') throw new Error('dist missing us pack'); console.log('holidays-us dist OK');"
node --input-type=module -e "const m = await import('./packages/holidays-ru/dist/index.js'); if (m.ru?.id !== 'ru') throw new Error('dist missing ru pack'); console.log('holidays-ru dist OK');"
```
Expected: both print OK.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/deps.test.ts
git commit -m "test(core): extend dependency guard to holiday packs"
git status --short   # should be clean; commit anything left over with an appropriate message
```

---

## Done — definition of success for plan 04

- `@saywhen/holidays-us` and `@saywhen/holidays-ru` ship per spec §4.5: fixed, nth/last-weekday, and computus rules (Western AND Orthodox Easter, both unit-tested against known tables), with per-language alias lists including inflected Russian forms.
- Multi-word holiday names parse via the new core phrase merge ("new year's day", "день народного единства", "fourth of july") and compose with the whole grammar (offsets, ranges, explicit years).
- **Region ≠ language proven by tests**: ru locale + us pack resolves "день благодарения" to US Thanksgiving; en locale + ru pack resolves "orthodox easter" — the spec §3 motivating scenario.
- `candidate.text` for holiday candidates is the locale's canonical alias and re-parses to the same dates (round-trip contract holds).
- Resolver null path exercised end-to-end ("пасха 2100" → invalid with an explanatory error).
- Bare-unit offsets ("in a week", "через месяц", "через год") parse in both locales — the gap recorded in plans 02/03 is closed.
- Deps guard enforces peer-only-core for all four data packages; `pnpm build` emits dist for both packs.

**Known gaps, deliberate (record, don't fix here):**
- "friday before christmas" (holiday-relative weekday) and "christmas weekend" don't parse — the AST has no node for weekday-relative-to-anchor; needs a designed extension (note "2 days before christmas" works today). Revisit alongside plan 05/06 if demand shows up.
- Typo correction does not reach multi-word names ("christms" corrects; "new yaer's day" doesn't) — single-word aliases get correction for free via the lexicon.
- Phrase merge REPLACES the constituent cells; an alias consisting entirely of standalone vocabulary shadows the compositional reading ("fourth of july" → holiday, same resolved date). Keep at least one non-vocabulary word in future aliases where the readings could diverge.
- Holiday starters/suggestions are plan 05 (spec §6 says packs contribute automatically — that wiring lands with core/suggest).

**Out of scope (later plans):** core/suggest ghost text + starters (05); controller/react/registry/playground (06).
