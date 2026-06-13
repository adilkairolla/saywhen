# saywhen Plan 09A — Range UX core + English Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the core range-UX engine (prepositional openers, month elision, prefer-current-year year inference, endpoint-attributed errors) and make it fully demoable in **English** — `from feb 24 to june 30`, `between feb 24 and june 30`, `march 1 to 15`, `feb 24 to june 30 2026`.

**Architecture:** All engine work is in `@saywhen/core` (a new `RANGE_OPEN` payload, a `filter` combinator, an opener + bare-day endpoint on the range grammar, and a rewritten `range` case in `resolve`). English is the reference locale, so its vocabulary (`between`/`and`/`from`-open) ships here too; Russian + Kazakh are Plan 09B. The controller/`@saywhen/react`/registry/playground are untouched (they accept any adapter).

**Tech Stack:** existing pnpm monorepo; zero-dep core; Vitest 3. `exactOptionalPropertyTypes` is on.

**This is plan 09A** (01–08 merged; spec at `docs/superpowers/specs/2026-06-13-saywhen-range-ux-design.md`, §1–§7). Plan 09B layers ru/kk vocabulary on top.

**Conventions (same as plans 01–08):**
- Run tests from repo root: `pnpm vitest run <path>`. Commit after every green task.
- Env quirk: if `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## Core facts the engineer needs (verified against current `main`)

- `SemPayload` is a discriminated union in `packages/core/src/types.ts`; `Lexicon = Record<string, SemPayload[]>` and `locale-en`'s `add()` **appends**, so one word can carry several payloads. The lattice (`lattice.ts:108`) turns each payload into a stream alternative and the engine parses them all (this is how `-` is both `OP` and `CONNECTOR`).
- Grammar helpers (`grammar.ts`): `A(expr, spec)`, `anchor(a)`, `P = Parser<GrammarParse>`, combinators `alt/seq/tok/opt/map/lazy/many/skipFiller`. `dayNum = tok("NUMBER", t => t.n>=1 && t.n<=31)`. Current `rangeP = map(seq(exprP, tok("CONNECTOR"), exprP), ([a,,b]) => A({type:"range",start:a.expr,end:b.expr}, a.specificity*b.specificity))`. `topP = alt(rangeP, rangePostfixP, exprP, ...exprRules)`.
- Combinator parsers return `Array<PRes<T>>`; `[]` means no parse. `map` cannot drop a result (so gating needs a `filter`).
- `resolve.ts`: `resolveExpr(expr, opts)` is exported; the `range` case currently resolves `start`, then `end` with `today` re-anchored to the start, then throws `"Range ends before it starts."` if `end < start`. `resolveCalendar(a, ctx)` forward-rolls a bare `m/d` only when `a.y === undefined` and `!ctx.allowPast`; with `a.y` set it is exact. Helpers: `compareWallDate`, `daysInMonth`, `Wall = {y,m,d,h,mi}` (`m` is 0-indexed).
- `Anchor` has `{ kind: "calendar"; y?; m?; d? }`. `DateExpr` range is `{ type:"range"; start; end }`.
- No test anywhere pins a bare-calendar range's resolved year. The only existing inverted-range test (`packages/core/test/resolve.test.ts:164`) uses **both explicit years** (`2026-06-20 → 2026-06-10`) and asserts `/ends before/i` — it stays green (explicit end year → throw, and the new message still contains "ends before it starts").
- Test clocks: core `resolve.test.ts` uses `2026-06-12T15:00:00Z` / `Asia/Almaty` (today 2026-06-12); `locale-en` e2e/suggest use `2026-06-12T08:00:00Z` / `America/New_York` (today 2026-06-12).

## File structure (created/modified by this plan)

```
packages/core/src/types.ts            MODIFY  +RANGE_OPEN payload kind (Task 1)
packages/core/src/combinators.ts      MODIFY  +filter() combinator (Task 1)
packages/core/test/combinators.test.ts (CREATE or APPEND) filter unit test (Task 1)
packages/core/src/grammar.ts          MODIFY  opener on rangeP; bareDayP/elidedRangeP; buildRange (Tasks 2–3)
packages/core/test/grammar-range.test.ts  MODIFY  opener + elision synthetic tests (Tasks 2–3)
packages/core/src/resolve.ts          MODIFY  range case: §3 year-inference + §4 errors (Task 4)
packages/core/test/resolve.test.ts    MODIFY  calendar-range tests (Task 4)
packages/locale-en/src/index.ts       MODIFY  +between/and/from-open vocabulary (Task 5)
packages/locale-en/test/e2e.test.ts   MODIFY  English range e2e (Task 5)
packages/locale-en/test/suggest.test.ts MODIFY  opener un-blanks typeahead (Task 5)
packages/conformance/src/cases.ts     MODIFY  +calendar/elided range semantic cases (Task 6)
```

---

### Task 1: Foundation — `RANGE_OPEN` payload + `filter` combinator

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/combinators.ts`
- Test: `packages/core/test/combinators.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/combinators.test.ts` (if it exists, append the `describe`):
```ts
import { describe, expect, test } from "vitest";
import { filter, tok } from "../src/combinators.js";
import { newExpectations } from "../src/combinators.js";
import type { SemToken } from "../src/types.js";

const t = (p: object): SemToken => ({ ...p, span: [0, 1], source: "x", confidence: 1 } as SemToken);

describe("filter combinator", () => {
  test("drops results whose value fails the predicate", () => {
    const p = filter(tok("NUMBER"), (v) => v.n > 10);
    const keep = p([t({ kind: "NUMBER", n: 15 })], 0, newExpectations());
    const drop = p([t({ kind: "NUMBER", n: 3 })], 0, newExpectations());
    expect(keep).toHaveLength(1);
    expect(drop).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/combinators.test.ts`
