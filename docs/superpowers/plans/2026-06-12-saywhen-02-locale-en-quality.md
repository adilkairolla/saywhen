# saywhen Plan 02 — locale-en Complete + Quality Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish `@saywhen/locale-en` (compound number words, accessible formatting, fuller vocabulary) and build the quality gates from spec §9: the locale conformance suite, fast-check round-trip properties, the chrono differential oracle, publish builds (tsdown), and the parse benchmark.

**Architecture:** Three pillars. (1) Core gains one new lattice capability — merging adjacent number-word cells via the locale's `parseNumber` — plus a typo-ordering bugfix; everything else in this plan is data, tests, and tooling around the existing engine. (2) The conformance suite is a new private package `@saywhen/conformance` that registers vitest suites against any `LocaleAdapter` — semantic cases are ASTs whose ground truth comes from the locale-independent resolver, so the suite needs zero per-locale expected values. (3) The oracle (`tools/oracle`) and bench run inside vitest (no extra runners); the full differential run is gated behind `ORACLE=1`.

**Tech Stack:** existing pnpm/TS/Vitest 3 monorepo; new dev-deps: `fast-check` (root), `chrono-node` (tools/oracle only — spec §1 forbids it anywhere else), `tsdown` (root).

**This is plan 2 of 6** (series defined in `2026-06-12-saywhen-01-core-engine.md`, which is fully executed and merged). Plan 03 = locale-ru, 04 = holiday packs, 05 = suggest, 06 = controller/react/registry/playground.

**Conventions (same as plan 01):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- All tests inject `now`; the standard clock is Friday `2026-06-12T08:00:00Z`, zone `America/New_York` (= 04:00 EDT) unless stated.
- `m` is 0-based month everywhere.
- Env quirk on this machine: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## File structure (created/modified by this plan)

```
packages/core/src/typo.ts                 MODIFY  curated map before digit guard (Task 0)
packages/core/src/lattice.ts              MODIFY  mergeNumberWords + parseNumber option (Task 1)
packages/core/src/engine.ts               MODIFY  wire locale.parseNumber into lattice (Task 1)
packages/core/test/fixtures/test-locale.ts MODIFY number words + compound parseNumber (Task 1)
packages/core/test/{typo,lattice,engine}.test.ts  MODIFY (Tasks 0–1)
packages/locale-en/src/index.ts           MODIFY  vocabulary, parseNumber, formatAccessible (Tasks 2–3)
packages/locale-en/test/e2e.test.ts       MODIFY  new acceptance cases (Task 2)
packages/locale-en/test/accessible.test.ts CREATE (Task 3)
packages/conformance/package.json         CREATE  @saywhen/conformance, private (Task 4)
packages/conformance/tsconfig.json        CREATE
packages/conformance/src/cases.ts         CREATE  SEMANTIC_CASES: named ASTs (Task 4)
packages/conformance/src/index.ts         CREATE  runLocaleConformance() (Task 4, extended Task 5)
packages/conformance/src/transforms.ts    CREATE  must-pass + fuzzy transforms (Task 5)
packages/conformance/test/transforms.test.ts CREATE (Task 5)
packages/locale-en/test/conformance.test.ts CREATE  runs the suite for en (Task 4)
packages/locale-en/test/roundtrip.property.test.ts CREATE  fast-check (Task 6)
tools/oracle/package.json                 CREATE  chrono-node lives ONLY here (Task 7)
tools/oracle/tsconfig.json                CREATE
tools/oracle/src/templates.ts             CREATE  phrase generator (Task 7)
tools/oracle/src/compare.ts               CREATE  chrono vs engine comparison (Task 7)
tools/oracle/src/report.ts                CREATE  diffs.md renderer (Task 7)
tools/oracle/test/oracle.test.ts          CREATE  unit tests + must-agree gate (Task 7)
tools/oracle/test/run-oracle.test.ts      CREATE  full run, gated on ORACLE=1 (Task 7)
tools/oracle/triage/{bugs,wontfix}.md     CREATE  (Task 8)
packages/core/tsdown.config.ts            CREATE  (Task 9)
packages/locale-en/tsdown.config.ts       CREATE  (Task 9)
packages/{core,locale-en}/package.json    MODIFY  build script, files, publishConfig (Task 9)
packages/locale-en/bench/parse.bench.ts   CREATE  (Task 10)
packages/locale-en/test/perf.test.ts      CREATE  p99 guard (Task 10)
package.json                              MODIFY  build/bench/oracle scripts; typecheck covers tools/* (Tasks 7, 9, 10)
vitest.config.ts                          MODIFY  benchmark excludes .var/ (Task 10)
.gitignore                                MODIFY  tools/oracle/results/ (Task 7)
```

---

### Task 0: Fix curated-typo ordering (latent plan-01 bug)

`correctToken` checks `/\d/` before the curated `typoMap`, so digit-bearing abbreviations like `b4 → before` (already shipped in both typo maps) can never fire. Spec §5.2: the curated map runs *before* edit-distance; only edit-distance must never touch digit tokens.

**Files:**
- Modify: `packages/core/src/typo.ts`
- Test: `packages/core/test/typo.test.ts`

- [ ] **Step 1: Add the failing tests** (inside the existing `describe("correctToken", ...)` block)

```ts
  test("curated entries may contain digits: 'b4' → before", () => {
    expect(correctToken("b4", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "before", cost: 0,
    });
  });
  test("digits still never reach edit-distance", () => {
    expect(correctToken("frid4y", lexKeys, testLocale.typoMap, adj)).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/typo.test.ts`
Expected: FAIL — `b4` returns `null`.

- [ ] **Step 3: Reorder the guards in `correctToken`**

Replace the first three lines of the function body:

```ts
  const curated = typoMap?.[text];
  if (curated) return { to: curated, cost: 0 };
  if (/\d/.test(text)) return null;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/typo.test.ts`
