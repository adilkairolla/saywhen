# saywhen Plan 01 — Core Engine + Minimal locale-en

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working `@saywhen/core` engine — `createEngine({ locale }).parse(text, ctx)` returns ranked, resolved candidates for English phrases like "next friday + 2 weeks", "3/4" (ambiguous), "end of next month", "friday at 5pm", "last 2 weeks" — with zero runtime dependencies.

**Architecture:** Five pure stages (tokenize → lexicon/typo → grammar → score → resolve) per spec §5 (`docs/superpowers/specs/2026-06-11-saywhen-design.md`). Locale layer produces a semantic-token lattice; a universal parser-combinator grammar returns ALL parses as unresolved `DateExpr` ASTs; a zero-dep `ZonedDate` resolver evaluates them against an injected `now`. A minimal `@saywhen/locale-en` is developed in lockstep; core unit tests use an inline fixture locale so core never depends on a locale package.

**Tech Stack:** pnpm workspaces, TypeScript strict, Vitest 3, tsdown. Node ≥ 20 (needs full `Intl.DateTimeFormat` timezone data). No runtime deps anywhere in this plan.

**This is plan 1 of 6.** The series follows spec §10; later plans are written when their predecessor completes (contracts may shift slightly after locale-ru validates them):

| Plan | Scope | Spec |
|---|---|---|
| **01 (this)** | monorepo scaffold, core engine, minimal locale-en | §3, §4, §5, §8 |
| 02 | locale-en complete, conformance suite, fast-check round-trip, chrono oracle | §9 |
| 03 | locale-ru | §4.1, §9.2 |
| 04 | holidays-us, holidays-ru | §4.5 |
| 05 | core/suggest (ghost, starters, range-building mode) | §6 |
| 06 | core/controller, react, registry, playground | §7 |

**Conventions for every task below:**
- Run tests from repo root: `pnpm vitest run <file>` (vitest is hoisted to the root).
- Commit after every green task. Messages use conventional commits.
- All test dates inject `now`; never read the wall clock.
- "m" in all calendar fields is **0-based month** (0 = January), matching `Date`. Days are 1-based. This is uniform across the whole codebase.

## File structure (what this plan creates)

```
package.json                      workspace root (private)
pnpm-workspace.yaml
tsconfig.base.json
packages/core/
  package.json                    @saywhen/core — ZERO deps
  tsconfig.json
  src/
    index.ts                      public exports
    types.ts                      SemToken, DateExpr, LocaleAdapter, ParseResult…
    normalize.ts                  NFKC/case/dash/quote folding
    zoned-date.ts                 Intl-based tz offsets, wallToUtc, calendar math
    lexicon.ts                    lexicon index build + validateLocale
    lattice.ts                    raw tokens → semantic token lattice → streams
    typo.ts                       Damerau-Levenshtein, keyboard weights
    combinators.ts                tok/seq/alt/opt/many/map + expectation tracking
    grammar.ts                    ~15 universal rules → DateExpr[] (all parses)
    resolve.ts                    DateExpr × ResolveContext → wall ranges
    score.ts                      confidence, dedupe, status
    engine.ts                     createEngine / engine.parse
  test/
    fixtures/test-locale.ts       tiny inline LocaleAdapter for core unit tests
    fixtures/toks.ts              SemToken factory helpers for grammar tests
    zoned-date.test.ts            DST matrix
    calendar.test.ts              arithmetic + clamps
    lexicon.test.ts
    lattice.test.ts
    typo.test.ts
    combinators.test.ts
    grammar.test.ts
    resolve.test.ts
    score.test.ts
    engine.test.ts                integration on fixture locale
    deps.test.ts                  zero-dependency guard
packages/locale-en/
  package.json                    @saywhen/locale-en — peerDep core
  tsconfig.json
  src/index.ts                    minimal en adapter (data + tokenize + format)
  test/e2e.test.ts                acceptance: real English through the real engine
```

---

### Task 0: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts` (placeholder export so typecheck passes)

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "saywhen-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "test": "vitest run",
    "typecheck": "pnpm -r --filter './packages/*' exec tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.1.0"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - apps/*
  - tools/*
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022"]
  }
}
```

Note: `lib` deliberately excludes `DOM` — core using a DOM API becomes a compile error (spec §3 dependency rule).

- [ ] **Step 2: Core package**

`packages/core/package.json`:
```json
{
  "name": "@saywhen/core",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```
(`exports` points at source for now; tsdown build output is wired up in plan 02 when there is something worth publishing.)

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/core/src/index.ts`:
```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 3: Install and verify**

Run: `pnpm install && pnpm typecheck`
Expected: both succeed, no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with @saywhen/core"
```

---

### Task 1: Core types

The single source of truth for every contract in spec §4. Pure types — the verification step is `tsc`.

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// ---------- units & periods ----------

export type Unit = "day" | "week" | "month" | "year" | "hour" | "minute";

export type PeriodRef =
  | { kind: "week" }
  | { kind: "month" }
  | { kind: "year" }
  | { kind: "weekend" }
  | { kind: "quarter"; q?: 1 | 2 | 3 | 4 }
  | { kind: "season"; s?: 0 | 1 | 2 | 3 }; // 0 spring, 1 summer, 2 autumn, 3 winter

// ---------- semantic tokens (spec §4.2) ----------

export type Rel = "this" | "next" | "last";

export type SemPayload =
  | { kind: "WEEKDAY"; day: number }              // 0 Sunday … 6 Saturday
  | { kind: "MONTH"; month: number }              // 0 January … 11 December
  | { kind: "NUMBER"; n: number; ordinal?: boolean }
  | { kind: "YEAR"; year: number }
  | { kind: "TIME"; h: number; m: number }        // 24h wall clock
  | { kind: "MERIDIEM"; value: "am" | "pm" }
  | { kind: "RELDAY"; offset: number }            // today 0, tomorrow +1, …
  | { kind: "REL"; which: Rel }
  | { kind: "UNIT"; unit: Unit }
  | { kind: "OP"; op: 1 | -1 }
  | { kind: "DIRECTION"; dir: "before" | "after" | "from" | "ago" | "in" }
  | { kind: "CONNECTOR" }
  | { kind: "BOUNDARY"; edge: "start" | "end" }
  | { kind: "PERIOD"; period: PeriodRef }
  | { kind: "HOLIDAY"; id: string }
  | { kind: "FILLER" }
  | { kind: "LITERAL" };

export type SemKind = SemPayload["kind"];

export interface TokenMeta {
  span: [number, number]; // into the NORMALIZED input string
  source: string;         // the normalized surface text
  confidence: number;     // 1.0; lowered by typo correction
}

export type SemToken = SemPayload & TokenMeta;

// ---------- AST (spec §4.3) — parsed, UNRESOLVED ----------

export type Anchor =
  | { kind: "now" }
  | { kind: "relday"; offset: number }
  | { kind: "weekday"; day: number; which?: Rel }
  | { kind: "calendar"; y?: number; m?: number; d?: number }
  | { kind: "holiday"; id: string; year?: number };

export type DateExpr =
  | { type: "anchor"; anchor: Anchor }
  | { type: "offset"; base: DateExpr; n: number; unit: Unit; dir: 1 | -1 }
  | { type: "range"; start: DateExpr; end: DateExpr }
  | { type: "period"; period: PeriodRef; which: Rel }
  | { type: "boundary"; of: DateExpr; edge: "start" | "end" }
  | { type: "withTime"; base: DateExpr; time: { h: number; m: number } };

// ---------- locale contract (spec §4.1) ----------

export interface RawToken {
  text: string;           // normalized surface
  span: [number, number]; // into the normalized input
}

/** normalized surface form → semantic payload(s) */
export type Lexicon = Record<string, SemPayload[]>;

export interface KeyboardLayout {
  /** physical rows, e.g. ["qwertyuiop", "asdfghjkl", "zxcvbnm"] */
  rows: string[];
}

export interface FormatOptions {
  now: Date;
  timeZone: string;
}

export interface LocaleRule {
  name: string;
  /** extension point this rule is injected at (spec §5.3) */
  at: "anchor" | "expression";
  /** try to match tokens starting at i; return null or the parse */
  match(toks: SemToken[], i: number): { expr: DateExpr; next: number } | null;
}

export interface LocaleAdapter {
  id: string;
  tokenize(text: string): RawToken[];
  lexicon: Lexicon;
  parseNumber(words: string[]): number | null;
  rules?: LocaleRule[];
  format(expr: DateExpr, opts: FormatOptions): string;
  formatAccessible(expr: DateExpr, opts: FormatOptions): string;
  keyboard?: KeyboardLayout;
  /** curated typo/abbreviation map, runs before edit-distance (spec §5.2) */
  typoMap?: Record<string, string>;
  defaults: { weekStart: 0 | 1; dateOrder: "MDY" | "DMY" | "YMD" };
}

// ---------- holiday pack contract (spec §4.5) ----------

export interface HolidayPack {
  id: string;
  entries: Array<{
    id: string;
    compute(year: number): { m: number; d: number } | null;
    names: Record<string, string[]>;
  }>;
}

// ---------- engine API (spec §4.4) ----------

export interface ParseContext {
  now: Date;
  timeZone: string;
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
}

export interface Correction {
  span: [number, number];
  from: string;
  to: string;
}

export interface Candidate {
  expr: DateExpr;
  start: { utcIso: string; date: string };
  end: { utcIso: string; date: string };
  isRange: boolean;
  hasExplicitTime: boolean;
  confidence: number;
  text: string;
}

export type ParseStatus = "valid" | "ambiguous" | "invalid" | "idle";

export interface ParseResult {
  status: ParseStatus;
  candidates: Candidate[];
  corrections: Correction[];
  errors: string[];
}