Expected: FAIL — `filter` is not exported from `combinators.js`.

- [ ] **Step 3: Implement `filter` and `RANGE_OPEN`**

In `packages/core/src/combinators.ts`, add after `map` (around line 97):
```ts
/** keep only results whose value satisfies the predicate (map cannot drop) */
export function filter<T>(p: Parser<T>, keep: (v: T) => boolean): Parser<T> {
  return (s, i, ex) => p(s, i, ex).filter((r) => keep(r.v));
}
```

In `packages/core/src/types.ts`, add to the `SemPayload` union (after the `CONNECTOR` line, line 29):
```ts
  | { kind: "RANGE_OPEN" }                          // leading range opener: from / between / с / между
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/combinators.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/combinators.ts packages/core/test/combinators.test.ts
git commit -m "feat(core): add RANGE_OPEN payload and filter combinator"
```

---

### Task 2: Grammar — prepositional opener on `rangeP`

**Files:**
- Modify: `packages/core/src/grammar.ts`
- Test: `packages/core/test/grammar-range.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/grammar-range.test.ts` (inside the file, new `describe`):
```ts
describe("prepositional opener (opt RANGE_OPEN on rangeP)", () => {
  test("RANGE_OPEN WEEKDAY CONNECTOR WEEKDAY → range", () => {
    const r = rangeOf([
      t({ kind: "RANGE_OPEN" }), t({ kind: "WEEKDAY", day: 1 }),
      t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "weekday", day: 1 } },
      end: { anchor: { kind: "weekday", day: 5 } },
    });
  });

  test("no opener still parses exactly one range (no duplicate)", () => {
    const parses = g.parseStream([
      t({ kind: "WEEKDAY", day: 1 }), t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 }),
    ]).parses.filter((p) => p.expr.type === "range");
    expect(parses).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts`
Expected: FAIL — the opener test returns `undefined` (rangeP has no opener yet).

- [ ] **Step 3: Implement the opener + shared `buildRange`**

In `packages/core/src/grammar.ts`, add `filter` to the combinator import (line 1–4):
```ts
import {
  alt, filter, lazy, many, map, newExpectations, opt, seq, skipFiller, tok,
  type Expectations, type Parser,
} from "./combinators.js";
```

