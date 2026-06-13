# saywhen Plan 08 — Kazakh polish & demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merged Kazakh support visible in the Vite playground (a `Қазақша` button + a `Кирил`/`Latyn` script sub-toggle wiring `kk`/`kkLatn` + `holidays-kk`), and capture the 2021-Latin-glyph and Kurban-Ait verification as code comments — no engine/behavior change.

**Architecture:** One playground file (`apps/playground/src/App.tsx`) gains a third locale and a script sub-toggle that swaps between the `kk` (Cyrillic-out) and `kkLatn` (Latin-out) adapters from the already-published `@saywhen/locale-kk`. The controller, `@saywhen/react`, and the registry `DateInput` already accept any `LocaleAdapter`, so nothing there changes. Two doc-comment edits record the verification findings (no mapping value or date changes).

**Tech Stack:** existing pnpm monorepo; Vite 5 + React 18 playground; Vitest 3 + `@testing-library/react` + jsdom for the app test. No new runtime deps in any published package (only the playground app gains two `workspace:*` devless deps).

**This is plan 8** (01–07 executed & merged; v1 + Kazakh complete). It is a small, self-contained polish/demo task per spec `docs/superpowers/specs/2026-06-13-saywhen-kk-polish-design.md`.

**Conventions (same as plans 01–07):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task.
- Env quirk: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`
- The playground uses a fixed demo clock **Friday `2026-06-12T08:00:00Z`** (`NOW` thunk) so its tests are deterministic. Kazakh uses `Asia/Almaty`.

## Core facts the engineer needs (verified against current `main`)

- `@saywhen/locale-kk` exports `kk` (id `"kk"`, Cyrillic canonical output), `kkLatn` (id `"kk-latn"`, 2021 Latin output), and `cyrToLat`. Both adapters accept **either** script as input (union lexicon). `@saywhen/holidays-kk` exports `kk` (a `HolidayPack`) and `kurbanAit`.
- The playground `DateInput` (from `@saywhen/registry/date-input`) takes `{ engine, suggest, timeZone, now, enableTime, name, onCommit }` and renders a combobox with a ghost completion. Suggestions/ghost are produced by the **active adapter's `format`**, so the same typed text renders Cyrillic suggestions under `kk` and Latin under `kkLatn` while resolving to the same date.
- Existing playground test pattern (`apps/playground/test/app.test.tsx`): click a locale button, type into the combobox, assert the ghost via `screen.getByText("<ghost>")` (e.g. `за` → `втра`). The ghost is its own text node.
- `pnpm typecheck` globs `./apps/*`, so the playground typechecks there. The playground builds via `pnpm --filter playground build` (Vite). `pnpm build` only builds `./packages/*` (publishable), not the app.
- The plan-07 `locale-kk` suggest test already proves `ер` → `ертең` (ghost `тең`) under `kk`; `cyrToLat("ертең") = "erteñ"`, so `er` → `erteñ` (ghost `teñ`) under `kkLatn`. `ертең`/`erteñ` (tomorrow) is the top starter, so both ghosts are stable.

## File structure (created/modified by this plan)

```
apps/playground/package.json                 MODIFY  add @saywhen/locale-kk + @saywhen/holidays-kk deps (Task 1)
apps/playground/src/App.tsx                   MODIFY  full rewrite: kk locale + script sub-toggle (Task 1)
apps/playground/test/app.test.tsx            MODIFY  append two Kazakh tests (Task 1)
packages/locale-kk/src/translit.ts            MODIFY  verification doc comment only — no value change (Task 2)
packages/holidays-kk/src/index.ts             MODIFY  Kurban Ait doc comment only — no date change (Task 2)
```

---

### Task 1: Playground — Kazakh locale + script sub-toggle

Wire `kk`/`kkLatn` + `holidays-kk` into the demo with a `Қазақша` button and a `Кирил`/`Latyn` sub-toggle. TDD: add deps, write the failing Kazakh tests, then rewrite `App.tsx`.

**Files:**
- Modify: `apps/playground/package.json`
- Modify: `apps/playground/src/App.tsx`
- Test: `apps/playground/test/app.test.tsx`

- [ ] **Step 1: Add the two workspace deps**

In `apps/playground/package.json`, add to `"dependencies"` (alphabetical, next to the other `@saywhen/*` packs):
```json
    "@saywhen/holidays-kk": "workspace:*",
    "@saywhen/locale-kk": "workspace:*",
```
Then link them:
```bash
pnpm install
```
Expected: `Already up to date` or a quick relink; `apps/playground` now resolves both packages.

- [ ] **Step 2: Write the failing Kazakh tests**

Append to `apps/playground/test/app.test.tsx` (inside the existing `describe("playground App", …)` block, after the Russian test):
```tsx
  test("switching to Kazakh re-renders in Cyrillic", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /қазақша/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ер" } });
    expect(screen.getByText("тең")).toBeDefined(); // ghost of "ертең"
  });

  test("Kazakh script sub-toggle switches canonical output to Latin", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /қазақша/i }));
    fireEvent.click(screen.getByRole("button", { name: /latyn/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "er" } });
    expect(screen.getByText("teñ")).toBeDefined(); // ghost of "erteñ" = cyrToLat("ертең")
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run apps/playground/test/app.test.tsx`
Expected: FAIL — the two new tests error in `getByRole("button", { name: /қазақша/i })` (no such button yet). The two existing en/ru tests still pass.

- [ ] **Step 4: Rewrite `apps/playground/src/App.tsx`** (complete file)

```tsx
import { useMemo, useState } from "react";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { ru } from "@saywhen/locale-ru";
import { kk, kkLatn } from "@saywhen/locale-kk";
import { us } from "@saywhen/holidays-us";
import { ru as ruHolidays } from "@saywhen/holidays-ru";
import { kk as kkHolidays } from "@saywhen/holidays-kk";
import { DateInput } from "@saywhen/registry/date-input";

type LocaleId = "en" | "ru" | "kk";
type Script = "cyr" | "latn";

// Fixed clock so the demo (and its tests) are deterministic; swap for () => new Date() in real use.
const NOW = () => new Date("2026-06-12T08:00:00Z");

export function App() {
  const [locale, setLocale] = useState<LocaleId>("en");
  const [script, setScript] = useState<Script>("cyr");
  const [withHolidays, setWithHolidays] = useState(true);
  const [enableTime, setEnableTime] = useState(false);
  const [committed, setCommitted] = useState("");

  const { engine, suggest } = useMemo(() => {
    // kk has two output adapters from one shared input lexicon: kk (Cyrillic) / kkLatn (Latin)
    const adapter =
      locale === "en" ? en : locale === "ru" ? ru : script === "cyr" ? kk : kkLatn;
    const packs = withHolidays
      ? locale === "en" ? [us] : locale === "ru" ? [ruHolidays] : [kkHolidays]
      : [];
    const opts = { locale: adapter, holidays: packs };
    return { engine: createEngine(opts), suggest: createSuggest(opts) };
  }, [locale, script, withHolidays]);

  const timeZone =
    locale === "kk" ? "Asia/Almaty" : locale === "ru" ? "Europe/Moscow" : "America/New_York";

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
        <button type="button" onClick={() => setLocale("kk")} aria-pressed={locale === "kk"}>
          Қазақша
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

      {locale === "kk" && (
        <div className="flex gap-2 text-sm" aria-label="script">
          <button type="button" onClick={() => setScript("cyr")} aria-pressed={script === "cyr"}>
            Кирил
          </button>
          <button type="button" onClick={() => setScript("latn")} aria-pressed={script === "latn"}>
            Latyn
          </button>
        </div>
      )}

      <DateInput
        key={`${locale}-${script}-${withHolidays}-${enableTime}`}
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

Notes: `script` joins the `useMemo` deps (flipping `Кирил`/`Latyn` rebuilds the engine) and the remount `key`. The sub-toggle renders only when `locale === "kk"`. `Asia/Almaty` matches the Kazakh test expectations.

- [ ] **Step 5: Run to verify pass (new + existing)**

Run: `pnpm vitest run apps/playground/test/app.test.tsx`
Expected: PASS — 4 tests (2 existing en/ru + 2 new Kazakh). If the Latin ghost assertion fails, confirm `cyrToLat("ертең") === "erteñ"` (it does under the current map); the ghost is the input-stripped remainder `teñ`.

- [ ] **Step 6: Typecheck the playground**

Run: `pnpm --filter playground typecheck`
Expected: clean (exit 0) — the `LocaleId`/`Script` unions and adapter selection are exhaustive.

- [ ] **Step 7: Commit**

```bash
git add apps/playground/package.json apps/playground/src/App.tsx apps/playground/test/app.test.tsx pnpm-lock.yaml
git commit -m "feat(playground): Kazakh locale with Кирил/Latyn script sub-toggle"
```

---

### Task 2: Capture verification findings as doc comments (no behavior change)

Record the 2021-Latin-glyph and Kurban-Ait verification in the code. **No mapping value or date changes** — only comments — so every existing test stays green.

**Files:**
- Modify: `packages/locale-kk/src/translit.ts`
- Modify: `packages/holidays-kk/src/index.ts`

- [ ] **Step 1: Update the `translit.ts` header + OVERRIDES comments**

In `packages/locale-kk/src/translit.ts`, replace the existing 7-line header comment (the block ending `// against the official alphabet for real-world Latin-input fidelity.`) with:
```ts
// Deterministic Kazakh Cyrillic → 2021 Latin transliteration.
// Used for BOTH directions of the dual-script design: every Cyrillic lexicon form is
// registered alongside cyrToLat(form) as an input alias, and kkLatn.format(expr) =
// cyrToLat(kk.format(expr)). The system is internally consistent for any self-consistent
// map (the round-trip/conformance tests pass regardless of official-2021 fidelity).
//
// Verification (2026-06-13): the NATIVE Kazakh letters below — ä ğ q ñ ö ū ü i y and й→ı —
// match the January 2021 Latin-alphabet decree. The Russian-LOAN letters (и ц ч щ ю я ё э в
// ъ ь) are NOT in the official 31-letter Kazakh Latin alphabet; they occur only in borrowed
// words (e.g. holiday names рождество/конституция/республика) and use reasonable
// transliteration conventions, not decree-backed forms. и→ï is the one debatable near-native
// choice (some sources merge it to i); kept as ï to stay distinct from і→i.
```

Then replace the two-line `OVERRIDES` comment (`// Letters whose 2021 official glyph is ambiguous/loan-only — tune here, then the whole` / `// system (lexicon aliases + Latin output) follows automatically. Empty by default.`) with:
```ts
// Per-letter overrides for the loan/ambiguous letters noted above — set a Cyrillic→Latin
// pair here and both the input aliases and the Latin output follow automatically. Empty by
// default (the MAP values are the chosen convention).
```

Leave `MAP` and `OVERRIDES` **values unchanged**.

- [ ] **Step 2: Update the Kurban Ait doc comment**

In `packages/holidays-kk/src/index.ts`, replace the two-line tail of the `kurbanAit` doc comment:
```ts
 * candidate with an explanatory error (spec §4.5 / §8). Extend the table as new years are
 * declared, and VERIFY each entry against the official Kazakhstan holiday calendar (±1 day).
```
with:
```ts
 * candidate with an explanatory error (spec §4.5 / §8). Verified against the calculated
 * Eid al-Adha (10 Dhu al-Hijjah) dates for 2023–2030, ±1 day vs official sighting/decree;
 * extend the table as new years are declared.
```

Leave the `TABLE` values unchanged.

- [ ] **Step 3: Confirm no behavior change**

Run: `pnpm vitest run packages/locale-kk packages/holidays-kk && pnpm --filter @saywhen/locale-kk exec tsc --noEmit && pnpm --filter @saywhen/holidays-kk exec tsc --noEmit`
Expected: PASS — every locale-kk + holidays-kk test still green (comments only), typecheck clean. The `cyrToLat` consistency test still passes because no `MAP`/`OVERRIDES` value changed.

- [ ] **Step 4: Commit**

```bash
git add packages/locale-kk/src/translit.ts packages/holidays-kk/src/index.ts
git commit -m "docs(locale-kk,holidays-kk): record 2021-Latin + Kurban Ait verification findings"
```

---

### Task 3: Whole-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all suites pass + 1 ORACLE-gated skip. New since plan 07: the 2 Kazakh playground tests (**885 → 887 passing**, 888 total incl. the skip). No other counts change (Task 2 is comments-only).

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: clean — the root script globs `./packages/*`, `./tools/*`, `./apps/*`, `./registry`, so the playground `App.tsx` is included.

- [ ] **Step 3: Build publishable packages + the playground**

Run:
```bash
pnpm build
pnpm --filter playground build
```
Expected: every package builds (unchanged from plan 07) and the Vite playground builds clean (the new Kazakh imports resolve). 

- [ ] **Step 4: Confirm clean tree**

Run: `git status --short`
Expected: clean (dist/build output is gitignored).

---

## Done — definition of success for plan 08

- The playground shows a **`Қазақша`** button; selecting it reveals a **`Кирил` / `Latyn`** sub-toggle that swaps the canonical-output adapter (`kk` ↔ `kkLatn`) while input stays union — the same typed phrase resolves to the same date with script-appropriate suggestions/ghost. Kazakh holidays toggle on (`Asia/Almaty`).
- Two Kazakh playground tests pass (`ер`→`тең`; `Latyn` + `er`→`teñ`); all existing tests stay green (**887 passing + 1 ORACLE skip = 888 total**); typecheck + all package builds + playground build green.
- `translit.ts` and `holidays-kk/src/index.ts` carry the verification findings as comments; **no `MAP`/`OVERRIDES`/`TABLE` value changed**, so the internal-consistency property and every prior test are untouched.

**Non-goals (unchanged from the spec):** no new locale/holiday features, no `-2` relday/midnight, no controller/`@saywhen/react`/registry changes, no cross-script holiday-name input, no publishing/versioning. The exact 2021 glyph for the contested loan letters remains an `OVERRIDES` tuning hook, now documented as convention rather than decree.
