# saywhen Plan 06 — Controller, React, Registry & Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship spec §7 — the framework-agnostic `@saywhen/core/controller` input state machine, the `@saywhen/react` hook with downshift-style APG-combobox prop getters, the shadcn-style copy-paste registry components, and a Vite playground — completing the saywhen v1 series.

**Architecture:** The controller is a zero-dep subscribable store in core (third subpath, alongside `.` and `./suggest`); it wires an `Engine` + optional `SuggestEngine` into a phase machine whose snapshot drives any UI. `@saywhen/react` is hooks-only: `useSyncExternalStore` + pure prop-getter builders (accessibility lives once, in the getters). Registry components are presentational Tailwind wrappers that own no logic. The playground is a demo app proving the whole stack end-to-end.

**Tech Stack:** existing pnpm/TS-strict/Vitest 3 monorepo; the controller adds **zero** dependencies. React layer onward adds React 18, `@testing-library/react` + `jsdom` + `jest-axe` (test-only), and Vite (playground). `moduleResolution: "bundler"` resolves the new `./controller` subpath in tsc and Vitest, exactly like `./suggest` in plan 05.

**This is plan 6 of 6** — the final plan (series in `2026-06-12-saywhen-01-core-engine.md`; 01–05 executed and merged, **595 tests + 1 ORACLE-gated skip** green, `@saywhen/core/suggest` shipped). After this, the v1 surface in spec §1 is complete.

**Conventions (same as plans 01–05):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- Standard clock: **Friday `2026-06-12T08:00:00Z`**. Controller/core tests use `Asia/Almaty`; en tests `America/New_York`; ru tests `Europe/Moscow`. `m` is 0-based month everywhere.
- Env quirk on this machine: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`
- **Ordering rationale:** Tasks 1–5 (core controller) add **no new dependencies** and are fully TDD-tested with the existing toolchain. Tasks 6–10 (react, registry, playground) install React/test/Vite deps. Do the core first so the heart of §7 lands even if a later `pnpm add` is blocked.

## Core facts the engineer needs (verified against current main)

- `createEngine` (`packages/core/src/engine.ts`) returns `{ locale, parse }` — the **only** producer of an `Engine`. Every other reference (`tools/oracle/src/compare.ts`, the holiday e2e tests) consumes the `Engine` type; adding a method to the interface only requires updating this one return. (Verified by grep — no mocks construct `Engine` literals.)
- `Candidate` (types.ts) = `{ expr: DateExpr; start: { utcIso; date }; end: { utcIso; date }; isRange; hasExplicitTime; confidence; text }`. `ParseResult` = `{ status: "valid"|"ambiguous"|"invalid"|"idle"; candidates; corrections; errors }`. `Correction` = `{ span: [number, number]; from; to }`.
- `ParseContext` = `{ now: Date; timeZone: string; weekStart?: 0|1; dateOrder?: "MDY"|"DMY"|"YMD"; allowPast?; enableTime? }`. **`exactOptionalPropertyTypes` is on** — you cannot pass `weekStart: undefined` to an object typed `{ weekStart?: 0|1 }`; use a conditional spread `...(weekStart !== undefined ? { weekStart } : {})`. (This is the same gotcha plan 01 hit.)
- `@saywhen/core/suggest` exports `createSuggest(opts): SuggestEngine`, `SuggestEngine.suggest(text, ctx): SuggestResult`, `SuggestContext extends ParseContext { limit? }`, `SuggestResult = { suggestions: Suggestion[]; ghost: string | null }`, `Suggestion = { text; expr; start; end; isRange; score }`. Plan 06 Task 1 adds `rangeMode: boolean` to `SuggestResult`.
- `packages/core/src/normalize.ts` exports `normalizeText(text)` (lowercase + fold; **does not trim**).
- `packages/core/src/zoned-date.ts` exports `startOfWeek(w, weekStart)`, `addDays(w, n)`, `weekdayOf(w)`, `daysInMonth(y, m)`, `startOfMonth(w)`, plus `type Wall = { y; m; d; h; mi }` (m 0-based). These cover `getMonthGrid`.
- `packages/core/test/fixtures/suggest-locale.ts` wraps `testLocale` with a real `format` but its `formatAccessible` is still `testLocale`'s `JSON.stringify`. Task 1 adds a real `formatAccessible` (capitalized) so controller announcement tests read naturally **and** prove the controller uses `formatAccessible`, not `format`.
- locale-en `format`/`formatAccessible`: `relday(1)` → `"tomorrow"`; `period({week},"next")` → `"next week"` / accessible `"next week"`; `range` accessible → `"from X to Y"`; `weekday(5)` accessible → `"Friday"` (capitalized); `calendar({d:15})` → `"the 15th"`. holidays-ru exports `ru: HolidayPack`; holidays-us exports `us`.
- `packages/core/package.json` `exports` currently has `"."` and `"./suggest"`; `tsdown.config.ts` builds `["src/index.ts", "src/suggest.ts"]`. Task 3/5 add `"./controller"`.
- `pnpm-workspace.yaml` globs `packages/*`, `apps/*`, `tools/*` (note: **`apps/*` is already there**; `registry/` is not — Task 8 adds it). Root scripts: `build` = `pnpm -r --filter './packages/*' run build`; `typecheck` = `pnpm -r --filter './packages/*' --filter './tools/*' exec tsc --noEmit`. `vitest.config.ts` excludes `node_modules` + `.var/`; default environment is node (jsdom is selected per-file with a `// @vitest-environment jsdom` docblock).
- `tsconfig.base.json`: `lib: ["ES2022"]` (**no DOM**), `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`. React/registry/playground tsconfigs must add `"lib": ["ES2022", "DOM", "DOM.Iterable"]` and `"jsx": "react-jsx"`.

## File structure (created/modified by this plan)

```
packages/core/src/types.ts                       MODIFY  Engine.formatAccessible; SuggestResult.rangeMode lives in suggest.ts (Task 1)
packages/core/src/engine.ts                       MODIFY  implement formatAccessible (Task 1)
packages/core/src/suggest.ts                      MODIFY  surface rangeMode (Task 1)
packages/core/test/fixtures/suggest-locale.ts     MODIFY  real formatAccessible (Task 1)
packages/core/test/suggest.test.ts                MODIFY  rangeMode assertions (Task 1)
packages/core/test/engine.test.ts                 MODIFY  formatAccessible assertion (Task 1)
packages/core/src/calendar-grid.ts                CREATE  getMonthGrid, clampTime (Task 2)
packages/core/test/calendar-grid.test.ts          CREATE  (Task 2)
packages/core/src/controller.ts                   CREATE  createDateInputController + re-export grid helpers (Tasks 3–4)
packages/core/test/controller.test.ts             CREATE  (Tasks 3–4)
packages/core/package.json                        MODIFY  "./controller" subpath export (Task 3)
packages/core/tsdown.config.ts                    MODIFY  third entry (Task 5)
packages/react/{package.json,tsconfig.json,tsdown.config.ts}   CREATE  (Task 6)
packages/react/src/props.ts                       CREATE  pure APG prop-getter builders (Task 6)
packages/react/test/props.test.ts                 CREATE  node test, no DOM (Task 6)
packages/react/src/index.ts                       CREATE  useDateInput hook (Task 7)
packages/react/test/use-date-input.test.tsx       CREATE  jsdom + RTL + jest-axe (Task 7)
registry/{package.json,tsconfig.json,registry.json}            CREATE  private workspace pkg + manifest (Task 8)
registry/components/{date-input,date-range-input}.tsx          CREATE  (Task 8)
registry/components/{calendar-grid,time-field}.tsx            CREATE  (Task 9)
registry/test/*.test.tsx                          CREATE  render + axe + manifest validation (Tasks 8–9)
apps/playground/{package.json,tsconfig.json,vite.config.ts,index.html}   CREATE  (Task 10)
apps/playground/src/{main.tsx,App.tsx}            CREATE  (Task 10)
apps/playground/test/app.test.tsx                 CREATE  render smoke (Task 10)
pnpm-workspace.yaml                               MODIFY  add registry (Task 8)
package.json (root)                               MODIFY  typecheck globs apps + registry (Task 8/10)
```

`packages/core/src/index.ts` stays the parse-only entry; the controller ships only on its own subpath (spec §7.1: zero-dep, tree-shakeable).

---

### Task 1: Core contract extensions for the controller

Two small core additions the controller depends on: `Engine.formatAccessible` (the announcement is a screen-reader string via `locale.formatAccessible` — spec §7.1 — and only the engine holds the holiday-name table), and `SuggestResult.rangeMode` (the controller's `RANGE_BUILDING` phase needs to know the input is mid-range — spec §7.1, §6).

**Files:**
- Modify: `packages/core/src/types.ts`, `packages/core/src/engine.ts`, `packages/core/src/suggest.ts`
- Modify: `packages/core/test/fixtures/suggest-locale.ts`, `packages/core/test/engine.test.ts`, `packages/core/test/suggest.test.ts`

- [ ] **Step 1: Give the fixture a real `formatAccessible`**

In `packages/core/test/fixtures/suggest-locale.ts`, add a capitalizer above `export const suggestLocale` and wire `formatAccessible` (capitalized so it is visibly distinct from `format` — proving the controller calls the accessible formatter):

```ts
const capFirst = (s: string) => (s === "" ? s : s.charAt(0).toUpperCase() + s.slice(1));
```

Then change the adapter object from:
```ts
export const suggestLocale: LocaleAdapter = {
  ...testLocale,
  lexicon,
  format: (expr: DateExpr, opts: FormatOptions) => fmt(expr, opts.holidayNames ?? {}),
};
```
to:
```ts
export const suggestLocale: LocaleAdapter = {
  ...testLocale,
  lexicon,
  format: (expr: DateExpr, opts: FormatOptions) => fmt(expr, opts.holidayNames ?? {}),
  formatAccessible: (expr: DateExpr, opts: FormatOptions) => capFirst(fmt(expr, opts.holidayNames ?? {})),
};
```

- [ ] **Step 2: Write the failing test for `engine.formatAccessible`**

Append to `packages/core/test/engine.test.ts` (it already imports `createEngine`; add `suggestLocale` and a `HolidayPack` import if not present):

```ts
import { suggestLocale } from "./fixtures/suggest-locale.js";
import type { HolidayPack } from "../src/types.js";

describe("engine.formatAccessible (spec §7.1 — injects holiday names)", () => {
  const pack: HolidayPack = {
    id: "p",
    entries: [{ id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas"] } }],
  };
  const engine = createEngine({ locale: suggestLocale, holidays: [pack] });
  const ctx = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };

  test("renders an expr with the accessible formatter", () => {
    expect(engine.formatAccessible({ type: "anchor", anchor: { kind: "relday", offset: 1 } }, ctx))
      .toBe("Tomorrow");
  });

  test("threads the engine's holiday names", () => {
    expect(engine.formatAccessible({ type: "anchor", anchor: { kind: "holiday", id: "christmas" } }, ctx))
      .toBe("Christmas");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/core/test/engine.test.ts`
Expected: FAIL — `engine.formatAccessible is not a function`.

- [ ] **Step 4: Add `formatAccessible` to the `Engine` interface**

In `packages/core/src/types.ts`, replace the `Engine` interface:
```ts
export interface Engine {
  locale: LocaleAdapter;
  parse(text: string, ctx: ParseContext): ParseResult;
}
```
with:
```ts
export interface Engine {
  locale: LocaleAdapter;
  parse(text: string, ctx: ParseContext): ParseResult;
  /** screen-reader phrasing for an expr, with the engine's holiday names injected (spec §7.1) */
  formatAccessible(expr: DateExpr, ctx: { now: Date; timeZone: string }): string;
}
```
(`DateExpr` is already declared in this file.)

- [ ] **Step 5: Implement it in `createEngine`**

In `packages/core/src/engine.ts`, add `DateExpr` to the type-import list from `./types.js`. Then, just before `return { locale, parse };`, add the function and update the return:
```ts
  function formatAccessible(expr: DateExpr, fctx: { now: Date; timeZone: string }): string {
    return locale.formatAccessible(expr, { now: fctx.now, timeZone: fctx.timeZone, holidayNames });
  }

  return { locale, parse, formatAccessible };
