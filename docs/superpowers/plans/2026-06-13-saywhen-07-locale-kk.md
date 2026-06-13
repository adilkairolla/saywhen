# saywhen Plan 07 — Kazakh (`locale-kk` + `holidays-kk`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Kazakh date support in both scripts — `@saywhen/locale-kk` (two adapters `kk`/`kkLatn` from one shared data source + a `cyrToLat` transliterator) and `@saywhen/holidays-kk` (fixed holidays + Kurban Ait) — per the approved spec `docs/superpowers/specs/2026-06-13-saywhen-locale-kk-design.md`.

**Architecture:** `locale-kk` enumerates Kazakh morphology as Cyrillic data; the lexicon registers each form plus its Latin transliteration (union input); `kk` emits Cyrillic, `kkLatn` emits `cyrToLat(kk.format(...))`. Kazakh is postpositional: a forward-offset **locale rule** (`кейін`) and one locale-neutral **core grammar rule** (`rangePostfixP`, the only core change) cover offsets and ranges. `holidays-kk` mirrors `holidays-ru` with a bounded Kurban Ait lookup.

**Tech Stack:** existing pnpm/TS-strict/Vitest 3 monorepo; `@saywhen/conformance` + `fast-check` for tests; tsdown builds. No new runtime deps (both packages: `@saywhen/core` peer only).

**This is plan 7 of the series** (01–06 executed & merged; the v1 surface is complete). It adds a third language end-to-end and is the template for future locales.