Expected: PASS (all, including plan-01 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/typo.ts packages/core/test/typo.test.ts
git commit -m "fix(core): curated typo map runs before the digit guard"
```

---

### Task 1: Compound number words — lattice merging via `locale.parseNumber`

Spec §4.1 defines `parseNumber(words) → number | null`, but nothing calls it yet: "twenty one" tokenizes to two NUMBER cells the grammar can't combine. The core merges **runs of single-alternative word-NUMBER cells** (never digit tokens) by asking the locale; the merged cell is ordinal iff the last word's NUMBER payload is ordinal. The locale stays in charge of which words exist and which compounds are valid; the core supplies the language-neutral mechanics.

**Files:**
- Modify: `packages/core/src/lattice.ts`, `packages/core/src/engine.ts`
- Modify: `packages/core/test/fixtures/test-locale.ts`
- Test: `packages/core/test/lattice.test.ts`, `packages/core/test/engine.test.ts`

- [ ] **Step 1: Extend the fixture locale**

In `packages/core/test/fixtures/test-locale.ts`, add to the lexicon (next to the existing relday entries):

```ts
  // number words for compound-merging tests
  one: [{ kind: "NUMBER", n: 1 }],
  two: [{ kind: "NUMBER", n: 2 }],
  twenty: [{ kind: "NUMBER", n: 20 }],
  thirty: [{ kind: "NUMBER", n: 30 }],
  first: [{ kind: "NUMBER", n: 1, ordinal: true }],
  third: [{ kind: "NUMBER", n: 3, ordinal: true }],
```

and replace the fixture's `parseNumber` with a compound-aware version:

```ts
  parseNumber: (words) => {
    const NUMS: Record<string, number> = { one: 1, two: 2, twenty: 20, thirty: 30 };
    const ORDS: Record<string, number> = { first: 1, third: 3 };
    if (words.length === 1) {
      const w = words[0]!;
      if (/^\d+$/.test(w)) return Number(w);
      return NUMS[w] ?? ORDS[w] ?? null;
    }
    if (words.length === 2) {
      const tens = NUMS[words[0]!];
      const unit = NUMS[words[1]!] ?? ORDS[words[1]!];
      if (tens !== undefined && tens >= 20 && tens % 10 === 0 && unit !== undefined && unit >= 1 && unit <= 9) {
        return tens + unit;
      }
    }
    return null;
  },
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/test/lattice.test.ts`:

```ts
describe("number-word merging (locale parseNumber)", () => {
  const opts = { parseNumber: testLocale.parseNumber };

  test("'twenty one' merges into NUMBER(21) with combined span and source", () => {
    const cells = buildLattice(testLocale.tokenize("twenty one"), testLocale.lexicon, opts);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.alternatives).toEqual([[
      expect.objectContaining({ kind: "NUMBER", n: 21, span: [0, 10], source: "twenty one" }),
    ]]);
  });

  test("'twenty first' merges into an ordinal NUMBER(21)", () => {
    const cells = buildLattice(testLocale.tokenize("twenty first"), testLocale.lexicon, opts);
    expect(cells[0]!.alternatives[0]![0]).toMatchObject({ kind: "NUMBER", n: 21, ordinal: true });
  });

  test("invalid compounds stay split: 'one two'", () => {
    expect(buildLattice(testLocale.tokenize("one two"), testLocale.lexicon, opts)).toHaveLength(2);
  });

  test("digit tokens never merge: '20 1'", () => {
    expect(buildLattice(testLocale.tokenize("20 1"), testLocale.lexicon, opts)).toHaveLength(2);
  });

  test("without the option, nothing merges", () => {
    expect(buildLattice(testLocale.tokenize("twenty one"), testLocale.lexicon)).toHaveLength(2);
  });
});
```

Append to `packages/core/test/engine.test.ts` (inside `describe("parse — happy paths", ...)`):

```ts
  test("compound number words: 'the twenty first of march' → next March 21", () => {
    const r = engine.parse("the twenty first of march", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.start.date).toBe("2027-03-21");
  });

  test("'twenty one days from tomorrow'", () => {
    expect(engine.parse("twenty one days from tomorrow", CTX).candidates[0]!.start.date).toBe("2026-07-04");
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/core/test/lattice.test.ts packages/core/test/engine.test.ts`
Expected: the five merging tests and two engine tests FAIL (cells stay split).

- [ ] **Step 4: Implement merging in `lattice.ts`**

Add `parseNumber` to the options interface:

```ts
export interface LatticeOptions {
  /** returns a corrected lexicon key for an unknown word, or null */
  correct?: (raw: RawToken) => CorrectionHit | null;
  dateOrder?: "MDY" | "DMY" | "YMD";
  /** locale compound-number reader; enables merging adjacent number-word cells */
  parseNumber?: (words: string[]) => number | null;
}
```

Add below `buildLattice`:

```ts
function wordNumberInfo(cell: LatticeCell): { n: number; ordinal: boolean } | null {
  if (/\d/.test(cell.raw.text)) return null; // digit tokens never merge
  if (cell.alternatives.length !== 1) return null;
  const alt = cell.alternatives[0]!;
  if (alt.length !== 1 || alt[0]!.kind !== "NUMBER") return null;
  return { n: alt[0]!.n, ordinal: alt[0]!.ordinal === true };
}

/** Merge maximal runs of word-NUMBER cells that the locale reads as one number. */
export function mergeNumberWords(
  cells: LatticeCell[],
  parseNumber: (words: string[]) => number | null,
): LatticeCell[] {
  const out: LatticeCell[] = [];
  let i = 0;
  while (i < cells.length) {
    if (!wordNumberInfo(cells[i]!)) {
      out.push(cells[i]!);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < cells.length && wordNumberInfo(cells[j]!)) j++;
    let merged = false;
    for (let k = j; k > i + 1 && !merged; k--) { // longest window first, ≥ 2 words
      const slice = cells.slice(i, k);
      const n = parseNumber(slice.map((c) => c.raw.text));
      if (n !== null) {
        const last = wordNumberInfo(slice[slice.length - 1]!)!;
        const raw: RawToken = {
          text: slice.map((c) => c.raw.text).join(" "),
          span: [slice[0]!.raw.span[0], slice[slice.length - 1]!.raw.span[1]],
        };
        const confidence = Math.min(...slice.map((c) => c.alternatives[0]![0]!.confidence));
        out.push({
          raw,
          alternatives: [[
            sem(last.ordinal ? { kind: "NUMBER", n, ordinal: true } : { kind: "NUMBER", n }, raw, confidence),
          ]],
        });
        i = k;
        merged = true;
      }
    }
    if (!merged) {
      out.push(cells[i]!);
      i++;
    }
  }
  return out;
}
```

and change `buildLattice`'s return to run the pass:

```ts
export function buildLattice(
  rawTokens: RawToken[],
  lexicon: Lexicon,
  opts: LatticeOptions = {},
): LatticeCell[] {
  const cells = rawTokens.map((raw) => {
    const digits = classifyDigits(raw, opts.dateOrder ?? "MDY");
    if (digits) return { raw, alternatives: digits };
    const payloads = lookupLexicon(lexicon, raw.text);
    if (payloads) return { raw, alternatives: payloads.map((p) => [sem(p, raw)]) };
    const hit = opts.correct?.(raw);
    if (hit) {
      const corrected = lookupLexicon(lexicon, hit.to);
      if (corrected) {
        const confidence = Math.max(0.5, 1 - 0.2 * Math.max(hit.cost, 0.5));
        return { raw, alternatives: corrected.map((p) => [sem(p, raw, confidence)]) };
      }
    }
    return { raw, alternatives: [[sem({ kind: "LITERAL" }, raw)]] };
  });
  return opts.parseNumber ? mergeNumberWords(cells, opts.parseNumber) : cells;
}
```

- [ ] **Step 5: Wire it in `engine.ts`**

In the `buildLattice(...)` call inside `parse`, add one option line next to `dateOrder`:

```ts
      dateOrder,
      parseNumber: (words: string[]) => locale.parseNumber(words),
```

- [ ] **Step 6: Run to verify pass — full core suite**

Run: `pnpm vitest run packages/core`
Expected: PASS (all files; existing tests unaffected because the option was absent before).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): merge compound number words via locale.parseNumber"
```

---

### Task 2: locale-en vocabulary completion

Adds: teens/tens cardinals (+ compounds via Task 1), word ordinals ("first" … "thirtieth", compounds like "twenty first"), `noon`/`midnight` as TIME entries, more weekday abbreviations, a compound-aware `parseNumber`, and an expanded curated typo map (digit-bearing entries now work thanks to Task 0).

**Files:**
- Modify: `packages/locale-en/src/index.ts`
- Test: `packages/locale-en/test/e2e.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `e2e.test.ts`)

```ts
describe("complete vocabulary (plan 02)", () => {
  test.each([
    ["the twenty first of march", "2027-03-21"],
    ["march twenty first", "2027-03-21"],
    ["the third", "2026-07-03"],            // bare word ordinal rolls past 06-12 → next month
    ["seventeen days from today", "2026-06-29"],
    ["twenty one days from tomorrow", "2026-07-04"],
    ["tues", "2026-06-16"],
    ["thurs", "2026-06-18"],
    ["weds", "2026-06-17"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("'tomorrow at noon' → 16:00Z (EDT)", () => {
    expect(top("tomorrow at noon").start.utcIso).toBe("2026-06-13T16:00:00.000Z");
  });
  test("'tomorrow at midnight' → 04:00Z", () => {
    expect(top("tomorrow at midnight").start.utcIso).toBe("2026-06-13T04:00:00.000Z");
  });

  test("curated abbreviations with digits: '2moro', '3 days b4 march 4'", () => {
    expect(top("2moro").start.date).toBe("2026-06-13");
    expect(top("3 days b4 march 4").start.date).toBe("2027-03-01");
  });
  test("'yest' corrects to yesterday", () => {
    expect(top("yest").start.date).toBe("2026-06-11");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-en/test/e2e.test.ts`
Expected: the new block FAILS (unknown words / no merge).

- [ ] **Step 3: Implement in `packages/locale-en/src/index.ts`**

Replace the `NUMBER_WORDS` constant with:

```ts
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, ...TENS,
};
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18,
  nineteenth: 19, twentieth: 20, thirtieth: 30,
};
```

In `buildLexicon()`:
- after the existing number-word loop, add:
  ```ts
  for (const [word, n] of Object.entries(ORDINAL_WORDS)) add([word], { kind: "NUMBER", n, ordinal: true });
  ```
- extend the weekday abbreviations: change the weekday line to
  ```ts
  WEEKDAYS.forEach((name, day) => add([name, WEEKDAY_ABBR[day]!], { kind: "WEEKDAY", day }));
  add(["tues"], { kind: "WEEKDAY", day: 2 });
  add(["weds"], { kind: "WEEKDAY", day: 3 });
  add(["thurs"], { kind: "WEEKDAY", day: 4 });
  ```
- next to the MERIDIEM entries, add:
  ```ts
  add(["noon", "midday"], { kind: "TIME", h: 12, m: 0 });
  add(["midnight"], { kind: "TIME", h: 0, m: 0 });
  ```

Replace `parseNumber` in the exported adapter:

```ts
  parseNumber: (words) => {
    const value = (w: string): number | null =>
      NUMBER_WORDS[w] ?? ORDINAL_WORDS[w] ?? (/^\d+$/.test(w) ? Number(w) : null);
    if (words.length === 1) return value(words[0]!);
    if (words.length === 2) {
      const tens = TENS[words[0]!];
      const unit = NUMBER_WORDS[words[1]!] ?? ORDINAL_WORDS[words[1]!];
      if (tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9) return tens + unit;
    }
    return null;
  },
```

Replace `typoMap`:

```ts
  typoMap: {
    tmrw: "tomorrow", tmr: "tomorrow", "2moro": "tomorrow", "2mrw": "tomorrow",
    tdy: "today", yest: "yesterday", b4: "before", nxt: "next", wknd: "weekend",
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-en`
Expected: PASS (new block + all plan-01 e2e).

- [ ] **Step 5: Commit**

```bash
git add packages/locale-en
git commit -m "feat(locale-en): complete number words, noon/midnight, abbreviations, typo map"
```

---

### Task 3: locale-en `formatAccessible`

Screen-reader phrasing per spec §4.1: spelled-out, capitalized proper nouns, no symbols (`+`, `q1`), natural prepositions. It does NOT need to re-parse (that is `format`'s contract, not this one).

**Files:**
- Modify: `packages/locale-en/src/index.ts`
- Test: `packages/locale-en/test/accessible.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { en } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
const acc = (expr: DateExpr) => en.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("formatAccessible", () => {
  test("anchors", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("tomorrow");
    expect(acc(A({ kind: "relday", offset: 3 }))).toBe("3 days from today");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("next Friday");
    expect(acc(A({ kind: "weekday", day: 1 }))).toBe("Monday");
    expect(acc(A({ kind: "calendar", m: 2, d: 21, y: 2027 }))).toBe("March 21st, 2027");
    expect(acc(A({ kind: "calendar", m: 2, d: 21 }))).toBe("March 21st");
    expect(acc(A({ kind: "calendar", d: 21 }))).toBe("the 21st");
    expect(acc(A({ kind: "calendar", m: 8 }))).toBe("September");
    expect(acc(A({ kind: "calendar", y: 2027 }))).toBe("the year 2027");
  });

  test("offsets", () => {
    expect(acc({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("2 weeks after next Friday");
    expect(acc({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("3 days before March 4th");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("in 2 weeks");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "day", dir: -1 })).toBe("1 day ago");
  });

  test("ranges, periods, boundaries", () => {
    expect(acc({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("from Monday to Friday");
    expect(acc({ type: "period", period: { kind: "week" }, which: "next" })).toBe("next week");
    expect(acc({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("this weekend");
    expect(acc({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" }))
      .toBe("the first quarter of next year");
    expect(acc({ type: "period", period: { kind: "season", s: 3 }, which: "this" })).toBe("this winter");
    expect(acc({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("the end of this month");
  });

  test("with time", () => {
    expect(acc({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("Friday at 5 PM");
    expect(acc({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("tomorrow at 9:30 AM");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-en/test/accessible.test.ts`
Expected: FAIL (formatAccessible currently aliases `format`).

- [ ] **Step 3: Implement** (add to `packages/locale-en/src/index.ts`, below `format`)

```ts
// ---------- accessible formatting (screen-reader phrasing; NOT re-parseable) ----------

const QUARTER_NAMES = ["first", "second", "third", "fourth"];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function accessibleTime(t: { h: number; m: number }): string {
  const mer = t.h >= 12 ? "PM" : "AM";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return t.m === 0 ? `${h12} ${mer}` : `${h12}:${String(t.m).padStart(2, "0")} ${mer}`;
}

function accessibleAnchor(a: Anchor): string {
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
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id; // names: plan 04
  }
}

function accessible(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return accessibleAnchor(expr.anchor);
    case "offset": {
      const unit = expr.n === 1 ? expr.unit : `${expr.unit}s`;
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1 ? `in ${expr.n} ${unit}` : `${expr.n} ${unit} ago`;
      }
      return `${expr.n} ${unit} ${expr.dir === 1 ? "after" : "before"} ${accessible(expr.base)}`;
    }
    case "range": return `from ${accessible(expr.start)} to ${accessible(expr.end)}`;
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `the ${QUARTER_NAMES[p.q - 1]} quarter of ${expr.which} year`;
      if (p.kind === "season" && p.s !== undefined) return `${expr.which} ${SEASONS[p.s]![1][0]}`;
      const noun = p.kind === "quarter" ? "quarter" : p.kind === "season" ? "season" : p.kind;
      return `${expr.which} ${noun}`;
    }
    case "boundary": return `the ${expr.edge} of ${accessible(expr.of)}`;
    case "withTime": return `${accessible(expr.base)} at ${accessibleTime(expr.time)}`;
  }
}
```

and change the adapter line:

```ts
  formatAccessible: (expr) => accessible(expr),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-en`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/locale-en
git commit -m "feat(locale-en): dedicated screen-reader formatAccessible phrasing"
```

---

### Task 4: `@saywhen/conformance` — the semantic contract

Spec §9.2. The contract is a list of **named ASTs**. For each: ground truth = `resolveExpr(expr)` (locale-independent, already unit-tested); the locale must `format` it to text that `engine.parse` resolves to the same dates with no corrections. This makes the suite zero-config for new locales — they pass it or their formatter/lexicon is incomplete. The variation matrix (seeds × transforms) lands in Task 5.

**Files:**
- Create: `packages/conformance/package.json`, `packages/conformance/tsconfig.json`
- Create: `packages/conformance/src/cases.ts`, `packages/conformance/src/index.ts`
- Create: `packages/locale-en/test/conformance.test.ts`
- Modify: `packages/locale-en/package.json` (devDep)

- [ ] **Step 1: Write the failing consumer test**

`packages/locale-en/test/conformance.test.ts`:
```ts
import { runLocaleConformance } from "@saywhen/conformance";
import { en } from "../src/index.js";

runLocaleConformance({
  locale: en,
  seeds: [
    { text: "tomorrow", start: "2026-06-13" },
    { text: "next friday", start: "2026-06-19" },
    { text: "march 21st", start: "2027-03-21" },
    { text: "the 21st of march", start: "2027-03-21" },
    { text: "march 4 2026", start: "2026-03-04" },
    { text: "in 2 weeks", start: "2026-06-26" },
    { text: "next friday + 2 weeks", start: "2026-07-03" },
    { text: "monday to friday", start: "2026-06-15", end: "2026-06-19" },
    { text: "next week", start: "2026-06-14", end: "2026-06-20" },
    { text: "this weekend", start: "2026-06-13", end: "2026-06-14" },
    { text: "end of next month", start: "2026-07-31" },
    { text: "friday at 5pm", start: "2026-06-12" },
  ],
});
```

Add the workspace dep to `packages/locale-en/package.json` devDependencies:
```json
    "@saywhen/conformance": "workspace:*",
```
(keep `@saywhen/core` there too; peerDependencies stay exactly `["@saywhen/core"]` — the deps guard checks this).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-en/test/conformance.test.ts`
Expected: FAIL — package `@saywhen/conformance` does not exist.

- [ ] **Step 3: Scaffold the package**

`packages/conformance/package.json`:
```json
{
  "name": "@saywhen/conformance",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "peerDependencies": {
    "@saywhen/core": "workspace:*"
  },
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "vitest": "^3.1.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/conformance/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `pnpm install` (links the workspace).

- [ ] **Step 4: Write `src/cases.ts`**

```ts
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
```

- [ ] **Step 5: Write `src/index.ts`**

```ts
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
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/locale-en/test/conformance.test.ts`
Expected: PASS — 25 semantic-contract tests under `locale conformance: en`. If any case fails, the bug is in the en **formatter or lexicon** (it emitted vocabulary it cannot re-parse) — fix `locale-en`, not the suite.

Also run: `pnpm typecheck` — the new package must typecheck.

- [ ] **Step 7: Commit**

```bash
git add packages/conformance packages/locale-en pnpm-lock.yaml
git commit -m "feat(conformance): semantic locale contract, passing for locale-en"
```

---

### Task 5: Conformance — variation matrix (must-pass + fuzzy tiers)

hot-date's proven approach (spec §9.2): seed phrases × transforms. Case/whitespace transforms are **must-pass**; typo transforms are a **fuzzy tier** with a pass-rate threshold (deterministic transforms, so the rate is stable).

**Files:**
- Create: `packages/conformance/src/transforms.ts`
- Create: `packages/conformance/test/transforms.test.ts`
- Modify: `packages/conformance/src/index.ts`

- [ ] **Step 1: Write the failing unit tests**

`packages/conformance/test/transforms.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { dropLastCharOfLongestWord, MUST_PASS_TRANSFORMS, swapInLongestWord } from "../src/transforms.js";

describe("typo transforms are deterministic and target the longest alphabetic word", () => {
  test("swapInLongestWord", () => {
    expect(swapInLongestWord("next friday + 2 weeks")).toBe("next firday + 2 weeks");
    expect(swapInLongestWord("this weekend")).toBe("this wekeend");
    expect(swapInLongestWord("next week")).toBeNull(); // longest word < 5 chars → skip
  });
  test("dropLastCharOfLongestWord", () => {
    expect(dropLastCharOfLongestWord("the 21st of march")).toBe("the 21st of marc");
    expect(dropLastCharOfLongestWord("in 2 weeks")).toBe("in 2 week");
    expect(dropLastCharOfLongestWord("next week")).toBeNull();
  });
  test("must-pass transforms preserve token text", () => {
    const t = Object.fromEntries(MUST_PASS_TRANSFORMS);
    expect(t["uppercase"]!("next friday")).toBe("NEXT FRIDAY");
    expect(t["extra-spaces"]!("next friday")).toBe("next  friday");
    expect(t["padded"]!("next friday")).toBe("  next friday ");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/conformance`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/transforms.ts`**

```ts
export type Transform = (s: string) => string;

export const MUST_PASS_TRANSFORMS: Array<[string, Transform]> = [
  ["identity", (s) => s],
  ["uppercase", (s) => s.toUpperCase()],
  ["capitalized", (s) => s.replace(/\b[a-zа-яё]/g, (c) => c.toUpperCase())],
  ["extra-spaces", (s) => s.replace(/ /g, "  ")],
  ["padded", (s) => `  ${s} `],
];

function longestAlphaWord(s: string): string | null {
  const words = s.match(/[a-zа-яё]+/g) ?? [];
  let best: string | null = null;
  for (const w of words) if (best === null || w.length > best.length) best = w;
  return best;
}

function replaceWord(s: string, word: string, repl: string): string {
  return s.replace(word, repl);
}

/** Swap the first distinct adjacent letter pair (from index 1) in the longest word ≥ 5 chars. */
export function swapInLongestWord(s: string): string | null {
  const w = longestAlphaWord(s);
  if (!w || w.length < 5) return null;
  for (let i = 1; i + 1 < w.length; i++) {
    if (w[i] !== w[i + 1]) {
      return replaceWord(s, w, w.slice(0, i) + w[i + 1]! + w[i]! + w.slice(i + 2));
    }
  }
  return null;
}

/** Drop the final character of the longest word ≥ 5 chars. */
export function dropLastCharOfLongestWord(s: string): string | null {
  const w = longestAlphaWord(s);
  if (!w || w.length < 5) return null;
  return replaceWord(s, w, w.slice(0, -1));
}

export const FUZZY_TRANSFORMS: Array<[string, (s: string) => string | null]> = [
  ["swap-adjacent", swapInLongestWord],
  ["drop-last-char", dropLastCharOfLongestWord],
];
```

- [ ] **Step 4: Add the matrix to `runLocaleConformance`**

In `src/index.ts`, import the transforms:
```ts
import { FUZZY_TRANSFORMS, MUST_PASS_TRANSFORMS } from "./transforms.js";
```
read the threshold in the destructuring:
```ts
  const { locale, holidays = [], seeds, fuzzyPassRate = 0.7 } = config;
```
and append inside the top-level `describe`, after the semantic contract block:

```ts
    describe("variation matrix — must pass (case/whitespace)", () => {
      for (const seed of seeds) {
        for (const [tname, t] of MUST_PASS_TRANSFORMS) {
          test(`${tname}: "${seed.text}"`, () => {
            const r = engine.parse(t(seed.text), CONFORMANCE_CTX);
            const top = r.candidates[0];
            expect(top, `no parse for transformed "${seed.text}"`).toBeDefined();
            expect(top!.start.date).toBe(seed.start);
            expect(top!.end.date).toBe(seed.end ?? seed.start);
          });
        }
      }
    });

    describe("variation matrix — fuzzy tier (typos)", () => {
      test(`pass rate ≥ ${fuzzyPassRate}`, () => {
        let attempted = 0;
        let passed = 0;
        const failures: string[] = [];
        for (const seed of seeds) {
          for (const [tname, t] of FUZZY_TRANSFORMS) {
            const mutated = t(seed.text);
            if (mutated === null) continue; // seed too short for this transform
            attempted++;
            const top = engine.parse(mutated, CONFORMANCE_CTX).candidates[0];
            if (top && top.start.date === seed.start && top.end.date === (seed.end ?? seed.start)) {
              passed++;
            } else {
              failures.push(`${tname}: "${mutated}" (from "${seed.text}")`);
            }
          }
        }
        expect(attempted).toBeGreaterThan(0);
        expect(passed / attempted, `fuzzy failures:\n${failures.join("\n")}`)
          .toBeGreaterThanOrEqual(fuzzyPassRate);
      });
    });
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/conformance packages/locale-en/test/conformance.test.ts`
Expected: PASS — transforms unit tests, ~60 must-pass matrix tests, and the fuzzy tier above 0.7 (a handful of fuzzy misses like `mont` → `mon` are expected and fine; the log lists them).

- [ ] **Step 6: Commit**

```bash
git add packages/conformance packages/locale-en
git commit -m "feat(conformance): seed-phrase variation matrix with must-pass and fuzzy tiers"
```

---

### Task 6: fast-check round-trip property

Spec §9.3: random `DateExpr` → `locale.format` → `engine.parse` → identical resolved dates. Ground truth via `resolveExpr` with `allowPast: true` on both sides (kills roll-forward asymmetry); unresolvable ASTs (e.g. random ranges that end before they start) are skipped with `fc.pre`. Generated shapes are restricted to what the formatter emits re-parseable text for (documented limitation: `season` without an index formats as the word "season", which is not vocabulary — always generate an index).

**Files:**
- Modify: root `package.json` (devDep)
- Create: `packages/locale-en/test/roundtrip.property.test.ts`

- [ ] **Step 1: Install fast-check**

Run: `pnpm add -Dw fast-check`
Expected: added to root devDependencies.

- [ ] **Step 2: Write the property test**

```ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  createEngine, resolveExpr,
  type DateExpr, type ParseContext, type Wall,
} from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
const CTX: ParseContext = {
  now: new Date("2026-06-12T08:00:00Z"),
  timeZone: "America/New_York",
  allowPast: true,
};
const RESOLVE_OPTS = {
  now: CTX.now, timeZone: CTX.timeZone, weekStart: 0 as const, allowPast: true,
};

const wallDate = (w: Wall) =>
  `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;

const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);
const relArb = fc.constantFrom("this", "next", "last");
const unitArb = fc.constantFrom("day", "week", "month", "year");

const anchorArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
  fc.record({
    m: fc.integer({ min: 0, max: 11 }),
    d: fc.integer({ min: 1, max: 28 }),
    y: fc.option(fc.integer({ min: 2025, max: 2030 }), { nil: undefined }),
  }).map(({ m, d, y }) => A({ kind: "calendar", m, d, ...(y !== undefined ? { y } : {}) })),
  fc.integer({ min: 1, max: 28 }).map((d) => A({ kind: "calendar", d })),
  fc.integer({ min: 0, max: 11 }).map((m) => A({ kind: "calendar", m })),
  fc.integer({ min: 2025, max: 2030 }).map((y) => A({ kind: "calendar", y })),
);

const periodArb: fc.Arbitrary<DateExpr> = fc.record({
  period: fc.oneof(
    fc.constantFrom({ kind: "week" }, { kind: "month" }, { kind: "year" }, { kind: "weekend" }),
    fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined })
      .map((q) => (q === undefined ? { kind: "quarter" } : { kind: "quarter", q })),
    fc.integer({ min: 0, max: 3 }).map((s) => ({ kind: "season", s })), // always indexed (see note)
  ),
  which: relArb,
}).map(({ period, which }) => ({ type: "period", period, which } as DateExpr));

const offsetArb: fc.Arbitrary<DateExpr> = fc.record({
  base: fc.oneof(anchorArb, fc.constant(A({ kind: "now" }))),
  n: fc.integer({ min: 1, max: 12 }),
  unit: unitArb,
  dir: fc.constantFrom(1, -1),
}).map((o) => ({ type: "offset", ...o } as DateExpr));

const rangeArb: fc.Arbitrary<DateExpr> = fc.record({ start: anchorArb, end: anchorArb })
  .map(({ start, end }) => ({ type: "range", start, end } as DateExpr));

const boundaryArb: fc.Arbitrary<DateExpr> = fc.record({
  of: periodArb,
  edge: fc.constantFrom("start", "end"),
}).map(({ of, edge }) => ({ type: "boundary", of, edge } as DateExpr));

const pointAnchorArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
);
const withTimeArb: fc.Arbitrary<DateExpr> = fc.record({
  base: pointAnchorArb,
  time: fc.record({ h: fc.integer({ min: 0, max: 23 }), m: fc.constantFrom(0, 15, 30, 45) }),
}).map(({ base, time }) => ({ type: "withTime", base, time } as DateExpr));

const exprArb = fc.oneof(anchorArb, periodArb, offsetArb, rangeArb, boundaryArb, withTimeArb);

describe("round-trip property (spec §9.3)", () => {
  test("format → parse → identical resolved dates", () => {
    fc.assert(
      fc.property(exprArb, (expr) => {
        const expected = resolveExpr(expr, RESOLVE_OPTS);
        fc.pre(expected.ok);
        const text = en.format(expr, { now: CTX.now, timeZone: CTX.timeZone });
        const r = engine.parse(text, CTX);
        expect(r.candidates.length, `no parse for "${text}" (${JSON.stringify(expr)})`).toBeGreaterThan(0);
        const top = r.candidates[0]!;
        expect(top.start.date, `start of "${text}"`).toBe(wallDate(expected.value.start));
        expect(top.end.date, `end of "${text}"`).toBe(wallDate(expected.value.end));
      }),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 3: Run it**

Run: `pnpm vitest run packages/locale-en/test/roundtrip.property.test.ts`
Expected: PASS. **If it fails**, fast-check prints a shrunk counterexample `{expr, text}`. That is a real formatter/grammar/resolver drift bug, which is this suite's purpose:
1. Add the shrunk case as a named regression test in the most specific suite (formatter bug → e2e round-trip block; resolver bug → `packages/core/test/resolve.test.ts`).
2. Fix the code (formatter must emit lexicon vocabulary; never weaken the property).
3. Re-run with the same seed (`fc.assert(..., { seed: <printed seed> })`) to confirm, then remove the explicit seed.
If the fix is non-trivial (> ~30 lines), stop and surface it to your human partner instead of improvising.

- [ ] **Step 4: Commit**

```bash
git add packages/locale-en/test/roundtrip.property.test.ts package.json pnpm-lock.yaml
git commit -m "test(locale-en): fast-check round-trip property over random DateExprs"
```

---

### Task 7: `tools/oracle` — chrono differential harness

Spec §9.4. chrono-node appears ONLY in this package's devDeps (spec §3 rule; the deps guard already polices `packages/*`). Three parts: a template phrase generator, a comparator (calendar-date equality in the reference zone), and a report renderer. Two test files: `oracle.test.ts` always runs (generator/comparator units + a curated **must-agree gate** — phrases where disagreement means we broke something); `run-oracle.test.ts` performs the full differential sweep and writes `results/diffs.md`, gated behind `ORACLE=1` so the normal suite stays side-effect-free.

**Files:**
- Create: `tools/oracle/package.json`, `tools/oracle/tsconfig.json`
- Create: `tools/oracle/src/templates.ts`, `tools/oracle/src/compare.ts`, `tools/oracle/src/report.ts`
- Create: `tools/oracle/test/oracle.test.ts`, `tools/oracle/test/run-oracle.test.ts`
- Modify: root `package.json` (typecheck filter + `oracle` script), `.gitignore`

- [ ] **Step 1: Scaffold the package**

`tools/oracle/package.json`:
```json
{
  "name": "@saywhen-tools/oracle",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/locale-en": "workspace:*",
    "chrono-node": "^2.7.0",
    "vitest": "^3.1.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`tools/oracle/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Root `package.json` — make typecheck cover tools and add the oracle script:
```json
    "typecheck": "pnpm -r --filter './packages/*' --filter './tools/*' exec tsc --noEmit",
    "oracle": "ORACLE=1 vitest run tools/oracle/test/run-oracle.test.ts",
```

Append to `.gitignore`:
```
tools/oracle/results/
```

Run: `pnpm install`
Expected: chrono-node resolves under tools/oracle only.

- [ ] **Step 2: Write the failing unit tests**

`tools/oracle/test/oracle.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { generatePhrases } from "../src/templates.js";
import { compareOne } from "../src/compare.js";
import { renderReport } from "../src/report.js";

const engine = createEngine({ locale: en });

describe("templates", () => {
  test("generates a broad fixed corpus", () => {
    const phrases = generatePhrases();
    expect(phrases.length).toBeGreaterThan(100);
    expect(phrases).toContain("next friday");
    expect(phrases).toContain("in 2 weeks");
    expect(new Set(phrases).size).toBe(phrases.length); // no duplicates
  });
});

describe("compareOne", () => {
  test("agreement on an absolute date", () => {
    const r = compareOne(engine, "june 1 2027");
    expect(r).toMatchObject({ ours: "2027-06-01", chrono: "2027-06-01", agree: true });
  });
  test("records disagreement rather than throwing", () => {
    const r = compareOne(engine, "zorp blarg");
    expect(r.agree).toBe(false);
    expect(r.ours).toBeNull();
  });
});

describe("renderReport", () => {
  test("lists only disagreements with a summary", () => {
    const md = renderReport([
      { text: "a", ours: "2026-01-01", chrono: "2026-01-01", agree: true },
      { text: "b", ours: "2026-01-02", chrono: "2026-01-03", agree: false },
    ]);
    expect(md).toContain("Agreement: 1/2");
    expect(md).toContain("| b | 2026-01-02 | 2026-01-03 |");
    expect(md).not.toContain("| a |");
  });
});

// Disagreement on any of these means WE broke something (or a chrono major changed):
// simple absolutes and unambiguous relatives both engines define identically.
const MUST_AGREE = [
  "today", "tomorrow", "yesterday",
  "in 3 days", "in 2 weeks",
  "june 15", "june 1 2027", "december 25 2026",
  "3/4/2026", "next monday",
];

describe("must-agree gate", () => {
  test.each(MUST_AGREE)("'%s'", (phrase) => {
    const r = compareOne(engine, phrase);
    expect(r, JSON.stringify(r)).toMatchObject({ agree: true });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run tools/oracle/test/oracle.test.ts`
Expected: FAIL — src modules missing.

- [ ] **Step 4: Implement the three modules**

`tools/oracle/src/templates.ts`:
```ts
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Fixed template corpus; deterministic, duplicate-free. */
export function generatePhrases(): string[] {
  const out = new Set<string>();
  for (const wd of WEEKDAYS) {
    out.add(wd);
    out.add(`next ${wd}`);
    out.add(`last ${wd}`);
    out.add(`this ${wd}`);
  }
  for (const mo of MONTHS) {
    for (const d of [1, 15, 28]) {
      out.add(`${mo} ${d}`);
      out.add(`${mo} ${d} 2027`);
    }
  }
  for (const n of [1, 2, 3, 10]) {
    for (const u of ["day", "week", "month"]) {
      const unit = n === 1 ? u : `${u}s`;
      out.add(`in ${n} ${unit}`);
      out.add(`${n} ${unit} ago`);
    }
  }
  out.add("today");
  out.add("tomorrow");
  out.add("yesterday");
  out.add("3/4/2026");
  out.add("12/25/2026");
  out.add("friday at 5pm");
  out.add("monday at 9:30am");
  return [...out];
}
```

`tools/oracle/src/compare.ts`:
```ts
import * as chrono from "chrono-node";
import type { Engine } from "@saywhen/core";

export const ORACLE_TZ = "America/New_York";
/** Friday 2026-06-12, 08:00 EDT. */
export const ORACLE_NOW = new Date("2026-06-12T12:00:00Z");

export interface OracleResult {
  text: string;
  ours: string | null;
  chrono: string | null;
  agree: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORACLE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export function localDateString(d: Date): string {
  return DATE_FMT.format(d); // en-CA renders YYYY-MM-DD
}

export function compareOne(engine: Engine, text: string, now: Date = ORACLE_NOW): OracleResult {
  const r = engine.parse(text, { now, timeZone: ORACLE_TZ, allowPast: true });
  const ours = r.candidates[0]?.start.date ?? null;
  const parsed = chrono.parseDate(text, { instant: now, timezone: ORACLE_TZ });
  const theirs = parsed ? localDateString(parsed) : null;
  return { text, ours, chrono: theirs, agree: ours !== null && ours === theirs };
}
```

`tools/oracle/src/report.ts`:
```ts
import type { OracleResult } from "./compare.js";

export function renderReport(results: OracleResult[]): string {
  const diffs = results.filter((r) => !r.agree);
  return [
    "# chrono differential report",
    "",
    `Agreement: ${results.length - diffs.length}/${results.length}`,
    "",
    "| phrase | ours | chrono |",
    "| --- | --- | --- |",
    ...diffs.map((d) => `| ${d.text} | ${d.ours ?? "—"} | ${d.chrono ?? "—"} |`),
    "",
    "Triage every row into `triage/bugs.md` or `triage/wontfix.md` (see Task 8).",
    "",
  ].join("\n");
}
```

`tools/oracle/test/run-oracle.test.ts`:
```ts
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
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run tools/oracle/test/oracle.test.ts && pnpm typecheck`
Expected: PASS, including all 10 must-agree phrases. If a must-agree phrase disagrees, inspect `compareOne`'s raw values first — a harness bug (timezone/reference handling) is far more likely than a same-day engine regression.

Also: `pnpm vitest run` — the full-run suite must show as **skipped** without `ORACLE=1`.

- [ ] **Step 6: Commit**

```bash
git add tools/oracle package.json pnpm-lock.yaml .gitignore
git commit -m "feat(oracle): chrono differential harness with must-agree gate"
```

---

### Task 8: Oracle first run + triage

The differential sweep will disagree on phrases where our documented semantics differ from chrono's (e.g. our week-relative `last monday` = previous week's Monday vs chrono's "most recent past Monday"). Each diff family gets a verdict: **wontfix** (deliberate, spec-backed difference — document the rationale) or **bug** (genuine defect — small fixes land now with a regression test; larger ones are recorded for the next plan).

**Files:**
- Create: `tools/oracle/triage/wontfix.md`, `tools/oracle/triage/bugs.md`

- [ ] **Step 1: Run the sweep**

Run: `pnpm oracle`
Expected: PASS; console prints the agreement rate; `tools/oracle/results/diffs.md` exists (gitignored).

- [ ] **Step 2: Read the diffs and triage every family**

Read `tools/oracle/results/diffs.md`. Group rows by template family (all `last <weekday>` rows are one family). For each family decide:
- **wontfix** — our behavior matches the resolver semantics locked in plan 01 Task 11 / spec §5; chrono simply defines it differently. Record phrase example, both values, and the spec-backed rationale.
- **bug** — our value is wrong by our OWN spec. If the fix is small (≤ ~30 lines incl. test): write the failing regression test in the owning package, fix, commit separately as `fix(...)`. Otherwise record it in `bugs.md` with enough detail to schedule into plan 03.

Seed `tools/oracle/triage/wontfix.md` with this structure (add real rows from the run):
```markdown
# Oracle wontfix — deliberate semantic differences vs chrono

| family | example | ours | chrono | rationale |
| --- | --- | --- | --- | --- |
| last <weekday> | last monday | 2026-06-01 | 2026-06-08 | spec: this/next/last are week-relative (plan 01 resolver semantics); chrono uses most-recent-past |
```

Seed `tools/oracle/triage/bugs.md`:
```markdown
# Oracle bugs — genuine defects found by differential testing

Open items are scheduled into the next plan. Fixed items move to the bottom with the fixing commit.

| status | phrase | ours | chrono (expected-ish) | notes |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 3: Verify the suite still passes after any fixes**

Run: `pnpm vitest run && pnpm typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add tools/oracle/triage
git commit -m "docs(oracle): triage first differential run into bugs/wontfix"
```

---

### Task 9: tsdown publish builds

Spec §3 tooling. Dev-time `exports` stay pointed at `./src/index.ts` (workspace tests keep importing source); `publishConfig.exports` overrides to `dist/` at pack time (pnpm applies `publishConfig` on publish). `.gitignore` already excludes `dist/`. Verification is behavioral: build, inspect outputs, runtime-import core's dist. (locale-en's dist can't be runtime-imported standalone — its `@saywhen/core` peer resolves to the source-exports workspace copy; a true publish dry-run is future pre-publish work alongside Changesets.)

**Files:**
- Modify: root `package.json` (devDep + build script)
- Create: `packages/core/tsdown.config.ts`, `packages/locale-en/tsdown.config.ts`
- Modify: `packages/core/package.json`, `packages/locale-en/package.json`

- [ ] **Step 1: Install tsdown and add the root script**

Run: `pnpm add -Dw tsdown`

Root `package.json` scripts:
```json
    "build": "pnpm -r --filter './packages/*' run build",
```
(`@saywhen/conformance` is private with no build script; `pnpm run` skips packages without the script — if your pnpm version errors instead, add `--if-present`.)

- [ ] **Step 2: Per-package config**

`packages/core/tsdown.config.ts` and `packages/locale-en/tsdown.config.ts` (identical content):
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
});
```

`packages/core/package.json` — add:
```json
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
```
and add to its scripts:
```json
    "build": "tsdown"
```

`packages/locale-en/package.json` — same three additions (`files`, `publishConfig`, `build` script), verbatim the same JSON.

- [ ] **Step 3: Build and verify**

Run: `pnpm build && ls packages/core/dist packages/locale-en/dist`
Expected: each dist contains `index.js` and `index.d.ts` (tsdown may also emit `.d.ts` sourcemaps — fine).

Run:
```bash
node --input-type=module -e "const m = await import('./packages/core/dist/index.js'); if (typeof m.createEngine !== 'function') throw new Error('dist missing createEngine'); console.log('core dist OK');"
```
Expected: `core dist OK`.

Run: `grep -c "from \"@saywhen/core\"" packages/locale-en/dist/index.js || grep -c "from '@saywhen/core'" packages/locale-en/dist/index.js`
Expected: ≥ 1 — core is externalized (peer dep), not bundled. If it was bundled, add `external: ["@saywhen/core"]` to locale-en's tsdown config.

- [ ] **Step 4: Full suite still green**

Run: `pnpm vitest run && pnpm typecheck`
Expected: PASS (dist is inert during dev; tests still hit src).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml packages/core packages/locale-en
git commit -m "build: tsdown ESM+dts builds with publishConfig dist exports"
```

---

### Task 10: Bench + p99 latency guard

Spec §9.5: tinybench on challenge phrases (vitest's `bench` is tinybench under the hood), p99 < 1 ms/parse budget. The bench file gives detailed numbers on demand; a plain vitest test guards p99 with 5× headroom so CI noise can't flake it while still catching order-of-magnitude regressions (the measured value is logged against the 1 ms budget).

**Files:**
- Create: `packages/locale-en/bench/parse.bench.ts`, `packages/locale-en/test/perf.test.ts`
- Modify: `vitest.config.ts`, root `package.json`

- [ ] **Step 1: Exclude vendored benches and add the script**

`vitest.config.ts` — the vendored hot-date repo has its own `bench/parser.bench.ts`; exclude it from benchmark discovery:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .var/ holds vendored reference libraries — never run their suites
    exclude: ["**/node_modules/**", ".var/**"],
    benchmark: {
      exclude: ["**/node_modules/**", ".var/**"],
    },
  },
});
```

Root `package.json` scripts:
```json
    "bench": "vitest bench --run",
```

- [ ] **Step 2: Write the perf guard test (failing only if the engine is slow)**

`packages/locale-en/test/perf.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

export const CHALLENGE_PHRASES = [
  "tomorrow", "next friday", "next friday + 2 weeks", "the twenty first of march",
  "monday to friday", "this weekend", "end of next month", "friday at 5pm",
  "3/4", "in 2 weeks", "3 days b4 march 4", "fridya",
];

describe("parse latency", () => {
  test("p99 within budget (1ms target, 5ms hard cap)", () => {
    for (const p of CHALLENGE_PHRASES) engine.parse(p, CTX); // warm-up
    const samples: number[] = [];
    for (let round = 0; round < 50; round++) {
      for (const p of CHALLENGE_PHRASES) {
        const t0 = performance.now();
        engine.parse(p, CTX);
        samples.push(performance.now() - t0);
      }
    }
    samples.sort((a, b) => a - b);
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    console.log(`parse p99: ${p99.toFixed(3)}ms over ${samples.length} samples (budget 1ms, cap 5ms)`);
    expect(p99).toBeLessThan(5);
  });
});
```

- [ ] **Step 3: Write the bench file**

`packages/locale-en/bench/parse.bench.ts`:
```ts
import { bench, describe } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const PHRASES = [
  "tomorrow", "next friday", "next friday + 2 weeks", "the twenty first of march",
  "monday to friday", "this weekend", "end of next month", "friday at 5pm",
  "3/4", "in 2 weeks", "3 days b4 march 4", "fridya",
];

describe("engine.parse", () => {
  bench("challenge set (12 phrases)", () => {
    for (const p of PHRASES) engine.parse(p, CTX);
  });
  bench("ambiguity worst case: '3/4 to 5/6'", () => {
    engine.parse("3/4 to 5/6", CTX);
  });
  bench("typo worst case: 'tomorow at fiev pm'", () => {
    engine.parse("tomorow at fiev pm", CTX);
  });
});
```

- [ ] **Step 4: Run both**

Run: `pnpm vitest run packages/locale-en/test/perf.test.ts`
Expected: PASS with a logged p99 well under 1 ms. If p99 exceeds 1 ms (budget) but is under 5 ms (cap), the test passes — note the number in the commit message; if it exceeds 5 ms, profile before proceeding (the likely culprits: typo correction scanning the lexicon per LITERAL token, or stream explosion).

Run: `pnpm bench`
Expected: tinybench table for the three benches; only ours run (`.var/` excluded).

- [ ] **Step 5: Commit**

```bash
git add packages/locale-en vitest.config.ts package.json
git commit -m "test(locale-en): parse benchmark and p99 latency guard"
```

---

### Task 11: Full verification

- [ ] **Step 1: Everything green**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected: all test files pass (core, conformance, locale-en incl. property + perf, oracle units + must-agree; the ORACLE-gated sweep skipped), typecheck clean across packages *and* tools, builds emit dist for core + locale-en.

- [ ] **Step 2: Dependency rules hold**

Run: `pnpm vitest run packages/core/test/deps.test.ts`
Expected: PASS — core still zero-dep; locale-en peers = exactly `["@saywhen/core"]`; chrono-node nowhere under `packages/`.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short   # should be clean; commit anything left over with an appropriate message
```

---

## Done — definition of success for plan 02

- locale-en parses compound number words ("the twenty first of march"), noon/midnight, extended abbreviations, and digit-bearing curated typos ("2moro", "b4").
- `formatAccessible` produces dedicated screen-reader phrasing (tested string-exact).
- `@saywhen/conformance` exists and locale-en passes: 25 semantic-contract cases + seed×transform matrix (must-pass tier 100%, fuzzy tier ≥ 70%). Plan 03's locale-ru will consume the same suite unchanged.
- fast-check round-trip property (300 runs) green: random `DateExpr` → format → parse → identical dates.
- chrono oracle harness in `tools/oracle` with a 10-phrase must-agree gate in the default suite; full sweep behind `pnpm oracle`; first run triaged into `triage/bugs.md` / `triage/wontfix.md`.
- `pnpm build` emits ESM + d.ts via tsdown for core and locale-en with publish-time dist exports.
- Bench + p99 guard in place; measured p99 logged against the 1 ms budget.

**Out of scope (later plans):** locale-ru + its conformance run (03); holiday packs + holiday-relative grammar ("friday before christmas") (04); suggest/ghost (05); controller/react/registry/playground + wire format + axe/a11y component tests (06); Changesets + npm publish dry-run (pre-publish task, scheduled when the npm scope is decided); fixing oracle-discovered bugs larger than ~30 lines (scheduled into 03 via `triage/bugs.md`).