export interface Engine {
  locale: LocaleAdapter;
  parse(text: string, ctx: ParseContext): ParseResult;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Replace `packages/core/src/index.ts` content:
```ts
export type * from "./types.js";
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): semantic token, AST, locale, and engine type contracts"
```

---

### Task 2: ZonedDate — timezone offsets and wall→UTC with DST policies

Spec §5.5. A `Wall` is a plain wall-clock record `{ y, m, d, h, mi }` in some zone. We derive zone offsets from `Intl.DateTimeFormat(...).formatToParts` (the date-fns-tz technique) — no Temporal, no tz database.

DST policies (fixed by spec, encode in tests):
- **Gap** (spring-forward, local time doesn't exist): shift forward by the gap.
- **Overlap** (fall-back, local time exists twice): take the **earlier instant** (= pre-transition offset).

**Files:**
- Create: `packages/core/src/zoned-date.ts`
- Test: `packages/core/test/zoned-date.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import {
  assertValidTimeZone,
  offsetAt,
  utcToWall,
  wallToUtc,
} from "../src/zoned-date.js";

describe("utcToWall", () => {
  test("converts a UTC instant to New York wall time", () => {
    // 2026-06-15T16:30:00Z is 12:30 EDT (-4)
    const w = utcToWall(new Date("2026-06-15T16:30:00Z"), "America/New_York");
    expect(w).toEqual({ y: 2026, m: 5, d: 15, h: 12, mi: 30 });
  });

  test("handles UTC+5 Almaty (no DST since 2024)", () => {
    const w = utcToWall(new Date("2026-01-10T22:00:00Z"), "Asia/Almaty");
    expect(w).toEqual({ y: 2026, m: 0, d: 11, h: 3, mi: 0 });
  });
});

describe("offsetAt", () => {
  test("Moscow is fixed +180 minutes", () => {
    expect(offsetAt(new Date("2026-01-01T00:00:00Z"), "Europe/Moscow")).toBe(180);
    expect(offsetAt(new Date("2026-07-01T00:00:00Z"), "Europe/Moscow")).toBe(180);
  });

  test("New York flips -300 ↔ -240 across DST", () => {
    expect(offsetAt(new Date("2026-01-01T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(offsetAt(new Date("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-240);
  });

  test("Lord Howe has a 30-minute DST shift (+630 ↔ +660)", () => {
    expect(offsetAt(new Date("2026-07-01T00:00:00Z"), "Australia/Lord_Howe")).toBe(630);
    expect(offsetAt(new Date("2026-01-01T00:00:00Z"), "Australia/Lord_Howe")).toBe(660);
  });
});

describe("wallToUtc — plain cases", () => {
  test("round-trips an unambiguous wall time", () => {
    const utc = wallToUtc({ y: 2026, m: 5, d: 15, h: 12, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-06-15T16:30:00.000Z");
  });
});

describe("wallToUtc — DST gap (spring forward)", () => {
  test("NY 2026-03-08 02:30 does not exist → shifts forward to 03:30 EDT", () => {
    const utc = wallToUtc({ y: 2026, m: 2, d: 8, h: 2, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(utcToWall(utc, "America/New_York")).toEqual({ y: 2026, m: 2, d: 8, h: 3, mi: 30 });
  });

  test("Lord Howe 2026-10-04 02:15 (gap is 02:00–02:30) → shifts to 02:45", () => {
    const utc = wallToUtc({ y: 2026, m: 9, d: 4, h: 2, mi: 15 }, "Australia/Lord_Howe");
    expect(utcToWall(utc, "Australia/Lord_Howe")).toEqual({ y: 2026, m: 9, d: 4, h: 2, mi: 45 });
  });
});

describe("wallToUtc — DST overlap (fall back)", () => {
  test("NY 2026-11-01 01:30 occurs twice → earlier instant (EDT, 05:30Z)", () => {
    const utc = wallToUtc({ y: 2026, m: 10, d: 1, h: 1, mi: 30 }, "America/New_York");
    expect(utc.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("assertValidTimeZone", () => {
  test("accepts valid IANA names", () => {
    expect(() => assertValidTimeZone("Asia/Almaty")).not.toThrow();
  });
  test("throws an actionable error on garbage", () => {
    expect(() => assertValidTimeZone("Mars/Olympus")).toThrow(/Invalid IANA time zone/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/zoned-date.test.ts`
Expected: FAIL — module `../src/zoned-date.js` not found.

- [ ] **Step 3: Implement `zoned-date.ts`**

```ts
export interface Wall {
  y: number;
  m: number; // 0-based
  d: number;
  h: number;
  mi: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    getDtf(timeZone);
  } catch {
    throw new Error(
      `Invalid IANA time zone: "${timeZone}". Use a name like "America/New_York".`,
    );
  }
}

export function utcToWall(date: Date, timeZone: string): Wall {
  const parts = getDtf(timeZone).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const h = get("hour");
  return {
    y: get("year"),
    m: get("month") - 1,
    d: get("day"),
    h: h === 24 ? 0 : h, // some ICU versions render midnight as 24
    mi: get("minute"),
  };
}

/** Offset in minutes east of UTC at the given instant. */
export function offsetAt(date: Date, timeZone: string): number {
  const w = utcToWall(date, timeZone);
  const asUtc = Date.UTC(w.y, w.m, w.d, w.h, w.mi, date.getUTCSeconds(), date.getUTCMilliseconds());
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function sameWall(a: Wall, b: Wall): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d && a.h === b.h && a.mi === b.mi;
}

/**
 * Wall time in a zone → UTC instant.
 * Gap (nonexistent local time): shift forward by the gap size.
 * Overlap (repeated local time): take the earlier instant.
 */
export function wallToUtc(w: Wall, timeZone: string): Date {
  const utcGuess = Date.UTC(w.y, w.m, w.d, w.h, w.mi);
  // Probe offsets a day before/after the guess: any transition near the
  // target produces two distinct candidate offsets.
  const o1 = offsetAt(new Date(utcGuess - 86_400_000), timeZone);
  const o2 = offsetAt(new Date(utcGuess + 86_400_000), timeZone);
  const c1 = new Date(utcGuess - o1 * 60_000);
  const c2 = new Date(utcGuess - o2 * 60_000);
  const ok1 = sameWall(utcToWall(c1, timeZone), w);
  const ok2 = sameWall(utcToWall(c2, timeZone), w);
  if (ok1 && ok2) return c1.getTime() <= c2.getTime() ? c1 : c2; // overlap → earlier
  if (ok1) return c1;
  if (ok2) return c2;
  // Gap: the pre-transition offset is the smaller one; using it lands just
  // past the gap, i.e. the wall time shifted forward.
  return new Date(utcGuess - Math.min(o1, o2) * 60_000);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/zoned-date.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/zoned-date.ts packages/core/test/zoned-date.test.ts
git commit -m "feat(core): Intl-based zone offsets and wallToUtc with DST gap/overlap policies"
```

---

### Task 3: ZonedDate — calendar arithmetic

Pure functions on `Wall` (and date-only triples). `Date.UTC` is used internally as proleptic-Gregorian day math only — never as an instant.

**Files:**
- Modify: `packages/core/src/zoned-date.ts` (append)
- Test: `packages/core/test/calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  compareWallDate,
  daysInMonth,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  weekdayOf,
  type Wall,
} from "../src/zoned-date.js";

const w = (y: number, m: number, d: number): Wall => ({ y, m, d, h: 0, mi: 0 });

describe("addDays", () => {
  test("crosses month and year ends", () => {
    expect(addDays(w(2026, 11, 30), 3)).toEqual(w(2027, 0, 2));
    expect(addDays(w(2026, 0, 1), -1)).toEqual(w(2025, 11, 31));
  });
  test("preserves time fields", () => {
    expect(addDays({ y: 2026, m: 5, d: 10, h: 17, mi: 30 }, 1)).toEqual({
      y: 2026, m: 5, d: 11, h: 17, mi: 30,
    });
  });
});

describe("addMonths — month-end clamping (spec §5.5)", () => {
  test("Jan 31 + 1 month clamps to Feb 28 in a non-leap year", () => {
    expect(addMonths(w(2026, 0, 31), 1)).toEqual(w(2026, 1, 28));
  });
  test("Jan 31 + 1 month clamps to Feb 29 in a leap year", () => {
    expect(addMonths(w(2028, 0, 31), 1)).toEqual(w(2028, 1, 29));
  });
  test("crosses year boundaries backwards", () => {
    expect(addMonths(w(2026, 1, 15), -3)).toEqual(w(2025, 10, 15));
  });
});

describe("addYears", () => {
  test("Feb 29 + 1 year clamps to Feb 28", () => {
    expect(addYears(w(2028, 1, 29), 1)).toEqual(w(2029, 1, 28));
  });
});

describe("week math", () => {
  test("weekdayOf: 2026-06-12 is a Friday (5)", () => {
    expect(weekdayOf(w(2026, 5, 12))).toBe(5);
  });
  test("startOfWeek respects weekStart", () => {
    // Friday 2026-06-12: Sunday-start week begins Sun 06-07; Monday-start begins Mon 06-08
    expect(startOfWeek(w(2026, 5, 12), 0)).toEqual(w(2026, 5, 7));
    expect(startOfWeek(w(2026, 5, 12), 1)).toEqual(w(2026, 5, 8));
    // A Sunday with weekStart=1 belongs to the week starting the previous Monday
    expect(startOfWeek(w(2026, 5, 14), 1)).toEqual(w(2026, 5, 8));
  });
});

describe("month boundaries", () => {
  test("startOfMonth / endOfMonth / daysInMonth", () => {
    expect(startOfMonth(w(2026, 1, 15))).toEqual(w(2026, 1, 1));
    expect(endOfMonth(w(2026, 1, 15))).toEqual(w(2026, 1, 28));
    expect(daysInMonth(2028, 1)).toBe(29);
  });
});

describe("compareWallDate", () => {
  test("orders by calendar date, ignoring time", () => {
    expect(compareWallDate({ ...w(2026, 5, 12), h: 23 }, w(2026, 5, 12))).toBe(0);
    expect(compareWallDate(w(2026, 5, 11), w(2026, 5, 12))).toBeLessThan(0);
    expect(compareWallDate(w(2027, 0, 1), w(2026, 11, 31))).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/calendar.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Append implementations to `zoned-date.ts`**

```ts
// ---------- calendar arithmetic (pure proleptic-Gregorian field math) ----------

export function addDays(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.m, w.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: w.h, mi: w.mi };
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function addMonths(w: Wall, n: number): Wall {
  const total = w.y * 12 + w.m + n;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return { y, m, d: Math.min(w.d, daysInMonth(y, m)), h: w.h, mi: w.mi };
}

export function addYears(w: Wall, n: number): Wall {
  return addMonths(w, n * 12);
}

/** 0 Sunday … 6 Saturday */
export function weekdayOf(w: Wall): number {
  return new Date(Date.UTC(w.y, w.m, w.d)).getUTCDay();
}

export function startOfWeek(w: Wall, weekStart: 0 | 1): Wall {
  const back = (weekdayOf(w) - weekStart + 7) % 7;
  return addDays({ ...w, h: 0, mi: 0 }, -back);
}

export function startOfMonth(w: Wall): Wall {
  return { y: w.y, m: w.m, d: 1, h: 0, mi: 0 };
}

export function endOfMonth(w: Wall): Wall {
  return { y: w.y, m: w.m, d: daysInMonth(w.y, w.m), h: 0, mi: 0 };
}

/** Compare calendar dates only (time fields ignored). */
export function compareWallDate(a: Wall, b: Wall): number {
  return Date.UTC(a.y, a.m, a.d) - Date.UTC(b.y, b.m, b.d);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/zoned-date.ts packages/core/test/calendar.test.ts
git commit -m "feat(core): calendar arithmetic with month-end clamping"
```

---

### Task 4: Normalization + lexicon index + `validateLocale`

`normalizeText` runs once in the engine before the locale tokenizes; all spans reference the normalized string (document this — it is the contract for `Correction.span` and `TokenMeta.span`). `validateLocale` is the dev assertion from spec §4.1/§8.

**Files:**
- Create: `packages/core/src/normalize.ts`, `packages/core/src/lexicon.ts`
- Test: `packages/core/test/lexicon.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { normalizeText } from "../src/normalize.js";
import { lookupLexicon, validateLocale } from "../src/lexicon.js";
import type { Lexicon, LocaleAdapter } from "../src/types.js";

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
```

(Remove the unused `testLocale` import line — it was illustrative; the fixture arrives in Task 5.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/lexicon.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/core/src/normalize.ts`:
```ts
/**
 * Engine-wide input normalization. Runs ONCE before locale tokenization;
 * every span in tokens/corrections refers to the string this returns.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-") // hyphens/dashes/minus → "-"
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"');
}
```

`packages/core/src/lexicon.ts`:
```ts
import type { Lexicon, LocaleAdapter, SemPayload } from "./types.js";

export function lookupLexicon(lex: Lexicon, form: string): SemPayload[] | null {
  const hit = lex[form];
  return hit && hit.length > 0 ? hit : null;
}

/**
 * Dev-mode completeness/consistency assertion for a LocaleAdapter (spec §4.1).
 * Throws with an actionable message; never call on user input paths.
 */
export function validateLocale(locale: LocaleAdapter): void {
  const seen = {
    weekdays: new Set<number>(),
    months: new Set<number>(),
    units: new Set<string>(),
    rels: new Set<string>(),
    reldays: 0,
  };

  for (const [form, payloads] of Object.entries(locale.lexicon)) {
    // duplicate form mapping to two payloads of the SAME kind with different
    // values is a data bug (ambiguity across kinds, e.g. "may", is legal)
    const byKind = new Map<string, string>();
    for (const p of payloads) {
      const value = JSON.stringify(p);
      const prior = byKind.get(p.kind);
      if (prior !== undefined && prior !== value) {
        throw new Error(
          `Locale "${locale.id}": form "${form}" has conflicting ${p.kind} meanings.`,
        );
      }
      byKind.set(p.kind, value);

      if (p.kind === "WEEKDAY") seen.weekdays.add(p.day);
      if (p.kind === "MONTH") seen.months.add(p.month);
      if (p.kind === "UNIT") seen.units.add(p.unit);
      if (p.kind === "REL") seen.rels.add(p.which);
      if (p.kind === "RELDAY") seen.reldays++;
    }
  }

  const missing: string[] = [];
  if (seen.weekdays.size < 7) missing.push(`weekdays (${seen.weekdays.size}/7)`);
  if (seen.months.size < 12) missing.push(`months (${seen.months.size}/12)`);
  if (seen.units.size < 6) missing.push(`units (${seen.units.size}/6)`);
  if (seen.rels.size < 3) missing.push(`this/next/last (${seen.rels.size}/3)`);
  if (seen.reldays < 1) missing.push("at least one RELDAY (today)");
  if (missing.length > 0) {
    throw new Error(`Locale "${locale.id}" lexicon is incomplete: missing ${missing.join(", ")}.`);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/lexicon.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/normalize.ts packages/core/src/lexicon.ts packages/core/test/lexicon.test.ts
git commit -m "feat(core): input normalization, lexicon lookup, validateLocale dev assertion"
```

---

### Task 5: Test fixtures — inline locale + token factories

Core unit tests must not depend on `@saywhen/locale-en` (dependency rules, spec §3). The fixture locale is a deliberately tiny English-like adapter; the token factories make grammar/resolver tests readable. **No production code in this task** — these are test files; verify by running the existing suite plus a smoke assertion.

**Files:**
- Create: `packages/core/test/fixtures/test-locale.ts`
- Create: `packages/core/test/fixtures/toks.ts`

- [ ] **Step 1: Write `fixtures/toks.ts`**

```ts
import type { Rel, SemPayload, SemToken, Unit, PeriodRef } from "../../src/types.js";

let cursor = 0;
/** Build a SemToken with auto-advancing fake spans. Call reset() per test if spans matter. */
function t(payload: SemPayload, source = payload.kind.toLowerCase()): SemToken {
  const span: [number, number] = [cursor, cursor + source.length];
  cursor += source.length + 1;
  return { ...payload, span, source, confidence: 1 };
}

export const toks = {
  reset: () => { cursor = 0; },
  weekday: (day: number) => t({ kind: "WEEKDAY", day }),
  month: (month: number) => t({ kind: "MONTH", month }),
  num: (n: number, ordinal?: boolean) => t(ordinal ? { kind: "NUMBER", n, ordinal } : { kind: "NUMBER", n }, String(n)),
  year: (year: number) => t({ kind: "YEAR", year }, String(year)),
  time: (h: number, m: number) => t({ kind: "TIME", h, m }, `${h}:${String(m).padStart(2, "0")}`),
  meridiem: (value: "am" | "pm") => t({ kind: "MERIDIEM", value }, value),
  relday: (offset: number) => t({ kind: "RELDAY", offset }),
  rel: (which: Rel) => t({ kind: "REL", which }, which),
  unit: (unit: Unit) => t({ kind: "UNIT", unit }, unit),
  op: (op: 1 | -1) => t({ kind: "OP", op }, op === 1 ? "+" : "-"),
  dir: (dir: "before" | "after" | "from" | "ago" | "in") => t({ kind: "DIRECTION", dir }, dir),
  connector: () => t({ kind: "CONNECTOR" }, "to"),
  boundary: (edge: "start" | "end") => t({ kind: "BOUNDARY", edge }, edge),
  period: (period: PeriodRef) => t({ kind: "PERIOD", period }),
  holiday: (id: string) => t({ kind: "HOLIDAY", id }, id),
  filler: () => t({ kind: "FILLER" }, "the"),
  literal: (source: string) => t({ kind: "LITERAL" }, source),
};
```

- [ ] **Step 2: Write `fixtures/test-locale.ts`**

```ts
import type { DateExpr, Lexicon, LocaleAdapter, RawToken } from "../../src/types.js";

const lexicon: Lexicon = {
  // weekdays (sun..sat) — two forms each to exercise multi-form lookup
  sunday: [{ kind: "WEEKDAY", day: 0 }], sun: [{ kind: "WEEKDAY", day: 0 }],
  monday: [{ kind: "WEEKDAY", day: 1 }], mon: [{ kind: "WEEKDAY", day: 1 }],
  tuesday: [{ kind: "WEEKDAY", day: 2 }], tue: [{ kind: "WEEKDAY", day: 2 }],
  wednesday: [{ kind: "WEEKDAY", day: 3 }], wed: [{ kind: "WEEKDAY", day: 3 }],
  thursday: [{ kind: "WEEKDAY", day: 4 }], thu: [{ kind: "WEEKDAY", day: 4 }],
  friday: [{ kind: "WEEKDAY", day: 5 }], fri: [{ kind: "WEEKDAY", day: 5 }],
  saturday: [{ kind: "WEEKDAY", day: 6 }], sat: [{ kind: "WEEKDAY", day: 6 }],
  // months — "may" is deliberately ambiguous with a LITERAL reading
  january: [{ kind: "MONTH", month: 0 }],
  february: [{ kind: "MONTH", month: 1 }],
  march: [{ kind: "MONTH", month: 2 }],
  april: [{ kind: "MONTH", month: 3 }],
  may: [{ kind: "MONTH", month: 4 }],
  june: [{ kind: "MONTH", month: 5 }],
  july: [{ kind: "MONTH", month: 6 }],
  august: [{ kind: "MONTH", month: 7 }],
  september: [{ kind: "MONTH", month: 8 }],
  october: [{ kind: "MONTH", month: 9 }],
  november: [{ kind: "MONTH", month: 10 }],
  december: [{ kind: "MONTH", month: 11 }],
  // reldays
  today: [{ kind: "RELDAY", offset: 0 }],
  tomorrow: [{ kind: "RELDAY", offset: 1 }],
  yesterday: [{ kind: "RELDAY", offset: -1 }],
  // rel / units / periods / boundaries
  this: [{ kind: "REL", which: "this" }],
  next: [{ kind: "REL", which: "next" }],
  last: [{ kind: "REL", which: "last" }],
  day: [{ kind: "UNIT", unit: "day" }], days: [{ kind: "UNIT", unit: "day" }],
  week: [{ kind: "UNIT", unit: "week" }], weeks: [{ kind: "UNIT", unit: "week" }],
  month: [{ kind: "UNIT", unit: "month" }], months: [{ kind: "UNIT", unit: "month" }],
  year: [{ kind: "UNIT", unit: "year" }], years: [{ kind: "UNIT", unit: "year" }],
  hour: [{ kind: "UNIT", unit: "hour" }], hours: [{ kind: "UNIT", unit: "hour" }],
  minute: [{ kind: "UNIT", unit: "minute" }], minutes: [{ kind: "UNIT", unit: "minute" }],
  weekend: [{ kind: "PERIOD", period: { kind: "weekend" } }],
  start: [{ kind: "BOUNDARY", edge: "start" }],
  beginning: [{ kind: "BOUNDARY", edge: "start" }],
  end: [{ kind: "BOUNDARY", edge: "end" }],
  // direction / op / connector / meridiem
  before: [{ kind: "DIRECTION", dir: "before" }],
  after: [{ kind: "DIRECTION", dir: "after" }],
  from: [{ kind: "DIRECTION", dir: "from" }],
  ago: [{ kind: "DIRECTION", dir: "ago" }],
  in: [{ kind: "DIRECTION", dir: "in" }],
  to: [{ kind: "CONNECTOR" }],
  until: [{ kind: "CONNECTOR" }],
  through: [{ kind: "CONNECTOR" }],
  am: [{ kind: "MERIDIEM", value: "am" }],
  pm: [{ kind: "MERIDIEM", value: "pm" }],
  "+": [{ kind: "OP", op: 1 }],
  "-": [{ kind: "OP", op: -1 }, { kind: "CONNECTOR" }], // "jun 10 - jun 12" stays ambiguous
  // filler
  on: [{ kind: "FILLER" }],
  at: [{ kind: "FILLER" }],
  the: [{ kind: "FILLER" }],
  of: [{ kind: "FILLER" }],
};

// 1st..31st ordinals, generated
for (let d = 1; d <= 31; d++) {
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  lexicon[`${d}${suffix}`] = [{ kind: "NUMBER", n: d, ordinal: true }];
}

const TOKEN_RE = /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+[a-z]+|\d+|[a-z]+(?:'[a-z]+)?|[+\-—]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const start = m.index ?? 0;
    // split digit+letter runs ("5pm" → "5","pm"; "21st" stays whole if it's a known ordinal)
    const dl = /^(\d+)([a-z]+)$/.exec(raw);
    if (dl && !(raw in lexicon)) {
      out.push({ text: dl[1]!, span: [start, start + dl[1]!.length] });
      out.push({ text: dl[2]!, span: [start + dl[1]!.length, start + raw.length] });
    } else {
      out.push({ text: raw, span: [start, start + raw.length] });
    }
  }
  return out;
}

export const testLocale: LocaleAdapter = {
  id: "test",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    if (words.length === 1 && /^\d+$/.test(words[0]!)) return Number(words[0]);
    return null;
  },
  format: (expr: DateExpr) => JSON.stringify(expr), // structural placeholder for unit tests only
  formatAccessible: (expr: DateExpr) => JSON.stringify(expr),
  keyboard: { rows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"] },
  typoMap: { tmrw: "tomorrow", b4: "before" },
  defaults: { weekStart: 0, dateOrder: "MDY" },
};
```

- [ ] **Step 3: Smoke-verify both fixtures**

Add to the bottom of `packages/core/test/lexicon.test.ts`:
```ts
import { testLocale } from "./fixtures/test-locale.js";
import { toks } from "./fixtures/toks.js";

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
```

Run: `pnpm vitest run packages/core/test/lexicon.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test
git commit -m "test(core): fixture locale and semantic-token factories"
```

---

### Task 6: Lattice builder

Spec §5.1. Converts `RawToken[]` into a **lattice**: one cell per raw token, each cell holding ≥ 1 alternative, where an alternative is a *sequence* of semantic tokens (a slash date like "3/4" expands to two-token sequences). `expandStreams` produces the flat token streams the grammar consumes (cartesian product, capped at 16 — log nothing, the cap is a spec constant).

Division of labor: the **locale lexicon** classifies words; the **core** classifies language-neutral digit shapes (integers, `h:mm` times, 4-digit years, slash dates). Unknown words become `LITERAL` (typo correction gets a shot at them in Task 7, before lattice assembly finalizes).

**Files:**
- Create: `packages/core/src/lattice.ts`
- Test: `packages/core/test/lattice.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildLattice, expandStreams } from "../src/lattice.js";
import { testLocale } from "./fixtures/test-locale.js";

function latticeFor(text: string) {
  return buildLattice(testLocale.tokenize(text), testLocale.lexicon);
}

describe("buildLattice — words via lexicon", () => {
  test("known word → its payloads as a single-token alternative", () => {
    const cells = latticeFor("friday");
    expect(cells).toHaveLength(1);
    expect(cells[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "WEEKDAY", day: 5, source: "friday", confidence: 1 })],
    ]);
  });

  test("unknown word → LITERAL", () => {
    const cells = latticeFor("zorp");
    expect(cells[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "LITERAL", source: "zorp" })],
    ]);
  });
});

describe("buildLattice — digit shapes (core responsibility)", () => {
  test("small integer → NUMBER", () => {
    expect(latticeFor("15")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "NUMBER", n: 15 })],
    ]);
  });
  test("4-digit integer in 1900–2100 → YEAR", () => {
    expect(latticeFor("2026")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "YEAR", year: 2026 })],
    ]);
  });
  test("h:mm → TIME (24h)", () => {
    expect(latticeFor("17:30")[0]!.alternatives).toEqual([
      [expect.objectContaining({ kind: "TIME", h: 17, m: 30 })],
    ]);
  });
  test("invalid time digits → LITERAL", () => {
    expect(latticeFor("29:99")[0]!.alternatives[0]![0]!.kind).toBe("LITERAL");
  });
});

describe("buildLattice — slash dates carry ambiguity (spec §5.1)", () => {
  test("'3/4' → MONTH(2)+NUMBER(4) and NUMBER(3)+MONTH(3)", () => {
    const alts = latticeFor("3/4")[0]!.alternatives;
    expect(alts).toHaveLength(2);
    expect(alts[0]).toEqual([
      expect.objectContaining({ kind: "MONTH", month: 2 }),
      expect.objectContaining({ kind: "NUMBER", n: 4 }),
    ]);
    expect(alts[1]).toEqual([
      expect.objectContaining({ kind: "NUMBER", n: 3 }),
      expect.objectContaining({ kind: "MONTH", month: 3 }),
    ]);
  });

  test("'13/4' is unambiguous (13 can't be a month) → one alternative", () => {
    const alts = latticeFor("13/4")[0]!.alternatives;
    expect(alts).toHaveLength(1);
    expect(alts[0]).toEqual([
      expect.objectContaining({ kind: "NUMBER", n: 13 }),
      expect.objectContaining({ kind: "MONTH", month: 3 }),
    ]);
  });

  test("'3/4/2026' appends YEAR to both readings", () => {
    const alts = latticeFor("3/4/2026")[0]!.alternatives;
    expect(alts).toHaveLength(2);
    for (const alt of alts) expect(alt[2]).toEqual(expect.objectContaining({ kind: "YEAR", year: 2026 }));
  });

  test("'2026/3/4' → YMD single reading", () => {
    const alts = latticeFor("2026/3/4")[0]!.alternatives;
    expect(alts).toEqual([[
      expect.objectContaining({ kind: "YEAR", year: 2026 }),
      expect.objectContaining({ kind: "MONTH", month: 2 }),
      expect.objectContaining({ kind: "NUMBER", n: 4 }),
    ]]);
  });
});

describe("expandStreams", () => {
  test("flattens single-alternative cells into one stream", () => {
    const streams = expandStreams(latticeFor("next friday"));
    expect(streams).toHaveLength(1);
    expect(streams[0]!.map((t) => t.kind)).toEqual(["REL", "WEEKDAY"]);
  });
  test("multiplies alternatives and caps at 16", () => {
    const streams = expandStreams(latticeFor("3/4 to 5/6"));
    expect(streams).toHaveLength(4); // 2 × 1 × 2
    const big = expandStreams(latticeFor("1/2 1/2 1/2 1/2 1/2"));
    expect(big.length).toBeLessThanOrEqual(16); // 2^5=32 capped
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/lattice.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `lattice.ts`**

```ts
import type { Lexicon, RawToken, SemPayload, SemToken } from "./types.js";
import { lookupLexicon } from "./lexicon.js";

export interface LatticeCell {
  raw: RawToken;
  /** each alternative is a SEQUENCE of semantic tokens */
  alternatives: SemToken[][];
}

const MAX_STREAMS = 16;

function sem(p: SemPayload, raw: RawToken, confidence = 1): SemToken {
  return { ...p, span: raw.span, source: raw.text, confidence };
}

/** Language-neutral digit-shape classification. Returns null when not digit-shaped. */
function classifyDigits(raw: RawToken): SemToken[][] | null {
  const t = raw.text;

  const time = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h <= 23 && m <= 59) return [[sem({ kind: "TIME", h, m }, raw)]];
    return [[sem({ kind: "LITERAL" }, raw)]];
  }

  const slash = /^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/.exec(t);
  if (slash) return classifySlashDate(Number(slash[1]), Number(slash[2]), slash[3] === undefined ? null : Number(slash[3]), raw);

  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (t.length === 4 && n >= 1900 && n <= 2100) return [[sem({ kind: "YEAR", year: n }, raw)]];
    return [[sem({ kind: "NUMBER", n }, raw)]];
  }