**Conventions (same as plans 01–06):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- Standard clock: **Friday `2026-06-12T08:00:00Z`**. Kazakh e2e/format/accessible tests use `Asia/Almaty` (UTC+5, no DST). Conformance uses the harness default (`America/New_York`).
- Env quirk: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`
- **Ordering:** Task 1 is the core rule (TDD against synthetic tokens, no Kazakh yet). Tasks 2–8 build `locale-kk`. Tasks 9–10 build `holidays-kk`. Task 11 verifies the whole repo. Kazakh data lands incrementally so each commit is green.

## Core facts the engineer needs (verified against current `main`)

- **`LocaleAdapter`** (`packages/core/src/types.ts`) = `{ id; tokenize(text): RawToken[]; lexicon: Lexicon; parseNumber(words): number|null; rules?: LocaleRule[]; format(expr, opts): string; formatAccessible(expr, opts): string; keyboard?; typoMap?; defaults: { weekStart: 0|1; dateOrder } }`. `RawToken = { text; span: [number, number] }`. `Lexicon = Record<string, SemPayload[]>`.
- **`SemPayload`** kinds: `WEEKDAY{day}`, `MONTH{month}`, `NUMBER{n,ordinal?}`, `YEAR{year}`, `TIME{h,m}`, `MERIDIEM{value:"am"|"pm"}`, `RELDAY{offset}`, `REL{which:"this"|"next"|"last"}`, `UNIT{unit}`, `OP{op:1|-1}`, `DIRECTION{dir:"before"|"after"|"from"|"ago"|"in"}`, `CONNECTOR`, `BOUNDARY{edge:"start"|"end"}`, `PERIOD{period}`, `HOLIDAY{id}`, `FILLER`, `LITERAL`. `Unit = "day"|"week"|"month"|"year"|"hour"|"minute"`.
- **`LocaleRule`** = `{ name; at: "anchor"|"expression"; match(toks: SemToken[], i: number): { expr: DateExpr; next: number } | null }`. The core invokes `match` **after** skipping leading fillers; the rule must skip fillers **between** its own tokens itself. **`SemToken = SemPayload & { span: [number,number]; source: string; confidence: number }`.** The core exports **no combinators** — write `match` as a manual token walk.
- **Grammar** (`packages/core/src/grammar.ts`): `inP` = `DIRECTION(in) NUMBER UNIT`; `inBareP` = `DIRECTION(in) UNIT` (n=1); `agoP` = `NUMBER UNIT DIRECTION(ago)` (postpositional, dir −1); `relOffsetP` = `NUMBER UNIT DIRECTION(after|before|from) <expr>` (needs a trailing base); `rangeP` = `<expr> CONNECTOR <expr>` (medial connector). `localeRules` with `at:"expression"` are tried in `topP`; `at:"anchor"` in `anchorP`. `parseStream` keeps only parses that consume the whole stream.
- **`createEngine`** (`packages/core/src/engine.ts`) returns `{ locale, parse, formatAccessible }`. `validateLocale` (`packages/core/src/lexicon.ts`) throws unless the lexicon has ≥7 weekdays, ≥12 months, ≥6 units, ≥3 rels (this/next/last), ≥1 relday, and no form maps to two **different** values of the **same** kind (cross-kind ambiguity like "may" is legal).
- **`normalizeText`** (`packages/core/src/normalize.ts`) = NFKC + `toLowerCase` + hyphen/quote folding. It does **not** strip diacritics; Kazakh Cyrillic and Latin-diacritic letters survive. Every span is into this normalized string.
- **`@saywhen/conformance`**: `runLocaleConformance({ locale, holidays?, seeds, fuzzyPassRate? })` — `seeds` (≥10) are `{ text; start; end? }` under the fixed clock (Fri 2026-06-12, `America/New_York`) with the adapter's `weekStart`. It runs the semantic contract over `SEMANTIC_CASES`, a must-pass case/whitespace matrix, and a fuzzy-typo tier (default ≥ 0.7).
- **Templates to mirror exactly:** `packages/locale-ru/{src/data.ts,src/index.ts,package.json,tsconfig.json,tsdown.config.ts,test/*}` and `packages/holidays-ru/{src/index.ts,package.json,tsdown.config.ts,test/*}`. Kazakh **has no grammatical gender** — so unlike `ru`, the this/next/last modifiers (`келесі`, `өткен`, `осы`) are invariant single strings (no gender×case tables), and nouns after numbers stay **singular** (no Slavic plural triples: "екі апта" = two week). This makes `kk` *simpler* than `ru`; the agglutination shows up only as enumerated case-suffixed surface forms (ablative/dative/locative).
- **`packages/core/test/deps.test.ts`** has `test.each(["locale-en","locale-ru","holidays-us","holidays-ru"])`. Add `"locale-kk"` (Task 3) and `"holidays-kk"` (Task 9). Each must have empty `dependencies` and `peerDependencies` exactly `["@saywhen/core"]`.
- **Internal-consistency property (important):** because `kkLatn.format = cyrToLat(kk.format(...))` **and** every Latin lexicon alias is `cyrToLat(cyrillicForm)`, the round-trip/conformance tests pass for **any** self-consistent `cyrToLat` — a wrong-vs-official transliteration only affects whether a real user's *official* Latin spelling is recognized, not the build. So exact 2021 glyphs for the few ambiguous letters can be tuned in `OVERRIDES` later without breaking tests.

## File structure (created/modified by this plan)

```
packages/core/src/grammar.ts                      MODIFY  add rangePostfixP to topP (Task 1)
packages/core/test/grammar-range.test.ts          CREATE  synthetic-token test for rangePostfixP (Task 1)
packages/core/test/deps.test.ts                   MODIFY  add locale-kk (Task 3), holidays-kk (Task 9)
packages/locale-kk/package.json                   CREATE  (Task 2)
packages/locale-kk/tsconfig.json                  CREATE  (Task 2)
packages/locale-kk/tsdown.config.ts               CREATE  (Task 2)
packages/locale-kk/src/translit.ts                CREATE  cyrToLat 2021 + OVERRIDES (Task 2)
packages/locale-kk/test/translit.test.ts          CREATE  (Task 2)
packages/locale-kk/src/data.ts                    CREATE  Cyrillic tables (Tasks 3–4)
packages/locale-kk/src/index.ts                   CREATE  lexicon/tokenize/parseNumber/format, kk + kkLatn (Tasks 3–5)
packages/locale-kk/test/e2e.test.ts               CREATE  parse cases (Tasks 3–5)
packages/locale-kk/test/{format,accessible,roundtrip.property}.test.ts   CREATE  (Task 6)
packages/locale-kk/test/conformance.test.ts       CREATE  both adapters (Task 7)
packages/locale-kk/test/suggest.test.ts           CREATE  (Task 8)
packages/holidays-kk/{package.json,tsconfig.json,tsdown.config.ts}       CREATE  (Task 9)
packages/holidays-kk/src/index.ts                 CREATE  pack + kurbanAit (Task 9)
packages/holidays-kk/test/{compute,e2e}.test.ts   CREATE  (Tasks 9–10)
```

`pnpm-workspace.yaml` already globs `packages/*` — no change. Root `typecheck`/`build` already glob `./packages/*` — the new packages are picked up automatically.

---

### Task 1: Core grammar — postpositional range rule (`rangePostfixP`)

The one core change (spec §2.1): a locale-neutral rule for ranges whose connector trails both endpoints. TDD against a synthetic token stream — no Kazakh needed yet.

**Files:**
- Create: `packages/core/test/grammar-range.test.ts`
- Modify: `packages/core/src/grammar.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/grammar-range.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { buildGrammar } from "../src/grammar.js";
import type { SemToken } from "../src/types.js";

// minimal SemToken builder — payload + required meta
const t = (p: object): SemToken => ({ ...p, span: [0, 1], source: "x", confidence: 1 } as SemToken);
const g = buildGrammar();
const rangeOf = (stream: SemToken[]) =>
  g.parseStream(stream).parses.find((p) => p.expr.type === "range")?.expr;

describe("rangePostfixP — postpositional range (connector trails)", () => {
  test("WEEKDAY WEEKDAY CONNECTOR → range(start, end)", () => {
    const r = rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "WEEKDAY", day: 5 }), t({ kind: "CONNECTOR" })]);
    expect(r).toMatchObject({
      type: "range",
      start: { type: "anchor", anchor: { kind: "weekday", day: 1 } },
      end: { type: "anchor", anchor: { kind: "weekday", day: 5 } },
    });
  });

  test("medial connector still works (no regression): WEEKDAY CONNECTOR WEEKDAY", () => {
    const r = rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "CONNECTOR" }), t({ kind: "WEEKDAY", day: 5 })]);
    expect(r).toMatchObject({ type: "range", start: { anchor: { day: 1 } }, end: { anchor: { day: 5 } } });
  });

  test("two endpoints with no connector do NOT form a range", () => {
    expect(rangeOf([t({ kind: "WEEKDAY", day: 1 }), t({ kind: "WEEKDAY", day: 5 })])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts`
Expected: FAIL — the first test finds no `range` parse (trailing-connector streams aren't parsed yet).

- [ ] **Step 3: Add the rule to the grammar**

In `packages/core/src/grammar.ts`, between the `rangeP` definition and the `topP` definition (currently `const topP: P = alt(rangeP, exprP, ...exprRules);`), insert `rangePostfixP` and extend `topP`:
```ts
  // postpositional range: "X Y CONNECTOR" — the connector trails both endpoints
  // (Kazakh "дүйсенбіден жұмаға дейін"). Locale-neutral and safe for medial-connector
  // locales: after the first exprP the second would have to start on a CONNECTOR token,
  // which exprP rejects — so en/ru "X CONNECTOR Y" never reaches this rule.
  const rangePostfixP: P = map(seq(exprP, exprP, tok("CONNECTOR")), ([a, b]) =>
    A({ type: "range", start: a.expr, end: b.expr }, a.specificity * b.specificity),
  );

  const topP: P = alt(rangeP, rangePostfixP, exprP, ...exprRules);
```
(Delete the old `const topP: P = alt(rangeP, exprP, ...exprRules);` line — it is replaced above.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/core/test/grammar-range.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Run the full suite — no regressions (the safety claim)**

Run: `pnpm vitest run && pnpm --filter @saywhen/core exec tsc --noEmit`
Expected: PASS — all 640 existing tests stay green (en/ru medial ranges like "monday to friday", "с понедельника по пятницу", "понедельник - пятница", "3 дня до 4 марта" are unaffected). Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/grammar.ts packages/core/test/grammar-range.test.ts
git commit -m "feat(core): postpositional range rule (rangePostfixP) for trailing connectors"
```

---

### Task 2: Scaffold `@saywhen/locale-kk` + the `cyrToLat` transliterator

The package skeleton plus the foundational, independently-testable transliterator. (`data.ts`/`index.ts` arrive in Tasks 3–5.)

**Files:**
- Create: `packages/locale-kk/{package.json,tsconfig.json,tsdown.config.ts}`
- Create: `packages/locale-kk/src/translit.ts`
- Test: `packages/locale-kk/test/translit.test.ts`

- [ ] **Step 1: Scaffold the package**

`packages/locale-kk/package.json`:
```json
{
  "name": "@saywhen/locale-kk",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
  },
  "peerDependencies": { "@saywhen/core": "workspace:*" },
  "devDependencies": { "@saywhen/conformance": "workspace:*", "@saywhen/core": "workspace:*" },
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit" }
}
```

`packages/locale-kk/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/locale-kk/tsdown.config.ts`:
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

- [ ] **Step 2: Write the failing test** — `packages/locale-kk/test/translit.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { cyrToLat } from "../src/translit.js";

describe("cyrToLat — Kazakh Cyrillic → 2021 Latin", () => {
  test("core date vocabulary transliterates with the expected glyphs", () => {
    expect(cyrToLat("ертең")).toBe("erteñ");
    expect(cyrToLat("апта")).toBe("apta");
    expect(cyrToLat("дүйсенбі")).toBe("düısenbi");
    expect(cyrToLat("наурыз")).toBe("nauryz");
    expect(cyrToLat("жұма")).toBe("jūma"); // ұ → ū (2021 diacritic)
    expect(cyrToLat("қыркүйек")).toBe("qyrküıek");
  });

  test("is idempotent on already-Latin input (no Cyrillic to map)", () => {
    expect(cyrToLat("apta")).toBe("apta");
  });

  test("passes through digits, spaces, and hyphens", () => {
    expect(cyrToLat("21 наурыз")).toBe("21 nauryz");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/locale-kk/test/translit.test.ts`
Expected: FAIL — `../src/translit.js` does not exist.

- [ ] **Step 4: Write `packages/locale-kk/src/translit.ts`** (complete file)

```ts
// Deterministic Kazakh Cyrillic → 2021 official Latin transliteration.
// Used for BOTH directions of the dual-script design: every Cyrillic lexicon form is
// registered alongside cyrToLat(form) as an input alias, and kkLatn.format(expr) =
// cyrToLat(kk.format(expr)). The system is internally consistent for any self-consistent
// map (see plan "internal-consistency property"); OVERRIDES is the single place to tune
// the handful of letters whose official 2021 glyph is ambiguous/loan-only — verify these
// against the official alphabet for real-world Latin-input fidelity.
const MAP: Record<string, string> = {
  а: "a", ә: "ä", б: "b", в: "v", г: "g", ғ: "ğ", д: "d", е: "e",
  ж: "j", з: "z", и: "ï", й: "ı", к: "k", қ: "q", л: "l", м: "m",
  н: "n", ң: "ñ", о: "o", ө: "ö", п: "p", р: "r", с: "s", т: "t",
  у: "u", ұ: "ū", ү: "ü", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ç",
  ш: "ş", щ: "şş", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "ıu", я: "ıa",
  ё: "ıo",
};

// Letters whose 2021 official glyph is ambiguous/loan-only — tune here, then the whole
// system (lexicon aliases + Latin output) follows automatically. Empty by default.
const OVERRIDES: Record<string, string> = {};

const TABLE: Record<string, string> = { ...MAP, ...OVERRIDES };

/** Transliterate Kazakh Cyrillic to 2021 Latin. Non-Cyrillic chars pass through. */
export function cyrToLat(s: string): string {
  let out = "";
  for (const ch of s) out += ch in TABLE ? TABLE[ch]! : ch;
  return out;
}
```

- [ ] **Step 5: Install + run to verify pass**

Run:
```bash
pnpm install
pnpm vitest run packages/locale-kk/test/translit.test.ts && pnpm --filter @saywhen/locale-kk exec tsc --noEmit
```
Expected: install links the package; 3 tests PASS; typecheck clean. (If a glyph assertion fails because your reference 2021 table differs for и/й/у, adjust `MAP`/the test together — the *mechanism* is what matters; pick one mapping and keep the test consistent with it.)

- [ ] **Step 6: Commit**

```bash
git add packages/locale-kk/package.json packages/locale-kk/tsconfig.json packages/locale-kk/tsdown.config.ts \
        packages/locale-kk/src/translit.ts packages/locale-kk/test/translit.test.ts pnpm-lock.yaml
git commit -m "feat(locale-kk): scaffold package and cyrToLat (2021 Latin) transliterator"
```

---

### Task 3: `kk` adapter — Cyrillic data, lexicon, tokenizer, formatter, forward-offset rule

Build the primary (Cyrillic-emitting) adapter end-to-end. The lexicon registers each Cyrillic form **and** its `cyrToLat` alias (dual-script input). Kazakh has no gender and keeps nouns singular after numbers, so the formatter is simpler than `ru`.

**Files:**
- Create: `packages/locale-kk/src/data.ts`, `packages/locale-kk/src/index.ts`
- Test: `packages/locale-kk/test/e2e.test.ts`
- Modify: `packages/core/test/deps.test.ts`

- [ ] **Step 1: Write the failing e2e test** — `packages/locale-kk/test/e2e.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { kk } from "../src/index.js";

const engine = createEngine({ locale: kk });
// Friday 2026-06-12 in Almaty (UTC+5, no DST); weekStart 1 (Monday), dateOrder DMY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates (kk)", () => {
  test.each([
    ["бүгін", "2026-06-12"],
    ["ертең", "2026-06-13"],
    ["бүрсігүні", "2026-06-14"],
    ["кеше", "2026-06-11"],
    ["жұма", "2026-06-12"],              // today is Friday
    ["сәрсенбі", "2026-06-17"],          // this week's Wed (06-10) passed → next
    ["келесі жұма", "2026-06-19"],
    ["өткен сәрсенбі", "2026-06-10"],
    ["дс", "2026-06-15"],                // abbreviation: next Monday
    ["21 наурыз", "2027-03-21"],         // March 21 2026 passed → next year
    ["4 наурыз 2026", "2026-03-04"],
    ["21-і", "2026-06-21"],
    ["қыркүйек", "2026-09-01"],
    ["наурызда", "2027-03-01"],          // locative month "in March"
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("Latin input is accepted under kk (dual-script)", () => {
    expect(top("erteñ").start.date).toBe("2026-06-13");
    expect(top("kelesi jūma").start.date).toBe("2026-06-19"); // cyrToLat("келесі жұма")
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-kk/test/e2e.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `packages/locale-kk/src/data.ts`** (complete file)

```ts
// Kazakh date morphology, enumerated as data (spec §4 — no stemmer; agglutinative case
// suffixes are listed surface forms). Kazakh has NO grammatical gender and keeps nouns
// singular after numerals, so this is simpler than ru: this/next/last are invariant, and
// counted units take no plural. The formatter reads the *_NOM/_ABL tables.
import type { Unit } from "@saywhen/core";

// ---------- weekdays (index 0 Sunday … 6 Saturday) ----------
// nom = canonical; abl = "-DEN" (range "from", offsets); dat = "-GE" (range "to") — all
// registered as WEEKDAY input aliases. The formatter emits nom only.
export const WEEKDAYS: Array<{ nom: string; abl: string; dat: string; abbr: string }> = [
  { nom: "жексенбі", abl: "жексенбіден", dat: "жексенбіге", abbr: "жс" },
  { nom: "дүйсенбі", abl: "дүйсенбіден", dat: "дүйсенбіге", abbr: "дс" },
  { nom: "сейсенбі", abl: "сейсенбіден", dat: "сейсенбіге", abbr: "сс" },
  { nom: "сәрсенбі", abl: "сәрсенбіден", dat: "сәрсенбіге", abbr: "ср" },
  { nom: "бейсенбі", abl: "бейсенбіден", dat: "бейсенбіге", abbr: "бс" },
  { nom: "жұма", abl: "жұмадан", dat: "жұмаға", abbr: "жм" },
  { nom: "сенбі", abl: "сенбіден", dat: "сенбіге", abbr: "сб" },
];

// ---------- months (index 0 Jan … 11 Dec) ----------
export const MONTHS_NOM = [
  "қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
  "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан",
];
/** locative "in <month>" — vowel/consonant harmony (verify against a reference) */
export const MONTHS_LOC = [
  "қаңтарда", "ақпанда", "наурызда", "сәуірде", "мамырда", "маусымда",
  "шілдеде", "тамызда", "қыркүйекте", "қазанда", "қарашада", "желтоқсанда",
];
export const MONTH_ABBR: string[][] = [
  ["қаң"], ["ақп"], ["нау"], ["сәу"], ["мам"], ["мау"],
  ["шіл"], ["там"], ["қыр"], ["қаз"], ["қар"], ["жел"],
];

// ---------- relative days ----------
// (-2 "day before yesterday" is multi-word in Kazakh — omitted in v1, see plan non-goals)
export const RELDAYS: Array<[string, number]> = [
  ["бүгін", 0], ["ертең", 1], ["бүрсігүні", 2], ["кеше", -1],
];

// ---------- this / next / last (invariant — no gender/case agreement) ----------
export const REL_FORMS: Record<"this" | "next" | "last", string[]> = {
  this: ["осы", "бұл", "мына"],
  next: ["келесі", "алдағы", "келер"],
  last: ["өткен", "былтырғы"],
};
/** formatter picks the canonical form per which */
export const REL_NOM: Record<"this" | "next" | "last", string> = {
  this: "осы", next: "келесі", last: "өткен",
};

// ---------- units ----------
// all surface forms registered as UNIT input aliases; the formatter uses NOM (and ABL for
// the forward offset "N <unit-ABL> кейін").
export const UNIT_FORMS: Record<Unit, string[]> = {
  day: ["күн", "күні", "күнде", "күннен"],
  week: ["апта", "аптада", "аптадан"],
  month: ["ай", "айда", "айдан"],
  year: ["жыл", "жылы", "жылда", "жылдан"],
  hour: ["сағат", "сағатта", "сағаттан"],
  minute: ["минут", "минутта", "минуттан"],
};
export const UNIT_NOM: Record<Unit, string> = {
  day: "күн", week: "апта", month: "ай", year: "жыл", hour: "сағат", minute: "минут",
};
export const UNIT_ABL: Record<Unit, string> = {
  day: "күннен", week: "аптадан", month: "айдан", year: "жылдан", hour: "сағаттан", minute: "минуттан",
};

// ---------- periods / seasons ----------
export const WEEKEND_FORMS = ["демалыс", "демалыста"];
export const QUARTER_FORMS = ["тоқсан", "тоқсанда", "квартал"]; // тоқсан is also "90" — legal homonym
/** formatter period nouns (REL + noun) */
export const PERIOD_NOUNS: Record<"week" | "month" | "year" | "weekend" | "quarter", string> = {
  week: "апта", month: "ай", year: "жыл", weekend: "демалыс", quarter: "тоқсан",
};
export const SEASONS: Array<{ nom: string; lexicon: string[] }> = [
  { nom: "көктем", lexicon: ["көктем", "көктемде", "көктемгі"] },
  { nom: "жаз", lexicon: ["жаз", "жазда", "жазғы"] },
  { nom: "күз", lexicon: ["күз", "күзде", "күзгі"] },
  { nom: "қыс", lexicon: ["қыс", "қыста", "қысқы"] },
];

// ---------- function words ----------
// кейін (after) and бұрын (before) are postpositional → DIRECTION; the kk forward-offset
// rule + the core relOffsetP consume them. дейін/шейін (until) → CONNECTOR (range, via the
// core rangePostfixP). "-" is also a CONNECTOR (medial dash, the canonical range form).
export const DIRECTIONS: Array<["after" | "before", string[]]> = [
  ["after", ["кейін", "соң"]],
  ["before", ["бұрын"]],
];
export const CONNECTORS = ["дейін", "шейін"];

export const MERIDIEMS: Array<["am" | "pm", string[]]> = [
  ["am", ["таңғы", "таңертеңгі"]],
  ["pm", ["кешкі", "түнгі"]],
];

/** сағат/жыл also map to UNIT — the FILLER reading lets "сағат 5", "2027 жылы" consume fully */
export const FILLERS = ["сағат", "жыл", "жылы", "күні", "де", "да"];

// ---------- numbers ----------
export const TENS: Record<string, number> = {
  жиырма: 20, отыз: 30, қырық: 40, елу: 50, алпыс: 60, жетпіс: 70, сексен: 80, тоқсан: 90,
};
export const CARDINALS: Record<string, number> = {
  бір: 1, екі: 2, үш: 3, төрт: 4, бес: 5, алты: 6, жеті: 7, сегіз: 8, тоғыз: 9, он: 10,
  ...TENS, жүз: 100,
};
export const ORDINALS: Record<string, number> = {
  бірінші: 1, екінші: 2, үшінші: 3, төртінші: 4, бесінші: 5, алтыншы: 6, жетінші: 7,
  сегізінші: 8, тоғызыншы: 9, оныншы: 10, жиырмасыншы: 20, отызыншы: 30,
};

// ---------- typing ----------
/** Kazakh Cyrillic ЙЦУКЕН rows (Kazakh letters on the number row) */
export const KEYBOARD_ROWS = ["әіңғүұқөһ", "йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];
export const TYPO_MAP: Record<string, string> = {
  ертен: "ертең", бугін: "бүгін", дуйсенбі: "дүйсенбі",
};
```

- [ ] **Step 4: Write `packages/locale-kk/src/index.ts`** (complete file — `kk` adapter)

```ts
import type {
  Anchor, DateExpr, FormatOptions, Lexicon, LocaleAdapter, LocaleRule, RawToken, SemPayload, Unit,
} from "@saywhen/core";
import { cyrToLat } from "./translit.js";
import {
  CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS, MERIDIEMS, MONTH_ABBR,
  MONTHS_LOC, MONTHS_NOM, ORDINALS, PERIOD_NOUNS, QUARTER_FORMS, RELDAYS, REL_FORMS,
  REL_NOM, SEASONS, TENS, TYPO_MAP, UNIT_ABL, UNIT_FORMS, UNIT_NOM, WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";

export { cyrToLat } from "./translit.js"; // re-exported for consumers (e.g. holidays-kk, dist smoke)

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  // register every Cyrillic surface form AND its Latin transliteration → same payload
  const add = (forms: string[], payload: SemPayload) => {
    const json = JSON.stringify(payload);
    for (const f of forms) {
      for (const g of new Set([f, cyrToLat(f)])) {
        const list = (lex[g] ??= []);
        if (!list.some((p) => JSON.stringify(p) === json)) list.push(payload);
      }
    }
  };

  WEEKDAYS.forEach((w, day) => add([w.nom, w.abl, w.dat, w.abbr], { kind: "WEEKDAY", day }));
  MONTHS_NOM.forEach((nom, month) =>
    add([nom, MONTHS_LOC[month]!, ...MONTH_ABBR[month]!], { kind: "MONTH", month }));

  for (const [form, offset] of RELDAYS) add([form], { kind: "RELDAY", offset });
  for (const which of ["this", "next", "last"] as const) add(REL_FORMS[which], { kind: "REL", which });

  for (const [unit, forms] of Object.entries(UNIT_FORMS) as Array<[Unit, string[]]>) {
    add(forms, { kind: "UNIT", unit });
  }

  for (const [word, n] of Object.entries(CARDINALS)) add([word], { kind: "NUMBER", n });
  for (const [word, n] of Object.entries(ORDINALS)) add([word], { kind: "NUMBER", n, ordinal: true });
  for (let d = 1; d <= 31; d++) add([`${d}-і`, `${d}-ші`], { kind: "NUMBER", n: d, ordinal: true });

  add(WEEKEND_FORMS, { kind: "PERIOD", period: { kind: "weekend" } });
  add(QUARTER_FORMS, { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1; q <= 4; q++) add([`тоқсан${q}`, `q${q}`], { kind: "PERIOD", period: { kind: "quarter", q: q as 1 | 2 | 3 | 4 } });
  SEASONS.forEach((s, i) => add(s.lexicon, { kind: "PERIOD", period: { kind: "season", s: i as 0 | 1 | 2 | 3 } }));

  for (const [dir, forms] of DIRECTIONS) add(forms, { kind: "DIRECTION", dir });
  add(CONNECTORS, { kind: "CONNECTOR" });
  add(["-"], { kind: "CONNECTOR" });
  add(["+", "плюс"], { kind: "OP", op: 1 });
  add(["-", "минус"], { kind: "OP", op: -1 });

  for (const [value, forms] of MERIDIEMS) add(forms, { kind: "MERIDIEM", value });
  add(["түс", "түскі"], { kind: "TIME", h: 12, m: 0 });

  add(FILLERS, { kind: "FILLER" });
  return lex;
}

const lexicon = buildLexicon();

const CYR = "а-яёәғқңөұүһі";
const LAT = "a-zäöüūıñğşç";
const TOKEN_RE = new RegExp(
  `\\d{1,4}/\\d{1,2}(?:/\\d{1,4})?|\\d{1,2}:\\d{2}|\\d+-[${CYR}${LAT}]+|\\d+[${CYR}${LAT}]+|\\d+|[${CYR}${LAT}]+\\d+|[${CYR}${LAT}]+|[+\\-]|\\S`,
  "g",
);

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (t: string, s: number) => out.push({ text: t, span: [s, s + t.length] });
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    if (!(raw in lexicon) && !(raw in TYPO_MAP)) {
      const dh = new RegExp(`^(\\d+)-([${CYR}${LAT}]+)$`).exec(raw); // "21-і" → "21" + "і"
      if (dh) { push(dh[1]!, start); push(dh[2]!, start + dh[1]!.length + 1); continue; }
      const dl = new RegExp(`^(\\d+)([${CYR}${LAT}]+)$`).exec(raw);
      const ld = new RegExp(`^([${CYR}${LAT}]+)(\\d+)$`).exec(raw);
      const split = dl ?? ld;
      if (split) { push(split[1]!, start); push(split[2]!, start + split[1]!.length); continue; }
    }
    push(raw, start);
  }
  return out;
}

// ---- Kazakh forward offset: "N <unit> кейін/бұрын" (postpositional, from now) ----
// The core has prepositional `in` and postpositional `ago` only; this supplies the missing
// postpositional forward/backward offset. Hand-written walk (core exports no combinators);
// it wins only when nothing follows the direction word — otherwise relOffsetP takes a base.
const NOW: DateExpr = { type: "anchor", anchor: { kind: "now" } };
const kkOffsetRule: LocaleRule = {
  name: "kk-postfix-offset",
  at: "expression",
  match(toks, i) {
    const skip = (j: number) => { while (j < toks.length && toks[j]?.kind === "FILLER") j++; return j; };
    let j = skip(i);
    let n = 1; // bare "аптадан кейін" (in a week) → n = 1; "2 аптадан кейін" → n = 2
    const num = toks[j];
    if (num && num.kind === "NUMBER" && !num.ordinal) { n = num.n; j = skip(j + 1); }
    const unit = toks[j];
    if (!unit || unit.kind !== "UNIT") return null;
    j = skip(j + 1);
    const dir = toks[j];
    if (!dir || dir.kind !== "DIRECTION" || (dir.dir !== "after" && dir.dir !== "before")) return null;
    return {
      expr: { type: "offset", base: NOW, n, unit: unit.unit, dir: dir.dir === "after" ? 1 : -1 },
      next: j + 1,
    };
  },
};

// ---------- formatting (canonical = Cyrillic, always re-parseable) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const count = (unit: Unit, n: number) => `${n} ${UNIT_NOM[unit]}`; // nouns stay singular
type Names = Record<string, string>;
const RELDAY_WORDS: Record<number, string> = { 0: "бүгін", 1: "ертең", 2: "бүрсігүні", [-1]: "кеше" };

function formatAnchor(a: Anchor, names: Names): string {
  switch (a.kind) {
    case "now": return "бүгін";
    case "relday": {
      const w = RELDAY_WORDS[a.offset];
      if (w) return w;
      return a.offset > 0 ? `${count("day", a.offset)} кейін` : `${count("day", -a.offset)} бұрын`;
    }
    case "weekday": {
      const w = WEEKDAYS[a.day]!;
      return a.which ? `${REL_NOM[a.which]} ${w.nom}` : w.nom;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${d} ${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `${d}-і`;
      if (m !== undefined) return `${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": {
      const name = names[a.id] ?? a.id;
      return a.year !== undefined ? `${name} ${a.year}` : name;
    }
  }
}

function format(expr: DateExpr, names: Names): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor, names);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `${expr.n} ${UNIT_ABL[expr.unit]} кейін`
          : `${count(expr.unit, expr.n)} бұрын`;
      }
      return `${format(expr.base, names)} ${expr.dir === 1 ? "+" : "-"} ${count(expr.unit, expr.n)}`;
    }
    case "range": return `${format(expr.start, names)} - ${format(expr.end, names)}`; // medial dash (rangeP)
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `${REL_NOM[expr.which]} тоқсан${p.q}`;
      if (p.kind === "season") {
        if (p.s === undefined) return `${REL_NOM[expr.which]} маусым`;
        return `${REL_NOM[expr.which]} ${SEASONS[p.s]!.nom}`;
      }
      return `${REL_NOM[expr.which]} ${PERIOD_NOUNS[p.kind]}`;
    }
    case "boundary": return `${format(expr.of, names)} ${expr.edge === "start" ? "басы" : "соңы"}`;
    case "withTime": return `${format(expr.base, names)} сағат ${expr.time.h}:${pad(expr.time.m)}`;
  }
}