Replace the existing `rangeP` definition (around line 177) with a `buildRange` helper + opener-aware rule:
```ts
  const buildRange = (a: GrammarParse, b: GrammarParse): GrammarParse =>
    A({ type: "range", start: a.expr, end: b.expr }, a.specificity * b.specificity);

  // explicit range, optionally introduced by a leading opener (from / between / с / между)
  const rangeP: P = map(
    seq(opt(tok("RANGE_OPEN")), exprP, tok("CONNECTOR"), exprP),
    ([, a, , b]) => buildRange(a, b),
  );
```
(The `opt` consumes the opener when present; with no opener the empty branch reproduces today's behaviour, and a present opener cannot also parse via the empty branch because the following `exprP` rejects a `RANGE_OPEN` token — so no duplicate parse.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts packages/core`
Expected: PASS — new opener tests green; all existing core tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grammar.ts packages/core/test/grammar-range.test.ts
git commit -m "feat(core): optional leading opener on the range rule"
```

---

### Task 3: Grammar — bare-day endpoint + `elidedRangeP` (month elision)

**Files:**
- Modify: `packages/core/src/grammar.ts`
- Test: `packages/core/test/grammar-range.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/grammar-range.test.ts`:
```ts
describe("month elision (bare-day endpoint, gated on an explicit month)", () => {
  // "march 1 to 15": MONTH NUMBER CONNECTOR NUMBER  (march=2, 0-indexed)
  test("back-elision: end bare day inherits nothing at parse time (month copied in resolve)", () => {
    const r = rangeOf([
      t({ kind: "MONTH", month: 2 }), t({ kind: "NUMBER", n: 1 }),
      t({ kind: "CONNECTOR" }), t({ kind: "NUMBER", n: 15 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "calendar", m: 2, d: 1 } },
      end: { anchor: { kind: "calendar", d: 15 } },
    });
  });

  // "1 to 15 march": NUMBER CONNECTOR NUMBER MONTH
  test("front-elision: start is a bare day, end carries the month", () => {
    const r = rangeOf([
      t({ kind: "NUMBER", n: 1 }), t({ kind: "CONNECTOR" }),
      t({ kind: "NUMBER", n: 15 }), t({ kind: "MONTH", month: 2 }),
    ]);
    expect(r).toMatchObject({
      type: "range",
      start: { anchor: { kind: "calendar", d: 1 } },
      end: { anchor: { kind: "calendar", m: 2, d: 15 } },
    });
  });

  test("'3 to 5' (no month anywhere) yields no range", () => {
    expect(rangeOf([
      t({ kind: "NUMBER", n: 3 }), t({ kind: "CONNECTOR" }), t({ kind: "NUMBER", n: 5 }),
    ])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts`
Expected: FAIL — the elision tests return `undefined` (bare `NUMBER` is not a range endpoint yet).

- [ ] **Step 3: Implement `bareDayP` + `elidedRangeP`**

In `packages/core/src/grammar.ts`, immediately after the `rangeP` definition from Task 2, add:
```ts
  // a bare cardinal day 1–31 as a range endpoint (ordinals like "the 21st" already parse via exprP)
  const bareDayP: P = map(
    tok("NUMBER", (n) => !n.ordinal && n.n >= 1 && n.n <= 31),
    (n) => A(anchor({ kind: "calendar", d: n.n }), 0.3),
  );
  const rangeEndpoint: P = alt(exprP, bareDayP);

  const endpointMonth = (e: DateExpr): boolean =>
    e.type === "anchor" && e.anchor.kind === "calendar" && e.anchor.m !== undefined;
  const rangeHasMonth = (e: DateExpr): boolean =>
    e.type === "range" && (endpointMonth(e.start) || endpointMonth(e.end));

  // elided range: admits a bare-day endpoint, but only when SOME endpoint carries an explicit
  // month — so "3 to 5" (no month) yields no candidate. The all-exprP overlap with rangeP dedupes.
  const elidedRangeP: P = filter(
    map(
      seq(opt(tok("RANGE_OPEN")), rangeEndpoint, tok("CONNECTOR"), rangeEndpoint),
      ([, a, , b]) => buildRange(a, b),
    ),
    (r) => rangeHasMonth(r.expr),
  );
```

Then add `elidedRangeP` to `topP` (replace the existing `topP` line, ~189):
```ts
  const topP: P = alt(rangeP, rangePostfixP, elidedRangeP, exprP, ...exprRules);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts packages/core`
Expected: PASS — elision tests green; `3 to 5` yields no range; all existing core tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/grammar.ts packages/core/test/grammar-range.test.ts
git commit -m "feat(core): bare-day range endpoint with month-gated elision"
```

---

### Task 4: Resolve — calendar-range year inference (§3) + endpoint errors (§4)

**Files:**
- Modify: `packages/core/src/resolve.ts`
- Test: `packages/core/test/resolve.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/resolve.test.ts` (inside the existing `describe("ranges"...)` block, or a new `describe` near the existing range tests; uses the file's `OPTS`, `anchor`, `day` helpers — today = 2026-06-12):
```ts
describe("calendar-range year inference (§3)", () => {
  const range = (start: object, end: object): DateExpr =>
    ({ type: "range", start: anchor(start), end: anchor(end) });

  test("bare past range prefers the current year", () => {
    expect(day(resolveExpr(range({ kind: "calendar", m: 1, d: 24 }, { kind: "calendar", m: 2, d: 5 }), OPTS)))
      .toEqual({ start: "2026-02-24", end: "2026-03-05" });
  });

  test("explicit end year propagates to the bare start", () => {
    expect(day(resolveExpr(range({ kind: "calendar", m: 1, d: 24 }, { kind: "calendar", m: 5, d: 30, y: 2026 }), OPTS)))
      .toEqual({ start: "2026-02-24", end: "2026-06-30" });
  });

  test("wrap: end before start (bare) rolls the end forward a year", () => {
    expect(day(resolveExpr(range({ kind: "calendar", m: 10, d: 1 }, { kind: "calendar", m: 1, d: 28 }), OPTS)))
      .toEqual({ start: "2026-11-01", end: "2027-02-28" });
  });

  test("month elision: a day-only end inherits the start's month", () => {
    expect(day(resolveExpr(range({ kind: "calendar", m: 2, d: 1 }, { kind: "calendar", d: 15 }), OPTS)))
      .toEqual({ start: "2026-03-01", end: "2026-03-15" });
  });

  test("monthless ordinal range is unchanged (anchors to today's month)", () => {
    expect(day(resolveExpr(range({ kind: "calendar", d: 21 }, { kind: "calendar", d: 25 }), OPTS)))
      .toEqual({ start: "2026-06-21", end: "2026-06-25" });
  });

  test("invalid endpoint is attributed to its side", () => {
    const r = resolveExpr(range({ kind: "calendar", m: 5, d: 31 }, { kind: "calendar", m: 6, d: 5 }), OPTS);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/start of the range.*no day 31/i) });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/resolve.test.ts`
Expected: FAIL — bare ranges still forward-roll to 2027; the elided/attribution cases error or mismatch.

- [ ] **Step 3: Implement the calendar-range path**

In `packages/core/src/resolve.ts`, replace the existing `case "range":` block (lines ~76–86) with a guarded dispatch:
```ts
    case "range": {
      const sc = calendarAnchor(expr.start);
      const ec = calendarAnchor(expr.end);
      // new path only when both ends are calendar anchors and at least one names a month
      if (sc && ec && (sc.m !== undefined || ec.m !== undefined)) {
        return resolveCalendarRange(sc, ec, ctx);
      }
      const start = rec(expr.start, ctx);
      const end = rec(expr.end, { ...ctx, today: { ...start.start, h: 0, mi: 0 } });
      if (compareWallDate(end.end, start.start) < 0) throw new Error("Range ends before it starts.");
      return {
        start: start.start,
        end: end.end,
        hasExplicitTime: start.hasExplicitTime || end.hasExplicitTime,
      };
    }
```

Then add these helpers near `resolveCalendar` (e.g. just above it, ~line 155). The `CalAnchor` type alias and `ymd` formatter:
```ts
type CalAnchor = Extract<Anchor, { kind: "calendar" }>;

function calendarAnchor(expr: DateExpr): CalAnchor | null {
  return expr.type === "anchor" && expr.anchor.kind === "calendar" ? expr.anchor : null;
}

function ymd(w: Wall): string {
  return `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

function resolveCalendarPinned(a: CalAnchor, year: number, side: "start" | "end", ctx: Ctx): Resolved {
  try {
    return resolveCalendar({ ...a, y: year }, ctx);
  } catch {
    throw new Error(`The ${side} of the range isn't a valid date — that month has no day ${a.d}.`);
  }
}

function resolveCalendarRange(startA: CalAnchor, endA: CalAnchor, ctx: Ctx): Resolved {
  // month inheritance: a day-only endpoint borrows the other endpoint's explicit month
  // (the caller only enters this path when at least one endpoint has a month, so this is defined)
  const monthSource = (startA.m ?? endA.m)!;
  const s: CalAnchor = startA.m === undefined ? { ...startA, m: monthSource } : startA;
  const e: CalAnchor = endA.m === undefined ? { ...endA, m: monthSource } : endA;
  // resolution year: own explicit → other's explicit → today's year (bare ranges prefer this year)
  const baseYear = startA.y ?? endA.y ?? ctx.today.y;
  const startRes = resolveCalendarPinned(s, startA.y ?? baseYear, "start", ctx);
  let endRes = resolveCalendarPinned(e, endA.y ?? baseYear, "end", ctx);
  if (compareWallDate(endRes.end, startRes.start) < 0) {
    if (endA.y === undefined) {
      endRes = resolveCalendarPinned(e, baseYear + 1, "end", ctx); // wrap forward a year
    } else {
      throw new Error(`That range ends before it starts (${ymd(startRes.start)} → ${ymd(endRes.end)}).`);
    }
  }
  return { start: startRes.start, end: endRes.end, hasExplicitTime: false };
}
```

Note `import type { Anchor, ... }` already includes `Anchor`; `Wall` is already imported from `./zoned-date.js`. No new imports needed.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/resolve.test.ts packages/core`
Expected: PASS — all §3 cases green; the existing `resolve.test.ts:164` inverted test still green (both years explicit → throw, message contains "ends before it starts"); all other core tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/resolve.ts packages/core/test/resolve.test.ts
git commit -m "feat(core): prefer-current-year range inference with endpoint-attributed errors"
```

---

### Task 5: English vocabulary + e2e + suggest

**Files:**
- Modify: `packages/locale-en/src/index.ts`
- Test: `packages/locale-en/test/e2e.test.ts`, `packages/locale-en/test/suggest.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/locale-en/test/e2e.test.ts` a new `describe` (uses the file's `top` helper; today = 2026-06-12, `America/New_York`):
```ts
describe("range UX (plan 09A)", () => {
  const rng = (text: string) => {
    const c = top(text);
    return { start: c.start.date, end: c.end.date };
  };
  test("from … to …", () => {
    expect(rng("from feb 24 to june 30")).toEqual({ start: "2026-02-24", end: "2026-06-30" });
  });
  test("between … and …", () => {
    expect(rng("between feb 24 and june 30")).toEqual({ start: "2026-02-24", end: "2026-06-30" });
  });
  test("month elision: march 1 to 15", () => {
    expect(rng("march 1 to 15")).toEqual({ start: "2026-03-01", end: "2026-03-15" });
  });
  test("mixed-year no longer errors: feb 24 to june 30 2026", () => {
    expect(rng("feb 24 to june 30 2026")).toEqual({ start: "2026-02-24", end: "2026-06-30" });
  });
  test("bare past range prefers the current year", () => {
    expect(rng("feb 24 to march 5")).toEqual({ start: "2026-02-24", end: "2026-03-05" });
  });
  test("wrap still works: nov 1 to feb 28", () => {
    expect(rng("nov 1 to feb 28")).toEqual({ start: "2026-11-01", end: "2027-02-28" });
  });
  test("monthless ordinal range unchanged: the 21st to the 25th", () => {
    expect(rng("the 21st to the 25th")).toEqual({ start: "2026-06-21", end: "2026-06-25" });
  });
  test("'3 to 5' is not a date range", () => {
    expect(engine.parse("3 to 5", CTX).candidates).toHaveLength(0);
  });
});
```

Append to `packages/locale-en/test/suggest.test.ts` (inside the `describe`):
```ts
  test("opener no longer blanks typeahead: 'from feb 24 to ' completes", () => {
    expect(sug.suggest("from feb 24 to ", CTX).suggestions.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-en/test/e2e.test.ts packages/locale-en/test/suggest.test.ts`
Expected: FAIL — `from`/`between`/`and` and `march 1 to 15` don't parse yet; the suggest case returns 0.

- [ ] **Step 3: Add the English vocabulary**

In `packages/locale-en/src/index.ts`, in the lexicon-building block (next to the existing connector/direction `add(...)` calls, ~lines 82–92), add:
```ts
  add(["between"], { kind: "RANGE_OPEN" });
  add(["and"], { kind: "CONNECTOR" });
  add(["from"], { kind: "RANGE_OPEN" }); // 'from' also keeps its DIRECTION payload (lattice carries both)
```
Leave the existing `add(["from"], { kind: "DIRECTION", dir: "from" })` untouched (the new line *adds* a second payload).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-en/test/e2e.test.ts packages/locale-en/test/suggest.test.ts packages/locale-en`
Expected: PASS — all new range e2e + suggest cases green; **all existing en tests still green** (notably `suggest e2e (en) › starters` is unchanged — no ranking regression — and `two weeks from tomorrow` still resolves via the `DIRECTION` reading of `from`).

- [ ] **Step 5: Commit**

```bash
git add packages/locale-en/src/index.ts packages/locale-en/test/e2e.test.ts packages/locale-en/test/suggest.test.ts
git commit -m "feat(locale-en): from…to / between…and / month-elided range vocabulary"
```

---

### Task 6: Conformance — range semantic cases

**Files:**
- Modify: `packages/conformance/src/cases.ts`

- [ ] **Step 1: Add the cases**

In `packages/conformance/src/cases.ts`, append to the `SEMANTIC_CASES` array (before the closing `];`):
```ts
  {
    name: "calendar↔calendar range",
    expr: { type: "range", start: A({ kind: "calendar", m: 1, d: 24 }), end: A({ kind: "calendar", m: 5, d: 30 }) },
  },
  {
    name: "month-elided range (day-only end)",
    expr: { type: "range", start: A({ kind: "calendar", m: 2, d: 1 }), end: A({ kind: "calendar", d: 15 }) },
  },
```
(These are **expr-based**: the harness formats each via the locale's own `format` — en `"february 24 to june 30"`, ru/kk via their `-` medial render — and re-parses, so every locale is held to the new range round-trip without needing English openers.)

- [ ] **Step 2: Run the conformance suites for all three locales**

Run: `pnpm vitest run packages/locale-en packages/locale-ru packages/locale-kk`
Expected: PASS — every locale's conformance suite round-trips the two new range cases (en/ru/kk all already format ranges with a medial connector that re-parses; the new core resolve applies uniformly). If a locale's `format` renders a day-only endpoint un-reparseably, that surfaces here — but `bare ordinal day` already round-trips in all three, so the day-only end is covered.

- [ ] **Step 3: Commit**

```bash
git add packages/conformance/src/cases.ts
git commit -m "test(conformance): calendar and month-elided range semantic cases"
```

---

### Task 7: Whole-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all suites pass + the 1 ORACLE-gated skip. New since plan 08: the Task 1/2/3/4 core tests, the Task 5 en tests, and 2×3 conformance cases. No existing assertion changes.

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: clean (exit 0).

- [ ] **Step 3: Build publishable packages + the playground**

Run:
```bash
pnpm build
pnpm --filter playground build
```
Expected: every package builds; the playground builds clean (no API changes).

- [ ] **Step 4: Confirm clean tree**

Run: `git status --short`
Expected: clean (dist/build output is gitignored).

---

## Done — definition of success for plan 09A

- English ranges parse the natural ways: `from … to …`, `between … and …`, month elision `march 1 to 15`, and `feb 24 to june 30 2026` resolves (no error). Bare past ranges prefer the current year; `nov 1 to feb 28` and `the 21st to the 25th` are unchanged; `3 to 5` is not a date.
- Invalid/inverted ranges produce endpoint-attributed messages; the existing inverted-range test stays green.
- Core change is `RANGE_OPEN` + `filter` + an opener/bare-day on the range grammar + a rewritten calendar-range resolve; no controller/react/registry/playground change.
- Full suite + typecheck + all builds + playground build green; **no existing assertion changed**.

**Non-goals (this plan):** Russian/Kazakh vocabulary (Plan 09B), time-of-day ranges, recurrence, locale month-names in error strings (core stays locale-neutral; errors attribute the side + ISO date).