  return null;
}

function classifySlashDate(a: number, b: number, c: number | null, raw: RawToken): SemToken[][] {
  const alts: SemToken[][] = [];
  const yearTok = (y: number) => sem({ kind: "YEAR", year: y < 100 ? y + 2000 : y }, raw);

  if (a >= 1900 && a <= 2100 && c !== null) {
    // YMD: 2026/3/4
    if (b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      alts.push([yearTok(a), sem({ kind: "MONTH", month: b - 1 }, raw), sem({ kind: "NUMBER", n: c }, raw)]);
    }
  } else {
    // M/D reading
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const seq = [sem({ kind: "MONTH", month: a - 1 }, raw), sem({ kind: "NUMBER", n: b }, raw)];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
    // D/M reading — skip when identical to M/D (e.g. "3/3")
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31 && a !== b) {
      const seq = [sem({ kind: "NUMBER", n: a }, raw), sem({ kind: "MONTH", month: b - 1 }, raw)];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
  }

  if (alts.length === 0) alts.push([sem({ kind: "LITERAL" }, raw)]);
  return alts;
}

export function buildLattice(rawTokens: RawToken[], lexicon: Lexicon): LatticeCell[] {
  return rawTokens.map((raw) => {
    const digits = classifyDigits(raw);
    if (digits) return { raw, alternatives: digits };
    const payloads = lookupLexicon(lexicon, raw.text);
    if (payloads) return { raw, alternatives: payloads.map((p) => [sem(p, raw)]) };
    return { raw, alternatives: [[sem({ kind: "LITERAL" }, raw)]] };
  });
}

/** Cartesian product of cell alternatives → flat token streams, capped at MAX_STREAMS. */
export function expandStreams(cells: LatticeCell[]): SemToken[][] {
  let streams: SemToken[][] = [[]];
  for (const cell of cells) {
    const next: SemToken[][] = [];
    for (const stream of streams) {
      for (const alt of cell.alternatives) {
        next.push([...stream, ...alt]);
        if (next.length >= MAX_STREAMS) break;
      }
      if (next.length >= MAX_STREAMS) break;
    }
    streams = next;
  }
  return streams;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/lattice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lattice.ts packages/core/test/lattice.test.ts
git commit -m "feat(core): semantic token lattice with slash-date ambiguity and stream expansion"
```

---

### Task 7: Typo correction — weighted Damerau-Levenshtein

Spec §5.2. Runs between tokenize and lattice finalization: raw tokens that would become `LITERAL` get one correction attempt. Order: curated `typoMap` first, then edit-distance search over lexicon keys. Costs: insert/delete 1, transpose 0.5, substitute 0.5 if keyboard-adjacent else 1. Thresholds: `len ≥ 8 → ≤ 2`, `len ≥ 4 → ≤ 1`, shorter or pure digits → never corrected.

**Files:**
- Create: `packages/core/src/typo.ts`
- Modify: `packages/core/src/lattice.ts` (accept a corrector hook)
- Test: `packages/core/test/typo.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildKeyboardAdjacency, correctToken, weightedDamerau } from "../src/typo.js";
import { buildLattice } from "../src/lattice.js";
import { testLocale } from "./fixtures/test-locale.js";

const adj = buildKeyboardAdjacency(testLocale.keyboard!);

describe("buildKeyboardAdjacency", () => {
  test("neighbors on QWERTY", () => {
    expect(adj.get("s")!.has("a")).toBe(true);  // same row
    expect(adj.get("s")!.has("w")).toBe(true);  // row above
    expect(adj.get("s")!.has("x")).toBe(true);  // row below
    expect(adj.get("s")!.has("p")).toBe(false);
  });
});

describe("weightedDamerau", () => {
  test("substitution of adjacent key costs 0.5", () => {
    expect(weightedDamerau("fridat", "friday", adj)).toBe(0.5); // t↔y adjacent
  });
  test("substitution of distant key costs 1", () => {
    expect(weightedDamerau("fridaq", "friday", adj)).toBe(1);
  });
  test("transposition costs 0.5", () => {
    expect(weightedDamerau("firday", "friday", adj)).toBe(0.5);
  });
  test("insert/delete cost 1 each", () => {
    expect(weightedDamerau("fridayy", "friday", adj)).toBe(1);
    expect(weightedDamerau("frida", "friday", adj)).toBe(1);
  });
});

describe("correctToken", () => {
  const lexKeys = Object.keys(testLocale.lexicon);

  test("curated typoMap wins before edit distance", () => {
    expect(correctToken("tmrw", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "tomorrow", cost: 0,
    });
  });
  test("edit-distance correction within threshold", () => {
    expect(correctToken("fridat", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "friday", cost: 0.5,
    });
    expect(correctToken("tomorow", lexKeys, testLocale.typoMap, adj)).toEqual({
      to: "tomorrow", cost: 1,
    });
  });
  test("two edits allowed only for length ≥ 8", () => {
    expect(correctToken("tomorroww", lexKeys, testLocale.typoMap, adj)?.to).toBe("tomorrow");
    expect(correctToken("fridqt", lexKeys, testLocale.typoMap, adj)).toBeNull(); // 2 edits, len 6
  });
  test("never corrects short tokens or digits", () => {
    expect(correctToken("mn", lexKeys, testLocale.typoMap, adj)).toBeNull();
    expect(correctToken("123", lexKeys, testLocale.typoMap, adj)).toBeNull();
  });
});