// accessible phrasing (natural; need not re-parse) — postpositional, declined endpoints
function accessible(expr: DateExpr, names: Names): string {
  switch (expr.type) {
    case "range": {
      const abl = (e: DateExpr) =>
        e.type === "anchor" && e.anchor.kind === "weekday" ? WEEKDAYS[e.anchor.day]!.abl : accessible(e, names);
      const dat = (e: DateExpr) =>
        e.type === "anchor" && e.anchor.kind === "weekday" ? WEEKDAYS[e.anchor.day]!.dat : accessible(e, names);
      return `${abl(expr.start)} ${dat(expr.end)} дейін`;
    }
    case "offset":
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1 ? `${expr.n} ${UNIT_ABL[expr.unit]} кейін` : `${count(expr.unit, expr.n)} бұрын`;
      }
      return `${accessible(expr.base, names)} ${expr.dir === 1 ? "кейін" : "бұрын"} ${count(expr.unit, expr.n)}`;
    case "withTime": return `${accessible(expr.base, names)} сағат ${expr.time.h}:${pad(expr.time.m)}`;
    default: return format(expr, names);
  }
}

function parseNumber(words: string[]): number | null {
  const value = (w: string): number | null =>
    CARDINALS[w] ?? ORDINALS[w] ?? (/^\d+$/.test(w) ? Number(w) : null);
  if (words.length === 1) return value(words[0]!);
  if (words.length === 2) {
    const tens = TENS[words[0]!];
    const unit = CARDINALS[words[1]!] ?? ORDINALS[words[1]!];
    if (tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9) return tens + unit;
  }
  return null;
}