```

- [ ] **Step 6: Run to verify pass**

Run: `pnpm vitest run packages/core/test/engine.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing test for `SuggestResult.rangeMode`**

Append to `packages/core/test/suggest.test.ts` (it already has `sug` and `CTX`):
```ts
describe("rangeMode flag (spec §6 — drives the controller's RANGE_BUILDING phase)", () => {
  test("true after a connector, false otherwise", () => {
    expect(sug.suggest("tomorrow to", CTX).rangeMode).toBe(true);
    expect(sug.suggest("tomorrow", CTX).rangeMode).toBe(false);
    expect(sug.suggest("", CTX).rangeMode).toBe(false);
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `pnpm vitest run packages/core/test/suggest.test.ts`
Expected: FAIL — `rangeMode` is `undefined`.

- [ ] **Step 9: Surface `rangeMode` from `suggest()`**

In `packages/core/src/suggest.ts`:

1. Extend the result type:
```ts
export interface SuggestResult {
  suggestions: Suggestion[];
  /** remaining characters of the top suggestion when it extends the typed input */
  ghost: string | null;
  /** true when the input is mid-range (a CONNECTOR was consumed) — spec §6 range-building */
  rangeMode: boolean;
}
```

2. Declare an accumulator just before the `if (input !== "") {` line:
```ts
    let anyRange = false;
```

3. Inside the `for (let k = startK; ...)` loop, immediately after the `for (const stream of expandStreams(cells)) { ... }` block sets the per-`k` `rangeMode`, capture it before the `kinds.size` early-continue:
```ts
        if (rangeMode) anyRange = true;
        if (kinds.size === 0) continue;
```
(The line `if (kinds.size === 0) continue;` already exists — add the `if (rangeMode) anyRange = true;` line directly above it.)

4. Change the final `return { suggestions, ghost };` to:
```ts
    return { suggestions, ghost, rangeMode: anyRange };
```

- [ ] **Step 10: Run to verify pass + full core suite (no regressions)**

Run: `pnpm vitest run packages/core && pnpm --filter @saywhen/core exec tsc --noEmit`
Expected: PASS — including all existing suggest/engine tests (adding a field and a method is additive). Typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/engine.ts packages/core/src/suggest.ts \
        packages/core/test/fixtures/suggest-locale.ts packages/core/test/engine.test.ts \
        packages/core/test/suggest.test.ts
git commit -m "feat(core): engine.formatAccessible and suggest rangeMode for the controller"
```

---

### Task 2: `getMonthGrid` + `clampTime` (calendar UI helpers)

Spec §7.1 ships two pure UI helpers alongside the controller. Both are zero-dep and trivially testable.

**Files:**
- Create: `packages/core/src/calendar-grid.ts`
- Test: `packages/core/test/calendar-grid.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/calendar-grid.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { clampTime, getMonthGrid } from "../src/calendar-grid.js";

describe("getMonthGrid", () => {
  // June 2026 (m = 5); June 1 2026 is a Monday.
  const grid = getMonthGrid(2026, 5, 0); // weekStart Sunday

  test("is a 6×7 grid", () => {
    expect(grid).toHaveLength(6);
    for (const row of grid) expect(row).toHaveLength(7);
  });

  test("leads with the trailing days of May, then June 1", () => {
    expect(grid[0]![0]).toEqual({ y: 2026, m: 4, d: 31, inMonth: false }); // Sun May 31
    expect(grid[0]![1]).toEqual({ y: 2026, m: 5, d: 1, inMonth: true });   // Mon Jun 1
  });

  test("flags in-month days and spills into July", () => {
    expect(grid[4]![2]).toEqual({ y: 2026, m: 5, d: 30, inMonth: true });  // Tue Jun 30
    expect(grid[5]![6]).toEqual({ y: 2026, m: 6, d: 11, inMonth: false }); // last cell Jul 11
  });

  test("weekStart Monday shifts the leading column", () => {
    const mon = getMonthGrid(2026, 5, 1);
    expect(mon[0]![0]).toEqual({ y: 2026, m: 5, d: 1, inMonth: true });    // Mon Jun 1 first
  });
});

describe("clampTime", () => {
  test("clamps hours and minutes into range", () => {
    expect(clampTime({ h: 25, m: 70 })).toEqual({ h: 23, m: 59 });
    expect(clampTime({ h: -3, m: -1 })).toEqual({ h: 0, m: 0 });
    expect(clampTime({ h: 13, m: 30 })).toEqual({ h: 13, m: 30 });
    expect(clampTime({ h: 9.7, m: 5.9 })).toEqual({ h: 9, m: 5 }); // truncates
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/calendar-grid.test.ts`
Expected: FAIL — `../src/calendar-grid.js` does not exist.

- [ ] **Step 3: Write `packages/core/src/calendar-grid.ts`** (complete file)

```ts
import { addDays, startOfWeek, type Wall } from "./zoned-date.js";

/** one cell of a month grid */
export interface MonthCell {
  y: number;
  m: number; // 0-based
  d: number;
  inMonth: boolean; // false for spill-over days from the adjacent month
}

/**
 * A 6-row × 7-column calendar grid for month (y, m), weeks starting `weekStart`.
 * Always 42 cells; leading/trailing cells come from the neighbouring months
 * (`inMonth: false`). Pure — no clock reads.
 */
export function getMonthGrid(y: number, m: number, weekStart: 0 | 1): MonthCell[][] {
  const first: Wall = { y, m, d: 1, h: 0, mi: 0 };
  let cursor = startOfWeek(first, weekStart);
  const rows: MonthCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: MonthCell[] = [];
    for (let c = 0; c < 7; c++) {
      row.push({ y: cursor.y, m: cursor.m, d: cursor.d, inMonth: cursor.y === y && cursor.m === m });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  }
  return rows;
}

/** clamp a wall-clock time into [00:00, 23:59], truncating fractional fields */
export function clampTime(t: { h: number; m: number }): { h: number; m: number } {
  return {
    h: Math.min(23, Math.max(0, Math.trunc(t.h))),
    m: Math.min(59, Math.max(0, Math.trunc(t.m))),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/calendar-grid.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/calendar-grid.ts packages/core/test/calendar-grid.test.ts
git commit -m "feat(core): getMonthGrid and clampTime calendar helpers"
```

---

### Task 3: Controller — store, input, phase, value

The subscribable store with the input/clear actions and the phase machine. Navigation, commit, ambiguity and keymap land in Task 4 (same file). Snapshot identity is stable (a fresh object only on change) so React's `useSyncExternalStore` won't loop.

**Files:**
- Create: `packages/core/src/controller.ts`
- Modify: `packages/core/package.json`
- Test: `packages/core/test/controller.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/controller.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import type { HolidayPack } from "../src/types.js";
import { createEngine } from "../src/engine.js";
import { createSuggest } from "../src/suggest.js";
import { createDateInputController } from "../src/controller.js";
import { suggestLocale } from "./fixtures/suggest-locale.js";

const pack: HolidayPack = {
  id: "p",
  entries: [{ id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas"] } }],
};
const now = () => new Date("2026-06-12T08:00:00Z"); // Fri
function make(opts: Partial<Parameters<typeof createDateInputController>[0]> = {}) {
  const engine = createEngine({ locale: suggestLocale, holidays: [pack] });
  const suggest = createSuggest({ locale: suggestLocale, holidays: [pack] });
  return createDateInputController({ engine, suggest, timeZone: "Asia/Almaty", now, ...opts });
}

describe("controller — input, phase, value", () => {
  test("starts EMPTY with a stable snapshot", () => {
    const c = make();
    const s = c.getState();
    expect(s.phase).toBe("EMPTY");
    expect(s.rawInput).toBe("");
    expect(s.value).toBe("");
    expect(s.suggestions).toEqual([]);
    expect(c.getState()).toBe(s); // identity stable until a mutation
  });

  test("typing a partial enters TYPING with suggestions + ghost", () => {
    const c = make();
    c.setInput("tom");
    const s = c.getState();
    expect(s.phase).toBe("TYPING"); // "tom" is not yet a parseable date
    expect(s.suggestions[0]!.text).toBe("tomorrow");
    expect(s.ghostText).toBe("orrow");
    expect(s.activeSuggestionIndex).toBe(0);
    expect(s.isOpen).toBe(true);
  });

  test("a complete date enters PARSED and exposes a wire value on commit", () => {
    const c = make();
    c.setInput("tomorrow");
    expect(c.getState().phase).toBe("PARSED");
    expect(c.getState().candidates[0]!.start.date).toBe("2026-06-13");
  });

  test("a dangling connector enters RANGE_BUILDING", () => {
    const c = make();
    c.setInput("tomorrow to");
    expect(c.getState().phase).toBe("RANGE_BUILDING");
  });

  test("date-only wire value vs range", () => {
    const c = make();
    c.setInput("tomorrow");
    c.commit();
    expect(c.getState().value).toBe("2026-06-13");
    c.setInput("tomorrow to weekend");
    c.commit();
    expect(c.getState().value).toBe("2026-06-13/2026-06-14");
  });

  test("enableTime emits ISO instants", () => {
    const c = make({ enableTime: true });
    c.setInput("tomorrow");
    c.commit();
    expect(c.getState().value).toMatch(/^2026-06-1\dT\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("clear resets and fires onClear", () => {
    const onClear = vi.fn();
    const c = make({ onClear });
    c.setInput("tomorrow");
    c.clear();
    expect(onClear).toHaveBeenCalledOnce();
    expect(c.getState().phase).toBe("EMPTY");
    expect(c.getState().value).toBe("");
  });

  test("subscribe + onChange fire on mutation, unsubscribe stops them", () => {
    const onChange = vi.fn();
    const c = make({ onChange });
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.setInput("tom");
    expect(listener).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    off();
    c.setInput("tomorrow");
    expect(listener).toHaveBeenCalledOnce(); // no more after unsubscribe
  });

  test("no suggest engine ⇒ no suggestions, parsing still works", () => {
    const engine = createEngine({ locale: suggestLocale, holidays: [pack] });
    const c = createDateInputController({ engine, timeZone: "Asia/Almaty", now });
    c.setInput("tomorrow");
    expect(c.getState().suggestions).toEqual([]);
    expect(c.getState().phase).toBe("PARSED");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/controller.test.ts`
Expected: FAIL — `../src/controller.js` does not exist.

- [ ] **Step 3: Write `packages/core/src/controller.ts`** (complete file — Task 4 fills the `// Task 4` action bodies; everything here compiles and the Task 3 tests pass)

```ts
import type { Candidate, Correction, Engine, ParseContext } from "./types.js";
import type { Suggestion, SuggestEngine } from "./suggest.js";
import { normalizeText } from "./normalize.js";

export type Phase = "EMPTY" | "TYPING" | "PARSED" | "RANGE_BUILDING" | "RESOLVED";
export type KeyName = "ArrowDown" | "ArrowUp" | "Tab" | "Enter" | "Escape";

export interface ControllerContextPatch {
  timeZone?: string;
  now?: () => Date;
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
}

export interface ControllerOptions {
  engine: Engine;
  /** optional — without it, suggestions and ghost text stay empty (spec §1.3, §6) */
  suggest?: SuggestEngine;
  timeZone: string; // IANA — validated by engine.parse on first use (spec §8)
  now?: () => Date; // injectable clock; defaults to () => new Date()
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
  suggestionLimit?: number;
  onChange?: (state: ControllerState) => void;
  onCommit?: (value: string, candidate: Candidate) => void;
  onClear?: () => void;
}

export interface ControllerState {
  rawInput: string;
  phase: Phase;
  candidates: Candidate[];
  alternatives: Candidate[]; // the non-top candidates when ambiguous
  suggestions: Suggestion[];
  activeSuggestionIndex: number; // -1 when none active
  ghostText: string; // "" when none
  value: string; // committed wire value; "" when cleared
  announcement: string; // pre-localized screen-reader string
  corrections: Correction[];
  isOpen: boolean; // suggestion list visibility (drives aria-expanded)
}

export interface DateInputController {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;
  setInput(text: string): void;
  commit(): void;
  acceptSuggestion(index?: number): void;
  cycleSuggestion(delta: 1 | -1): void;
  resolveAmbiguity(candidateIndex: number): void;
  clear(): void;
  setContext(patch: ControllerContextPatch): void;
  keymap(key: KeyName): boolean;
}

function wireValue(c: Candidate, enableTime: boolean): string {
  if (enableTime) return c.isRange ? `${c.start.utcIso}/${c.end.utcIso}` : c.start.utcIso;
  return c.isRange ? `${c.start.date}/${c.end.date}` : c.start.date;
}

export function createDateInputController(options: ControllerOptions): DateInputController {
  const { engine, suggest } = options;
  let timeZone = options.timeZone;
  let nowFn = options.now ?? (() => new Date());
  let weekStart = options.weekStart;
  let dateOrder = options.dateOrder;
  let allowPast = options.allowPast ?? false;
  let enableTime = options.enableTime ?? false;
  const limit = options.suggestionLimit ?? 5;

  let rawInput = "";
  let candidates: Candidate[] = [];
  let alternatives: Candidate[] = [];
  let suggestions: Suggestion[] = [];
  let corrections: Correction[] = [];
  let activeSuggestionIndex = -1;
  let chosenIndex = 0;
  let rangeMode = false;
  let committed = false;
  let committedCandidate: Candidate | null = null;
  let value = "";
  let isOpen = false;

  const listeners = new Set<() => void>();

  function parseCtx(): ParseContext {
    return {
      now: nowFn(),
      timeZone,
      allowPast,
      enableTime,
      ...(weekStart !== undefined ? { weekStart } : {}),
      ...(dateOrder !== undefined ? { dateOrder } : {}),
    };
  }

  function runParse(): void {
    const ctx = parseCtx();
    const result = engine.parse(rawInput, ctx);
    candidates = result.candidates;
    corrections = result.corrections;
    chosenIndex = 0;
    alternatives = result.status === "ambiguous" ? candidates.slice(1) : [];
    const s =
      suggest && rawInput.trim() !== ""
        ? suggest.suggest(rawInput, { ...ctx, limit })
        : { suggestions: [] as Suggestion[], ghost: null, rangeMode: false };
    suggestions = s.suggestions;
    rangeMode = s.rangeMode;
    if (activeSuggestionIndex >= suggestions.length) activeSuggestionIndex = suggestions.length - 1;
  }

  function phaseNow(): Phase {
    if (committed) return "RESOLVED";
    if (rawInput.trim() === "") return "EMPTY";
    if (candidates.length > 0) return "PARSED";
    if (rangeMode) return "RANGE_BUILDING";
    return "TYPING";
  }

  function activeSuggestion(): Suggestion | undefined {
    return activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] : suggestions[0];
  }

  function ghostNow(): string {
    const a = activeSuggestion();
    if (!a) return "";
    const input = normalizeText(rawInput).trim();
    return input !== "" && a.text.length > input.length && a.text.startsWith(input)
      ? a.text.slice(input.length)
      : "";
  }

  function announce(phase: Phase): string {
    if (phase === "RESOLVED") {
      return committedCandidate
        ? `Selected ${engine.formatAccessible(committedCandidate.expr, { now: nowFn(), timeZone })}.`
        : "Cleared.";
    }
    if (phase === "PARSED") {
      const c = candidates[chosenIndex] ?? candidates[0]!;
      const text = engine.formatAccessible(c.expr, { now: nowFn(), timeZone });
      return alternatives.length > 0
        ? `${candidates.length} possible dates. ${text}. Use arrow keys to review alternatives.`
        : `${text}. Press Enter to select.`;
    }
    if (phase === "RANGE_BUILDING") return `Building a date range. ${suggestions.length} options.`;
    if (phase === "TYPING") {
      if (suggestions.length === 0) return "No matching date.";
      const a = activeSuggestion();
      return `${suggestions.length} suggestions.${a ? ` ${a.text} highlighted.` : ""}`;
    }
    return "";
  }

  function build(): ControllerState {
    const phase = phaseNow();
    return {
      rawInput,
      phase,
      candidates,
      alternatives,
      suggestions,
      activeSuggestionIndex,
      ghostText: ghostNow(),
      value,
      announcement: announce(phase),
      corrections,
      isOpen: isOpen && !committed && suggestions.length > 0,
    };
  }

  let snapshot: ControllerState = build();

  function notify(): void {
    snapshot = build();
    options.onChange?.(snapshot);
    for (const l of listeners) l();
  }

  function setInput(text: string): void {
    rawInput = text;
    committed = false;
    committedCandidate = null;
    isOpen = true;
    activeSuggestionIndex = -1;
    runParse();
    if (suggestions.length > 0) activeSuggestionIndex = 0;
    notify();
  }

  function clear(): void {
    rawInput = "";
    candidates = [];
    alternatives = [];
    suggestions = [];
    corrections = [];
    activeSuggestionIndex = -1;
    chosenIndex = 0;
    rangeMode = false;
    committed = false;
    committedCandidate = null;
    value = "";
    isOpen = false;
    notify();
    options.onClear?.();
  }

  function commit(): void {
    const c = candidates[chosenIndex] ?? candidates[0];
    if (!c) return;
    value = wireValue(c, enableTime);
    rawInput = c.text;
    committedCandidate = c;
    committed = true;
    isOpen = false;
    activeSuggestionIndex = -1;
    notify();
    options.onCommit?.(value, c);
  }
  function acceptSuggestion(index?: number): void {
    // Task 4
    void index;
  }
  function cycleSuggestion(delta: 1 | -1): void {
    // Task 4
    void delta;
  }
  function resolveAmbiguity(candidateIndex: number): void {
    // Task 4
    void candidateIndex;
  }
  function setContext(patch: ControllerContextPatch): void {
    // Task 4
    void patch;
  }
  function keymap(key: KeyName): boolean {
    // Task 4
    void key;
    return false;
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setInput,
    commit,
    acceptSuggestion,
    cycleSuggestion,
    resolveAmbiguity,
    clear,
    setContext,
    keymap,
  };
}

export { getMonthGrid, clampTime, type MonthCell } from "./calendar-grid.js";
```

Notes for the engineer: `commit` is implemented in full above (the Task 3 wire-value test exercises it). The other five actions (`acceptSuggestion`, `cycleSuggestion`, `resolveAmbiguity`, `setContext`, `keymap`) stay as the no-op stubs shown — none are called by the Task 3 tests — and get their real bodies in Task 4. The `void x;` lines keep the unused parameters from tripping any future lint; they compile as-is.

- [ ] **Step 4: Add the `./controller` subpath export to `packages/core/package.json`**

Replace the `exports` and `publishConfig.exports` blocks so they read:
```json
  "exports": {
    ".": "./src/index.ts",
    "./suggest": "./src/suggest.ts",
    "./controller": "./src/controller.ts"
  },
```
```json
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
      "./suggest": { "types": "./dist/suggest.d.ts", "import": "./dist/suggest.js" },
      "./controller": { "types": "./dist/controller.d.ts", "import": "./dist/controller.js" }
    }
  },
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/core/test/controller.test.ts && pnpm --filter @saywhen/core exec tsc --noEmit`
Expected: PASS — all Task 3 controller tests; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/controller.ts packages/core/package.json packages/core/test/controller.test.ts
git commit -m "feat(core): @saywhen/core/controller — store, input, phase, value"
```

---

### Task 4: Controller — navigation, commit, ambiguity, keymap, announcements

Fill in the remaining actions and the screen-reader announcements.

**Files:**
- Modify: `packages/core/src/controller.ts`
- Test: `packages/core/test/controller.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/controller.test.ts`:
```ts
describe("controller — navigation, commit, ambiguity, keymap", () => {
  test("cycleSuggestion wraps and Tab accepts the ghost", () => {
    const c = make();
    c.setInput("next w"); // "next week", "next weekend", "next wednesday", ...
    expect(c.getState().activeSuggestionIndex).toBe(0);
    c.cycleSuggestion(1);
    expect(c.getState().activeSuggestionIndex).toBe(1);
    c.cycleSuggestion(-1);
    expect(c.getState().activeSuggestionIndex).toBe(0);
    expect(c.keymap("Tab")).toBe(true);
    expect(c.getState().rawInput).toBe("next week"); // ghost accepted
  });

  test("acceptSuggestion fills the input and re-parses", () => {
    const c = make();
    c.setInput("tom");
    c.acceptSuggestion(); // active = tomorrow
    expect(c.getState().rawInput).toBe("tomorrow");
    expect(c.getState().phase).toBe("PARSED");
  });

  test("Enter commits a parsed date and fires onCommit once", () => {
    const onCommit = vi.fn();
    const c = make({ onCommit });
    c.setInput("tomorrow");
    expect(c.keymap("Enter")).toBe(true);
    expect(c.getState().phase).toBe("RESOLVED");
    expect(onCommit).toHaveBeenCalledWith("2026-06-13", expect.objectContaining({ text: "tomorrow" }));
  });

  test("announcement uses formatAccessible (capitalized), not format", () => {
    const c = make();
    c.setInput("tomorrow");
    expect(c.getState().announcement).toBe("Tomorrow. Press Enter to select.");
    c.commit();
    expect(c.getState().announcement).toBe("Selected Tomorrow.");
  });

  test("resolveAmbiguity picks a candidate and commits it", () => {
    const c = make();
    c.setInput("3/4"); // MDY default → Mar 4; alt Apr 3
    const st = c.getState();
    expect(st.candidates.length).toBeGreaterThan(1);
    c.resolveAmbiguity(1);
    expect(c.getState().phase).toBe("RESOLVED");
    expect(c.getState().value).toBe(c.getState().candidates[1]!.start.date);
  });

  test("Escape closes the list, then clears", () => {
    const c = make();
    c.setInput("tom");
    expect(c.getState().isOpen).toBe(true);
    expect(c.keymap("Escape")).toBe(true); // closes list
    expect(c.getState().isOpen).toBe(false);
    c.commit();                            // value set... but "tom" has no candidate, so:
    c.setInput("tomorrow");
    c.commit();
    expect(c.keymap("Escape")).toBe(true); // value set → clears
    expect(c.getState().value).toBe("");
  });

  test("keymap returns false when it has nothing to do", () => {
    const c = make();
    expect(c.keymap("ArrowDown")).toBe(false); // no suggestions
    expect(c.keymap("Enter")).toBe(false);     // nothing parsed
    expect(c.keymap("Escape")).toBe(false);    // nothing open, no value
  });

  test("setContext re-parses with the new flags", () => {
    const c = make();
    c.setInput("tomorrow");
    c.setContext({ enableTime: true });
    c.commit();
    expect(c.getState().value).toMatch(/T\d{2}:\d{2}:\d{2}/); // now an instant
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/controller.test.ts`
Expected: FAIL — the new describe's actions are stubs.

- [ ] **Step 3: Replace the five stub bodies in `packages/core/src/controller.ts`**

Replace the five stub functions (`acceptSuggestion`, `cycleSuggestion`, `resolveAmbiguity`, `setContext`, `keymap` — `commit` is already real from Task 3) with:
```ts
  function acceptSuggestion(index?: number): void {
    const i = index ?? (activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0);
    const s = suggestions[i];
    if (!s) return;
    setInput(s.text);
  }

  function cycleSuggestion(delta: 1 | -1): void {
    if (suggestions.length === 0) return;
    isOpen = true;
    const base = activeSuggestionIndex < 0 ? (delta === 1 ? -1 : 0) : activeSuggestionIndex;
    activeSuggestionIndex = (base + delta + suggestions.length) % suggestions.length;
    notify();
  }

  function resolveAmbiguity(candidateIndex: number): void {
    const c = candidates[candidateIndex];
    if (!c) return;
    chosenIndex = candidateIndex;
    value = wireValue(c, enableTime);
    rawInput = c.text;
    committedCandidate = c;
    committed = true;
    isOpen = false;
    activeSuggestionIndex = -1;
    notify();
    options.onCommit?.(value, c);
  }

  function setContext(patch: ControllerContextPatch): void {
    if (patch.timeZone !== undefined) timeZone = patch.timeZone;
    if (patch.now !== undefined) nowFn = patch.now;
    if (patch.weekStart !== undefined) weekStart = patch.weekStart;
    if (patch.dateOrder !== undefined) dateOrder = patch.dateOrder;
    if (patch.allowPast !== undefined) allowPast = patch.allowPast;
    if (patch.enableTime !== undefined) enableTime = patch.enableTime;
    committed = false;
    committedCandidate = null;
    runParse();
    notify();
  }

  function keymap(key: KeyName): boolean {
    switch (key) {
      case "ArrowDown":
        if (suggestions.length === 0) return false;
        cycleSuggestion(1);
        return true;
      case "ArrowUp":
        if (suggestions.length === 0) return false;
        cycleSuggestion(-1);
        return true;
      case "Tab":
        if (ghostNow() === "") return false;
        acceptSuggestion();
        return true;
      case "Enter":
        if (committed) return false;
        if (candidates.length > 0) {
          commit();
          return true;
        }
        if (suggestions.length > 0) {
          acceptSuggestion();
          return true;
        }
        return false;
      case "Escape":
        if (isOpen) {
          isOpen = false;
          notify();
          return true;
        }
        if (value !== "") {
          clear();
          return true;
        }
        return false;
      default:
        return false;
    }
  }
```

- [ ] **Step 4: Run to verify pass + full core suite**

Run: `pnpm vitest run packages/core && pnpm --filter @saywhen/core exec tsc --noEmit`
Expected: PASS — all controller tests and no regressions; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/controller.ts packages/core/test/controller.test.ts
git commit -m "feat(core): controller navigation, commit, ambiguity, keymap, announcements"
```

---

### Task 5: Controller build wiring

**Files:**
- Modify: `packages/core/tsdown.config.ts`

- [ ] **Step 1: Add the third build entry**

`packages/core/tsdown.config.ts` `entry` becomes:
```ts
  entry: ["src/index.ts", "src/suggest.ts", "src/controller.ts"],
```

- [ ] **Step 2: Build + dist smoke**

Run:
```bash
pnpm --filter @saywhen/core build
node --input-type=module -e "const m = await import('./packages/core/dist/controller.js'); if (typeof m.createDateInputController !== 'function' || typeof m.getMonthGrid !== 'function') throw new Error('controller dist missing exports'); console.log('controller dist OK');"
```
Expected: build succeeds; prints `controller dist OK`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/tsdown.config.ts
git commit -m "build(core): emit the ./controller subpath entry"
```

---

### Task 6: `@saywhen/react` — package + pure prop getters

The accessibility lives in pure prop-getter builders (`props.ts`) so they are unit-testable in node with no DOM. The React hook (Task 7) is a thin `useSyncExternalStore` wrapper over them.

**Files:**
- Create: `packages/react/package.json`, `packages/react/tsconfig.json`, `packages/react/tsdown.config.ts`
- Create: `packages/react/src/props.ts`
- Test: `packages/react/test/props.test.ts`

- [ ] **Step 1: Scaffold the package**

`packages/react/package.json`:
```json
{
  "name": "@saywhen/react",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
  },
  "peerDependencies": { "@saywhen/core": "workspace:*", "react": "^18.3.0 || ^19.0.0" },
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/locale-en": "workspace:*",
    "@types/react": "^18.3.0",
    "react": "^18.3.0"
  },
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit" }
}
```

`packages/react/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  },
  "include": ["src", "test"]
}
```

`packages/react/tsdown.config.ts`:
```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  outDir: "dist",
  external: ["react", /^@saywhen\//], // keep react + every @saywhen/* subpath (incl. /controller) external
  fixedExtension: false, // package is type:module → emit .js/.d.ts
});
```

- [ ] **Step 2: Install deps**

Run: `pnpm install`
Expected: links `@saywhen/core` + `@saywhen/locale-en` into the new package and resolves `react` + `@types/react`. (If offline, this is the first task that needs the registry — the core controller from Tasks 1–5 is already merged and unaffected.)

- [ ] **Step 3: Write the failing test** — `packages/react/test/props.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { createDateInputController } from "@saywhen/core/controller";
import { en } from "@saywhen/locale-en";
import { makeGhostProps, makeInputProps, makeListboxProps, makeOptionProps } from "../src/props.js";

