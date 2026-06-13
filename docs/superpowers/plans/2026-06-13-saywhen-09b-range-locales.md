# saywhen Plan 09B — Range UX locale rollout (Russian + Kazakh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the plan-09A range engine to **Russian** (`с … по …`, `между … и …`, front-elided `с 1 по 15 марта`) and **Kazakh** (`X пен Y аралығы`, front-elided `1 мен 15 қаңтар`) — pure locale vocabulary on top of the core rules. The year-inference fix already applies to all locales (it's in core `resolve`).

**Architecture:** No core changes. Russian adds `с`/`между` (`RANGE_OPEN`) and `и` (`CONNECTOR`). Kazakh adds the conjunction `пен/бен/мен` (`CONNECTOR`, medial) and the postposition `арасы/аралығы/аралығында` (`FILLER`, trailing) — so `X пен Y аралығы` routes through the core `rangeP` (with trailing filler skipped) and `1 мен 15 қаңтар` through `elidedRangeP`, with **no custom `LocaleRule`** needed. (This is simpler than the spec's "rule modelled on `kkBoundaryRule`" sketch — same outcome, less code.)

**Tech Stack:** existing pnpm monorepo; Vitest 3. Kazakh is dual-script: the `kk` `add()` auto-registers `cyrToLat(form)` for every form, so editing the Cyrillic data arrays covers Latin input too.

**This is plan 09B** (depends on **09A** being merged; spec at `docs/superpowers/specs/2026-06-13-saywhen-range-ux-design.md`, §5–§6).

**Conventions (same as plans 01–09A):**
- Run tests from repo root: `pnpm vitest run <path>`. Commit after every green task.
- Env quirk: if `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## Core facts the engineer needs (verified against current `main`)

- Both locales build their lexicon from data-array constants: `ru` `data.ts` exports `CONNECTORS = ["по", "до"]` and `DIRECTIONS`; `index.ts` does `add(CONNECTORS, { kind: "CONNECTOR" })` (line 51). `kk` `data.ts` exports `CONNECTORS = ["дейін", "шейін"]` (line 94) and `FILLERS = ["сағат", "жыл", "жылы", "күні", "де", "да"]` (line 110); `index.ts` does `add(CONNECTORS, …)` (line 49) and `add(FILLERS, …)` (line 57).
- The `kk` `add()` (index.ts:18–22) registers every form **and** its `cyrToLat(form)` alias — so Cyrillic data edits automatically enable Latin input.
- After 09A, `RANGE_OPEN` is a `SemPayload` kind; the core `rangeP` accepts an optional leading `RANGE_OPEN`; `elidedRangeP` admits a bare-day endpoint when some endpoint has an explicit month; the `range` resolve prefers the current year for month-bearing calendar ranges. None of that needs per-locale code beyond the trigger words.
- Test clocks (both today = 2026-06-12, `dateOrder` **DMY**): `ru` e2e/suggest use `2026-06-12T08:00:00Z` / `Europe/Moscow`; `kk` e2e uses `2026-06-12T08:00:00Z` / `Asia/Almaty`. Both e2e files expose `top(text)` (top candidate, throws on no-parse). Both suggest files expose `sug` + `CTX` + `texts(r)`.
- Russian months are 0-indexed: `март` = 2 (so `1 марта` → `calendar{ m:2, d:1 }`). Kazakh `қаңтар` = 0.

## File structure (created/modified by this plan)

```
packages/locale-ru/src/data.ts       MODIFY  +и in CONNECTORS; +RANGE_OPENERS export (Task 1)
packages/locale-ru/src/index.ts      MODIFY  add(RANGE_OPENERS, RANGE_OPEN) (Task 1)
packages/locale-ru/test/e2e.test.ts  MODIFY  Russian range e2e (Task 1)
packages/locale-ru/test/suggest.test.ts MODIFY  opener un-blanks typeahead (Task 1)
packages/locale-kk/src/data.ts       MODIFY  +пен/бен/мен in CONNECTORS; +арасы/аралығы/аралығында in FILLERS (Task 2)
packages/locale-kk/test/e2e.test.ts  MODIFY  Kazakh between + front-elision e2e (Task 2)
```

---

### Task 1: Russian — `с … по …`, `между … и …`, front-elision

**Files:**
- Modify: `packages/locale-ru/src/data.ts`, `packages/locale-ru/src/index.ts`
- Test: `packages/locale-ru/test/e2e.test.ts`, `packages/locale-ru/test/suggest.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/locale-ru/test/e2e.test.ts` a new `describe` (uses the file's `top`; today 2026-06-12, DMY):
```ts
describe("range UX (plan 09B)", () => {
  const rng = (text: string) => {
    const c = top(text);
    return { start: c.start.date, end: c.end.date };
  };
  test("с … по … with front-elision: 'с 1 по 15 марта'", () => {
    expect(rng("с 1 по 15 марта")).toEqual({ start: "2026-03-01", end: "2026-03-15" });
  });
  test("между … и …: 'между 1 марта и 15 марта'", () => {
    expect(rng("между 1 марта и 15 марта")).toEqual({ start: "2026-03-01", end: "2026-03-15" });
  });
  test("bare range prefers the current year: '1 марта по 15 марта'", () => {
    expect(rng("1 марта по 15 марта")).toEqual({ start: "2026-03-01", end: "2026-03-15" });
  });
});
```

Append to `packages/locale-ru/test/suggest.test.ts` (inside its `describe`):
```ts
  test("opener un-blanks typeahead: 'с 1 по ' completes", () => {
    expect(sug.suggest("с 1 по ", CTX).suggestions.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-ru/test/e2e.test.ts packages/locale-ru/test/suggest.test.ts`
Expected: FAIL — `с`/`между`/`и` are not yet vocabulary; the suggest case returns 0.

- [ ] **Step 3: Add the Russian vocabulary**

In `packages/locale-ru/src/data.ts`, change the `CONNECTORS` line (150) and add a `RANGE_OPENERS` export just below it:
```ts
export const CONNECTORS = ["по", "до", "и"];

// range openers — "с … по …", "между … и …" (prepositional, lead the range)
export const RANGE_OPENERS = ["с", "со", "между"];
```

In `packages/locale-ru/src/index.ts`, add `RANGE_OPENERS` to the data import (the destructured `import { … } from "./data.js"`, around line 5), then add one `add(...)` call right after `add(CONNECTORS, { kind: "CONNECTOR" });` (line 51):
```ts
  add(RANGE_OPENERS, { kind: "RANGE_OPEN" });
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-ru`
Expected: PASS — new range e2e + suggest cases green; **all existing ru tests still green** (the ru `suggest` starters/rankings unchanged; `до` keeps its `DIRECTION`+`CONNECTOR` lattice readings). Watch-point: adding `и` as a `CONNECTOR` — the full ru suite (incl. conformance + suggest) must stay green; if a pre-existing phrase regresses, that surfaces here.

- [ ] **Step 5: Commit**

```bash
git add packages/locale-ru/src/data.ts packages/locale-ru/src/index.ts packages/locale-ru/test/e2e.test.ts packages/locale-ru/test/suggest.test.ts
git commit -m "feat(locale-ru): с…по… / между…и… range vocabulary"
```

---

### Task 2: Kazakh — `X пен Y аралығы` + front-elision

**Files:**
- Modify: `packages/locale-kk/src/data.ts`
- Test: `packages/locale-kk/test/e2e.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/locale-kk/test/e2e.test.ts` a new `describe` (uses the file's `top`; today 2026-06-12, DMY; `қаңтар` = January = month 0):
```ts
describe("range UX (plan 09B)", () => {
  const rng = (text: string) => {
    const c = top(text);
    return { start: c.start.date, end: c.end.date };
  };
  test("between (medial conjunction + trailing postposition): '1 қаңтар мен 15 қаңтар аралығы'", () => {
    expect(rng("1 қаңтар мен 15 қаңтар аралығы")).toEqual({ start: "2026-01-01", end: "2026-01-15" });
  });
  test("front-elision: '1 мен 15 қаңтар'", () => {
    expect(rng("1 мен 15 қаңтар")).toEqual({ start: "2026-01-01", end: "2026-01-15" });
  });
  test("Latin input still routes through the same rules: '1 men 15 qañtar'", () => {
    expect(rng("1 men 15 qañtar")).toEqual({ start: "2026-01-01", end: "2026-01-15" });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-kk/test/e2e.test.ts`
Expected: FAIL — `мен`/`аралығы` are not yet vocabulary, so the phrases don't parse.

- [ ] **Step 3: Add the Kazakh vocabulary**

In `packages/locale-kk/src/data.ts`, extend `CONNECTORS` (line 94) with the conjunction allomorphs and `FILLERS` (line 110) with the "between" postpositions:
```ts
export const CONNECTORS = ["дейін", "шейін", "пен", "бен", "мен"];
```
```ts
export const FILLERS = ["сағат", "жыл", "жылы", "күні", "де", "да", "арасы", "аралығы", "аралығында"];
```
(No `index.ts` change — it already does `add(CONNECTORS, …)` and `add(FILLERS, …)`, and `add()` auto-registers the `cyrToLat` Latin aliases `pen/ben/men`, `arasy/aralyğy/…`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-kk`
Expected: PASS — between + front-elision (Cyrillic and Latin) green; **all existing kk tests still green**, including the existing postpositional `… дейін` ranges (medial `мен` and trailing `аралығы` are additive) and the kk conformance suite.

- [ ] **Step 5: Commit**

```bash
git add packages/locale-kk/src/data.ts packages/locale-kk/test/e2e.test.ts
git commit -m "feat(locale-kk): X пен Y аралығы between-range vocabulary"
```

---

### Task 3: Whole-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all suites pass + the 1 ORACLE-gated skip. New since 09A: the ru + kk range e2e/suggest cases. No existing assertion changes.

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
Expected: clean.

---

## Done — definition of success for plan 09B

- Russian parses `с … по …`, `между … и …`, and front-elided `с 1 по 15 марта`; bare ranges prefer the current year; typeahead is un-blanked after `с …`.
- Kazakh parses `X пен Y аралығы` and front-elided `1 мен 15 қаңтар`, in **both** Cyrillic and Latin, via the core rules (no custom rule); existing postpositional `… дейін` ranges still work.
- Pure vocabulary change — no core/grammar/resolve edits; full suite + typecheck + all builds + playground build green; **no existing assertion changed**.

**Non-goals (this plan):** any core/grammar change (all in 09A), cross-script holiday-name input, recurrence, publishing.