describe("lattice integration", () => {
  test("corrected token enters the lattice with reduced confidence", () => {
    const corrections: Array<{ span: [number, number]; from: string; to: string }> = [];
    const cells = buildLattice(testLocale.tokenize("fridat"), testLocale.lexicon, {
      correct: (raw) => {
        const c = correctToken(raw.text, Object.keys(testLocale.lexicon), testLocale.typoMap, adj);
        if (c) corrections.push({ span: raw.span, from: raw.text, to: c.to });
        return c;
      },
    });
    const tok = cells[0]!.alternatives[0]![0]!;
    expect(tok).toMatchObject({ kind: "WEEKDAY", day: 5 });
    expect(tok.confidence).toBeLessThan(1);
    expect(corrections).toEqual([{ span: [0, 6], from: "fridat", to: "friday" }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/typo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `typo.ts`**

```ts
import type { KeyboardLayout } from "./types.js";

export type Adjacency = Map<string, Set<string>>;

/** Keys within one row/column step on the physical layout are "adjacent". */
export function buildKeyboardAdjacency(layout: KeyboardLayout): Adjacency {
  const pos = new Map<string, { r: number; c: number }>();
  layout.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => pos.set(ch, { r, c }));
  });
  const adj: Adjacency = new Map();
  for (const [ch, p] of pos) {
    const set = new Set<string>();
    for (const [other, q] of pos) {
      if (other !== ch && Math.abs(p.r - q.r) <= 1 && Math.abs(p.c - q.c) <= 1) set.add(other);
    }
    adj.set(ch, set);
  }
  return adj;
}

/** Damerau-Levenshtein; substitution 0.5 for keyboard-adjacent keys, transposition 0.5. */
export function weightedDamerau(a: string, b: string, adj: Adjacency): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const ca = a[i - 1]!;
      const cb = b[j - 1]!;
      const subCost = ca === cb ? 0 : adj.get(ca)?.has(cb) ? 0.5 : 1;
      let best = Math.min(
        dp[i - 1]![j]! + 1,          // delete
        dp[i]![j - 1]! + 1,          // insert
        dp[i - 1]![j - 1]! + subCost, // substitute
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, dp[i - 2]![j - 2]! + 0.5); // transpose
      }
      dp[i]![j] = best;
    }
  }
  return dp[m]![n]!;
}

export interface CorrectionHit {
  to: string;
  cost: number;
}

function thresholdFor(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

export function correctToken(
  text: string,
  lexiconKeys: string[],
  typoMap: Record<string, string> | undefined,
  adj: Adjacency,
): CorrectionHit | null {
  if (/\d/.test(text)) return null;
  const curated = typoMap?.[text];
  if (curated) return { to: curated, cost: 0 };

  const threshold = thresholdFor(text.length);
  if (threshold === 0) return null;

  let best: CorrectionHit | null = null;
  for (const key of lexiconKeys) {
    if (Math.abs(key.length - text.length) > threshold) continue;
    const cost = weightedDamerau(text, key, adj);
    if (cost <= threshold && (best === null || cost < best.cost)) best = { to: key, cost };
  }
  return best;
}
```

- [ ] **Step 4: Wire the corrector hook into `lattice.ts`**

In `lattice.ts`, change `buildLattice`'s signature and the LITERAL fallback:

```ts
import type { Lexicon, RawToken, SemPayload, SemToken } from "./types.js";
import { lookupLexicon } from "./lexicon.js";
import type { CorrectionHit } from "./typo.js";

export interface LatticeOptions {
  /** returns a corrected lexicon key for an unknown word, or null */
  correct?: (raw: RawToken) => CorrectionHit | null;
}

export function buildLattice(
  rawTokens: RawToken[],
  lexicon: Lexicon,
  opts: LatticeOptions = {},
): LatticeCell[] {
  return rawTokens.map((raw) => {
    const digits = classifyDigits(raw);
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
}
```
(`sem` gains the optional `confidence = 1` third parameter shown in Task 6.)

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/core/test/typo.test.ts packages/core/test/lattice.test.ts`
Expected: PASS (lattice tests unchanged — options arg is optional).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/typo.ts packages/core/src/lattice.ts packages/core/test/typo.test.ts
git commit -m "feat(core): keyboard-weighted Damerau-Levenshtein typo correction"
```

---

### Task 8: Parser combinators with expectation tracking

Spec §5.3. Combinators run over one flat `SemToken[]` stream and return **all** `(value, nextIndex)` pairs. `FILLER` tokens are transparently skipped before every token match. Failures record the expected kind at the furthest frontier reached — this `Expectations` object is the grammar hook `core/suggest` builds on in plan 05, so it lands now.

**Files:**
- Create: `packages/core/src/combinators.ts`
- Test: `packages/core/test/combinators.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, test } from "vitest";
import {
  alt, many, map, newExpectations, opt, seq, tok, type Expectations,
} from "../src/combinators.js";
import { toks } from "./fixtures/toks.js";

let ex: Expectations;
beforeEach(() => {
  toks.reset();
  ex = newExpectations();
});

describe("tok", () => {
  test("matches a kind and consumes one token", () => {
    const s = [toks.weekday(5)];
    const r = tok("WEEKDAY")(s, 0, ex);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ i: 1, v: { kind: "WEEKDAY", day: 5 } });
  });

  test("skips FILLER before matching", () => {
    const s = [toks.filler(), toks.filler(), toks.weekday(2)];
    const r = tok("WEEKDAY")(s, 0, ex);
    expect(r[0]).toMatchObject({ i: 3, v: { day: 2 } });
  });

  test("on failure records the expectation at the frontier", () => {
    const s = [toks.weekday(5)];
    expect(tok("MONTH")(s, 0, ex)).toHaveLength(0);
    expect(ex.frontier).toBe(0);
    expect([...ex.kinds]).toContain("MONTH");
  });

  test("predicate filters matches", () => {
    const s = [toks.unit("hour")];
    expect(tok("UNIT", (t) => t.unit === "week")(s, 0, ex)).toHaveLength(0);
    expect(tok("UNIT", (t) => t.unit === "hour")(s, 0, ex)).toHaveLength(1);
  });
});

describe("seq / map", () => {
  test("threads positions and collects values", () => {
    const s = [toks.rel("next"), toks.weekday(5)];
    const p = map(seq(tok("REL"), tok("WEEKDAY")), ([r, w]) => `${r.which}-${w.day}`);
    expect(p(s, 0, ex)).toEqual([{ v: "next-5", i: 2 }]);
  });
});

describe("alt — returns ALL parses", () => {
  test("both branches succeed → both results", () => {
    const s = [toks.num(5)];
    const p = alt(
      map(tok("NUMBER"), () => "a"),
      map(tok("NUMBER", (t) => t.n === 5), () => "b"),
    );
    expect(p(s, 0, ex).map((r) => r.v).sort()).toEqual(["a", "b"]);
  });
});

describe("opt", () => {
  test("with the optional present: only the consuming branch completes the seq", () => {
    const s = [toks.rel("next"), toks.weekday(5)];
    const r = seq(opt(tok("REL")), tok("WEEKDAY"))(s, 0, ex);
    expect(r).toHaveLength(1);
    expect(r[0]!.i).toBe(2);
  });
  test("with the optional absent: the skip branch completes", () => {
    const s = [toks.weekday(5)];
    const r = seq(opt(tok("REL")), tok("WEEKDAY"))(s, 0, ex);
    expect(r).toEqual([{ v: [null, expect.objectContaining({ day: 5 })], i: 1 }]);
  });
});

describe("many", () => {
  test("returns every prefix length (0..n)", () => {
    const s = [toks.num(1), toks.num(2), toks.num(3)];
    const r = many(tok("NUMBER"))(s, 0, ex);
    expect(r.map((x) => x.i).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("expectation frontier", () => {
  test("keeps only the furthest failure point", () => {
    const s = [toks.rel("next"), toks.num(9)];
    seq(tok("REL"), tok("WEEKDAY"))(s, 0, ex); // fails at index 1 expecting WEEKDAY
    tok("MONTH")(s, 0, ex);                    // fails at index 0 — must NOT overwrite
    expect(ex.frontier).toBe(1);
    expect([...ex.kinds]).toEqual(["WEEKDAY"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/combinators.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `combinators.ts`**

```ts
import type { SemKind, SemToken } from "./types.js";

export interface Expectations {
  /** furthest token index any parser failed at */
  frontier: number;
  /** kinds expected at the frontier (suggest-engine hook, plan 05) */
  kinds: Set<SemKind>;
}

export function newExpectations(): Expectations {
  return { frontier: -1, kinds: new Set() };
}

function expectAt(ex: Expectations, i: number, kind: SemKind): void {
  if (i > ex.frontier) {
    ex.frontier = i;
    ex.kinds = new Set([kind]);
  } else if (i === ex.frontier) {
    ex.kinds.add(kind);
  }
}

export interface PRes<T> {
  v: T;
  i: number;
}

export type Parser<T> = (s: SemToken[], i: number, ex: Expectations) => Array<PRes<T>>;

export function skipFiller(s: SemToken[], i: number): number {
  while (i < s.length && s[i]!.kind === "FILLER") i++;
  return i;
}

export function tok<K extends SemKind>(
  kind: K,
  pred?: (t: Extract<SemToken, { kind: K }>) => boolean,
): Parser<Extract<SemToken, { kind: K }>> {
  return (s, i, ex) => {
    const j = skipFiller(s, i);
    const t = s[j];
    if (t?.kind === kind) {
      const typed = t as Extract<SemToken, { kind: K }>;
      if (!pred || pred(typed)) return [{ v: typed, i: j + 1 }];
    }
    expectAt(ex, j, kind);
    return [];
  };
}

export function seq<A, B>(pa: Parser<A>, pb: Parser<B>): Parser<[A, B]>;
export function seq<A, B, C>(pa: Parser<A>, pb: Parser<B>, pc: Parser<C>): Parser<[A, B, C]>;
export function seq<A, B, C, D>(pa: Parser<A>, pb: Parser<B>, pc: Parser<C>, pd: Parser<D>): Parser<[A, B, C, D]>;
export function seq(...ps: Array<Parser<unknown>>): Parser<unknown[]> {
  return (s, i, ex) => {
    let acc: Array<PRes<unknown[]>> = [{ v: [], i }];
    for (const p of ps) {
      const next: Array<PRes<unknown[]>> = [];
      for (const a of acc) {
        for (const r of p(s, a.i, ex)) next.push({ v: [...a.v, r.v], i: r.i });
      }
      acc = next;
      if (acc.length === 0) return [];
    }
    return acc;
  };
}

export function alt<T>(...ps: Array<Parser<T>>): Parser<T> {
  return (s, i, ex) => ps.flatMap((p) => p(s, i, ex));
}

export function opt<T>(p: Parser<T>): Parser<T | null> {
  return (s, i, ex) => [{ v: null, i }, ...p(s, i, ex)];
}

export function many<T>(p: Parser<T>): Parser<T[]> {
  return (s, i, ex) => {
    const out: Array<PRes<T[]>> = [{ v: [], i }];
    let frontier: Array<PRes<T[]>> = out.slice();
    while (frontier.length > 0) {
      const next: Array<PRes<T[]>> = [];
      for (const f of frontier) {
        for (const r of p(s, f.i, ex)) {
          if (r.i > f.i) next.push({ v: [...f.v, r.v], i: r.i }); // progress guard
        }
      }
      out.push(...next);
      frontier = next;
    }
    return out;
  };
}

export function map<T, U>(p: Parser<T>, f: (v: T) => U): Parser<U> {
  return (s, i, ex) => p(s, i, ex).map((r) => ({ v: f(r.v), i: r.i }));
}

/** lazy reference for recursive grammars */
export function lazy<T>(get: () => Parser<T>): Parser<T> {
  return (s, i, ex) => get()(s, i, ex);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/combinators.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/combinators.ts packages/core/test/combinators.test.ts
git commit -m "feat(core): all-parses combinators with filler skipping and expectation frontier"
```

---

### Task 9: Grammar — anchors, full-input filter, locale-rule injection

Spec §5.3. `buildGrammar(localeRules)` is a factory (locale escape-hatch rules are injected as extra `alt` branches at the two documented extension points). `parseStream` runs the top rule at position 0 and keeps only parses that consume the **entire** stream (trailing FILLER allowed); structurally identical ASTs are deduped. This task lands anchors; Task 10 adds the compound rules into the same factory.

**Files:**
- Create: `packages/core/src/grammar.ts`
- Test: `packages/core/test/grammar.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, test } from "vitest";
import { buildGrammar } from "../src/grammar.js";
import { toks } from "./fixtures/toks.js";
import type { SemToken } from "../src/types.js";

const g = buildGrammar();

function exprs(stream: SemToken[]) {
  return g.parseStream(stream).parses.map((p) => p.expr);
}

beforeEach(() => toks.reset());

describe("anchor: relday", () => {
  test("tomorrow", () => {
    expect(exprs([toks.relday(1)])).toEqual([
      { type: "anchor", anchor: { kind: "relday", offset: 1 } },
    ]);
  });
});

describe("anchor: weekday", () => {
  test("bare weekday has no which", () => {
    expect(exprs([toks.weekday(5)])).toEqual([
      { type: "anchor", anchor: { kind: "weekday", day: 5 } },
    ]);
  });
  test("REL weekday carries which", () => {
    expect(exprs([toks.rel("next"), toks.weekday(5)])).toEqual([
      { type: "anchor", anchor: { kind: "weekday", day: 5, which: "next" } },
    ]);
  });
  test("filler is skipped: 'on the friday'", () => {
    expect(exprs([toks.filler(), toks.filler(), toks.weekday(5)])).toHaveLength(1);
  });
});

describe("anchor: calendar", () => {
  test("MONTH NUMBER → {m, d}", () => {
    expect(exprs([toks.month(2), toks.num(4)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 4 } },
    );
  });
  test("NUMBER MONTH YEAR → {y, m, d}", () => {
    expect(exprs([toks.num(4), toks.month(2), toks.year(2027)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2027, m: 2, d: 4 } },
    );
  });
  test("YEAR MONTH NUMBER → {y, m, d}", () => {
    expect(exprs([toks.year(2026), toks.month(2), toks.num(4)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2026, m: 2, d: 4 } },
    );
  });
  test("ordinal works as the day: 'march 21st' and 'the 21st of march'", () => {
    expect(exprs([toks.month(2), toks.num(21, true)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 21 } },
    );
    expect(exprs([toks.filler(), toks.num(21, true), toks.filler(), toks.month(2)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 2, d: 21 } },
    );
  });
  test("day out of range fails: 'march 45'", () => {
    expect(exprs([toks.month(2), toks.num(45)])).toHaveLength(0);
  });
  test("month alone → {m}, lower specificity than full date", () => {
    const r = g.parseStream([toks.month(2)]).parses;
    expect(r[0]!.expr).toEqual({ type: "anchor", anchor: { kind: "calendar", m: 2 } });
    const full = g.parseStream([toks.month(2), toks.num(4)]).parses;
    expect(r[0]!.specificity).toBeLessThan(full[0]!.specificity);
  });
  test("bare ordinal → {d}: 'the 21st'", () => {
    expect(exprs([toks.filler(), toks.num(21, true)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", d: 21 } },
    );
  });
  test("bare year → {y}", () => {
    expect(exprs([toks.year(2027)])).toContainEqual(
      { type: "anchor", anchor: { kind: "calendar", y: 2027 } },
    );
  });
});

describe("anchor: holiday", () => {
  test("HOLIDAY with optional YEAR", () => {
    expect(exprs([toks.holiday("christmas")])).toEqual([
      { type: "anchor", anchor: { kind: "holiday", id: "christmas" } },
    ]);
    expect(exprs([toks.holiday("christmas"), toks.year(2027)])).toEqual([
      { type: "anchor", anchor: { kind: "holiday", id: "christmas", year: 2027 } },
    ]);
  });
});

describe("full-input filter", () => {
  test("unconsumed non-filler token kills the parse", () => {
    expect(exprs([toks.weekday(5), toks.literal("zorp")])).toHaveLength(0);
  });
  test("trailing filler is fine", () => {
    expect(exprs([toks.weekday(5), toks.filler()])).toHaveLength(1);
  });
  test("empty stream parses to nothing", () => {
    expect(exprs([])).toHaveLength(0);
  });
});

describe("locale escape-hatch rules", () => {
  test("an anchor-position rule adds an alternative", () => {
    const custom = buildGrammar([{
      name: "test-rule",
      at: "anchor",
      match: (s, i) =>
        s[i]?.kind === "LITERAL" && s[i]!.source === "doomsday"
          ? { expr: { type: "anchor", anchor: { kind: "calendar", m: 11, d: 31 } }, next: i + 1 }
          : null,
    }]);
    expect(custom.parseStream([toks.literal("doomsday")]).parses[0]!.expr).toEqual(
      { type: "anchor", anchor: { kind: "calendar", m: 11, d: 31 } },
    );
  });
});

describe("expectations surface from parseStream", () => {
  test("after REL, a WEEKDAY is among expected kinds", () => {
    const { expectations } = g.parseStream([toks.rel("next")]);
    expect(expectations.frontier).toBe(1);
    expect([...expectations.kinds]).toContain("WEEKDAY");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `grammar.ts` (anchors only — compound rules arrive in Task 10)**

```ts
import {
  alt, lazy, map, newExpectations, opt, seq, skipFiller, tok,
  type Expectations, type Parser,
} from "./combinators.js";
import type { Anchor, DateExpr, LocaleRule, SemToken } from "./types.js";

export interface GrammarParse {
  expr: DateExpr;
  specificity: number;
}

export interface StreamResult {
  parses: GrammarParse[];
  expectations: Expectations;
}

export interface Grammar {
  parseStream(stream: SemToken[]): StreamResult;
}

type P = Parser<GrammarParse>;

const A = (expr: DateExpr, specificity: number): GrammarParse => ({ expr, specificity });
const anchor = (a: Anchor): DateExpr => ({ type: "anchor", anchor: a });

function localeRuleParser(rule: LocaleRule): P {
  return (s, i) => {
    const j = skipFiller(s, i);
    const r = rule.match(s, j);
    return r ? [{ v: A(r.expr, 1), i: r.next }] : [];
  };
}

export function buildGrammar(localeRules: LocaleRule[] = []): Grammar {
  const anchorRules = localeRules.filter((r) => r.at === "anchor").map(localeRuleParser);
  const exprRules = localeRules.filter((r) => r.at === "expression").map(localeRuleParser);

  // ---- anchors ----
  const dayNum = tok("NUMBER", (t) => t.n >= 1 && t.n <= 31);

  const reldayA: P = map(tok("RELDAY"), (t) => A(anchor({ kind: "relday", offset: t.offset }), 1));

  const weekdayA: P = map(seq(opt(tok("REL")), tok("WEEKDAY")), ([rel, wd]) =>
    A(anchor({ kind: "weekday", day: wd.day, ...(rel ? { which: rel.which } : {}) }), rel ? 1 : 0.9),
  );

  const calMD: P = map(seq(tok("MONTH"), dayNum, opt(tok("YEAR"))), ([mo, d, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, d: d.n, ...(y ? { y: y.year } : {}) }), 1),
  );
  const calDM: P = map(seq(dayNum, tok("MONTH"), opt(tok("YEAR"))), ([d, mo, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, d: d.n, ...(y ? { y: y.year } : {}) }), 1),
  );
  const calYMD: P = map(seq(tok("YEAR"), tok("MONTH"), dayNum), ([y, mo, d]) =>
    A(anchor({ kind: "calendar", y: y.year, m: mo.month, d: d.n }), 1),
  );
  const calMonthOnly: P = map(seq(tok("MONTH"), opt(tok("YEAR"))), ([mo, y]) =>
    A(anchor({ kind: "calendar", m: mo.month, ...(y ? { y: y.year } : {}) }), 0.6),
  );
  const ordinalDayA: P = map(tok("NUMBER", (t) => t.ordinal === true && t.n >= 1 && t.n <= 31), (t) =>
    A(anchor({ kind: "calendar", d: t.n }), 0.8),
  );
  const bareYearA: P = map(tok("YEAR"), (t) => A(anchor({ kind: "calendar", y: t.year }), 0.7));

  const holidayA: P = map(seq(tok("HOLIDAY"), opt(tok("YEAR"))), ([h, y]) =>
    A(anchor({ kind: "holiday", id: h.id, ...(y ? { year: y.year } : {}) }), 1),
  );

  const anchorP: P = alt(
    reldayA, weekdayA, calYMD, calMD, calDM, calMonthOnly, ordinalDayA, bareYearA, holidayA,
    ...anchorRules,
  );

  // Task 10 replaces this with the full compound-expression grammar.
  const topP: P = alt(anchorP, ...exprRules);

  function parseStream(stream: SemToken[]): StreamResult {
    const expectations = newExpectations();
    if (stream.length === 0) return { parses: [], expectations };
    const all = topP(stream, 0, expectations);
    const complete = all.filter((r) => skipFiller(stream, r.i) === stream.length);
    // dedupe structurally identical ASTs, keeping the highest specificity
    const byKey = new Map<string, GrammarParse>();
    for (const { v } of complete) {
      const key = JSON.stringify(v.expr);
      const prior = byKey.get(key);
      if (!prior || v.specificity > prior.specificity) byKey.set(key, v);
    }
    return { parses: [...byKey.values()], expectations };
  }

  return { parseStream };
}
```

Note: `lazy` is imported now but first used in Task 10 — if the linter complains, add the import in Task 10 instead.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/grammar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grammar.ts packages/core/test/grammar.test.ts
git commit -m "feat(core): grammar factory with anchor rules, full-input filter, locale-rule injection"
```

---

### Task 10: Grammar — compound expressions

Completes the universal rule inventory of spec §5.3: periods, lookback spans, in/ago, direction offsets, postfix arithmetic, boundaries, with-time, ranges.

**Files:**
- Modify: `packages/core/src/grammar.ts`
- Test: `packages/core/test/grammar.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
describe("offset arithmetic", () => {
  const nextFriday = { type: "anchor", anchor: { kind: "weekday", day: 5, which: "next" } };

  test("acid-test shape: 'next friday + 2 weeks'", () => {
    expect(exprs([toks.rel("next"), toks.weekday(5), toks.op(1), toks.num(2), toks.unit("week")]))
      .toContainEqual({ type: "offset", base: nextFriday, n: 2, unit: "week", dir: 1 });
  });

  test("'2 weeks after next friday' produces the SAME AST", () => {
    expect(exprs([toks.num(2), toks.unit("week"), toks.dir("after"), toks.rel("next"), toks.weekday(5)]))
      .toContainEqual({ type: "offset", base: nextFriday, n: 2, unit: "week", dir: 1 });
  });

  test("'3 days before march 4' negates direction", () => {
    expect(exprs([toks.num(3), toks.unit("day"), toks.dir("before"), toks.month(2), toks.num(4)]))
      .toContainEqual({
        type: "offset",
        base: { type: "anchor", anchor: { kind: "calendar", m: 2, d: 4 } },
        n: 3, unit: "day", dir: -1,
      });
  });

  test("chained postfix ops fold left: 'tomorrow + 2 weeks - 3 days'", () => {
    expect(exprs([toks.relday(1), toks.op(1), toks.num(2), toks.unit("week"), toks.op(-1), toks.num(3), toks.unit("day")]))
      .toContainEqual({
        type: "offset",
        base: { type: "offset", base: { type: "anchor", anchor: { kind: "relday", offset: 1 } }, n: 2, unit: "week", dir: 1 },
        n: 3, unit: "day", dir: -1,
      });
  });
});

describe("now-relative", () => {
  const NOW = { type: "anchor", anchor: { kind: "now" } };
  test("'in 2 weeks'", () => {
    expect(exprs([toks.dir("in"), toks.num(2), toks.unit("week")]))
      .toContainEqual({ type: "offset", base: NOW, n: 2, unit: "week", dir: 1 });
  });
  test("'3 days ago'", () => {
    expect(exprs([toks.num(3), toks.unit("day"), toks.dir("ago")]))
      .toContainEqual({ type: "offset", base: NOW, n: 3, unit: "day", dir: -1 });
  });
  test("lookback span: 'last 2 weeks' → range ending now", () => {
    expect(exprs([toks.rel("last"), toks.num(2), toks.unit("week")]))
      .toContainEqual({
        type: "range",
        start: { type: "offset", base: NOW, n: 2, unit: "week", dir: -1 },
        end: NOW,
      });
  });
  test("lookahead span: 'next 2 weeks' → range starting now", () => {
    expect(exprs([toks.rel("next"), toks.num(2), toks.unit("week")]))
      .toContainEqual({
        type: "range",
        start: NOW,
        end: { type: "offset", base: NOW, n: 2, unit: "week", dir: 1 },
      });
  });
});

describe("periods", () => {
  test("'next week' (REL + UNIT-as-period)", () => {
    expect(exprs([toks.rel("next"), toks.unit("week")]))
      .toContainEqual({ type: "period", period: { kind: "week" }, which: "next" });
  });
  test("'this weekend' and bare 'weekend'", () => {
    const expected = { type: "period", period: { kind: "weekend" }, which: "this" };
    expect(exprs([toks.rel("this"), toks.period({ kind: "weekend" })])).toContainEqual(expected);
    expect(exprs([toks.period({ kind: "weekend" })])).toContainEqual(expected);
  });
  test("'last quarter'", () => {
    expect(exprs([toks.rel("last"), toks.period({ kind: "quarter" })]))
      .toContainEqual({ type: "period", period: { kind: "quarter" }, which: "last" });
  });
});

describe("boundary", () => {
  test("'end of month' → boundary of this-month period", () => {
    expect(exprs([toks.boundary("end"), toks.filler(), toks.unit("month")]))
      .toContainEqual({
        type: "boundary",
        of: { type: "period", period: { kind: "month" }, which: "this" },
        edge: "end",
      });
  });
  test("'start of next week'", () => {
    expect(exprs([toks.boundary("start"), toks.filler(), toks.rel("next"), toks.unit("week")]))
      .toContainEqual({
        type: "boundary",
        of: { type: "period", period: { kind: "week" }, which: "next" },
        edge: "start",
      });
  });
});

describe("with-time", () => {
  test("'friday at 5pm' → withTime 17:00", () => {
    expect(exprs([toks.weekday(5), toks.filler(), toks.num(5), toks.meridiem("pm")]))
      .toContainEqual({
        type: "withTime",
        base: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
        time: { h: 17, m: 0 },
      });
  });
  test("'tomorrow 17:30' uses 24h TIME token directly", () => {
    expect(exprs([toks.relday(1), toks.time(17, 30)]))
      .toContainEqual({
        type: "withTime",
        base: { type: "anchor", anchor: { kind: "relday", offset: 1 } },
        time: { h: 17, m: 30 },
      });
  });
  test("'12am' is midnight, '12pm' is noon", () => {
    expect(exprs([toks.relday(0), toks.num(12), toks.meridiem("am")]))
      .toContainEqual(expect.objectContaining({ time: { h: 0, m: 0 } }));
    expect(exprs([toks.relday(0), toks.num(12), toks.meridiem("pm")]))
      .toContainEqual(expect.objectContaining({ time: { h: 12, m: 0 } }));
  });
});

describe("ranges", () => {
  test("'monday to friday'", () => {
    expect(exprs([toks.weekday(1), toks.connector(), toks.weekday(5)]))
      .toContainEqual({
        type: "range",
        start: { type: "anchor", anchor: { kind: "weekday", day: 1 } },
        end: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
      });
  });
  test("range of compound ends: 'tomorrow to end of month'", () => {
    expect(exprs([toks.relday(1), toks.connector(), toks.boundary("end"), toks.filler(), toks.unit("month")]))
      .toHaveLength(1);
  });
  test("after a CONNECTOR the parser expects anchor-ish kinds (range-building hook)", () => {
    const { expectations } = g.parseStream([toks.weekday(1), toks.connector()]);
    expect(expectations.frontier).toBe(2);
    expect([...expectations.kinds]).toEqual(expect.arrayContaining(["WEEKDAY", "RELDAY", "MONTH"]));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar.test.ts`
Expected: new tests FAIL (anchor tests still pass).

- [ ] **Step 3: Implement — replace the `topP` placeholder inside `buildGrammar`**

Add at module level (outside `buildGrammar`):

```ts
function applyMeridiem(h: number, m: number, mer?: "am" | "pm"): { h: number; m: number } {
  if (!mer || h > 12) return { h, m };
  if (mer === "pm") return { h: h === 12 ? 12 : h + 12, m };
  return { h: h === 12 ? 0 : h, m };
}
```

Inside `buildGrammar`, delete `const topP: P = alt(anchorP, ...exprRules);` and add:

```ts
  // ---- time ----
  const timeP: Parser<{ h: number; m: number }> = alt(
    map(seq(tok("TIME"), opt(tok("MERIDIEM"))), ([t, mer]) => applyMeridiem(t.h, t.m, mer?.value)),
    map(
      seq(tok("NUMBER", (t) => !t.ordinal && t.n >= 1 && t.n <= 12), tok("MERIDIEM")),
      ([n, mer]) => applyMeridiem(n.n, 0, mer.value),
    ),
  );

  // ---- periods ----
  const periodRefP = alt(
    map(tok("PERIOD"), (t) => t.period),
    map(
      tok("UNIT", (u) => u.unit === "week" || u.unit === "month" || u.unit === "year"),
      (u) => ({ kind: u.unit }) as PeriodRef,
    ),
  );
  const relPeriodP: P = map(seq(tok("REL"), periodRefP), ([rel, p]) =>
    A({ type: "period", period: p, which: rel.which }, 1),
  );
  const barePeriodP: P = map(tok("PERIOD"), (t) =>
    A({ type: "period", period: t.period, which: "this" }, 0.8),
  );

  // ---- now-relative ----
  const NOW: DateExpr = anchor({ kind: "now" });
  const numUnit = seq(tok("NUMBER", (t) => !t.ordinal), tok("UNIT"));

  const inP: P = map(seq(tok("DIRECTION", (d) => d.dir === "in"), numUnit), ([, [n, u]]) =>
    A({ type: "offset", base: NOW, n: n.n, unit: u.unit, dir: 1 }, 1),
  );
  const agoP: P = map(seq(numUnit, tok("DIRECTION", (d) => d.dir === "ago")), ([[n, u]]) =>
    A({ type: "offset", base: NOW, n: n.n, unit: u.unit, dir: -1 }, 1),
  );

  // "last 2 weeks" / "next 2 weeks" → spans anchored at now
  const lookP: P = map(seq(tok("REL", (r) => r.which !== "this"), numUnit), ([rel, [n, u]]) => {
    const off: DateExpr = {
      type: "offset", base: NOW, n: n.n, unit: u.unit, dir: rel.which === "last" ? -1 : 1,
    };
    return A(
      rel.which === "last"
        ? { type: "range", start: off, end: NOW }
        : { type: "range", start: NOW, end: off },
      1,
    );
  });

  // "2 weeks after/before/from X"
  const relOffsetP: P = map(
    seq(
      numUnit,
      tok("DIRECTION", (d) => d.dir === "after" || d.dir === "before" || d.dir === "from"),
      lazy(() => exprP),
    ),
    ([[n, u], d, base]) =>
      A(
        { type: "offset", base: base.expr, n: n.n, unit: u.unit, dir: d.dir === "before" ? -1 : 1 },
        base.specificity,
      ),
  );

  // "end of X" — bare UNIT target reads as this-period ("end of month")
  const boundaryTarget: P = alt(
    lazy(() => exprP),
    map(
      tok("UNIT", (u) => u.unit === "week" || u.unit === "month" || u.unit === "year"),
      (u) => A({ type: "period", period: { kind: u.unit } as PeriodRef, which: "this" }, 0.9),
    ),
  );
  const boundaryP: P = map(seq(tok("BOUNDARY"), boundaryTarget), ([b, t]) =>
    A({ type: "boundary", of: t.expr, edge: b.edge }, t.specificity),
  );

  const primaryP: P = alt(
    anchorP, relPeriodP, barePeriodP, lookP, inP, agoP, relOffsetP, boundaryP,
  );

  // postfix arithmetic: X (+|-) n UNIT, repeatable, left-folded
  const offsetTail = seq(tok("OP"), numUnit);
  const withOffsets: P = map(seq(primaryP, many(offsetTail)), ([base, tails]) =>
    tails.reduce<GrammarParse>(
      (acc, [op, [n, u]]) =>
        A({ type: "offset", base: acc.expr, n: n.n, unit: u.unit, dir: op.op }, acc.specificity),
      base,
    ),
  );

  // optional time attachment: "X at 5pm" ("at" is FILLER)
  const exprP: P = map(seq(withOffsets, opt(timeP)), ([base, time]) =>
    time ? A({ type: "withTime", base: base.expr, time }, base.specificity) : base,
  );

  // explicit range
  const rangeP: P = map(seq(exprP, tok("CONNECTOR"), exprP), ([a, , b]) =>
    A({ type: "range", start: a.expr, end: b.expr }, a.specificity * b.specificity),
  );

  const topP: P = alt(rangeP, exprP, ...exprRules);
```

Add `PeriodRef` to the type imports from `./types.js`, and `lazy`, `many` to the combinator imports if not already present.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/grammar.test.ts`
Expected: PASS (all, including Task 9's).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grammar.ts packages/core/test/grammar.test.ts
git commit -m "feat(core): compound grammar — offsets, periods, boundaries, with-time, ranges"
```

---

### Task 11: Resolver

Spec §5.5 + §4.3. `resolveExpr(expr, opts)` evaluates an unresolved AST against injected `now`/`timeZone` and returns inclusive wall-clock day ranges (points have `start === end`). Internally it throws on impossible candidates ("Feb 30", "range ends before it starts") and the wrapper converts that to `{ ok: false, error }` — user input never throws past this boundary (spec §8).

**Resolution semantics locked in by this task** (these ARE the product decisions; tests encode them):
- `weekday` with no `which` → soonest occurrence **on or after** today (today counts). `this` → that weekday of the current week (per `weekStart`); `next` → current week's + 7; `last` → current week's − 7. `this monday` may be in the past — scoring penalizes, the resolver doesn't.
- `calendar {m,d}` without year → this year, rolled to next year if past and `!allowPast`. Bare ordinal `{d}` → this month, rolled to next month if past. `{m}` only → whole-month range (rolled to next year if the month is past). `{y}` only → whole-year range.
- `holiday` without year → next occurrence on/after today (checks this year, then next).
- `weekend` → the Saturday on-or-after the target week's start, plus the following Sunday.
- `quarter`/`season` without an index → the current one shifted by `which`; with an index → that quarter/season, `which` shifts the **year**. Seasons are meteorological; winter (s=3) is Dec–Feb and belongs to the year it starts in.
- `range` → the end expression is resolved **relative to the range start** ("friday to monday" crosses the week), then must not end before it starts.
- `withTime` on a multi-day range → error. `hour`/`minute` offsets set `hasExplicitTime`.

**Files:**
- Modify: `packages/core/src/zoned-date.ts` (add `addMinutes`)
- Create: `packages/core/src/resolve.ts`
- Test: `packages/core/test/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { resolveExpr, type ResolveOptions } from "../src/resolve.js";
import type { DateExpr } from "../src/types.js";

// Fixed clock: 2026-06-12T15:00:00Z = Friday 2026-06-12 20:00 in Asia/Almaty (UTC+5)
const OPTS: ResolveOptions = {
  now: new Date("2026-06-12T15:00:00Z"),
  timeZone: "Asia/Almaty",
  weekStart: 1,
  allowPast: false,
  holidays: new Map([
    ["christmas", () => ({ m: 11, d: 25 })],
    ["new-year", () => ({ m: 0, d: 1 })],
  ]),
};

const anchor = (a: object): DateExpr => ({ type: "anchor", anchor: a } as DateExpr);
const day = (r: ReturnType<typeof resolveExpr>) => {
  if (!r.ok) throw new Error(r.error);
  const f = (w: { y: number; m: number; d: number }) =>
    `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
  return { start: f(r.value.start), end: f(r.value.end) };
};

describe("anchors", () => {
  test("relday: tomorrow", () => {
    expect(day(resolveExpr(anchor({ kind: "relday", offset: 1 }), OPTS)).start).toBe("2026-06-13");
  });

  test("bare weekday: today counts ('friday' on a Friday is today)", () => {
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5 }), OPTS)).start).toBe("2026-06-12");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 1 }), OPTS)).start).toBe("2026-06-15");
  });

  test("this/next/last weekday are week-relative", () => {
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 1, which: "this" }), OPTS)).start).toBe("2026-06-08");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5, which: "next" }), OPTS)).start).toBe("2026-06-19");
    expect(day(resolveExpr(anchor({ kind: "weekday", day: 5, which: "last" }), OPTS)).start).toBe("2026-06-05");
  });

  test("calendar {m,d}: rolls to next year when past (unless allowPast)", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 0, d: 5 }), OPTS)).start).toBe("2027-01-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 0, d: 5 }), { ...OPTS, allowPast: true })).start).toBe("2026-01-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", y: 2026, m: 0, d: 5 }), OPTS)).start).toBe("2026-01-05");
  });

  test("calendar-invalid dates error: Feb 30", () => {
    const r = resolveExpr(anchor({ kind: "calendar", y: 2026, m: 1, d: 30 }), OPTS);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/no day 30/i) });
  });

  test("bare ordinal day rolls to next month when past", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", d: 5 }), OPTS)).start).toBe("2026-07-05");
    expect(day(resolveExpr(anchor({ kind: "calendar", d: 20 }), OPTS)).start).toBe("2026-06-20");
  });

  test("month-only is a range; past month rolls a year", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", m: 2 }), OPTS))).toEqual({
      start: "2027-03-01", end: "2027-03-31",
    });
  });

  test("bare year is a range", () => {
    expect(day(resolveExpr(anchor({ kind: "calendar", y: 2027 }), OPTS))).toEqual({
      start: "2027-01-01", end: "2027-12-31",
    });
  });

  test("holiday rolls forward; explicit year pins it", () => {
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "christmas" }), OPTS)).start).toBe("2026-12-25");
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "new-year" }), OPTS)).start).toBe("2027-01-01");
    expect(day(resolveExpr(anchor({ kind: "holiday", id: "christmas", year: 2028 }), OPTS)).start).toBe("2028-12-25");
    expect(resolveExpr(anchor({ kind: "holiday", id: "nope" }), OPTS).ok).toBe(false);
  });
});

describe("periods (weekStart=1)", () => {
  const period = (period: object, which: string): DateExpr =>
    ({ type: "period", period, which } as DateExpr);

  test("next week", () => {
    expect(day(resolveExpr(period({ kind: "week" }, "next"), OPTS))).toEqual({
      start: "2026-06-15", end: "2026-06-21",
    });
  });
  test("this weekend is the upcoming Sat–Sun", () => {
    expect(day(resolveExpr(period({ kind: "weekend" }, "this"), OPTS))).toEqual({
      start: "2026-06-13", end: "2026-06-14",
    });
  });
  test("weekend with weekStart=0 still lands on Sat–Sun", () => {
    expect(day(resolveExpr(period({ kind: "weekend" }, "this"), { ...OPTS, weekStart: 0 }))).toEqual({
      start: "2026-06-13", end: "2026-06-14",
    });
  });
  test("last quarter (today is Q2) → Q1", () => {
    expect(day(resolveExpr(period({ kind: "quarter" }, "last"), OPTS))).toEqual({
      start: "2026-01-01", end: "2026-03-31",
    });
  });
  test("quarter index: 'Q1' + which=next shifts the year", () => {
    expect(day(resolveExpr(period({ kind: "quarter", q: 1 }, "next"), OPTS))).toEqual({
      start: "2027-01-01", end: "2027-03-31",
    });
  });
  test("this season (June) is summer; winter spans the year boundary", () => {
    expect(day(resolveExpr(period({ kind: "season" }, "this"), OPTS))).toEqual({
      start: "2026-06-01", end: "2026-08-31",
    });
    expect(day(resolveExpr(period({ kind: "season", s: 3 }, "this"), OPTS))).toEqual({
      start: "2026-12-01", end: "2027-02-28",
    });
  });
});

describe("compound expressions", () => {
  test("boundary: end of this month", () => {
    const e: DateExpr = {
      type: "boundary",
      of: { type: "period", period: { kind: "month" }, which: "this" },
      edge: "end",
    };
    expect(day(resolveExpr(e, OPTS))).toEqual({ start: "2026-06-30", end: "2026-06-30" });
  });

  test("offset: tomorrow + 2 weeks", () => {
    const e: DateExpr = {
      type: "offset",
      base: anchor({ kind: "relday", offset: 1 }),
      n: 2, unit: "week", dir: 1,
    };
    expect(day(resolveExpr(e, OPTS)).start).toBe("2026-06-27");
  });

  test("offset month-end clamp: Jan 31 + 1 month → Feb 28", () => {
    const e: DateExpr = {
      type: "offset",
      base: anchor({ kind: "calendar", y: 2026, m: 0, d: 31 }),
      n: 1, unit: "month", dir: 1,
    };
    expect(day(resolveExpr(e, OPTS)).start).toBe("2026-02-28");
  });

  test("range end resolves relative to the start: friday to monday crosses the week", () => {
    const e: DateExpr = {
      type: "range",
      start: anchor({ kind: "weekday", day: 5 }),
      end: anchor({ kind: "weekday", day: 1 }),
    };
    expect(day(resolveExpr(e, OPTS))).toEqual({ start: "2026-06-12", end: "2026-06-15" });
  });

  test("range that ends before it starts errors", () => {
    const e: DateExpr = {
      type: "range",
      start: anchor({ kind: "calendar", y: 2026, m: 5, d: 20 }),
      end: anchor({ kind: "calendar", y: 2026, m: 5, d: 10 }),
    };
    expect(resolveExpr(e, OPTS)).toMatchObject({ ok: false, error: expect.stringMatching(/ends before/i) });
  });

  test("withTime sets wall time and hasExplicitTime", () => {
    const e: DateExpr = {
      type: "withTime",
      base: anchor({ kind: "weekday", day: 5 }),
      time: { h: 17, m: 0 },
    };
    const r = resolveExpr(e, OPTS);
    expect(r.ok && r.value.start).toMatchObject({ d: 12, h: 17, mi: 0 });
    expect(r.ok && r.value.hasExplicitTime).toBe(true);
  });

  test("withTime on a multi-day range errors", () => {
    const e: DateExpr = {
      type: "withTime",
      base: { type: "period", period: { kind: "week" }, which: "next" },
      time: { h: 9, m: 0 },
    };
    expect(resolveExpr(e, OPTS).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/resolve.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add `addMinutes` to `zoned-date.ts`**

```ts
export function addMinutes(w: Wall, n: number): Wall {
  const t = new Date(Date.UTC(w.y, w.m, w.d, w.h, w.mi + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}
```

- [ ] **Step 4: Implement `resolve.ts`**

```ts
import type { Anchor, DateExpr, PeriodRef, Rel } from "./types.js";
import {
  addDays, addMinutes, addMonths, addYears, compareWallDate, daysInMonth,
  endOfMonth, startOfMonth, startOfWeek, utcToWall, weekdayOf, type Wall,
} from "./zoned-date.js";

export interface ResolveOptions {
  now: Date;
  timeZone: string;
  weekStart: 0 | 1;
  allowPast: boolean;
  holidays?: Map<string, (year: number) => { m: number; d: number } | null>;
}

export interface Resolved {
  start: Wall;
  end: Wall; // inclusive; === start for points
  hasExplicitTime: boolean;
}

export type ResolveOutcome = { ok: true; value: Resolved } | { ok: false; error: string };

interface Ctx {
  today: Wall; // 00:00 local
  weekStart: 0 | 1;
  allowPast: boolean;
  holidays: NonNullable<ResolveOptions["holidays"]>;
}

export function resolveExpr(expr: DateExpr, opts: ResolveOptions): ResolveOutcome {
  const nowWall = utcToWall(opts.now, opts.timeZone);
  const ctx: Ctx = {
    today: { ...nowWall, h: 0, mi: 0 },
    weekStart: opts.weekStart,
    allowPast: opts.allowPast,
    holidays: opts.holidays ?? new Map(),
  };
  try {
    return { ok: true, value: rec(expr, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function rec(expr: DateExpr, ctx: Ctx): Resolved {
  switch (expr.type) {
    case "anchor":
      return resolveAnchor(expr.anchor, ctx);

    case "offset": {
      const base = rec(expr.base, ctx);
      const n = expr.n * expr.dir;
      const shift = (w: Wall): Wall => {
        switch (expr.unit) {
          case "day": return addDays(w, n);
          case "week": return addDays(w, n * 7);
          case "month": return addMonths(w, n);
          case "year": return addYears(w, n);
          case "hour": return addMinutes(w, n * 60);
          case "minute": return addMinutes(w, n);
        }
      };
      const timed = expr.unit === "hour" || expr.unit === "minute";
      return {
        start: shift(base.start),
        end: shift(base.end),
        hasExplicitTime: base.hasExplicitTime || timed,
      };
    }

    case "range": {
      const start = rec(expr.start, ctx);
      // end is interpreted relative to where the range starts
      const end = rec(expr.end, { ...ctx, today: { ...start.start, h: 0, mi: 0 } });
      if (compareWallDate(end.end, start.start) < 0) throw new Error("Range ends before it starts.");
      return {
        start: start.start,
        end: end.end,
        hasExplicitTime: start.hasExplicitTime || end.hasExplicitTime,
      };
    }

    case "period":
      return resolvePeriod(expr.period, expr.which, ctx);

    case "boundary": {
      const of = rec(expr.of, ctx);
      const w = expr.edge === "start" ? of.start : of.end;
      return { start: w, end: w, hasExplicitTime: false };
    }

    case "withTime": {
      const base = rec(expr.base, ctx);
      if (compareWallDate(base.start, base.end) !== 0) {
        throw new Error("Cannot attach a time of day to a range.");
      }
      const w: Wall = { ...base.start, h: expr.time.h, mi: expr.time.m };
      return { start: w, end: w, hasExplicitTime: true };
    }
  }
}

function point(w: Wall): Resolved {
  return { start: w, end: w, hasExplicitTime: false };
}

function resolveAnchor(a: Anchor, ctx: Ctx): Resolved {
  switch (a.kind) {
    case "now":
      return point(ctx.today);

    case "relday":
      return point(addDays(ctx.today, a.offset));

    case "weekday": {
      const inThisWeek = addDays(
        startOfWeek(ctx.today, ctx.weekStart),
        (a.day - ctx.weekStart + 7) % 7,
      );
      switch (a.which) {
        case undefined:
          return point(addDays(ctx.today, (a.day - weekdayOf(ctx.today) + 7) % 7));
        case "this": return point(inThisWeek);
        case "next": return point(addDays(inThisWeek, 7));
        case "last": return point(addDays(inThisWeek, -7));
      }
    }

    case "calendar":
      return resolveCalendar(a, ctx);

    case "holiday": {
      const compute = ctx.holidays.get(a.id);
      if (!compute) throw new Error(`Unknown holiday "${a.id}".`);
      if (a.year !== undefined) {
        const md = compute(a.year);
        if (!md) throw new Error(`No date for holiday "${a.id}" in ${a.year}.`);
        return point({ y: a.year, m: md.m, d: md.d, h: 0, mi: 0 });
      }
      for (const y of [ctx.today.y, ctx.today.y + 1]) {
        const md = compute(y);
        if (md) {
          const w: Wall = { y, m: md.m, d: md.d, h: 0, mi: 0 };
          if (compareWallDate(w, ctx.today) >= 0) return point(w);
        }
      }
      throw new Error(`No upcoming date for holiday "${a.id}".`);
    }
  }
}

function resolveCalendar(a: Extract<Anchor, { kind: "calendar" }>, ctx: Ctx): Resolved {
  const { y, m, d } = a;

  if (m !== undefined && d !== undefined) {
    const tryYear = (yy: number): Wall => {
      if (d > daysInMonth(yy, m)) throw new Error(`Invalid date: that month has no day ${d}.`);
      return { y: yy, m, d, h: 0, mi: 0 };
    };
    if (y !== undefined) return point(tryYear(y));
    const thisYear = tryYear(ctx.today.y);
    if (!ctx.allowPast && compareWallDate(thisYear, ctx.today) < 0) return point(tryYear(ctx.today.y + 1));
    return point(thisYear);
  }

  if (d !== undefined) {
    const cur: Wall = { y: ctx.today.y, m: ctx.today.m, d, h: 0, mi: 0 };
    const valid = d <= daysInMonth(cur.y, cur.m);
    if (valid && (ctx.allowPast || compareWallDate(cur, ctx.today) >= 0)) return point(cur);
    const next = addMonths({ ...ctx.today, d: 1 }, 1);
    if (d > daysInMonth(next.y, next.m)) throw new Error(`No day ${d} in the coming month.`);
    return point({ y: next.y, m: next.m, d, h: 0, mi: 0 });
  }

  if (m !== undefined) {
    let yy = y ?? ctx.today.y;
    if (y === undefined && !ctx.allowPast && m < ctx.today.m) yy += 1;
    const start: Wall = { y: yy, m, d: 1, h: 0, mi: 0 };
    return { start, end: endOfMonth(start), hasExplicitTime: false };
  }

  if (y !== undefined) {
    return {
      start: { y, m: 0, d: 1, h: 0, mi: 0 },
      end: { y, m: 11, d: 31, h: 0, mi: 0 },
      hasExplicitTime: false,
    };
  }

  throw new Error("Empty calendar anchor.");
}

function resolvePeriod(p: PeriodRef, which: Rel, ctx: Ctx): Resolved {
  const off = which === "this" ? 0 : which === "next" ? 1 : -1;

  switch (p.kind) {
    case "week": {
      const start = addDays(startOfWeek(ctx.today, ctx.weekStart), off * 7);
      return { start, end: addDays(start, 6), hasExplicitTime: false };
    }
    case "month": {
      const start = startOfMonth(addMonths(ctx.today, off));
      return { start, end: endOfMonth(start), hasExplicitTime: false };
    }
    case "year": {
      const y = ctx.today.y + off;
      return {
        start: { y, m: 0, d: 1, h: 0, mi: 0 },
        end: { y, m: 11, d: 31, h: 0, mi: 0 },
        hasExplicitTime: false,
      };
    }
    case "weekend": {
      const weekBase = addDays(startOfWeek(ctx.today, ctx.weekStart), off * 7);
      const sat = addDays(weekBase, (6 - weekdayOf(weekBase) + 7) % 7);
      return { start: sat, end: addDays(sat, 1), hasExplicitTime: false };
    }
    case "quarter": {
      let y = ctx.today.y;
      let q: number;
      if (p.q !== undefined) {
        q = p.q - 1;
        y += off;
      } else {
        q = Math.floor(ctx.today.m / 3) + off;
        y += Math.floor(q / 4);
        q = ((q % 4) + 4) % 4;
      }
      return {
        start: { y, m: q * 3, d: 1, h: 0, mi: 0 },
        end: endOfMonth({ y, m: q * 3 + 2, d: 1, h: 0, mi: 0 }),
        hasExplicitTime: false,
      };
    }
    case "season": {
      // meteorological: 0 spring Mar–May, 1 summer, 2 autumn, 3 winter Dec–Feb
      const curSeason = ctx.today.m === 11 || ctx.today.m <= 1 ? 3 : Math.floor((ctx.today.m - 2) / 3);
      let s: number;
      let y = ctx.today.y;
      if (p.s !== undefined) {
        s = p.s;
        y += off;
      } else {
        if (curSeason === 3 && ctx.today.m <= 1) y -= 1; // current winter started last December
        s = curSeason + off;
        y += Math.floor(s / 4);
        s = ((s % 4) + 4) % 4;
      }
      if (s === 3) {
        return {
          start: { y, m: 11, d: 1, h: 0, mi: 0 },
          end: endOfMonth({ y: y + 1, m: 1, d: 1, h: 0, mi: 0 }),
          hasExplicitTime: false,
        };
      }
      return {
        start: { y, m: 2 + s * 3, d: 1, h: 0, mi: 0 },
        end: endOfMonth({ y, m: 4 + s * 3, d: 1, h: 0, mi: 0 }),
        hasExplicitTime: false,
      };
    }
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/core/test/resolve.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/resolve.ts packages/core/src/zoned-date.ts packages/core/test/resolve.test.ts
git commit -m "feat(core): AST resolver with documented weekday/period/range semantics"
```

---

### Task 12: Scoring, dedupe, status — plus dateOrder weighting in the lattice

Spec §5.4: `confidence = Π(token confidences) × rule specificity × plausibility`. The `dateOrder` tie-break for slash dates is implemented **in the lattice**: the dispreferred reading's tokens get confidence 0.95, which flows into the product naturally — scoring itself stays AST-shape-agnostic.

**Files:**
- Modify: `packages/core/src/lattice.ts` (dateOrder option)
- Create: `packages/core/src/score.ts`
- Test: `packages/core/test/score.test.ts`, `packages/core/test/lattice.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/lattice.test.ts`:
```ts
describe("dateOrder weighting", () => {
  test("MDY: D/M reading is dispreferred (0.95)", () => {
    const cells = buildLattice(testLocale.tokenize("3/4"), testLocale.lexicon, { dateOrder: "MDY" });
    const [md, dm] = cells[0]!.alternatives;
    expect(md![0]!.confidence).toBe(1);
    expect(dm![0]!.confidence).toBe(0.95);
  });
  test("DMY: M/D reading is dispreferred", () => {
    const cells = buildLattice(testLocale.tokenize("3/4"), testLocale.lexicon, { dateOrder: "DMY" });
    const [md, dm] = cells[0]!.alternatives;
    expect(md![0]!.confidence).toBe(0.95);
    expect(dm![0]!.confidence).toBe(1);
  });
});
```

Create `packages/core/test/score.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { scoreAndRank, statusFor, type ScoreInput } from "../src/score.js";
import type { Wall } from "../src/zoned-date.js";

const today: Wall = { y: 2026, m: 5, d: 12, h: 0, mi: 0 };
const w = (y: number, m: number, d: number): Wall => ({ y, m, d, h: 0, mi: 0 });
const expr = { type: "anchor", anchor: { kind: "now" } } as ScoreInput["expr"];

function input(partial: Partial<ScoreInput>): ScoreInput {
  return {
    expr,
    specificity: 1,
    tokenConfidence: 1,
    resolved: { start: w(2026, 5, 20), end: w(2026, 5, 20), hasExplicitTime: false },
    ...partial,
  };
}

describe("scoreAndRank", () => {
  test("confidence is the product of the three factors", () => {
    const [r] = scoreAndRank([input({ tokenConfidence: 0.9, specificity: 0.8 })], { today, allowPast: false });
    expect(r!.confidence).toBeCloseTo(0.72);
  });

  test("past candidates are penalized unless allowPast", () => {
    const past = input({ resolved: { start: w(2026, 5, 1), end: w(2026, 5, 1), hasExplicitTime: false } });
    expect(scoreAndRank([past], { today, allowPast: false })[0]!.confidence).toBeCloseTo(0.6);
    expect(scoreAndRank([past], { today, allowPast: true })[0]!.confidence).toBe(1);
  });

  test("ranks descending and dedupes identical (start, end), keeping the best", () => {
    const a = input({ specificity: 0.7 });
    const b = input({ specificity: 1 }); // same resolved dates
    const c = input({ specificity: 0.9, resolved: { start: w(2026, 6, 1), end: w(2026, 6, 1), hasExplicitTime: false } });
    const ranked = scoreAndRank([a, b, c], { today, allowPast: false });
    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.confidence).toBe(1);
    expect(ranked[1]!.confidence).toBe(0.9);
  });
});

describe("statusFor", () => {
  test("empty → invalid; one → valid", () => {
    expect(statusFor([])).toBe("invalid");
    expect(statusFor([{ confidence: 0.4 } as never])).toBe("valid");
  });
  test("two near-scored survivors → ambiguous (ratio > 0.8)", () => {
    expect(statusFor([{ confidence: 1 }, { confidence: 0.95 }] as never)).toBe("ambiguous");
    expect(statusFor([{ confidence: 1 }, { confidence: 0.5 }] as never)).toBe("valid");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/score.test.ts packages/core/test/lattice.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lattice.ts`: add `dateOrder` to `LatticeOptions`, thread it into `classifyDigits`/`classifySlashDate`, and weight the dispreferred reading:

```ts
export interface LatticeOptions {
  correct?: (raw: RawToken) => CorrectionHit | null;
  dateOrder?: "MDY" | "DMY" | "YMD";
}
```

In `classifySlashDate` (signature gains `dateOrder: "MDY" | "DMY" | "YMD" = "MDY"`), build each two-field reading with a confidence:

```ts
    const mdConf = dateOrder === "DMY" ? 0.95 : 1;
    const dmConf = dateOrder === "DMY" ? 1 : 0.95;
    // M/D reading
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const seq = [
        sem({ kind: "MONTH", month: a - 1 }, raw, mdConf),
        sem({ kind: "NUMBER", n: b }, raw, mdConf),
      ];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
    // D/M reading
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31 && a !== b) {
      const seq = [
        sem({ kind: "NUMBER", n: a }, raw, dmConf),
        sem({ kind: "MONTH", month: b - 1 }, raw, dmConf),
      ];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
```

(`classifyDigits` passes `opts.dateOrder` through; `buildLattice` hands `opts` to `classifyDigits`.)

Create `score.ts`:

```ts
import type { DateExpr } from "./types.js";
import { compareWallDate, type Wall } from "./zoned-date.js";
import type { Resolved } from "./resolve.js";

export interface ScoreInput {
  expr: DateExpr;
  specificity: number;
  tokenConfidence: number;
  resolved: Resolved;
}

export interface ScoredParse {
  expr: DateExpr;
  resolved: Resolved;
  confidence: number;
}

const PAST_PENALTY = 0.6;
const AMBIGUITY_RATIO = 0.8;

export function scoreAndRank(
  inputs: ScoreInput[],
  opts: { today: Wall; allowPast: boolean },
): ScoredParse[] {
  const byDates = new Map<string, ScoredParse>();
  for (const inp of inputs) {
    const isPast = compareWallDate(inp.resolved.end, opts.today) < 0;
    const plausibility = isPast && !opts.allowPast ? PAST_PENALTY : 1;
    const confidence = inp.tokenConfidence * inp.specificity * plausibility;
    const key = JSON.stringify([inp.resolved.start, inp.resolved.end]);
    const prior = byDates.get(key);
    if (!prior || confidence > prior.confidence) {
      byDates.set(key, { expr: inp.expr, resolved: inp.resolved, confidence });
    }
  }
  return [...byDates.values()].sort((a, b) => b.confidence - a.confidence);
}

export function statusFor(ranked: Array<{ confidence: number }>): "valid" | "ambiguous" | "invalid" {
  if (ranked.length === 0) return "invalid";
  if (ranked.length >= 2 && ranked[1]!.confidence / ranked[0]!.confidence > AMBIGUITY_RATIO) {
    return "ambiguous";
  }
  return "valid";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/score.test.ts packages/core/test/lattice.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/score.ts packages/core/src/lattice.ts packages/core/test
git commit -m "feat(core): confidence scoring, date-level dedupe, ambiguity status"
```

---

### Task 13: `createEngine` — full pipeline assembly

Spec §4.4 + §8. Config errors throw at creation (`validateLocale`, holiday-pack shape) or at first use of a bad `timeZone`; user input never throws. Holiday names merge into a **copy** of the locale lexicon as `HOLIDAY(id)` entries. The §5.3 cap of 8 candidates is applied after ranking. `enableTime` is accepted and threaded through `ParseContext` but only the controller consumes it (plan 06).

**Files:**
- Create: `packages/core/src/engine.ts`
- Modify: `packages/core/src/index.ts` (public API)
- Test: `packages/core/test/engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { createEngine } from "../src/engine.js";
import { testLocale } from "./fixtures/test-locale.js";
import type { HolidayPack, ParseContext } from "../src/types.js";

const engine = createEngine({ locale: testLocale });
// Friday 2026-06-12 in Almaty
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };

describe("createEngine config errors (spec §8: config always throws)", () => {
  test("invalid locale throws at creation", () => {
    expect(() => createEngine({ locale: { ...testLocale, lexicon: {} } })).toThrow(/incomplete/);
  });
  test("invalid timezone throws at parse-context use", () => {
    expect(() => engine.parse("tomorrow", { ...CTX, timeZone: "Nope/Nope" })).toThrow(/Invalid IANA/);
  });
});

describe("parse — happy paths", () => {
  test("'tomorrow' → valid single candidate", () => {
    const r = engine.parse("tomorrow", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]).toMatchObject({
      start: { date: "2026-06-13" },
      end: { date: "2026-06-13" },
      isRange: false,
      hasExplicitTime: false,
    });
  });

  test("'next friday + 2 weeks' → 2026-07-03", () => {
    const r = engine.parse("next friday + 2 weeks", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.start.date).toBe("2026-07-03");
  });

  test("filler words are skipped: 'on the next friday'", () => {
    expect(engine.parse("on the next friday", CTX).status).toBe("valid");
  });

  test("'monday to friday' → range", () => {
    const r = engine.parse("monday to friday", CTX);
    expect(r.candidates[0]).toMatchObject({
      isRange: true,
      start: { date: "2026-06-15" },
      end: { date: "2026-06-19" },
    });
  });

  test("'friday at 5pm' → explicit time, correct UTC instant", () => {
    const r = engine.parse("friday at 5pm", CTX);
    expect(r.candidates[0]).toMatchObject({ hasExplicitTime: true, start: { date: "2026-06-12" } });
    // 17:00 Almaty (UTC+5) = 12:00Z
    expect(r.candidates[0]!.start.utcIso).toBe("2026-06-12T12:00:00.000Z");
  });
});

describe("parse — ambiguity (spec acid case '3/4')", () => {
  test("two candidates, MDY default ranks March 4 first", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.map((c) => c.start.date)).toEqual(["2027-03-04", "2027-04-03"]);
  });
  test("dateOrder override flips the ranking", () => {
    const r = engine.parse("3/4", { ...CTX, dateOrder: "DMY" });
    expect(r.candidates[0]!.start.date).toBe("2027-04-03");
  });
});

describe("parse — typo correction", () => {
  test("'fridat' corrects to friday, reports the correction, lowers confidence", () => {
    const r = engine.parse("fridat", CTX);
    expect(r.status).toBe("valid");
    expect(r.corrections).toEqual([{ span: [0, 6], from: "fridat", to: "friday" }]);
    expect(r.candidates[0]!.confidence).toBeLessThan(1);
  });
});

describe("parse — failure modes never throw (spec §8)", () => {
  test("gibberish → invalid with an error message", () => {
    const r = engine.parse("zorp blarg", CTX);
    expect(r.status).toBe("invalid");
    expect(r.candidates).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
  test("empty / whitespace → idle", () => {
    expect(engine.parse("", CTX).status).toBe("idle");
    expect(engine.parse("   ", CTX).status).toBe("idle");
  });
  test("calendar-impossible input → invalid with explanation", () => {
    const r = engine.parse("february 30", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no day 30/i);
  });
});

describe("holiday packs merge into the lexicon", () => {
  const pack: HolidayPack = {
    id: "test-pack",
    entries: [{
      id: "christmas",
      compute: () => ({ m: 11, d: 25 }),
      names: { test: ["christmas", "xmas"], ru: ["рождество"] },
    }],
  };
  const withHolidays = createEngine({ locale: testLocale, holidays: [pack] });

  test("holiday by name resolves and rolls forward", () => {
    const r = withHolidays.parse("xmas", CTX);
    expect(r.status).toBe("valid");
    expect(r.candidates[0]!.start.date).toBe("2026-12-25");
  });
  test("names for other locales are not merged", () => {
    expect(withHolidays.parse("рождество", CTX).status).toBe("invalid");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/engine.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `engine.ts`**

```ts
import type {
  Candidate, Correction, Engine, HolidayPack, Lexicon, LocaleAdapter,
  ParseContext, ParseResult,
} from "./types.js";
import { normalizeText } from "./normalize.js";
import { validateLocale } from "./lexicon.js";
import { buildLattice, expandStreams } from "./lattice.js";
import { buildGrammar } from "./grammar.js";
import { buildKeyboardAdjacency, correctToken } from "./typo.js";
import { resolveExpr } from "./resolve.js";
import { scoreAndRank, statusFor, type ScoreInput, type ScoredParse } from "./score.js";
import { assertValidTimeZone, utcToWall, wallToUtc, type Wall } from "./zoned-date.js";

export interface CreateEngineOptions {
  locale: LocaleAdapter;
  holidays?: HolidayPack[];
}

const MAX_CANDIDATES = 8;

export function createEngine(options: CreateEngineOptions): Engine {
  const { locale, holidays = [] } = options;
  validateLocale(locale);

  // merge holiday names for THIS locale into a lexicon copy (spec §4.5)
  const lexicon: Lexicon = { ...locale.lexicon };
  const holidayComputes = new Map<string, (y: number) => { m: number; d: number } | null>();
  for (const pack of holidays) {
    if (!pack.id || !Array.isArray(pack.entries)) {
      throw new Error(`Malformed holiday pack: expected { id, entries[] }.`);
    }
    for (const entry of pack.entries) {
      holidayComputes.set(entry.id, entry.compute);
      for (const name of entry.names[locale.id] ?? []) {
        const form = normalizeText(name);
        lexicon[form] = [...(lexicon[form] ?? []), { kind: "HOLIDAY", id: entry.id }];
      }
    }
  }

  const grammar = buildGrammar(locale.rules ?? []);
  const adjacency = locale.keyboard ? buildKeyboardAdjacency(locale.keyboard) : null;
  const lexiconKeys = Object.keys(lexicon);

  function parse(text: string, ctx: ParseContext): ParseResult {
    assertValidTimeZone(ctx.timeZone); // config error → throws (spec §8)
    const normalized = normalizeText(text);
    if (normalized.trim() === "") {
      return { status: "idle", candidates: [], corrections: [], errors: [] };
    }

    const weekStart = ctx.weekStart ?? locale.defaults.weekStart;
    const dateOrder = ctx.dateOrder ?? locale.defaults.dateOrder;
    const allowPast = ctx.allowPast ?? false;

    const corrections: Correction[] = [];
    const cells = buildLattice(locale.tokenize(normalized), lexicon, {
      dateOrder,
      ...(adjacency
        ? {
            correct: (raw: { text: string; span: [number, number] }) => {
              const hit = correctToken(raw.text, lexiconKeys, locale.typoMap, adjacency);
              if (hit) corrections.push({ span: raw.span, from: raw.text, to: hit.to });
              return hit;
            },
          }
        : {}),
    });

    const errors: string[] = [];
    const inputs: ScoreInput[] = [];
    const seenExprs = new Set<string>();
    for (const stream of expandStreams(cells)) {
      const { parses } = grammar.parseStream(stream);
      const tokenConfidence = stream.reduce((p, t) => p * t.confidence, 1);
      for (const p of parses) {
        const key = JSON.stringify(p.expr);
        if (seenExprs.has(key)) continue;
        seenExprs.add(key);
        const r = resolveExpr(p.expr, {
          now: ctx.now, timeZone: ctx.timeZone, weekStart, allowPast,
          holidays: holidayComputes,
        });
        if (!r.ok) {
          errors.push(r.error);
          continue;
        }
        inputs.push({ expr: p.expr, specificity: p.specificity, tokenConfidence, resolved: r.value });
      }
    }

    const today: Wall = { ...utcToWall(ctx.now, ctx.timeZone), h: 0, mi: 0 };
    const ranked = scoreAndRank(inputs, { today, allowPast }).slice(0, MAX_CANDIDATES);
    const candidates = ranked.map((s) => toCandidate(s, ctx, locale));
    const status = statusFor(ranked);
    if (status === "invalid" && errors.length === 0) {
      errors.push(`Could not interpret "${text}" as a date.`);
    }
    return { status, candidates, corrections, errors };
  }

  return { locale, parse };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toCandidate(s: ScoredParse, ctx: ParseContext, locale: LocaleAdapter): Candidate {
  const fmtDate = (w: Wall) => `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`;
  const startDate = fmtDate(s.resolved.start);
  const endDate = fmtDate(s.resolved.end);
  return {
    expr: s.expr,
    start: { utcIso: wallToUtc(s.resolved.start, ctx.timeZone).toISOString(), date: startDate },
    end: { utcIso: wallToUtc(s.resolved.end, ctx.timeZone).toISOString(), date: endDate },
    isRange: startDate !== endDate,
    hasExplicitTime: s.resolved.hasExplicitTime,
    confidence: s.confidence,
    text: locale.format(s.expr, { now: ctx.now, timeZone: ctx.timeZone }),
  };
}
```

- [ ] **Step 4: Export the public API**

Replace `packages/core/src/index.ts`:
```ts
export type * from "./types.js";
export { createEngine, type CreateEngineOptions } from "./engine.js";
export { validateLocale } from "./lexicon.js";
export { normalizeText } from "./normalize.js";
export { resolveExpr, type Resolved, type ResolveOptions, type ResolveOutcome } from "./resolve.js";
export type { Wall } from "./zoned-date.js";
```

- [ ] **Step 5: Run to verify pass — full suite**

Run: `pnpm vitest run packages/core`
Expected: PASS (all files).

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): createEngine assembles the five-stage parse pipeline"
```

---

### Task 14: `@saywhen/locale-en` (minimal) + end-to-end acceptance

The real English adapter, developed in lockstep with core (spec §10 step 1). "Minimal" = full grammar coverage with the core vocabulary; plan 02 adds compound number words, more abbreviations/typos, `formatAccessible` phrasing, and the conformance suite. `format` must emit **re-parseable canonical text** — the e2e suite round-trips it.

**Files:**
- Create: `packages/locale-en/package.json`, `packages/locale-en/tsconfig.json`
- Create: `packages/locale-en/src/index.ts`
- Test: `packages/locale-en/test/e2e.test.ts`

- [ ] **Step 1: Package scaffolding**

`packages/locale-en/package.json`:
```json
{
  "name": "@saywhen/locale-en",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "peerDependencies": {
    "@saywhen/core": "workspace:*"
  },
  "devDependencies": {
    "@saywhen/core": "workspace:*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/locale-en/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

Run: `pnpm install` (links the workspace dep).

- [ ] **Step 2: Write the failing e2e tests**

`packages/locale-en/test/e2e.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { en } from "../src/index.js";

const engine = createEngine({ locale: en });
// Friday 2026-06-12, 04:00 in New York (EDT, UTC-4); weekStart 0, dateOrder MDY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };

const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates", () => {
  test.each([
    ["today", "2026-06-12"],
    ["tomorrow", "2026-06-13"],
    ["friday", "2026-06-12"],
    ["next friday", "2026-06-19"],
    ["march 21st", "2027-03-21"],
    ["the 21st of march", "2027-03-21"],
    ["march 4 2026", "2026-03-04"],
    ["the 21st", "2026-06-21"],
    ["in 2 weeks", "2026-06-26"],
    ["3 days ago", "2026-06-09"],
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});

describe("the acid test (spec §2)", () => {
  test("'next friday + 2 weeks' ≡ '2 weeks after next friday' → 2026-07-03", () => {
    const a = top("next friday + 2 weeks");
    const b = top("2 weeks after next friday");
    expect(a.start.date).toBe("2026-07-03");
    expect(b.start.date).toBe(a.start.date);
    expect(b.expr).toEqual(a.expr); // same AST, not just same date
  });
  test("word numbers: 'two weeks from tomorrow' → 2026-06-27", () => {
    expect(top("two weeks from tomorrow").start.date).toBe("2026-06-27");
  });
});

describe("ranges & periods (weekStart=0 for en)", () => {
  test("'monday to friday'", () => {
    const c = top("monday to friday");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-15", "2026-06-19"]);
  });
  test("'next week' → Sun..Sat", () => {
    const c = top("next week");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-14", "2026-06-20"]);
  });
  test("'this weekend' → Sat–Sun", () => {
    const c = top("this weekend");
    expect([c.start.date, c.end.date]).toEqual(["2026-06-13", "2026-06-14"]);
  });
  test("'end of next month'", () => {
    expect(top("end of next month").start.date).toBe("2026-07-31");
  });
  test("'last 2 weeks' with allowPast", () => {
    const c = top("last 2 weeks", { ...CTX, allowPast: true });
    expect([c.start.date, c.end.date]).toEqual(["2026-05-29", "2026-06-12"]);
  });
});

describe("time of day", () => {
  test("'friday at 5pm' → 21:00Z (EDT)", () => {
    const c = top("friday at 5pm");
    expect(c.hasExplicitTime).toBe(true);
    expect(c.start.utcIso).toBe("2026-06-12T21:00:00.000Z");
  });
  test("'tomorrow at 9:30am'", () => {
    expect(top("tomorrow at 9:30am").start.utcIso).toBe("2026-06-13T13:30:00.000Z");
  });
});

describe("ambiguity & typo correction", () => {
  test("'3/4' is ambiguous; MDY ranks March 4 first", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.map((c) => c.start.date)).toEqual(["2027-03-04", "2027-04-03"]);
  });
  test("'tmrw' and 'tomorow' both correct to tomorrow", () => {
    expect(top("tmrw").start.date).toBe("2026-06-13");
    expect(top("tomorow").start.date).toBe("2026-06-13");
    expect(engine.parse("tomorow", CTX).corrections).toHaveLength(1);
  });
});

describe("round-trip: candidate.text re-parses to the same dates (spec §9.3 seed)", () => {
  test.each([
    "tomorrow", "next friday", "march 21st", "next friday + 2 weeks",
    "monday to friday", "next week", "this weekend", "end of next month",
    "friday at 5pm", "in 2 weeks",
  ])("'%s'", (text) => {
    const first = top(text);
    const second = top(first.text);
    expect(second.start.date).toBe(first.start.date);
    expect(second.end.date).toBe(first.end.date);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/locale-en`
Expected: FAIL — `../src/index.js` missing.

- [ ] **Step 4: Implement `packages/locale-en/src/index.ts`**

```ts
import type {
  DateExpr, Anchor, Lexicon, LocaleAdapter, PeriodRef, RawToken, Unit,
} from "@saywhen/core";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const UNITS: Array<[Unit, string[]]> = [
  ["day", ["day", "days"]],
  ["week", ["week", "weeks", "wk", "wks"]],
  ["month", ["month", "months", "mo"]],
  ["year", ["year", "years", "yr", "yrs"]],
  ["hour", ["hour", "hours", "hr", "hrs"]],
  ["minute", ["minute", "minutes", "min", "mins"]],
];
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const SEASONS: Array<[number, string[]]> = [
  [0, ["spring"]], [1, ["summer"]], [2, ["autumn", "fall"]], [3, ["winter"]],
];

function ordinalSuffix(d: number): string {
  if (d % 10 === 1 && d !== 11) return "st";
  if (d % 10 === 2 && d !== 12) return "nd";
  if (d % 10 === 3 && d !== 13) return "rd";
  return "th";
}

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  const add = (forms: string[], payload: Lexicon[string][number]) => {
    for (const f of forms) lex[f] = [...(lex[f] ?? []), payload];
  };

  WEEKDAYS.forEach((name, day) => add([name, WEEKDAY_ABBR[day]!], { kind: "WEEKDAY", day }));
  MONTHS.forEach((name, month) => add([name], { kind: "MONTH", month }));
  MONTH_ABBR.forEach((abbr, month) => { if (abbr !== MONTHS[month]) add([abbr], { kind: "MONTH", month }); });
  add(["sept"], { kind: "MONTH", month: 8 });

  add(["today", "tonight"], { kind: "RELDAY", offset: 0 });
  add(["tomorrow"], { kind: "RELDAY", offset: 1 });
  add(["yesterday"], { kind: "RELDAY", offset: -1 });

  add(["this"], { kind: "REL", which: "this" });
  add(["next"], { kind: "REL", which: "next" });
  add(["last"], { kind: "REL", which: "last" });

  for (const [unit, forms] of UNITS) add(forms, { kind: "UNIT", unit });
  for (const [word, n] of Object.entries(NUMBER_WORDS)) add([word], { kind: "NUMBER", n });
  for (let d = 1; d <= 31; d++) add([`${d}${ordinalSuffix(d)}`], { kind: "NUMBER", n: d, ordinal: true });

  add(["weekend"], { kind: "PERIOD", period: { kind: "weekend" } });
  add(["quarter"], { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1 as 1 | 2 | 3 | 4; q <= 4; q++) add([`q${q}`], { kind: "PERIOD", period: { kind: "quarter", q } });
  for (const [s, forms] of SEASONS) add(forms, { kind: "PERIOD", period: { kind: "season", s: s as 0 | 1 | 2 | 3 } });

  add(["start", "beginning"], { kind: "BOUNDARY", edge: "start" });
  add(["end"], { kind: "BOUNDARY", edge: "end" });

  add(["before"], { kind: "DIRECTION", dir: "before" });
  add(["after"], { kind: "DIRECTION", dir: "after" });
  add(["from"], { kind: "DIRECTION", dir: "from" });
  add(["ago"], { kind: "DIRECTION", dir: "ago" });
  add(["in"], { kind: "DIRECTION", dir: "in" });

  add(["to", "until", "till", "through", "thru"], { kind: "CONNECTOR" });
  add(["+", "plus"], { kind: "OP", op: 1 });
  add(["minus"], { kind: "OP", op: -1 });
  add(["-"], { kind: "OP", op: -1 });
  add(["-"], { kind: "CONNECTOR" }); // "jun 10 - jun 12" — lattice carries both readings

  add(["am"], { kind: "MERIDIEM", value: "am" });
  add(["pm"], { kind: "MERIDIEM", value: "pm" });

  add(["on", "at", "the", "of", "a", "an", "for"], { kind: "FILLER" });

  return lex;
}

const lexicon = buildLexicon();

const TOKEN_RE = /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+[a-z]+|\d+|[a-z]+(?:'[a-z]+)?|[+\-]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    const dl = /^(\d+)([a-z]+)$/.exec(raw);
    if (dl && !(raw in lexicon)) {
      // "5pm" → "5" + "pm"; "21st" stays whole (known ordinal)
      out.push({ text: dl[1]!, span: [start, start + dl[1]!.length] });
      out.push({ text: dl[2]!, span: [start + dl[1]!.length, start + raw.length] });
    } else {
      out.push({ text: raw, span: [start, start + raw.length] });
    }
  }
  return out;
}

// ---------- formatting (canonical, re-parseable) ----------

function formatTime(t: { h: number; m: number }): string {
  const mer = t.h >= 12 ? "pm" : "am";
  const h12 = t.h % 12 === 0 ? 12 : t.h % 12;
  return t.m === 0 ? `${h12}${mer}` : `${h12}:${String(t.m).padStart(2, "0")}${mer}`;
}

function periodName(p: PeriodRef): string {
  switch (p.kind) {
    case "week": case "month": case "year": return p.kind;
    case "weekend": return "weekend";
    case "quarter": return p.q ? `q${p.q}` : "quarter";
    case "season": return p.s !== undefined ? SEASONS[p.s]![1][0]! : "season";
  }
}

function formatAnchor(a: Anchor): string {
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
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id; // names: plan 04
  }
}

function format(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `in ${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`}`
          : `${expr.n} ${expr.n === 1 ? expr.unit : `${expr.unit}s`} ago`;
      }
      const unit = expr.n === 1 ? expr.unit : `${expr.unit}s`;
      return `${format(expr.base)} ${expr.dir === 1 ? "+" : "-"} ${expr.n} ${unit}`;
    }
    case "range": return `${format(expr.start)} to ${format(expr.end)}`;
    case "period": return `${expr.which} ${periodName(expr.period)}`;
    case "boundary": return `${expr.edge === "start" ? "start" : "end"} of ${format(expr.of)}`;
    case "withTime": return `${format(expr.base)} at ${formatTime(expr.time)}`;
  }
}

export const en: LocaleAdapter = {
  id: "en",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    if (words.length !== 1) return null; // compounds ("twenty one"): plan 02
    const w = words[0]!;
    if (/^\d+$/.test(w)) return Number(w);
    return NUMBER_WORDS[w] ?? null;
  },
  format: (expr) => format(expr),
  formatAccessible: (expr) => format(expr), // dedicated phrasing: plan 02
  keyboard: { rows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"] },
  typoMap: {
    tmrw: "tomorrow", tmr: "tomorrow", tdy: "today", b4: "before",
    nxt: "next", wknd: "weekend",
  },
  defaults: { weekStart: 0, dateOrder: "MDY" },
};
```

Note on `"last 2 weeks"` lookback: the grammar produces a range ending at *now*; the whole range is in the past, so without `allowPast` the score penalty applies but it still parses — the e2e test passes `allowPast: true` to assert exact dates.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/locale-en`
Expected: PASS. If a round-trip case fails, fix the **formatter** to emit vocabulary the lexicon contains (that is the invariant this suite enforces).

- [ ] **Step 6: Commit**

```bash
git add packages/locale-en pnpm-lock.yaml
git commit -m "feat(locale-en): minimal English adapter with round-trip formatting"
```

---

### Task 15: Dependency-rule guard + full verification

Spec §3's rules, enforced as a test so CI catches violations from day one.

**Files:**
- Test: `packages/core/test/deps.test.ts`

- [ ] **Step 1: Write the guard test**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = (p: string) => JSON.parse(readFileSync(join(root, p, "package.json"), "utf8"));

describe("dependency rules (spec §3)", () => {
  test("@saywhen/core has ZERO runtime dependencies", () => {
    const core = pkg("packages/core");
    expect(Object.keys(core.dependencies ?? {})).toEqual([]);
    expect(core.peerDependencies).toBeUndefined();
  });

  test("@saywhen/locale-en depends on core as a peer only", () => {
    const en = pkg("packages/locale-en");
    expect(Object.keys(en.dependencies ?? {})).toEqual([]);
    expect(Object.keys(en.peerDependencies ?? {})).toEqual(["@saywhen/core"]);
  });

  test("core source never imports from other packages", () => {
    // tsconfig lib already excludes DOM; this guards package boundaries
    const srcDir = join(root, "packages/core/src");
    for (const f of readdirSync(srcDir)) {
      const text = readFileSync(join(srcDir, f), "utf8");
      expect(text, `${f} must not import @saywhen/*`).not.toMatch(/from "@saywhen\//);
    }
  });
});
```

- [ ] **Step 2: Run the FULL suite + typecheck**

Run: `pnpm vitest run && pnpm typecheck`
Expected: every test file passes, typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/deps.test.ts
git commit -m "test: dependency-rule guard for core and locale-en"
```

---

## Done — definition of success for plan 01

- `pnpm vitest run` green: ZonedDate DST matrix, lattice ambiguity, typo correction, all-parses grammar, resolver semantics, scoring, engine integration, locale-en e2e incl. the spec §2 acid test and round-trip seeds.
- `createEngine({ locale: en }).parse("next friday + 2 weeks", { now, timeZone })` returns a valid candidate with correct dates in any IANA zone.
- Zero runtime dependencies anywhere; the guard test enforces it.

**Out of scope here (later plans):** full en vocabulary (compound number words, `formatAccessible` phrasing) + conformance suite + fast-check round-trip + chrono oracle + tsdown publish builds + bench (02), locale-ru (03), holiday data packs + holiday-relative grammar rules ("friday before christmas", "christmas weekend") (04), suggestions/ghost (05), controller/react/registry/playground + wire value format (06).