const ids = { input: "x-input", listbox: "x-listbox", option: (i: number) => `x-option-${i}` };
function controller() {
  const engine = createEngine({ locale: en });
  const suggest = createSuggest({ locale: en });
  return createDateInputController({
    engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z"),
  });
}

describe("APG combobox prop getters", () => {
  test("input props carry the combobox ARIA and the active descendant", () => {
    const c = controller();
    c.setInput("tom");
    const p = makeInputProps(c.getState(), c, ids);
    expect(p.role).toBe("combobox");
    expect(p["aria-expanded"]).toBe(true);
    expect(p["aria-controls"]).toBe("x-listbox");
    expect(p["aria-autocomplete"]).toBe("list");
    expect(p["aria-activedescendant"]).toBe("x-option-0");
    expect(p.value).toBe("tom");
  });

  test("onChange drives the controller", () => {
    const c = controller();
    const p = makeInputProps(c.getState(), c, ids);
    p.onChange({ target: { value: "tomorrow" } } as never);
    expect(c.getState().rawInput).toBe("tomorrow");
  });

  test("onKeyDown delegates to keymap and preventDefaults when handled", () => {
    const c = controller();
    c.setInput("tom");
    let prevented = false;
    const ev = { key: "ArrowDown", preventDefault: () => { prevented = true; } };
    makeInputProps(c.getState(), c, ids).onKeyDown(ev as never);
    expect(prevented).toBe(true);
    expect(c.getState().activeSuggestionIndex).toBe(1);
  });

  test("listbox + option + ghost props", () => {
    const c = controller();
    c.setInput("tom");
    expect(makeListboxProps(ids)).toEqual({ id: "x-listbox", role: "listbox" });
    const op = makeOptionProps(c.getState(), c, ids, 0);
    expect(op.role).toBe("option");
    expect(op.id).toBe("x-option-0");
    expect(op["aria-selected"]).toBe(true);
    expect(makeGhostProps(c.getState())).toEqual({ "aria-hidden": true, children: "orrow" });
  });

  test("option onMouseDown accepts the suggestion (and blocks blur)", () => {
    const c = controller();
    c.setInput("tom");
    let prevented = false;
    makeOptionProps(c.getState(), c, ids, 0).onMouseDown({ preventDefault: () => { prevented = true; } } as never);
    expect(prevented).toBe(true);
    expect(c.getState().rawInput).toBe("tomorrow");
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run packages/react/test/props.test.ts`
Expected: FAIL — `../src/props.js` does not exist.

- [ ] **Step 5: Write `packages/react/src/props.ts`** (complete file)

```ts
import type * as React from "react";
import type {
  ControllerState,
  DateInputController,
  KeyName,
} from "@saywhen/core/controller";

export interface DateInputIds {
  input: string;
  listbox: string;
  option: (index: number) => string;
}

export interface InputProps {
  id: string;
  role: "combobox";
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-autocomplete": "list";
  "aria-haspopup": "listbox";
  "aria-activedescendant"?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface ListboxProps {
  id: string;
  role: "listbox";
}

export interface OptionProps {
  id: string;
  role: "option";
  "aria-selected": boolean;
  onMouseDown: (e: { preventDefault: () => void }) => void;
}

export interface GhostProps {
  "aria-hidden": true;
  children: string;
}

const KEYS = new Set<KeyName>(["ArrowDown", "ArrowUp", "Tab", "Enter", "Escape"]);

export function makeInputProps(
  state: ControllerState,
  controller: DateInputController,
  ids: DateInputIds,
): InputProps {
  const active = state.isOpen && state.activeSuggestionIndex >= 0;
  return {
    id: ids.input,
    role: "combobox",
    "aria-expanded": state.isOpen,
    "aria-controls": ids.listbox,
    "aria-autocomplete": "list",
    "aria-haspopup": "listbox",
    ...(active ? { "aria-activedescendant": ids.option(state.activeSuggestionIndex) } : {}),
    value: state.rawInput,
    onChange: (e) => controller.setInput(e.target.value),
    onKeyDown: (e) => {
      if (!KEYS.has(e.key as KeyName)) return;
      if (controller.keymap(e.key as KeyName)) e.preventDefault();
    },
  };
}

export function makeListboxProps(ids: DateInputIds): ListboxProps {
  return { id: ids.listbox, role: "listbox" };
}

export function makeOptionProps(
  state: ControllerState,
  controller: DateInputController,
  ids: DateInputIds,
  index: number,
): OptionProps {
  return {
    id: ids.option(index),
    role: "option",
    "aria-selected": index === state.activeSuggestionIndex,
    onMouseDown: (e) => {
      e.preventDefault(); // keep focus on the input; beat the blur/commit
      controller.acceptSuggestion(index);
    },
  };
}

export function makeGhostProps(state: ControllerState): GhostProps {
  return { "aria-hidden": true, children: state.ghostText };
}
```

- [ ] **Step 6: Run to verify pass + typecheck**

Run: `pnpm vitest run packages/react/test/props.test.ts && pnpm --filter @saywhen/react exec tsc --noEmit`
Expected: PASS — 5 tests; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/react/package.json packages/react/tsconfig.json packages/react/tsdown.config.ts \
        packages/react/src/props.ts packages/react/test/props.test.ts pnpm-lock.yaml
git commit -m "feat(react): @saywhen/react package and APG combobox prop getters"
```

---

### Task 7: `@saywhen/react` — `useDateInput` hook

The hook binds the controller to React via `useSyncExternalStore` and returns state + the prop getters. Verified with `@testing-library/react` (jsdom) and `jest-axe`.

**Files:**
- Create: `packages/react/src/index.ts`
- Test: `packages/react/test/use-date-input.test.tsx`

- [ ] **Step 1: Install test tooling at the root**

Run:
```bash
pnpm add -D -w @testing-library/react@^16 @testing-library/dom@^10 react-dom@^18.3.0 \
  @types/react-dom@^18.3.0 jsdom@^25 jest-axe@^9
```
Expected: root devDependencies updated (shared jsdom test tooling). `jest-axe@9` ships its own types — we assert on `axe(...).violations` directly rather than via the `toHaveNoViolations` matcher (which augments jest, not vitest), so no `@types/jest-axe` and no matcher setup is needed.

- [ ] **Step 2: Write the failing test** — `packages/react/test/use-date-input.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { useDateInput } from "../src/index.js";

afterEach(cleanup);

const engine = createEngine({ locale: en });
const suggest = createSuggest({ locale: en });

function Combo() {
  const d = useDateInput({
    engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z"),
  });
  return (
    <div>
      <label htmlFor={d.getInputProps().id}>Date</label>
      <input {...d.getInputProps()} />
      <ul {...d.getListboxProps()}>
        {d.state.suggestions.map((s, i) => (
          <li key={s.text} {...d.getOptionProps(i)}>{s.text}</li>
        ))}
      </ul>
    </div>
  );
}

describe("useDateInput", () => {
  test("typing shows suggestions and opens the listbox", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tom" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("tomorrow")).toBeDefined();
  });

  test("ArrowDown moves aria-activedescendant", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "next w" } });
    const first = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  test("Enter on a parsed date commits the canonical text", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("tomorrow");
  });

  test("no axe violations while open", async () => {
    const { container } = render(<Combo />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/react/test/use-date-input.test.tsx`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 4: Write `packages/react/src/index.ts`** (complete file)

```ts
import { useCallback, useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import {
  createDateInputController,
  type ControllerContextPatch,
  type ControllerOptions,
  type ControllerState,
  type DateInputController,
} from "@saywhen/core/controller";
import {
  makeGhostProps,
  makeInputProps,
  makeListboxProps,
  makeOptionProps,
  type DateInputIds,
  type GhostProps,
  type InputProps,
  type ListboxProps,
  type OptionProps,
} from "./props.js";

export * from "./props.js";
export type { ControllerOptions, ControllerState, DateInputController };

export interface UseDateInput {
  state: ControllerState;
  controller: DateInputController;
  getInputProps(): InputProps;
  getListboxProps(): ListboxProps;
  getOptionProps(index: number): OptionProps;
  getGhostProps(): GhostProps;
}

export function useDateInput(options: ControllerOptions): UseDateInput {
  const ref = useRef<DateInputController | null>(null);
  if (ref.current === null) ref.current = createDateInputController(options);
  const controller = ref.current;

  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  const baseId = useId();
  const ids = useMemo<DateInputIds>(
    () => ({
      input: `${baseId}-input`,
      listbox: `${baseId}-listbox`,
      option: (i: number) => `${baseId}-option-${i}`,
    }),
    [baseId],
  );

  // keep live context fields in sync; swapping the engine requires a remount (use a React key)
  const { timeZone, allowPast, enableTime, weekStart, dateOrder } = options;
  useEffect(() => {
    const patch: ControllerContextPatch = { timeZone };
    if (allowPast !== undefined) patch.allowPast = allowPast;
    if (enableTime !== undefined) patch.enableTime = enableTime;
    if (weekStart !== undefined) patch.weekStart = weekStart;
    if (dateOrder !== undefined) patch.dateOrder = dateOrder;
    controller.setContext(patch);
  }, [controller, timeZone, allowPast, enableTime, weekStart, dateOrder]);

  return {
    state,
    controller,
    getInputProps: useCallback(() => makeInputProps(state, controller, ids), [state, controller, ids]),
    getListboxProps: useCallback(() => makeListboxProps(ids), [ids]),
    getOptionProps: useCallback(
      (i: number) => makeOptionProps(state, controller, ids, i),
      [state, controller, ids],
    ),
    getGhostProps: useCallback(() => makeGhostProps(state), [state]),
  };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/react/test/use-date-input.test.tsx && pnpm --filter @saywhen/react exec tsc --noEmit`
Expected: PASS — 4 tests; typecheck clean. (The axe assertion reads `results.violations` directly, so no jest matcher augmentation is involved.)

- [ ] **Step 6: Build + dist smoke**

Run:
```bash
pnpm --filter @saywhen/react build
node --input-type=module -e "const m = await import('./packages/react/dist/index.js'); if (typeof m.useDateInput !== 'function') throw new Error('react dist missing useDateInput'); console.log('react dist OK');"
```
Expected: build succeeds; prints `react dist OK`.

- [ ] **Step 7: Commit**

```bash
git add packages/react/src/index.ts packages/react/test/use-date-input.test.tsx package.json pnpm-lock.yaml
git commit -m "feat(react): useDateInput hook with useSyncExternalStore + a11y integration tests"
```

---

### Task 8: Registry — scaffold, `DateInput`, `DateRangeInput`, manifest

The registry is a private workspace package (never published — distribution is the copy-paste JSON). Components own zero logic; they wrap `useDateInput`.

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `registry/package.json`, `registry/tsconfig.json`, `registry/registry.json`
- Create: `registry/components/date-input.tsx`, `registry/components/date-range-input.tsx`
- Test: `registry/test/date-input.test.tsx`

- [ ] **Step 1: Register the workspace + scaffold**

Add registry to `pnpm-workspace.yaml` so it reads:
```yaml
packages:
  - packages/*
  - apps/*
  - tools/*
  - registry
```

(The root `typecheck` script is widened to include `apps/*` and `registry` in Task 10, once the playground exists — adding an `apps/*` filter now, while `apps/` is empty, is avoided on purpose. Registry typecheck runs explicitly in Task 9 Step 5.)

`registry/package.json` (private — `"files"` omitted on purpose; nothing publishes):
```json
{
  "name": "@saywhen/registry",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./date-input": "./components/date-input.tsx",
    "./date-range-input": "./components/date-range-input.tsx",
    "./calendar-grid": "./components/calendar-grid.tsx",
    "./time-field": "./components/time-field.tsx"
  },
  "peerDependencies": { "@saywhen/core": "workspace:*", "@saywhen/react": "workspace:*", "react": "^18.3.0 || ^19.0.0" },
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/react": "workspace:*",
    "@types/react": "^18.3.0",
    "react": "^18.3.0"
  },
  "scripts": { "typecheck": "tsc --noEmit" }
}
```

`registry/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  },
  "include": ["components", "test"]
}
```

Then run `pnpm install` to link the workspace deps.

- [ ] **Step 2: Write the failing tests**

`registry/test/date-input.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { DateInput } from "../components/date-input.js";
import { DateRangeInput } from "../components/date-range-input.js";

afterEach(cleanup);

const engine = createEngine({ locale: en });
const suggest = createSuggest({ locale: en });
const common = { engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z") };

describe("DateInput component", () => {
  test("renders a combobox and posts the wire value via a hidden input", () => {
    const { container } = render(<DateInput {...common} name="when" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.blur(input); // commit on blur
    const hidden = container.querySelector('input[type="hidden"][name="when"]') as HTMLInputElement;
    expect(hidden.value).toBe("2026-06-13");
  });

  test("ghost overlay shows the completion", () => {
    render(<DateInput {...common} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    expect(screen.getByText("orrow")).toBeDefined();
  });

  test("no axe violations", async () => {
    const { container } = render(<DateInput {...common} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

describe("DateRangeInput component", () => {
  test("is a range-oriented preset of DateInput", () => {
    render(<DateRangeInput {...common} />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });
});
```

(The `registry.json` manifest is created in Step 6 below, but its drift test lands in Task 9 — once all four component files exist — so every commit stays green.)

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run registry/test/date-input.test.tsx`
Expected: FAIL — the component files do not exist.

- [ ] **Step 4: Write `registry/components/date-input.tsx`** (complete file)

```tsx
import { useDateInput } from "@saywhen/react";
import type { Engine } from "@saywhen/core";
import type { SuggestEngine } from "@saywhen/core/suggest";

export interface DateInputProps {
  engine: Engine;
  suggest?: SuggestEngine;
  timeZone: string;
  now?: () => Date;
  name?: string; // hidden input for form posts
  placeholder?: string;
  /** accessible name for the combobox (required by APG; defaults to "Date") */
  ariaLabel?: string;
  enableTime?: boolean;
  allowPast?: boolean;
  onCommit?: (value: string) => void;
}

export function DateInput({
  engine, suggest, timeZone, now, name, placeholder, ariaLabel, enableTime, allowPast, onCommit,
}: DateInputProps) {
  const d = useDateInput({
    engine,
    timeZone,
    ...(suggest ? { suggest } : {}),
    ...(now ? { now } : {}),
    ...(enableTime !== undefined ? { enableTime } : {}),
    ...(allowPast !== undefined ? { allowPast } : {}),
    ...(onCommit ? { onCommit: (value) => onCommit(value) } : {}),
  });
  const { state } = d;
  return (
    <div className="relative w-full">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-0 whitespace-pre px-3 py-2 text-sm">
          <span className="invisible">{state.rawInput}</span>
          <span className="text-muted-foreground">{state.ghostText}</span>
        </span>
        <input
          {...d.getInputProps()}
          aria-label={ariaLabel ?? "Date"}
          placeholder={placeholder}
          onBlur={() => d.controller.commit()}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {state.isOpen && state.suggestions.length > 0 && (
        <ul
          {...d.getListboxProps()}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {state.suggestions.map((s, i) => (
            <li
              key={s.text}
              {...d.getOptionProps(i)}
              className={`cursor-pointer rounded px-3 py-1.5 text-sm ${
                i === state.activeSuggestionIndex ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
      {name !== undefined && <input type="hidden" name={name} value={state.value} readOnly />}
      <span role="status" aria-live="polite" className="sr-only">
        {state.announcement}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Write `registry/components/date-range-input.tsx`** (complete file — a thin preset; DRY over `DateInput`)

```tsx
import { DateInput, type DateInputProps } from "./date-input.js";

/** Range-oriented preset of {@link DateInput}: same combobox, range-y placeholder.
 *  Natural-language ranges ("next mon to fri") are handled by the engine itself. */
export function DateRangeInput(props: DateInputProps) {
  return <DateInput placeholder="e.g. next monday to friday" {...props} />;
}
```

- [ ] **Step 6: Write `registry/registry.json`** (shadcn-style manifest; `date-range-input` lists `date-input` as a registry dependency)

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry.json",
  "name": "saywhen",
  "homepage": "https://github.com/saywhen/saywhen",
  "items": [
    {
      "name": "date-input",
      "type": "registry:component",
      "title": "Date Input",
      "description": "Natural-language date input with ghost completion and a suggestion popover.",
      "dependencies": ["@saywhen/react", "@saywhen/core"],
      "files": [{ "path": "components/date-input.tsx", "type": "registry:component" }]
    },
    {
      "name": "date-range-input",
      "type": "registry:component",
      "title": "Date Range Input",
      "description": "Range-oriented preset of the date input.",
      "registryDependencies": ["date-input"],
      "files": [{ "path": "components/date-range-input.tsx", "type": "registry:component" }]
    },
    {
      "name": "calendar-grid",
      "type": "registry:component",
      "title": "Calendar Grid",
      "description": "Month grid built on getMonthGrid; pure presentational day buttons.",
      "dependencies": ["@saywhen/core"],
      "files": [{ "path": "components/calendar-grid.tsx", "type": "registry:component" }]
    },
    {
      "name": "time-field",
      "type": "registry:component",
      "title": "Time Field",
      "description": "Hour/minute stepper built on clampTime.",
      "dependencies": ["@saywhen/core"],
      "files": [{ "path": "components/time-field.tsx", "type": "registry:component" }]
    }
  ]
}
```

- [ ] **Step 7: Run to verify pass + typecheck**

Run: `pnpm vitest run registry/test/date-input.test.tsx && pnpm --filter @saywhen/registry exec tsc --noEmit`
Expected: PASS — the `DateInput`/`DateRangeInput` suite (4 tests); typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml registry/package.json registry/tsconfig.json \
        registry/registry.json registry/components/date-input.tsx registry/components/date-range-input.tsx \
        registry/test/date-input.test.tsx pnpm-lock.yaml
git commit -m "feat(registry): DateInput + DateRangeInput components and registry manifest"
```

---

### Task 9: Registry — `CalendarGrid`, `TimeField`

The two remaining presentational components, on `getMonthGrid` and `clampTime`. Completing them turns the manifest test green.

**Files:**
- Create: `registry/components/calendar-grid.tsx`, `registry/components/time-field.tsx`
- Test: `registry/test/calendar-grid.test.tsx`, `registry/test/time-field.test.tsx`, `registry/test/registry-manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

`registry/test/calendar-grid.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { CalendarGrid } from "../components/calendar-grid.js";

afterEach(cleanup);

describe("CalendarGrid", () => {
  test("renders the month and selects a day", () => {
    const onSelect = vi.fn();
    render(<CalendarGrid year={2026} month={5} weekStart={0} onSelect={onSelect} />); // June 2026
    const cell = screen.getByRole("button", { name: "15" });
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith("2026-06-15");
  });

  test("no axe violations", async () => {
    const { container } = render(<CalendarGrid year={2026} month={5} weekStart={0} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
```

`registry/test/time-field.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimeField } from "../components/time-field.js";

afterEach(cleanup);

describe("TimeField", () => {
  test("clamps out-of-range entries via clampTime", () => {
    const onChange = vi.fn();
    render(<TimeField value={{ h: 9, m: 0 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith({ h: 23, m: 0 });
  });
});
```

`registry/test/registry-manifest.test.ts` (drift guard — now that all four files exist):
```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "registry.json"), "utf8")) as {
  items: Array<{ name: string; files: Array<{ path: string }> }>;
};

describe("registry.json manifest", () => {
  test("every listed file exists on disk", () => {
    for (const item of manifest.items) {
      for (const f of item.files) {
        expect(existsSync(join(root, f.path)), `${item.name}: ${f.path}`).toBe(true);
      }
    }
  });

  test("declares the four v1 components", () => {
    expect(manifest.items.map((i) => i.name).sort()).toEqual([
      "calendar-grid", "date-input", "date-range-input", "time-field",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run registry/test/calendar-grid.test.tsx registry/test/time-field.test.tsx`
Expected: FAIL — the component files do not exist.

- [ ] **Step 3: Write `registry/components/calendar-grid.tsx`** (complete file)

```tsx
import { getMonthGrid } from "@saywhen/core/controller";

export interface CalendarGridProps {
  year: number;
  month: number; // 0-based
  weekStart?: 0 | 1;
  selected?: string; // YYYY-MM-DD
  onSelect?: (date: string) => void;
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

export function CalendarGrid({ year, month, weekStart = 0, selected, onSelect }: CalendarGridProps) {
  const grid = getMonthGrid(year, month, weekStart);
  const header = weekStart === 1 ? [...DOW.slice(1), DOW[0]!] : DOW;
  // A native <table> (not role="grid") keeps it presentational and axe-clean — full
  // roving-tabindex grid keyboard semantics are future work (see Known gaps).
  return (
    <table aria-label={`${MONTHS[month]!} ${year}`} className="border-collapse text-center text-sm">
      <thead>
        <tr>
          {header.map((d) => (
            <th key={d} scope="col" className="p-1 font-medium text-muted-foreground">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.map((row, r) => (
          <tr key={r}>
            {row.map((cell) => {
              const iso = `${cell.y}-${pad(cell.m + 1)}-${pad(cell.d)}`;
              const isSelected = selected === iso;
              return (
                <td key={iso} className="p-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect?.(iso)}
                    className={`h-9 w-9 rounded ${cell.inMonth ? "" : "text-muted-foreground"} ${
                      isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    }`}
                  >
                    {cell.d}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Write `registry/components/time-field.tsx`** (complete file)

```tsx
import { clampTime } from "@saywhen/core/controller";

export interface TimeValue {
  h: number;
  m: number;
}

export interface TimeFieldProps {
  value: TimeValue;
  onChange: (value: TimeValue) => void;
}

export function TimeField({ value, onChange }: TimeFieldProps) {
  const set = (h: number, m: number) => onChange(clampTime({ h, m }));
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={23}
        aria-label="Hour"
        value={value.h}
        onChange={(e) => set(Number(e.target.value), value.m)}
        className="w-14 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums"
      />
      <span aria-hidden>:</span>
      <input
        type="number"
        min={0}
        max={59}
        aria-label="Minute"
        value={value.m}
        onChange={(e) => set(value.h, Number(e.target.value))}
        className="w-14 rounded-md border bg-transparent px-2 py-1 text-sm tabular-nums"
      />
    </div>
  );
}
```

- [ ] **Step 5: Run to verify pass (incl. the now-complete manifest)**

Run: `pnpm vitest run registry && pnpm --filter @saywhen/registry exec tsc --noEmit`
Expected: PASS — all four component suites + `registry-manifest.test.ts` (all four files now exist); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add registry/components/calendar-grid.tsx registry/components/time-field.tsx \
        registry/test/calendar-grid.test.tsx registry/test/time-field.test.tsx \
        registry/test/registry-manifest.test.ts
git commit -m "feat(registry): CalendarGrid and TimeField components"
```

---

### Task 10: Playground app

A Vite + React demo wiring the registry `DateInput` against live locale / holiday / time toggles — the end-to-end proof of the whole stack.

**Files:**
- Modify: `package.json` (root — widen `typecheck`)
- Create: `apps/playground/{package.json,tsconfig.json,vite.config.ts,index.html}`
- Create: `apps/playground/src/{main.tsx,App.tsx}`
- Test: `apps/playground/test/app.test.tsx`

- [ ] **Step 1: Scaffold**

`apps/playground/package.json`:
```json
{
  "name": "playground",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/locale-en": "workspace:*",
    "@saywhen/locale-ru": "workspace:*",
    "@saywhen/holidays-us": "workspace:*",
    "@saywhen/holidays-ru": "workspace:*",
    "@saywhen/react": "workspace:*",
    "@saywhen/registry": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

`apps/playground/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx"
  },
  "include": ["src", "test"]
}
```

`apps/playground/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [react()] });
```

Now widen the root `package.json` `typecheck` script (all four workspace groups exist as of this task):
```json
    "typecheck": "pnpm -r --filter './packages/*' --filter './tools/*' --filter './apps/*' --filter './registry' exec tsc --noEmit",
```

`apps/playground/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>saywhen playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/playground/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Then run `pnpm install` to link the workspace deps and fetch Vite.

- [ ] **Step 2: Write the failing test** — `apps/playground/test/app.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

afterEach(cleanup);

describe("playground App", () => {
  test("mounts a working date input", () => {
    render(<App />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("committed").textContent).toBe("2026-06-13");
  });

  test("switching locale re-renders in Russian", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /русский/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "за" } });
    expect(screen.getByText("втра")).toBeDefined(); // ghost of "завтра"
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run apps/playground/test/app.test.tsx`
Expected: FAIL — `../src/App.js` does not exist.

- [ ] **Step 4: Write `apps/playground/src/App.tsx`** (complete file)

```tsx
import { useMemo, useState } from "react";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { ru } from "@saywhen/locale-ru";
import { us } from "@saywhen/holidays-us";
import { ru as ruHolidays } from "@saywhen/holidays-ru";
import { DateInput } from "@saywhen/registry/date-input";

type LocaleId = "en" | "ru";

// Fixed clock so the demo (and its tests) are deterministic; swap for () => new Date() in real use.
const NOW = () => new Date("2026-06-12T08:00:00Z");

export function App() {
  const [locale, setLocale] = useState<LocaleId>("en");
  const [withHolidays, setWithHolidays] = useState(true);
  const [enableTime, setEnableTime] = useState(false);
  const [committed, setCommitted] = useState("");

  const { engine, suggest } = useMemo(() => {
    const adapter = locale === "en" ? en : ru;
    const packs = withHolidays ? (locale === "en" ? [us] : [ruHolidays]) : [];
    const opts = { locale: adapter, holidays: packs };
    return { engine: createEngine(opts), suggest: createSuggest(opts) };
  }, [locale, withHolidays]);

  const timeZone = locale === "en" ? "America/New_York" : "Europe/Moscow";

  return (
    <main className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-xl font-semibold">saywhen</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"}>
          English
        </button>
        <button type="button" onClick={() => setLocale("ru")} aria-pressed={locale === "ru"}>
          Русский
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={withHolidays} onChange={(e) => setWithHolidays(e.target.checked)} />
          holidays
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={enableTime} onChange={(e) => setEnableTime(e.target.checked)} />
          time
        </label>
      </div>

      <DateInput
        key={`${locale}-${withHolidays}-${enableTime}`}
        engine={engine}
        suggest={suggest}
        timeZone={timeZone}
        now={NOW}
        enableTime={enableTime}
        name="date"
        onCommit={setCommitted}
      />

      <p className="text-sm text-muted-foreground">
        committed: <span data-testid="committed">{committed}</span>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run apps/playground/test/app.test.tsx && pnpm --filter playground exec tsc --noEmit`
Expected: PASS — 2 tests; typecheck clean. (The `key` forces a fresh controller when the engine changes, so the locale switch takes effect.)

- [ ] **Step 6: Build smoke**

Run: `pnpm --filter playground build`
Expected: `vite build` succeeds and writes `apps/playground/dist/`.

- [ ] **Step 7: Add `apps/playground/dist` to .gitignore if needed, then commit**

`dist/` is already gitignored at the repo root. Commit the source:
```bash
git add apps/playground package.json pnpm-lock.yaml
git commit -m "feat(playground): Vite demo wiring DateInput across locales, holidays, time"
```

---

### Task 11: Final verification — the whole series green

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all suites pass + 1 ORACLE-gated skip. New tests since plan 05: engine.formatAccessible (2), suggest rangeMode (1), calendar-grid (5), controller (≈16), react props (5), react hook (4), registry components (≈6), registry manifest (2), playground (2) — roughly **+43 tests** over the 595 baseline (~638 total).

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: clean across `packages/*`, `tools/*`, `apps/*`, and `registry` (the root script now globs all four).

- [ ] **Step 3: Build all publishable packages + dist smoke**

Run:
```bash
pnpm build
node --input-type=module -e "const m = await import('./packages/core/dist/controller.js'); if (typeof m.createDateInputController !== 'function') throw new Error('controller dist'); console.log('controller OK');"
node --input-type=module -e "const m = await import('./packages/react/dist/index.js'); if (typeof m.useDateInput !== 'function') throw new Error('react dist'); console.log('react OK');"
pnpm --filter playground build
```
Expected: every package builds; both dist smokes print OK; the playground builds. (Root `build` globs `./packages/*`, so it builds core + react + locales + holidays; the playground builds separately.)

- [ ] **Step 4: Commit any leftover (should be nothing)**

```bash
git status --short   # expect clean (dist is gitignored)
```

---

## Done — definition of success for plan 06 (and the v1 series)

- **`@saywhen/core/controller`** ships as a zero-dep third subpath: a subscribable store with a stable snapshot (React-safe), the `EMPTY → TYPING → PARSED | RANGE_BUILDING → RESOLVED` phase machine (`AMBIGUOUS` = `PARSED` with `alternatives > 0`), the wire-value format (`YYYY-MM-DD`, `…/…` ranges, ISO instants under `enableTime`), pre-localized `announcement`s via `engine.formatAccessible`, and the `getMonthGrid` / `clampTime` UI helpers (spec §7.1).
- **`@saywhen/react`** exposes `useDateInput` with downshift-style prop getters carrying full APG combobox ARIA (`role`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, generated ids) — accessibility implemented once, in pure getters, verified by `jest-axe` (spec §7.2).
- **Registry** ships four copy-paste Tailwind components (`DateInput`, `DateRangeInput`, `CalendarGrid`, `TimeField`) that own zero logic, plus a `registry.json` consumable by `npx shadcn add`, with a manifest-vs-disk drift test (spec §7.3, §9.5).
- **Playground** proves the stack end-to-end: live locale (en/ru), holiday-pack, and time toggles over the registry `DateInput`.
- Two core-contract refinements were required and are recorded: `Engine.formatAccessible` (the announcement needs the engine's holiday names) and `SuggestResult.rangeMode` (the controller's `RANGE_BUILDING` phase). Both are additive — the existing 595 tests stay green.

**Known gaps, deliberate (record, don't fix here):**
- Ghost overlay alignment assumes the input font/padding match the overlay span; the registry component pins them with shared utility classes but pixel-perfect overlay is the consumer's styling responsibility.
- `DateRangeInput` is a placeholder preset of `DateInput` (natural-language ranges are a core capability, not a separate widget); a two-field start/end variant is future work.
- The controller re-reads `now()` on every `notify()`; a long-open input crossing midnight re-anchors relative dates on the next keystroke (acceptable — there is no timer; spec §8 forbids wall-clock reads outside injected `now`).
- The playground uses a fixed clock for deterministic tests; real embeds pass `now: () => new Date()`.
- No Changesets/versioning wired (spec §3 lists Changesets as tooling) — first-publish concern, out of v1 scope.

**Series complete.** With plan 06 merged, the spec §1 v1 surface is delivered: pluggable en/ru locales, holidays, typo correction, generated suggestions + ghost, structured ambiguity, zero-dep timezone math, a headless controller, and accessible React bindings with copy-paste UI. Future work stays as designed-for, not built (spec §11): recurrence, more locales, web-component wrapper, Vue/Svelte bindings.
```