export const kk: LocaleAdapter = {
  id: "kk",
  tokenize,
  lexicon,
  parseNumber,
  rules: [kkOffsetRule],
  format: (expr, opts: FormatOptions) => format(expr, opts.holidayNames ?? {}),
  formatAccessible: (expr, opts: FormatOptions) => accessible(expr, opts.holidayNames ?? {}),
  keyboard: { rows: KEYBOARD_ROWS },
  typoMap: TYPO_MAP,
  defaults: { weekStart: 1, dateOrder: "DMY" },
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/locale-kk/test/e2e.test.ts && pnpm --filter @saywhen/locale-kk exec tsc --noEmit`
Expected: PASS — single-date cases (incl. Latin input) green; typecheck clean. If a date is off, the most likely cause is a weekday/month surface form or a locative; fix the `data.ts` string (not the test's expected date, which is derived from the fixed clock).

- [ ] **Step 6: Add `locale-kk` to the deps guard**

In `packages/core/test/deps.test.ts`, change the `test.each` array to include `locale-kk`:
```ts
  test.each(["locale-en", "locale-ru", "locale-kk", "holidays-us", "holidays-ru"])(
```

- [ ] **Step 7: Run the deps guard + commit**

Run: `pnpm vitest run packages/core/test/deps.test.ts`
Expected: PASS — `locale-kk` has empty `dependencies` and peer `["@saywhen/core"]`.

```bash
git add packages/locale-kk/src/data.ts packages/locale-kk/src/index.ts \
        packages/locale-kk/test/e2e.test.ts packages/core/test/deps.test.ts
git commit -m "feat(locale-kk): kk adapter — Cyrillic data, dual-script lexicon, formatter, offset rule"
```

---

### Task 4: `kk` parsing — relative, periods, ranges, time

Cover the rest of the parse surface against the adapter from Task 3 (these exercise the forward-offset locale rule, the `rangePostfixP` core rule, periods/seasons, and time). If any case fails, it is a data/wiring bug in `index.ts`/`data.ts` to fix — not a test to weaken.

**Files:**
- Test: `packages/locale-kk/test/e2e.test.ts` (append)

- [ ] **Step 1: Append the failing test cases**

Append to `packages/locale-kk/test/e2e.test.ts`:
```ts
describe("relative, periods, ranges, time (kk)", () => {
  test.each([
    ["2 аптадан кейін", "2026-06-26", "2026-06-26"],
    ["аптадан кейін", "2026-06-19", "2026-06-19"],       // bare unit → n = 1
    ["бір аптадан кейін", "2026-06-19", "2026-06-19"],
    ["2 апта бұрын", "2026-05-29", "2026-05-29"],
    ["осы апта", "2026-06-08", "2026-06-14"],             // Monday weeks
    ["келесі апта", "2026-06-15", "2026-06-21"],
    ["келесі ай", "2026-07-01", "2026-07-31"],
    ["осы демалыс", "2026-06-13", "2026-06-14"],
    ["жаз", "2026-06-01", "2026-08-31"],                 // this summer
    ["дүйсенбіден жұмаға дейін", "2026-06-15", "2026-06-19"], // postpositional range (core rule)
    ["дүйсенбі - жұма", "2026-06-15", "2026-06-19"],          // dash range (canonical form)
    ["келесі жұма + 2 апта", "2026-07-03", "2026-07-03"],
  ])("'%s' → %s..%s", (text, start, end) => {
    const c = top(text);
    expect(c.start.date).toBe(start);
    expect(c.end.date).toBe(end);
  });
});

describe("times (Almaty = UTC+5)", () => {
  test.each([
    ["жұма сағат 17:30", "2026-06-12T12:30:00.000Z"],
    ["ертең түс", "2026-06-13T07:00:00.000Z"],            // noon
    ["дүйсенбі сағат 9:30", "2026-06-15T04:30:00.000Z"],
  ])("'%s' → %s", (text, iso) => {
    expect(top(text).start.utcIso).toBe(iso);
  });
});
```

- [ ] **Step 2: Run to verify**

Run: `pnpm vitest run packages/locale-kk/test/e2e.test.ts`
Expected: PASS — all cases. The postpositional range relies on Task 1's `rangePostfixP`; the forward offset relies on `kkOffsetRule`. A failure on `"2 аптадан кейін"` means the offset rule or the `аптадан` UNIT alias is wrong; a failure on the range means `дейін` isn't a CONNECTOR or `жұмаға`/`дүйсенбіден` aren't WEEKDAY aliases.

- [ ] **Step 3: Commit**

```bash
git add packages/locale-kk/test/e2e.test.ts
git commit -m "test(locale-kk): relative, periods, postpositional ranges, time"
```

---

### Task 5: `kkLatn` adapter — Latin-output sibling

The second adapter: same shared data, same input (both scripts), but canonical output in 2021 Latin. `kkLatn.format(expr) = cyrToLat(kk's Cyrillic format)` — so the two can't drift, and every Latin string it emits is itself a lexicon alias (re-parseable under both adapters).

**Files:**
- Modify: `packages/locale-kk/src/index.ts` (add `kkLatn` export)
- Test: `packages/locale-kk/test/latin.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/locale-kk/test/latin.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { createEngine, type DateExpr, type ParseContext } from "@saywhen/core";
import { kk, kkLatn } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const CTX: ParseContext = { now: OPTS.now, timeZone: "Asia/Almaty" };
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);
const latnEngine = createEngine({ locale: kkLatn });

describe("kkLatn — Latin canonical output", () => {
  test("distinct id", () => {
    expect(kkLatn.id).toBe("kk-latn");
  });

  test("format emits Latin (= transliteration of the Cyrillic form)", () => {
    const nextFri = A({ kind: "weekday", day: 5, which: "next" });
    expect(kk.format(nextFri, OPTS)).toBe("келесі жұма");           // Cyrillic adapter
    expect(kkLatn.format(A({ kind: "relday", offset: 1 }), OPTS)).toBe("erteñ");
    expect(kkLatn.format(nextFri, OPTS)).toBe("kelesi jūma");       // Latin adapter (ұ → ū)
    expect(kkLatn.format(A({ kind: "calendar", m: 2, d: 21 }), OPTS)).toBe("21-i");
  });

  test("its own canonical output re-parses (round-trip)", () => {
    const text = kkLatn.format(A({ kind: "weekday", day: 1, which: "next" }), OPTS); // "kelesi düısenbi"
    const r = latnEngine.parse(text, CTX);
    expect(r.candidates[0]!.start.date).toBe("2026-06-15");
  });

  test("accepts Cyrillic input too (union lexicon)", () => {
    expect(latnEngine.parse("ертең", CTX).candidates[0]!.start.date).toBe("2026-06-13");
    expect(latnEngine.parse("erteñ", CTX).candidates[0]!.start.date).toBe("2026-06-13");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-kk/test/latin.test.ts`
Expected: FAIL — `kkLatn` is not exported.

- [ ] **Step 3: Add the `kkLatn` export to `packages/locale-kk/src/index.ts`**

After the `export const kk: LocaleAdapter = { … };` block, add:
```ts
// Latin-emitting sibling: same shared data and union input lexicon; only the canonical
// output script differs. Output = cyrToLat of kk's Cyrillic format, so the two never drift
// and every emitted Latin string is itself a lexicon alias (re-parseable under both).
export const kkLatn: LocaleAdapter = {
  ...kk,
  id: "kk-latn",
  format: (expr, opts: FormatOptions) => cyrToLat(format(expr, opts.holidayNames ?? {})),
  formatAccessible: (expr, opts: FormatOptions) => cyrToLat(accessible(expr, opts.holidayNames ?? {})),
};
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `pnpm vitest run packages/locale-kk/test/latin.test.ts && pnpm --filter @saywhen/locale-kk exec tsc --noEmit`
Expected: PASS — 4 tests; typecheck clean. (`21-i` assumes `cyrToLat("і") = "i"`; if your `OVERRIDES` map `і`/`и` differently, align the expected string with `cyrToLat`.)

- [ ] **Step 5: Commit**

```bash
git add packages/locale-kk/src/index.ts packages/locale-kk/test/latin.test.ts
git commit -m "feat(locale-kk): kkLatn adapter (2021 Latin canonical output)"
```

---

### Task 6: Formatter unit tests (`format` + `formatAccessible`)

Pin the canonical (Cyrillic) and accessible phrasings. These guard re-parseability and the postpositional accessible forms.

**Files:**
- Test: `packages/locale-kk/test/format.test.ts`, `packages/locale-kk/test/accessible.test.ts`

- [ ] **Step 1: Write the format test** — `packages/locale-kk/test/format.test.ts`

```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { kk } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const fmt = (expr: DateExpr) => kk.format(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("kk canonical format (re-parseable)", () => {
  test("anchors", () => {
    expect(fmt(A({ kind: "relday", offset: 2 }))).toBe("бүрсігүні");
    expect(fmt(A({ kind: "relday", offset: -1 }))).toBe("кеше");
    expect(fmt(A({ kind: "relday", offset: 5 }))).toBe("5 күн кейін");
    expect(fmt(A({ kind: "weekday", day: 5, which: "next" }))).toBe("келесі жұма");
    expect(fmt(A({ kind: "weekday", day: 1 }))).toBe("дүйсенбі");
    expect(fmt(A({ kind: "calendar", y: 2027, m: 2, d: 21 }))).toBe("21 наурыз 2027");
    expect(fmt(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 наурыз");
    expect(fmt(A({ kind: "calendar", d: 21 }))).toBe("21-і");
    expect(fmt(A({ kind: "calendar", m: 8 }))).toBe("қыркүйек");
  });

  test("offsets, periods, ranges, time", () => {
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("2 аптадан кейін");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 3, unit: "day", dir: -1 })).toBe("3 күн бұрын");
    expect(fmt({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("келесі жұма + 2 апта");
    expect(fmt({ type: "period", period: { kind: "week" }, which: "next" })).toBe("келесі апта");
    expect(fmt({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("осы демалыс");
    expect(fmt({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("осы жаз");
    expect(fmt({
      type: "range",
      start: A({ kind: "weekday", day: 1 }),
      end: A({ kind: "weekday", day: 5 }),
    })).toBe("дүйсенбі - жұма");
    expect(fmt({ type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 30 } }))
      .toBe("жұма сағат 17:30");
  });
});
```

- [ ] **Step 2: Write the accessible test** — `packages/locale-kk/test/accessible.test.ts`

```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { kk } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const acc = (expr: DateExpr) => kk.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("kk formatAccessible (natural, postpositional)", () => {
  test("offsets and ranges decline endpoints", () => {
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("2 аптадан кейін");
    expect(acc({
      type: "range",
      start: A({ kind: "weekday", day: 1 }),
      end: A({ kind: "weekday", day: 5 }),
    })).toBe("дүйсенбіден жұмаға дейін");
  });

  test("anchors read naturally", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("ертең");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("келесі жұма");
  });
});
```

- [ ] **Step 3: Run to verify pass**

Run: `pnpm vitest run packages/locale-kk/test/format.test.ts packages/locale-kk/test/accessible.test.ts`
Expected: PASS — both files pin the existing formatter behavior.

- [ ] **Step 4: Commit**

```bash
git add packages/locale-kk/test/format.test.ts packages/locale-kk/test/accessible.test.ts
git commit -m "test(locale-kk): canonical and accessible formatter coverage"
```

---

### Task 7: Round-trip property test (both adapters)

`format → parse → identical resolved dates`, 300 fast-check runs per adapter — the strongest re-parseability guard. Boundaries are excluded from the arbitrary (postpositional boundaries are a deferred fast-follow; see non-goals).

**Files:**
- Test: `packages/locale-kk/test/roundtrip.property.test.ts`

- [ ] **Step 1: Write the property test** — `packages/locale-kk/test/roundtrip.property.test.ts`

```ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { createEngine, resolveExpr, type DateExpr, type LocaleAdapter, type ParseContext, type Wall } from "@saywhen/core";
import { kk, kkLatn } from "../src/index.js";

const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty", allowPast: true };
const RESOLVE = { now: CTX.now, timeZone: CTX.timeZone, weekStart: 1 as const, allowPast: true };
const wallDate = (w: Wall) => `${w.y}-${String(w.m + 1).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;

const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);
const relArb = fc.constantFrom("this", "next", "last");
const unitArb = fc.constantFrom("day", "week", "month", "year");

const anchorArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
  fc.record({
    m: fc.integer({ min: 0, max: 11 }), d: fc.integer({ min: 1, max: 28 }),
    y: fc.option(fc.integer({ min: 2025, max: 2030 }), { nil: undefined }),
  }).map(({ m, d, y }) => A({ kind: "calendar", m, d, ...(y !== undefined ? { y } : {}) })),
  fc.integer({ min: 1, max: 28 }).map((d) => A({ kind: "calendar", d })),
  fc.integer({ min: 0, max: 11 }).map((m) => A({ kind: "calendar", m })),
);
const periodArb: fc.Arbitrary<DateExpr> = fc.record({
  period: fc.oneof(
    fc.constantFrom({ kind: "week" }, { kind: "month" }, { kind: "year" }, { kind: "weekend" }),
    fc.integer({ min: 1, max: 4 }).map((q) => ({ kind: "quarter", q })),
    fc.integer({ min: 0, max: 3 }).map((s) => ({ kind: "season", s })),
  ),
  which: relArb,
}).map(({ period, which }) => ({ type: "period", period, which } as DateExpr));
const offsetArb: fc.Arbitrary<DateExpr> = fc.record({
  base: fc.oneof(anchorArb, fc.constant(A({ kind: "now" }))),
  n: fc.integer({ min: 1, max: 12 }), unit: unitArb, dir: fc.constantFrom(1, -1),
}).map((o) => ({ type: "offset", ...o } as DateExpr));
const rangeArb: fc.Arbitrary<DateExpr> = fc.record({ start: anchorArb, end: anchorArb })
  .map(({ start, end }) => ({ type: "range", start, end } as DateExpr));
const pointArb: fc.Arbitrary<DateExpr> = fc.oneof(
  fc.integer({ min: -1, max: 1 }).map((offset) => A({ kind: "relday", offset })),
  fc.record({ day: fc.integer({ min: 0, max: 6 }), which: fc.option(relArb, { nil: undefined }) })
    .map(({ day, which }) => A({ kind: "weekday", day, ...(which ? { which } : {}) })),
);
const withTimeArb: fc.Arbitrary<DateExpr> = fc.record({
  base: pointArb, time: fc.record({ h: fc.integer({ min: 0, max: 23 }), m: fc.constantFrom(0, 15, 30, 45) }),
}).map(({ base, time }) => ({ type: "withTime", base, time } as DateExpr));

// boundaries excluded — postpositional boundaries are a deferred fast-follow (non-goals)
const exprArb = fc.oneof(anchorArb, periodArb, offsetArb, rangeArb, withTimeArb);

describe.each([["kk", kk], ["kk-latn", kkLatn]] as Array<[string, LocaleAdapter]>)(
  "round-trip property — %s",
  (_id, locale) => {
    const engine = createEngine({ locale });
    test("format → parse → identical resolved dates", () => {
      fc.assert(
        fc.property(exprArb, (expr) => {
          const expected = resolveExpr(expr, RESOLVE);
          fc.pre(expected.ok);
          const text = locale.format(expr, { now: CTX.now, timeZone: CTX.timeZone });
          const r = engine.parse(text, CTX);
          expect(r.candidates.length, `no parse for "${text}" (${JSON.stringify(expr)})`).toBeGreaterThan(0);
          const top = r.candidates[0]!;
          expect(top.start.date, `start of "${text}"`).toBe(wallDate(expected.value.start));
          expect(top.end.date, `end of "${text}"`).toBe(wallDate(expected.value.end));
        }),
        { numRuns: 300 },
      );
    });
  },
);
```

- [ ] **Step 2: Run to verify pass**

Run: `pnpm vitest run packages/locale-kk/test/roundtrip.property.test.ts`
Expected: PASS — 600 generated cases (300 per adapter). A failure prints the offending expr/text; the fix is in `format`/`data.ts` (a non-re-parseable surface form), never the test.

- [ ] **Step 3: Commit**

```bash
git add packages/locale-kk/test/roundtrip.property.test.ts
git commit -m "test(locale-kk): 300-run round-trip property for kk and kkLatn"
```

---

### Task 8: Conformance (both scripts), suggestions, build

The shared conformance harness proves pluggability — run it for **each** adapter (Cyrillic seeds for `kk`, the same phrases transliterated for `kkLatn`). Then the generated-suggestions smoke and the build/dist smoke.

**Files:**
- Test: `packages/locale-kk/test/conformance.test.ts`, `packages/locale-kk/test/suggest.test.ts`

- [ ] **Step 1: Write the conformance test** — `packages/locale-kk/test/conformance.test.ts`

```ts
import { runLocaleConformance, type ConformanceSeed } from "@saywhen/conformance";
import { kk, kkLatn } from "../src/index.js";
import { cyrToLat } from "../src/translit.js";

// Cyrillic seeds under the fixed conformance clock (Fri 2026-06-12, America/New_York) with
// kk's Monday weekStart. The Latin seeds are the same phrases through cyrToLat (DRY) — proving
// both scripts resolve identically.
const SEEDS: ConformanceSeed[] = [
  { text: "бүгін", start: "2026-06-12" },
  { text: "ертең", start: "2026-06-13" },
  { text: "сәрсенбі", start: "2026-06-17" },
  { text: "келесі жұма", start: "2026-06-19" },
  { text: "21 наурыз", start: "2027-03-21" },
  { text: "4 наурыз 2026", start: "2026-03-04" },
  { text: "қыркүйек", start: "2026-09-01" },
  { text: "2 аптадан кейін", start: "2026-06-26" },
  { text: "келесі жұма + 2 апта", start: "2026-07-03" },
  { text: "келесі апта", start: "2026-06-15", end: "2026-06-21" },
  { text: "осы демалыс", start: "2026-06-13", end: "2026-06-14" },
  { text: "дүйсенбіден жұмаға дейін", start: "2026-06-15", end: "2026-06-19" },
];

runLocaleConformance({ locale: kk, seeds: SEEDS });
runLocaleConformance({
  locale: kkLatn,
  seeds: SEEDS.map((s) => ({ ...s, text: cyrToLat(s.text) })),
});
```

- [ ] **Step 2: Write the suggest test** — `packages/locale-kk/test/suggest.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { createSuggest, type SuggestContext, type SuggestResult } from "@saywhen/core/suggest";
import { kk } from "../src/index.js";

const sug = createSuggest({ locale: kk });
const CTX: SuggestContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const texts = (r: SuggestResult) => r.suggestions.map((s) => s.text);

describe("suggest e2e (kk)", () => {
  test("starters render in Kazakh, tomorrow first", () => {
    const r = sug.suggest("", CTX);
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions[0]!.text).toBe("ертең");
    expect(r.suggestions[0]!.start.date).toBe("2026-06-13");
  });

  test("'ер' → ертең with ghost", () => {
    const r = sug.suggest("ер", CTX);
    expect(r.suggestions[0]!.text).toBe("ертең");
    expect(r.ghost).toBe("тең");
  });

  test("weekday prefix completes: 'келесі ж' → келесі жұма", () => {
    expect(texts(sug.suggest("келесі ж", CTX))).toContain("келесі жұма");
  });
});
```

- [ ] **Step 3: Run to verify pass + typecheck the package**

Run: `pnpm vitest run packages/locale-kk && pnpm --filter @saywhen/locale-kk exec tsc --noEmit`
Expected: PASS — conformance for both adapters (semantic contract + must-pass matrix + fuzzy ≥ 0.7), suggest starters/ghost, and all earlier `kk` files; typecheck clean. If a Latin conformance must-pass case fails, the cause is a tokenizer gap for a Latin-diacritic run — widen the `LAT` class in `index.ts`.

- [ ] **Step 4: Build + dist smoke**

Run:
```bash
pnpm --filter @saywhen/locale-kk build
node --input-type=module -e "const m = await import('./packages/locale-kk/dist/index.js'); if (m.kk?.id !== 'kk' || m.kkLatn?.id !== 'kk-latn' || typeof m.cyrToLat !== 'function') throw new Error('locale-kk dist exports'); console.log('locale-kk dist OK');"
```
Expected: build succeeds; prints `locale-kk dist OK`. (`cyrToLat` is re-exported from `index.ts` — add `export { cyrToLat } from "./translit.js";` at the top of `index.ts` if not already present.)

- [ ] **Step 5: Commit**

```bash
git add packages/locale-kk/test/conformance.test.ts packages/locale-kk/test/suggest.test.ts packages/locale-kk/src/index.ts
git commit -m "test(locale-kk): dual-script conformance + generated suggestions; build smoke"
```

---

### Task 9: `@saywhen/holidays-kk` — pack, Kurban Ait, compute tests

Mirror `holidays-ru`: fixed-date entries plus one bounded lookup (`kurbanAit`). Names carry four keys (`kk`, `kk-latn`, `ru`, `en`) so each adapter resolves native names.

**Files:**
- Create: `packages/holidays-kk/{package.json,tsconfig.json,tsdown.config.ts}`
- Create: `packages/holidays-kk/src/index.ts`
- Test: `packages/holidays-kk/test/compute.test.ts`
- Modify: `packages/core/test/deps.test.ts`

- [ ] **Step 1: Scaffold**

`packages/holidays-kk/package.json`:
```json
{
  "name": "@saywhen/holidays-kk",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
  },
  "peerDependencies": { "@saywhen/core": "workspace:*" },
  "devDependencies": {
    "@saywhen/core": "workspace:*",
    "@saywhen/locale-kk": "workspace:*",
    "@saywhen/locale-en": "workspace:*"
  },
  "scripts": { "build": "tsdown", "typecheck": "tsc --noEmit" }
}
```

`packages/holidays-kk/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/holidays-kk/tsdown.config.ts`:
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

- [ ] **Step 2: Write the failing compute test** — `packages/holidays-kk/test/compute.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { cyrToLat } from "@saywhen/locale-kk";
import { kk, kurbanAit } from "../src/index.js";

describe("kurbanAit (bounded lookup)", () => {
  test.each([
    [2026, 4, 27],
    [2027, 4, 16],
    [2030, 3, 13],
  ])("%i → m=%i d=%i", (y, m, d) => {
    expect(kurbanAit(y)).toEqual({ m, d });
  });
  test("null outside the tabulated range", () => {
    expect(kurbanAit(2019)).toBeNull();
    expect(kurbanAit(2100)).toBeNull();
  });
});

describe("entries", () => {
  const get = (id: string) => kk.entries.find((e) => e.id === id)!;
  test("fixed dates", () => {
    expect(get("victory-day").compute(2026)).toEqual({ m: 4, d: 9 });
    expect(get("nauryz").compute(2026)).toEqual({ m: 2, d: 22 });
    expect(get("independence-day").compute(2026)).toEqual({ m: 11, d: 16 });
  });
  test("every entry has kk, kk-latn, ru, en names", () => {
    for (const e of kk.entries) {
      expect(e.names.kk?.length, e.id).toBeGreaterThan(0);
      expect(e.names["kk-latn"]?.length, e.id).toBeGreaterThan(0);
      expect(e.names.ru?.length, e.id).toBeGreaterThan(0);
      expect(e.names.en?.length, e.id).toBeGreaterThan(0);
    }
  });
  test("kk-latn canonical name = cyrToLat(kk canonical name)", () => {
    for (const e of kk.entries) {
      expect(e.names["kk-latn"]![0], e.id).toBe(cyrToLat(e.names.kk![0]!));
    }
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm install && pnpm vitest run packages/holidays-kk/test/compute.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 4: Write `packages/holidays-kk/src/index.ts`** (complete file)

```ts
import type { HolidayPack } from "@saywhen/core";

const fixed = (m: number, d: number) => () => ({ m, d });

/**
 * Kurban Ait (Eid al-Adha, 10 Dhu al-Hijjah) as officially observed in Kazakhstan.
 * Lunar — the Gregorian date is set by sighting/decree, so it is tabulated rather than
 * computed (spec §6). Bounded; returns null outside the table → the engine drops the
 * candidate with an explanatory error (spec §4.5 / §8). Extend the table as new years are
 * declared, and VERIFY each entry against the official Kazakhstan holiday calendar (±1 day).
 */
export function kurbanAit(year: number): { m: number; d: number } | null {
  const TABLE: Record<number, [number, number]> = {
    2023: [5, 28], 2024: [5, 16], 2025: [5, 6], 2026: [4, 27],
    2027: [4, 16], 2028: [4, 5], 2029: [3, 24], 2030: [3, 13],
  };
  const hit = TABLE[year];
  return hit ? { m: hit[0], d: hit[1] } : null;
}

// kk = Cyrillic canonical (first), kk-latn = Latin canonical (first) = cyrToLat of it.
// The kk adapter resolves Cyrillic names; kkLatn resolves Latin (cross-script holiday-name
// input is a deferred fast-follow — the general date grammar is already dual-script).
export const kk: HolidayPack = {
  id: "kk",
  entries: [
    { id: "new-year", compute: fixed(0, 1),
      names: { kk: ["жаңа жыл"], "kk-latn": ["jaña jyl"], ru: ["новый год"], en: ["new year's day", "new year"] } },
    { id: "orthodox-christmas", compute: fixed(0, 7),
      names: { kk: ["рождество"], "kk-latn": ["rojdestvo"], ru: ["рождество"], en: ["orthodox christmas"] } },
    { id: "intl-womens-day", compute: fixed(2, 8),
      names: { kk: ["әйелдер күні"], "kk-latn": ["äıelder küni"], ru: ["женский день"], en: ["international women's day", "women's day"] } },
    { id: "nauryz", compute: fixed(2, 22),
      names: { kk: ["наурыз", "наурыз мейрамы"], "kk-latn": ["nauryz", "nauryz meıramy"], ru: ["наурыз"], en: ["nauryz"] } },
    { id: "unity-day", compute: fixed(4, 1),
      names: { kk: ["бірлік күні"], "kk-latn": ["birlik küni"], ru: ["день единства народа казахстана"], en: ["people's unity day", "unity day"] } },
    { id: "defenders-day", compute: fixed(4, 7),
      names: { kk: ["отан қорғаушы күні"], "kk-latn": ["otan qorğaushy küni"], ru: ["день защитника отечества"], en: ["defenders day"] } },
    { id: "victory-day", compute: fixed(4, 9),
      names: { kk: ["жеңіс күні"], "kk-latn": ["jeñis küni"], ru: ["день победы"], en: ["victory day"] } },
    { id: "capital-day", compute: fixed(6, 6),
      names: { kk: ["астана күні"], "kk-latn": ["astana küni"], ru: ["день столицы"], en: ["capital day", "astana day"] } },
    { id: "constitution-day", compute: fixed(7, 30),
      names: { kk: ["конституция күні"], "kk-latn": ["konstıtutsıa küni"], ru: ["день конституции"], en: ["constitution day"] } },
    { id: "republic-day", compute: fixed(9, 25),
      names: { kk: ["республика күні"], "kk-latn": ["respublıka küni"], ru: ["день республики"], en: ["republic day"] } },
    { id: "independence-day", compute: fixed(11, 16),
      names: { kk: ["тәуелсіздік күні"], "kk-latn": ["täuelsizdik küni"], ru: ["день независимости"], en: ["independence day"] } },
    { id: "kurban-ait", compute: kurbanAit,
      names: { kk: ["құрбан айт"], "kk-latn": ["qūrban aıt"], ru: ["курбан айт"], en: ["kurban ait", "eid al-adha"] } },
  ],
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/holidays-kk/test/compute.test.ts && pnpm --filter @saywhen/holidays-kk exec tsc --noEmit`
Expected: PASS. If the `cyrToLat` consistency test fails, fix the `kk-latn` name to exactly `cyrToLat(<kk name>)` (run `cyrToLat` mentally or in a scratch test) — the transliterator is the source of truth.

- [ ] **Step 6: Add `holidays-kk` to the deps guard**

In `packages/core/test/deps.test.ts`, extend the array:
```ts
  test.each(["locale-en", "locale-ru", "locale-kk", "holidays-us", "holidays-ru", "holidays-kk"])(
```

- [ ] **Step 7: Run the guard + commit**

Run: `pnpm vitest run packages/core/test/deps.test.ts`
Expected: PASS — `holidays-kk` has empty `dependencies` and peer `["@saywhen/core"]`.

```bash
git add packages/holidays-kk/package.json packages/holidays-kk/tsconfig.json packages/holidays-kk/tsdown.config.ts \
        packages/holidays-kk/src/index.ts packages/holidays-kk/test/compute.test.ts \
        packages/core/test/deps.test.ts pnpm-lock.yaml
git commit -m "feat(holidays-kk): Kazakh holiday pack with bounded Kurban Ait lookup"
```

---

### Task 10: `holidays-kk` end-to-end

Resolve holidays through the engine: roll-forward, grammar composition, canonical re-parse, out-of-range invalids, and cross-language/cross-script name resolution.

**Files:**
- Test: `packages/holidays-kk/test/e2e.test.ts`

- [ ] **Step 1: Write the failing e2e test** — `packages/holidays-kk/test/e2e.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { createEngine, type Engine, type ParseContext } from "@saywhen/core";
import { kk as kkLocale, kkLatn } from "@saywhen/locale-kk";
import { en } from "@saywhen/locale-en";
import { kk as kkHolidays } from "../src/index.js";

const engine = createEngine({ locale: kkLocale, holidays: [kkHolidays] });
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Asia/Almaty" };
const top = (text: string, e: Engine = engine, ctx: ParseContext = CTX) => {
  const r = e.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("KK holidays resolve and roll forward (kk)", () => {
  test.each([
    ["жаңа жыл", "2027-01-01"],
    ["рождество", "2027-01-07"],
    ["наурыз", "2027-03-22"],          // Mar 22 2026 passed
    ["жеңіс күні", "2027-05-09"],
    ["тәуелсіздік күні", "2026-12-16"],
    ["құрбан айт", "2027-05-16"],       // May 27 2026 passed → 2027
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("composes with the grammar (dash range over holidays)", () => {
    // dash range uses nominative names + medial CONNECTOR (no inflected holiday forms needed;
    // postpositional holiday ranges like "жаңа жылдан рождествоға дейін" are a deferred fast-follow)
    const r = top("жаңа жыл - рождество");
    expect(r.start.date).toBe("2027-01-01");
    expect(r.end.date).toBe("2027-01-07");
  });

  test("canonical text uses the first kk alias and re-parses", () => {
    expect(top("наурыз мейрамы").text).toBe("наурыз");
    expect(top(top("наурыз").text).start.date).toBe("2027-03-22");
  });

  test("Kurban Ait outside the table → invalid with explanation", () => {
    const r = engine.parse("құрбан айт 2100", CTX);
    expect(r.status).toBe("invalid");
    expect(r.errors[0]).toMatch(/no date for holiday/i);
  });
});

describe("region ≠ language and dual script", () => {
  const enEngine = createEngine({ locale: en, holidays: [kkHolidays] });
  const NY: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "America/New_York" };
  const latnEngine = createEngine({ locale: kkLatn, holidays: [kkHolidays] });

  test("English names on Kazakh dates", () => {
    expect(top("victory day", enEngine, NY).start.date).toBe("2027-05-09");
    expect(top("nauryz", enEngine, NY).start.date).toBe("2027-03-22");
  });

  test("Latin holiday names under kkLatn", () => {
    expect(top("jeñis küni", latnEngine).start.date).toBe("2027-05-09");
  });
});
```

- [ ] **Step 2: Run to verify pass**

Run: `pnpm vitest run packages/holidays-kk/test/e2e.test.ts`
Expected: PASS. (Multi-word names like "құрбан айт", "наурыз мейрамы", "жеңіс күні" rely on the core's phrase-merge — confirmed working for `holidays-ru` "день победы". The dash range uses nominative holiday names + the medial `-` CONNECTOR, so no inflected holiday forms are needed.)

- [ ] **Step 3: Build + dist smoke + commit**

Run:
```bash
pnpm --filter @saywhen/holidays-kk build
node --input-type=module -e "const m = await import('./packages/holidays-kk/dist/index.js'); if (m.kk?.id !== 'kk' || typeof m.kurbanAit !== 'function') throw new Error('holidays-kk dist'); console.log('holidays-kk dist OK');"
```
Expected: build succeeds; prints `holidays-kk dist OK`.

```bash
git add packages/holidays-kk/test/e2e.test.ts
git commit -m "test(holidays-kk): roll-forward, composition, cross-language and dual-script e2e"
```

---

### Task 11: Whole-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all suites pass + 1 ORACLE-gated skip. New since plan 06: grammar-range (3), translit (3), locale-kk e2e (~30), latin (4), format/accessible (~5), roundtrip (2 props = 600 cases), conformance (two adapters × full matrix), suggest (3), holidays-kk compute (~5) + e2e (~10) — roughly **+70 tests** over the 640 baseline. The pre-existing `locale-en` perf test is timing-sensitive: if it flags on a cold run, re-run it alone (`pnpm vitest run packages/locale-en/test/perf.test.ts`) to confirm it's warm-cache flakiness, not a regression.

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: clean — the root script globs `./packages/*` (so `locale-kk` and `holidays-kk` are included) plus `./tools/*`, `./apps/*`, `./registry`.

- [ ] **Step 3: Build all publishable packages + dist smokes**

Run:
```bash
pnpm build
node --input-type=module -e "const m = await import('./packages/locale-kk/dist/index.js'); if (m.kk?.id !== 'kk' || m.kkLatn?.id !== 'kk-latn') throw new Error('locale-kk dist'); console.log('locale-kk OK');"
node --input-type=module -e "const m = await import('./packages/holidays-kk/dist/index.js'); if (typeof m.kurbanAit !== 'function') throw new Error('holidays-kk dist'); console.log('holidays-kk OK');"
```
Expected: every package builds (`pnpm build` globs `./packages/*`, so it now builds `locale-kk` + `holidays-kk` too); both dist smokes print OK.

- [ ] **Step 4: Confirm clean tree**

Run: `git status --short`
Expected: clean (dist is gitignored).

---

## Done — definition of success for plan 07

- **`@saywhen/locale-kk`** ships two adapters from one shared data source: `kk` (Cyrillic canonical output) and `kkLatn` (2021 Latin canonical output = `cyrToLat ∘ kk.format`). Both accept **either script** on input (union lexicon: every Cyrillic form + its `cyrToLat` alias). Full Kazakh date surface — reldays, weekdays ± this/next/last, calendar dates, months (incl. locative), ordinals, **postpositional unit offsets** (`кейін`/`бұрын` via the `kkOffsetRule`), periods, seasons, **postpositional ranges** (`дейін`, via the new core rule) and the dash canonical form, and time.
- **`@saywhen/holidays-kk`** resolves 11 fixed holidays + Kurban Ait (bounded lookup, `null`-outside-range with an explanatory invalid), names in `kk`/`kk-latn`/`ru`/`en`, working cross-language (en locale + kk pack) and cross-script (kkLatn + Latin names).
- **One core change only:** `rangePostfixP` (spec §2.1), locale-neutral, with an en/ru regression test — the existing 640 tests stay green.
- Shared `@saywhen/conformance` passes **unchanged** for each adapter (the dual-script pluggability proof); 300-run round-trip per adapter; full repo suite + typecheck + builds + dist smokes green.

**Known gaps, deliberate (record, don't fix here):**
- **Boundaries** (start/end of a period) are postpositional in Kazakh (`ай соңы`) and are **deferred** — they'd need a second core rule (`boundaryPostfixP`, the same shape as `rangePostfixP`). This is the one spec §4.1 feature not in kk v1; it is excluded from the formatter's round-trip arbitrary. Fast-follow.
- The `-2` relative day ("day before yesterday") and midnight are multi-word/uncertain single forms in Kazakh — omitted in v1.
- **Cross-script holiday-name input** (typing a Latin holiday name under the `kk` adapter, or vice-versa) is not supported; holiday names are per-adapter-script. The general date grammar is fully dual-script.
- The exact **2021 Latin glyphs** for ambiguous/loan letters (и, й, у, ё, ю, я, ц, щ) live in `translit.ts` `OVERRIDES` and should be verified against the official alphabet for real-world Latin-input fidelity. Tests pass regardless (internal-consistency property), so this is a fidelity refinement, not a blocker.
- **Kurban Ait** dates are tabulated to declared dates over 2023–2030 and must be verified/extended against official decrees (±1 day vs sighting).
- Oracle stays English-only; `locale-kk` is not wired into the playground UI toggle (optional fast-follow — the registry/controller already accept it with no code change).

**Next (optional fast-follows):** postpositional boundaries (`boundaryPostfixP` + `басы`/`соңы`); inflected holiday range forms; a playground locale toggle for `kk`/`kkLatn`; widening `holidays-kk`'s Kurban Ait table.

