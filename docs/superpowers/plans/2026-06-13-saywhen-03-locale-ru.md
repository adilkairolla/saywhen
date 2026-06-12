# saywhen Plan 03 — @saywhen/locale-ru Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@saywhen/locale-ru`, the Russian locale adapter — proving the two-layer architecture is genuinely language-pluggable by passing the shared `@saywhen/conformance` suite unchanged.

**Architecture:** Zero new core code. Russian is pure locale data + formatters: morphology is handled by *enumerating inflections as lexicon data* (spec decision — no stemmer), so "следующая", "следующей", "следующую" all map to the same `REL next` payload. The grammar, resolver, scorer, typo engine, and compound-number merge (plan 02) are reused as-is. The formatter picks grammatically correct forms (gender/case agreement) from the same enumerated tables — output is always re-parseable because every emitted form is lexicon data.

**Tech Stack:** existing pnpm/TS/Vitest 3 monorepo; no new dependencies. New package `@saywhen/locale-ru` mirrors `@saywhen/locale-en`'s structure (peer dep on core, tsdown build, conformance devDep).

**This is plan 3 of 6** (series in `2026-06-12-saywhen-01-core-engine.md`; 01–02 executed and merged). Plan 04 = holiday packs, 05 = suggest, 06 = controller/react/registry/playground.

**Conventions (same as plans 01–02):**
- Run tests from repo root: `pnpm vitest run <file>`. Commit after every green task (conventional commits).
- Standard clock: Friday `2026-06-12T08:00:00Z`. RU tests use zone `Europe/Moscow` (UTC+3, no DST) = 11:00 local. `m` is 0-based month.
- RU defaults differ from EN: `weekStart: 1` (Monday), `dateOrder: "DMY"`. Week-period expectations below already account for Monday weeks.
- Env quirk on this machine: non-interactive shells break the nvm lazy-loader. If `pnpm` fails with `_lazy_load_nvm`, prefix commands with:
  `export PATH="$HOME/.nvm/versions/node/v22.15.0/bin:$HOME/Library/pnpm:$PATH"; unset -f node npm pnpm npx 2>/dev/null;`

## Core facts the engineer needs (verified against current main)

- `validateLocale` (packages/core/src/lexicon.ts) requires: all 7 weekdays, 12 months, all 6 units, this/next/last, ≥1 RELDAY. One form MAY carry payloads of *different* kinds (e.g. "дня" = UNIT day + MERIDIEM pm); two payloads of the SAME kind with different values throw.
- The grammar (packages/core/src/grammar.ts) requires **full stream consumption** (trailing non-FILLER tokens kill a parse). That is why "года"/"году"/"год"/"г" get a FILLER payload *in addition to* UNIT year — "21 марта 2027 года" must consume "года".
- `numUnit` = NUMBER directly followed by UNIT. DIRECTION dirs: `после`→after, `до`→before (+CONNECTOR, like en "-"), `через`/`спустя`→in, `назад`→ago, `от`→from.
- Engine already calls `locale.parseNumber` for compound number words (plan 02) and the curated `typoMap` runs before the digit guard.
- `mergeNumberWords` merges only single-alternative word-NUMBER cells without digits; the merged cell is ordinal iff the LAST word is ordinal ("двадцать первое" → ordinal 21).
- The conformance transforms already support Cyrillic (`[a-zа-яё]` in transforms.ts). Note: the `capitalized` must-pass transform is a no-op for Cyrillic (JS `\b` is ASCII) — it degrades to identity, which trivially passes.
- normalizeText does NFKC + toLowerCase. It does NOT fold ё→е, so the lexicon enumerates both spellings where a vocabulary word contains ё (четвёртое/четвертое).

## File structure (created/modified by this plan)

```
packages/locale-ru/package.json           CREATE  mirror of locale-en (Task 0)
packages/locale-ru/tsconfig.json          CREATE  (Task 0)
packages/locale-ru/tsdown.config.ts       CREATE  (Task 0)
packages/locale-ru/src/data.ts            CREATE  ALL word tables: inflections as data (Task 1)
packages/locale-ru/src/index.ts           CREATE  lexicon build, tokenizer, adapter (Task 1);
                                                  format (Task 2); formatAccessible (Task 4)
packages/locale-ru/test/e2e.test.ts       CREATE  4 blocks: dates/relative/times/typos (Task 1)
packages/locale-ru/test/format.test.ts    CREATE  exact-string canonical formatter (Task 2)
packages/locale-ru/test/conformance.test.ts CREATE 12 RU seeds → shared suite (Task 3)
packages/locale-ru/test/accessible.test.ts CREATE exact-string accessible phrasing (Task 4)
packages/locale-ru/test/roundtrip.property.test.ts CREATE fast-check (Task 5)
packages/core/test/deps.test.ts           MODIFY  peer guard covers every locale pkg (Task 6)
```

---

### Task 0: Scaffold the package

**Files:**
- Create: `packages/locale-ru/package.json`, `packages/locale-ru/tsconfig.json`, `packages/locale-ru/tsdown.config.ts`

- [ ] **Step 1: Write the three files**

`packages/locale-ru/package.json`:
```json
{
  "name": "@saywhen/locale-ru",
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
    "@saywhen/conformance": "workspace:*",
    "@saywhen/core": "workspace:*"
  },
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/locale-ru/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`packages/locale-ru/tsdown.config.ts`:
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
Expected: `@saywhen/locale-ru` appears in the workspace; no errors. (Root `build`/`typecheck` scripts pick the new package up automatically via their `./packages/*` filters.)

- [ ] **Step 3: Commit**

```bash
git add packages/locale-ru pnpm-lock.yaml
git commit -m "chore(locale-ru): scaffold package"
```

---

### Task 1: Word tables, lexicon, tokenizer, adapter — full e2e coverage

The heart of the plan. `data.ts` holds every inflection as data; `index.ts` builds the lexicon (with payload-level dedupe), tokenizes Cyrillic, implements `parseNumber` for compounds, and exports the adapter with PLACEHOLDER formatters (`JSON.stringify`) — real formatters land in Tasks 2 and 4 (test-locale precedent from plan 01).

**Files:**
- Create: `packages/locale-ru/src/data.ts`, `packages/locale-ru/src/index.ts`
- Test: `packages/locale-ru/test/e2e.test.ts`

- [ ] **Step 1: Write the failing e2e tests**

`packages/locale-ru/test/e2e.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { createEngine, type ParseContext } from "@saywhen/core";
import { ru } from "../src/index.js";

const engine = createEngine({ locale: ru });
// Friday 2026-06-12, 11:00 in Moscow (UTC+3, no DST); weekStart 1, dateOrder DMY
const CTX: ParseContext = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };

const top = (text: string, ctx: ParseContext = CTX) => {
  const r = engine.parse(text, ctx);
  if (r.candidates.length === 0) throw new Error(`no parse for "${text}": ${r.errors.join("; ")}`);
  return r.candidates[0]!;
};

describe("single dates", () => {
  test.each([
    ["сегодня", "2026-06-12"],
    ["завтра", "2026-06-13"],
    ["послезавтра", "2026-06-14"],
    ["вчера", "2026-06-11"],
    ["позавчера", "2026-06-10"],
    ["пятница", "2026-06-12"],
    ["в среду", "2026-06-17"],
    ["следующая пятница", "2026-06-19"],
    ["следующее воскресенье", "2026-06-21"],   // Monday weeks: this week's Sunday is 06-14
    ["прошлая среда", "2026-06-03"],
    ["пт", "2026-06-12"],
    ["вт", "2026-06-16"],
    ["21 марта", "2027-03-21"],
    ["21-го марта", "2027-03-21"],
    ["двадцать первое марта", "2027-03-21"],
    ["21 марта 2027 года", "2027-03-21"],      // "года" must read as filler here
    ["4 марта 2026", "2026-03-04"],
    ["21-е", "2026-06-21"],
    ["третье", "2026-07-03"],                  // June 3 passed → rolls to next month
    ["сентябрь", "2026-09-01"],
    ["в марте", "2027-03-01"],                 // prepositional month form
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });

  test("DMY default: '3/4' ranks April 3 over March 4", () => {
    const r = engine.parse("3/4", CTX);
    expect(r.candidates[0]!.start.date).toBe("2027-04-03");
    expect(r.candidates[1]!.start.date).toBe("2027-03-04");
  });
});

describe("relative, periods, ranges", () => {
  test.each([
    ["через 2 недели", "2026-06-26", "2026-06-26"],
    ["через 21 день", "2026-07-03", "2026-07-03"],
    ["2 недели назад", "2026-05-29", "2026-05-29"],
    ["прошлые 2 недели", "2026-05-29", "2026-06-12"],
    ["следующая неделя", "2026-06-15", "2026-06-21"], // Monday weeks
    ["эта неделя", "2026-06-08", "2026-06-14"],
    ["в следующем году", "2027-01-01", "2027-12-31"],
    ["эти выходные", "2026-06-13", "2026-06-14"],
    ["конец следующего месяца", "2026-07-31", "2026-07-31"],
    ["начало следующей недели", "2026-06-15", "2026-06-15"],
    ["конец этого месяца", "2026-06-30", "2026-06-30"],
    ["с понедельника по пятницу", "2026-06-15", "2026-06-19"],
    ["понедельник - пятница", "2026-06-15", "2026-06-19"],
    ["3 дня до 4 марта", "2027-03-01", "2027-03-01"],
    ["2 недели после следующей пятницы", "2026-07-03", "2026-07-03"],
    ["следующая пятница + 2 недели", "2026-07-03", "2026-07-03"],
    ["это лето", "2026-06-01", "2026-08-31"],
  ])("'%s' → %s..%s", (text, start, end) => {
    const c = top(text);
    expect(c.start.date).toBe(start);
    expect(c.end.date).toBe(end);
  });
});

describe("times (Moscow = UTC+3)", () => {
  test.each([
    ["пятница в 5 вечера", "2026-06-12T14:00:00.000Z"],
    ["завтра в полдень", "2026-06-13T09:00:00.000Z"],
    ["завтра в полночь", "2026-06-12T21:00:00.000Z"],
    ["пятница в 17:30", "2026-06-12T14:30:00.000Z"],
    ["понедельник в 9:30", "2026-06-15T06:30:00.000Z"],
  ])("'%s' → %s", (text, iso) => {
    expect(top(text).start.utcIso).toBe(iso);
  });
});

describe("typos (ЙЦУКЕН keyboard + curated map)", () => {
  test("'пятнца' corrects to пятница", () => {
    const r = engine.parse("пятнца", CTX);
    expect(r.corrections).toHaveLength(1);
    expect(r.candidates[0]!.start.date).toBe("2026-06-12");
  });
  test.each([
    ["седня", "2026-06-12"],      // curated
    ["завтро", "2026-06-13"],     // curated
    ["зватра", "2026-06-13"],     // transposition, cost 0.5
    ["понеделник", "2026-06-15"], // dropped ь, cost 1 within len-10 threshold 2
  ])("'%s' → %s", (text, date) => {
    expect(top(text).start.date).toBe(date);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-ru`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 3: Write `src/data.ts`** (complete file)

```ts
// Russian morphology, enumerated as data (spec: no stemmer — inflections are lexicon entries).
// The formatter reads the same tables to pick grammatically agreeing forms.

export type Which = "this" | "next" | "last";
export type Gender = "m" | "f" | "n" | "pl";

// ---------- weekdays (index = day: 0 Sunday … 6 Saturday) ----------

export interface WeekdayForms {
  nom: string;   // понедельник — also matches "в понедельник" where acc = nom
  gen: string;   // понедельника — "с понедельника", "после понедельника"
  acc: string;   // понедельник/среду — "в среду", "по пятницу"
  abbr: string;
  gender: Gender;
}

export const WEEKDAYS: WeekdayForms[] = [
  { nom: "воскресенье", gen: "воскресенья", acc: "воскресенье", abbr: "вс", gender: "n" },
  { nom: "понедельник", gen: "понедельника", acc: "понедельник", abbr: "пн", gender: "m" },
  { nom: "вторник", gen: "вторника", acc: "вторник", abbr: "вт", gender: "m" },
  { nom: "среда", gen: "среды", acc: "среду", abbr: "ср", gender: "f" },
  { nom: "четверг", gen: "четверга", acc: "четверг", abbr: "чт", gender: "m" },
  { nom: "пятница", gen: "пятницы", acc: "пятницу", abbr: "пт", gender: "f" },
  { nom: "суббота", gen: "субботы", acc: "субботу", abbr: "сб", gender: "f" },
];

// ---------- months (index = m: 0 January … 11 December) ----------

export const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
/** genitive — used with day numbers: "21 марта" */
export const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
/** prepositional — "в марте" */
export const MONTHS_PREP = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];
/** "май" is already the nominative — the dedupe in add() makes the empty slot unnecessary, but keep intent clear */
export const MONTH_ABBR: string[][] = [
  ["янв"], ["фев"], ["мар"], ["апр"], [], ["июн"],
  ["июл"], ["авг"], ["сен", "сент"], ["окт"], ["ноя"], ["дек"],
];

// ---------- relative days ----------

export const RELDAYS: Array<[string, number]> = [
  ["сегодня", 0], ["завтра", 1], ["послезавтра", 2], ["вчера", -1], ["позавчера", -2],
];

// ---------- this / next / last: full inflection sets for the lexicon ----------

export const REL_FORMS: Record<Which, string[]> = {
  this: ["этот", "эта", "это", "эти", "этого", "этой", "этих", "эту", "этим", "этом", "этими"],
  next: [
    "следующий", "следующая", "следующее", "следующие", "следующего", "следующей",
    "следующих", "следующую", "следующим", "следующем", "следующими",
    "будущий", "будущая", "будущее", "будущего", "будущей", "будущем", "будущую",
  ],
  last: [
    "прошлый", "прошлая", "прошлое", "прошлые", "прошлого", "прошлой",
    "прошлых", "прошлую", "прошлым", "прошлом", "прошлыми",
  ],
};

// case tables the FORMATTERS use to pick the agreeing form
export const REL_NOM: Record<Which, Record<Gender, string>> = {
  this: { m: "этот", f: "эта", n: "это", pl: "эти" },
  next: { m: "следующий", f: "следующая", n: "следующее", pl: "следующие" },
  last: { m: "прошлый", f: "прошлая", n: "прошлое", pl: "прошлые" },
};
export const REL_GEN: Record<Which, Record<Gender, string>> = {
  this: { m: "этого", f: "этой", n: "этого", pl: "этих" },
  next: { m: "следующего", f: "следующей", n: "следующего", pl: "следующих" },
  last: { m: "прошлого", f: "прошлой", n: "прошлого", pl: "прошлых" },
};
export const REL_ACC: Record<Which, Record<Gender, string>> = {
  this: { m: "этот", f: "эту", n: "это", pl: "эти" },
  next: { m: "следующий", f: "следующую", n: "следующее", pl: "следующие" },
  last: { m: "прошлый", f: "прошлую", n: "прошлое", pl: "прошлые" },
};
export const REL_INS: Record<Which, Record<Gender, string>> = {
  this: { m: "этим", f: "этой", n: "этим", pl: "этими" },
  next: { m: "следующим", f: "следующей", n: "следующим", pl: "следующими" },
  last: { m: "прошлым", f: "прошлой", n: "прошлым", pl: "прошлыми" },
};

// ---------- units ----------

export const UNIT_FORMS = {
  day: ["день", "дня", "дней", "дн"],
  week: ["неделя", "недели", "неделю", "недель", "неделе", "нед"],
  month: ["месяц", "месяца", "месяцев", "месяце", "мес"],
  year: ["год", "года", "году", "лет", "г"],
  hour: ["час", "часа", "часов", "ч"],
  minute: ["минута", "минуты", "минут", "мин"],
} as const;

/** counting triples [n%10==1, n%10 in 2..4, else] — accusative-leaning singular ("через 1 неделю") */
export const UNIT_COUNT: Record<keyof typeof UNIT_FORMS, [string, string, string]> = {
  day: ["день", "дня", "дней"],
  week: ["неделю", "недели", "недель"],
  month: ["месяц", "месяца", "месяцев"],
  year: ["год", "года", "лет"],
  hour: ["час", "часа", "часов"],
  minute: ["минуту", "минуты", "минут"],
};

// ---------- periods / seasons / boundaries ----------

export const WEEKEND_FORMS = ["выходные", "выходных", "выходным"];
export const QUARTER_FORMS = ["квартал", "квартала", "квартале"];

/** formatter noun table for REL-agreeing periods */
export const PERIOD_NOUNS: Record<"week" | "month" | "year" | "weekend" | "quarter",
  { nom: string; gen: string; gender: Gender }> = {
  week: { nom: "неделя", gen: "недели", gender: "f" },
  month: { nom: "месяц", gen: "месяца", gender: "m" },
  year: { nom: "год", gen: "года", gender: "m" },
  weekend: { nom: "выходные", gen: "выходных", gender: "pl" },
  quarter: { nom: "квартал", gen: "квартала", gender: "m" },
};

export const SEASONS: Array<{ nom: string; gen: string; ins: string; gender: Gender; lexicon: string[] }> = [
  { nom: "весна", gen: "весны", ins: "весной", gender: "f", lexicon: ["весна", "весны", "весной", "весне"] },
  { nom: "лето", gen: "лета", ins: "летом", gender: "n", lexicon: ["лето", "лета", "летом"] },
  { nom: "осень", gen: "осени", ins: "осенью", gender: "f", lexicon: ["осень", "осени", "осенью"] },
  { nom: "зима", gen: "зимы", ins: "зимой", gender: "f", lexicon: ["зима", "зимы", "зимой", "зиме"] },
];

export const BOUNDARIES = {
  start: ["начало", "начала", "начале"],
  end: ["конец", "конца", "конце"],
};

// ---------- function words ----------

export const DIRECTIONS: Array<["before" | "after" | "from" | "ago" | "in", string[]]> = [
  ["after", ["после"]],
  ["before", ["до"]],          // "до" ALSO gets a CONNECTOR payload (range "с … до …")
  ["in", ["через", "спустя"]], // "через 2 недели"
  ["ago", ["назад"]],
  ["from", ["от"]],
];

export const CONNECTORS = ["по", "до"];

export const MERIDIEMS: Array<["am" | "pm", string[]]> = [
  ["am", ["утра", "ночи"]],
  ["pm", ["вечера", "дня"]], // "дня" ALSO maps to UNIT day — different kinds, legal ambiguity
];

/** год/года/году/г also map to UNIT year — the FILLER reading lets "2027 года" consume fully */
export const FILLERS = ["в", "во", "на", "к", "с", "со", "год", "года", "году", "г", "число", "числа"];

// ---------- numbers ----------

export const TENS: Record<string, number> = {
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
};

export const CARDINALS: Record<string, number> = {
  один: 1, одна: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15,
  шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  ...TENS,
};

/** neuter + genitive date ordinals; ё words get both spellings (normalize keeps ё) */
export const ORDINALS: Record<string, number> = {
  первое: 1, первого: 1, второе: 2, второго: 2, третье: 3, третьего: 3,
  четвёртое: 4, четвертое: 4, четвёртого: 4, четвертого: 4,
  пятое: 5, пятого: 5, шестое: 6, шестого: 6, седьмое: 7, седьмого: 7,
  восьмое: 8, восьмого: 8, девятое: 9, девятого: 9, десятое: 10, десятого: 10,
  одиннадцатое: 11, одиннадцатого: 11, двенадцатое: 12, двенадцатого: 12,
  тринадцатое: 13, тринадцатого: 13, четырнадцатое: 14, четырнадцатого: 14,
  пятнадцатое: 15, пятнадцатого: 15, шестнадцатое: 16, шестнадцатого: 16,
  семнадцатое: 17, семнадцатого: 17, восемнадцатое: 18, восемнадцатого: 18,
  девятнадцатое: 19, девятнадцатого: 19, двадцатое: 20, двадцатого: 20,
  тридцатое: 30, тридцатого: 30,
};

/** masculine ordinals for accessible quarter phrasing ("первый квартал") */
export const ORD_QUARTER = ["первый", "второй", "третий", "четвёртый"];

// ---------- typing ----------

/** ЙЦУКЕН physical rows (ё sits apart on the backtick key — omitted, no adjacency) */
export const KEYBOARD_ROWS = ["йцукенгшщзхъ", "фывапролджэ", "ячсмитьбю"];

export const TYPO_MAP: Record<string, string> = {
  седня: "сегодня", сёдня: "сегодня", завтро: "завтра",
};
```

- [ ] **Step 4: Write `src/index.ts`** (complete file; formatters are placeholders until Tasks 2/4)

```ts
import type {
  DateExpr, Lexicon, LocaleAdapter, RawToken, Unit,
} from "@saywhen/core";
import {
  BOUNDARIES, CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS,
  MERIDIEMS, MONTH_ABBR, MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, ORDINALS,
  QUARTER_FORMS, RELDAYS, REL_FORMS, SEASONS, TENS, TYPO_MAP, UNIT_FORMS,
  WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";

function buildLexicon(): Lexicon {
  const lex: Lexicon = {};
  // dedupe-aware add: many inflections collide ("май" abbr = nominative)
  const add = (forms: string[], payload: Lexicon[string][number]) => {
    const json = JSON.stringify(payload);
    for (const f of forms) {
      const list = (lex[f] ??= []);
      if (!list.some((p) => JSON.stringify(p) === json)) list.push(payload);
    }
  };

  WEEKDAYS.forEach((w, day) => add([w.nom, w.gen, w.acc, w.abbr], { kind: "WEEKDAY", day }));
  MONTHS_NOM.forEach((nom, month) =>
    add([nom, MONTHS_GEN[month]!, MONTHS_PREP[month]!, ...MONTH_ABBR[month]!], { kind: "MONTH", month }));

  for (const [form, offset] of RELDAYS) add([form], { kind: "RELDAY", offset });
  for (const which of ["this", "next", "last"] as const) add(REL_FORMS[which], { kind: "REL", which });

  for (const [unit, forms] of Object.entries(UNIT_FORMS) as Array<[Unit, readonly string[]]>) {
    add([...forms], { kind: "UNIT", unit });
  }

  for (const [word, n] of Object.entries(CARDINALS)) add([word], { kind: "NUMBER", n });
  for (const [word, n] of Object.entries(ORDINALS)) add([word], { kind: "NUMBER", n, ordinal: true });
  for (let d = 1; d <= 31; d++) {
    add([`${d}-е`, `${d}-ое`, `${d}-го`, `${d}-ого`], { kind: "NUMBER", n: d, ordinal: true });
  }

  add(WEEKEND_FORMS, { kind: "PERIOD", period: { kind: "weekend" } });
  add(QUARTER_FORMS, { kind: "PERIOD", period: { kind: "quarter" } });
  for (let q = 1; q <= 4; q++) {
    add([`кв${q}`, `q${q}`], { kind: "PERIOD", period: { kind: "quarter", q: q as 1 | 2 | 3 | 4 } });
  }
  SEASONS.forEach((s, i) => add(s.lexicon, { kind: "PERIOD", period: { kind: "season", s: i as 0 | 1 | 2 | 3 } }));

  add(BOUNDARIES.start, { kind: "BOUNDARY", edge: "start" });
  add(BOUNDARIES.end, { kind: "BOUNDARY", edge: "end" });

  for (const [dir, forms] of DIRECTIONS) add(forms, { kind: "DIRECTION", dir });
  add(CONNECTORS, { kind: "CONNECTOR" });
  add(["-"], { kind: "CONNECTOR" }); // "пн - пт" — lattice carries both OP and CONNECTOR readings
  add(["+", "плюс"], { kind: "OP", op: 1 });
  add(["-", "минус"], { kind: "OP", op: -1 });

  for (const [value, forms] of MERIDIEMS) add(forms, { kind: "MERIDIEM", value });
  add(["полдень"], { kind: "TIME", h: 12, m: 0 });
  add(["полночь"], { kind: "TIME", h: 0, m: 0 });

  add(FILLERS, { kind: "FILLER" });

  return lex;
}

const lexicon = buildLexicon();

const TOKEN_RE =
  /\d{1,4}\/\d{1,2}(?:\/\d{1,4})?|\d{1,2}:\d{2}|\d+-[а-яё]+|\d+[а-яё]+|\d+|[а-яё]+\d+|[а-яё]+|[a-z]+\d*|[+\-]|\S/g;

function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  const push = (t: string, s: number) => out.push({ text: t, span: [s, s + t.length] });
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!;
    const start = m.index!;
    // mixed digit/letter runs split unless the whole token is known ("21-е", "кв1")
    if (!(raw in lexicon) && !(raw in TYPO_MAP)) {
      const dh = /^(\d+)-([а-яё]+)$/.exec(raw); // "32-е" → "32" + "е"
      if (dh) {
        push(dh[1]!, start);
        push(dh[2]!, start + dh[1]!.length + 1);
        continue;
      }
      const dl = /^(\d+)([а-яё]+)$/.exec(raw);  // "17часов" → "17" + "часов"
      const ld = /^([а-яё]+)(\d+)$/.exec(raw);  // unknown Cyrillic+digit run
      const split = dl ?? ld;
      if (split) {
        push(split[1]!, start);
        push(split[2]!, start + split[1]!.length);
        continue;
      }
    }
    push(raw, start);
  }
  return out;
}

export const ru: LocaleAdapter = {
  id: "ru",
  tokenize,
  lexicon,
  parseNumber: (words) => {
    const value = (w: string): number | null =>
      CARDINALS[w] ?? ORDINALS[w] ?? (/^\d+$/.test(w) ? Number(w) : null);
    if (words.length === 1) return value(words[0]!);
    if (words.length === 2) {
      const tens = TENS[words[0]!];
      const unit = CARDINALS[words[1]!] ?? ORDINALS[words[1]!];
      if (tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9) return tens + unit;
    }
    return null;
  },
  format: (expr: DateExpr) => JSON.stringify(expr), // replaced in Task 2
  formatAccessible: (expr: DateExpr) => JSON.stringify(expr), // replaced in Task 4
  keyboard: { rows: KEYBOARD_ROWS },
  typoMap: TYPO_MAP,
  defaults: { weekStart: 1, dateOrder: "DMY" },
};
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run packages/locale-ru`
Expected: PASS — all four e2e blocks. If `createEngine` throws `Locale "ru" lexicon is incomplete`, a required table didn't make it into `buildLexicon` (7 weekdays / 12 months / 6 units / 3 rels / ≥1 relday). If a specific phrase fails, debug by checking each word reaches the kind the grammar needs (see "Core facts" above).

Also run: `pnpm vitest run packages/core` — core must stay green (nothing in it changed; this catches accidental edits).

- [ ] **Step 6: Commit**

```bash
git add packages/locale-ru
git commit -m "feat(locale-ru): Russian lexicon, tokenizer, and adapter with full e2e coverage"
```

---

### Task 2: Canonical formatter — re-parseable Russian with case agreement

`format` must emit text the ru engine re-parses to the SAME dates (conformance contract, Task 3). Every form it emits is lexicon data, and gender/case agreement comes from the REL_* tables. Key choices, each verified against the core grammar:

- Arithmetic offsets use the `+`/`-` operator style ("следующая пятница + 2 недели") — sidesteps genitive agreement entirely in the canonical form.
- Counting forms use `ruPlural` with accusative-leaning triples: "через 1 неделю", "через 2 недели", "через 5 дней", "через 21 день".
- Quarter-with-index ALWAYS carries the REL word ("следующий кв1") — a bare "кв1" would re-parse as `which: "this"` and drift the date.
- Boundary targets are emitted in genitive ("конец этого месяца") — the genitive REL/noun forms are lexicon entries, so this parses to the identical AST.
- Ranges use the " - " connector ("понедельник - пятница") — natural in written Russian and already a CONNECTOR/OP lattice ambiguity the grammar resolves.

**Files:**
- Modify: `packages/locale-ru/src/index.ts`
- Test: `packages/locale-ru/test/format.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/locale-ru/test/format.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const fmt = (expr: DateExpr) => ru.format(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("canonical format (always re-parseable)", () => {
  test("reldays and weekdays", () => {
    expect(fmt(A({ kind: "relday", offset: 2 }))).toBe("послезавтра");
    expect(fmt(A({ kind: "relday", offset: -2 }))).toBe("позавчера");
    expect(fmt(A({ kind: "relday", offset: 5 }))).toBe("через 5 дней");
    expect(fmt(A({ kind: "weekday", day: 5, which: "next" }))).toBe("следующая пятница");
    expect(fmt(A({ kind: "weekday", day: 0, which: "next" }))).toBe("следующее воскресенье");
    expect(fmt(A({ kind: "weekday", day: 1 }))).toBe("понедельник");
  });

  test("calendar anchors", () => {
    expect(fmt(A({ kind: "calendar", y: 2027, m: 0, d: 5 }))).toBe("5 января 2027");
    expect(fmt(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 марта");
    expect(fmt(A({ kind: "calendar", d: 21 }))).toBe("21-е");
    expect(fmt(A({ kind: "calendar", m: 8 }))).toBe("сентябрь");
    expect(fmt(A({ kind: "calendar", y: 2027 }))).toBe("2027");
  });

  test("offsets", () => {
    expect(fmt({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("следующая пятница + 2 недели");
    expect(fmt({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("4 марта - 3 дня");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("через 2 недели");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "week", dir: 1 })).toBe("через 1 неделю");
    expect(fmt({ type: "offset", base: A({ kind: "now" }), n: 3, unit: "day", dir: -1 })).toBe("3 дня назад");
  });

  test("ranges, periods, boundaries, time", () => {
    expect(fmt({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("понедельник - пятница");
    expect(fmt({ type: "period", period: { kind: "week" }, which: "this" })).toBe("эта неделя");
    expect(fmt({ type: "period", period: { kind: "month" }, which: "next" })).toBe("следующий месяц");
    expect(fmt({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("эти выходные");
    expect(fmt({ type: "period", period: { kind: "quarter" }, which: "last" })).toBe("прошлый квартал");
    expect(fmt({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" })).toBe("следующий кв1");
    expect(fmt({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("это лето");
    expect(fmt({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("конец этого месяца");
    expect(fmt({
      type: "boundary", of: { type: "period", period: { kind: "week" }, which: "next" }, edge: "start",
    })).toBe("начало следующей недели");
    expect(fmt({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("пятница в 17:00");
    expect(fmt({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("завтра в 9:30");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-ru/test/format.test.ts`
Expected: FAIL — format currently returns JSON.

- [ ] **Step 3: Implement in `src/index.ts`**

Extend the data imports (replace the existing import block's name list):
```ts
import {
  BOUNDARIES, CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS,
  MERIDIEMS, MONTH_ABBR, MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, ORDINALS,
  PERIOD_NOUNS, QUARTER_FORMS, RELDAYS, REL_FORMS, REL_GEN, REL_NOM,
  SEASONS, TENS, TYPO_MAP, UNIT_COUNT, UNIT_FORMS, WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";
```
and add `Anchor` to the type imports from `@saywhen/core`.

Add below `tokenize` (before the adapter):

```ts
// ---------- canonical formatting (re-parseable: every emitted form is lexicon data) ----------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Russian plural selection: 1 день / 2 дня / 5 дней (11–14 always take the third form). */
export function ruPlural(n: number, [one, few, many]: [string, string, string]): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const count = (unit: Unit, n: number) => `${n} ${ruPlural(n, UNIT_COUNT[unit])}`;

const RELDAY_WORDS: Record<number, string> = {
  0: "сегодня", 1: "завтра", 2: "послезавтра", [-1]: "вчера", [-2]: "позавчера",
};

function formatAnchor(a: Anchor): string {
  switch (a.kind) {
    case "now": return "сегодня";
    case "relday": {
      const word = RELDAY_WORDS[a.offset];
      if (word) return word;
      return a.offset > 0 ? `через ${count("day", a.offset)}` : `${count("day", -a.offset)} назад`;
    }
    case "weekday": {
      const w = WEEKDAYS[a.day]!;
      return a.which ? `${REL_NOM[a.which][w.gender]} ${w.nom}` : w.nom;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) return `${d} ${MONTHS_GEN[m]}${y !== undefined ? ` ${y}` : ""}`;
      if (d !== undefined) return `${d}-е`;
      if (m !== undefined) return `${MONTHS_NOM[m]}${y !== undefined ? ` ${y}` : ""}`;
      return String(y);
    }
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id; // names: plan 04
  }
}

/** genitive rendering for boundary targets ("конец этого месяца"); falls back to nominative */
function formatGen(of: DateExpr): string {
  if (of.type === "period") {
    const p = of.period;
    if (p.kind === "quarter" && p.q) return `${REL_GEN[of.which].m} кв${p.q}`;
    if (p.kind === "season") {
      if (p.s === undefined) return format(of);
      const s = SEASONS[p.s]!;
      return `${REL_GEN[of.which][s.gender]} ${s.gen}`;
    }
    const noun = PERIOD_NOUNS[p.kind];
    return `${REL_GEN[of.which][noun.gender]} ${noun.gen}`;
  }
  if (of.type === "anchor" && of.anchor.kind === "calendar"
      && of.anchor.m !== undefined && of.anchor.d === undefined && of.anchor.y === undefined) {
    return MONTHS_GEN[of.anchor.m]!; // "конец марта"
  }
  return format(of);
}

function format(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return formatAnchor(expr.anchor);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `через ${count(expr.unit, expr.n)}`
          : `${count(expr.unit, expr.n)} назад`;
      }
      return `${format(expr.base)} ${expr.dir === 1 ? "+" : "-"} ${count(expr.unit, expr.n)}`;
    }
    case "range": return `${format(expr.start)} - ${format(expr.end)}`;
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) return `${REL_NOM[expr.which].m} кв${p.q}`;
      if (p.kind === "season") {
        if (p.s === undefined) return `${REL_NOM[expr.which].m} сезон`; // not vocabulary; arbs always index seasons
        const s = SEASONS[p.s]!;
        return `${REL_NOM[expr.which][s.gender]} ${s.nom}`;
      }
      const noun = PERIOD_NOUNS[p.kind];
      return `${REL_NOM[expr.which][noun.gender]} ${noun.nom}`;
    }
    case "boundary": return `${expr.edge === "start" ? "начало" : "конец"} ${formatGen(expr.of)}`;
    case "withTime": return `${format(expr.base)} в ${expr.time.h}:${pad(expr.time.m)}`;
  }
}
```

and change the adapter line:
```ts
  format: (expr) => format(expr),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-ru`
Expected: PASS (format tests + all e2e — candidate `text` now renders Russian instead of JSON, which no e2e asserts on, but rerun the whole package to be sure).

- [ ] **Step 5: Commit**

```bash
git add packages/locale-ru
git commit -m "feat(locale-ru): canonical re-parseable Russian formatter"
```

---

### Task 3: Pass the shared conformance suite

The point of the whole plan: `@saywhen/conformance` runs UNCHANGED against ru. The 25 semantic-contract ASTs get their ground truth from the locale-independent resolver (with ru's `weekStart: 1`); ru must format each to text its own engine re-parses to the same dates with zero corrections. The seed phrases drive the variation matrix (case/whitespace must-pass + deterministic-typo fuzzy tier ≥ 0.7).

**Files:**
- Create: `packages/locale-ru/test/conformance.test.ts`

- [ ] **Step 1: Write the consumer test**

```ts
import { runLocaleConformance } from "@saywhen/conformance";
import { ru } from "../src/index.js";

// Expectations under the fixed conformance clock (Fri 2026-06-12, America/New_York)
// with ru's Monday weekStart.
runLocaleConformance({
  locale: ru,
  seeds: [
    { text: "завтра", start: "2026-06-13" },
    { text: "следующая пятница", start: "2026-06-19" },
    { text: "21 марта", start: "2027-03-21" },
    { text: "двадцать первое марта", start: "2027-03-21" },
    { text: "4 марта 2026", start: "2026-03-04" },
    { text: "через 2 недели", start: "2026-06-26" },
    { text: "следующая пятница + 2 недели", start: "2026-07-03" },
    { text: "с понедельника по пятницу", start: "2026-06-15", end: "2026-06-19" },
    { text: "следующая неделя", start: "2026-06-15", end: "2026-06-21" },
    { text: "эти выходные", start: "2026-06-13", end: "2026-06-14" },
    { text: "конец следующего месяца", start: "2026-07-31" },
    { text: "пятница в 5 вечера", start: "2026-06-12" },
  ],
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/locale-ru/test/conformance.test.ts`
Expected: PASS — 25 semantic cases + 60 must-pass matrix tests + fuzzy tier ≥ 0.7.

**If a semantic case fails**, the ru formatter emitted something its own lexicon can't re-parse to the same AST. The fix belongs in `locale-ru` (formatter or data), NEVER in the conformance suite. Walk the failure:
1. Print `ru.format(case.expr, ...)` for the failing case.
2. Feed that exact string to `engine.parse` and inspect `candidates[0].expr` vs the case AST.
3. Typical causes: a missing inflection in data.ts (add it), or a formatter form that re-parses with a different `which`/index (adjust the formatter to carry the disambiguating word, as `следующий кв1` does).

**If the fuzzy tier fails** (< 0.7), list the printed failures — a transform may be producing a mutation whose weighted edit distance exceeds the length threshold. That is acceptable for a few seeds (the tier averages), but a near-zero rate means the ЙЦУКЕН adjacency isn't wired (check `keyboard: { rows: KEYBOARD_ROWS }` made it into the adapter).

- [ ] **Step 3: Commit**

```bash
git add packages/locale-ru/test/conformance.test.ts
git commit -m "test(locale-ru): pass the shared conformance suite"
```

---

### Task 4: `formatAccessible` — natural Russian with full case agreement

Screen-reader phrasing (spec §4.1): grammatically natural, NOT required to re-parse. The genitive/accusative/instrumental REL and noun tables from data.ts make agreement a lookup, not morphology: "с понедельника по пятницу", "2 недели после следующей пятницы", "этим летом", "первый квартал следующего года".

**Files:**
- Modify: `packages/locale-ru/src/index.ts`
- Test: `packages/locale-ru/test/accessible.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/locale-ru/test/accessible.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import type { DateExpr } from "@saywhen/core";
import { ru } from "../src/index.js";

const OPTS = { now: new Date("2026-06-12T08:00:00Z"), timeZone: "Europe/Moscow" };
const acc = (expr: DateExpr) => ru.formatAccessible(expr, OPTS);
const A = (anchor: object): DateExpr => ({ type: "anchor", anchor } as DateExpr);

describe("formatAccessible (natural phrasing, case agreement)", () => {
  test("anchors", () => {
    expect(acc(A({ kind: "relday", offset: 1 }))).toBe("завтра");
    expect(acc(A({ kind: "relday", offset: 3 }))).toBe("через 3 дня");
    expect(acc(A({ kind: "weekday", day: 5, which: "next" }))).toBe("следующая пятница");
    expect(acc(A({ kind: "weekday", day: 1 }))).toBe("понедельник");
    expect(acc(A({ kind: "calendar", m: 2, d: 21, y: 2027 }))).toBe("21 марта 2027 года");
    expect(acc(A({ kind: "calendar", m: 2, d: 21 }))).toBe("21 марта");
    expect(acc(A({ kind: "calendar", d: 21 }))).toBe("21-е число");
    expect(acc(A({ kind: "calendar", m: 8 }))).toBe("сентябрь");
    expect(acc(A({ kind: "calendar", y: 2027 }))).toBe("2027 год");
  });

  test("offsets decline the base after после/до", () => {
    expect(acc({
      type: "offset", base: A({ kind: "weekday", day: 5, which: "next" }), n: 2, unit: "week", dir: 1,
    })).toBe("2 недели после следующей пятницы");
    expect(acc({
      type: "offset", base: A({ kind: "calendar", m: 2, d: 4 }), n: 3, unit: "day", dir: -1,
    })).toBe("3 дня до 4 марта");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 2, unit: "week", dir: 1 })).toBe("через 2 недели");
    expect(acc({ type: "offset", base: A({ kind: "now" }), n: 1, unit: "day", dir: -1 })).toBe("1 день назад");
  });

  test("ranges use с + genitive … по + accusative", () => {
    expect(acc({
      type: "range", start: A({ kind: "weekday", day: 1 }), end: A({ kind: "weekday", day: 5 }),
    })).toBe("с понедельника по пятницу");
    expect(acc({
      type: "range",
      start: A({ kind: "calendar", m: 2, d: 21 }),
      end: A({ kind: "calendar", m: 0, d: 5, y: 2027 }),
    })).toBe("с 21 марта по 5 января 2027 года");
  });

  test("periods and boundaries", () => {
    expect(acc({ type: "period", period: { kind: "week" }, which: "next" })).toBe("следующая неделя");
    expect(acc({ type: "period", period: { kind: "weekend" }, which: "this" })).toBe("эти выходные");
    expect(acc({ type: "period", period: { kind: "quarter", q: 1 }, which: "next" }))
      .toBe("первый квартал следующего года");
    expect(acc({ type: "period", period: { kind: "season", s: 3 }, which: "this" })).toBe("этой зимой");
    expect(acc({ type: "period", period: { kind: "season", s: 1 }, which: "this" })).toBe("этим летом");
    expect(acc({
      type: "boundary", of: { type: "period", period: { kind: "month" }, which: "this" }, edge: "end",
    })).toBe("конец этого месяца");
  });

  test("with time", () => {
    expect(acc({
      type: "withTime", base: A({ kind: "weekday", day: 5 }), time: { h: 17, m: 0 },
    })).toBe("пятница в 17:00");
    expect(acc({
      type: "withTime", base: A({ kind: "relday", offset: 1 }), time: { h: 9, m: 30 },
    })).toBe("завтра в 9:30");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/locale-ru/test/accessible.test.ts`
Expected: FAIL (formatAccessible still returns JSON).

- [ ] **Step 3: Implement** (add to `src/index.ts`, below `format`)

Extend the data import list with `ORD_QUARTER`, `REL_ACC`, `REL_INS` (final list):
```ts
import {
  BOUNDARIES, CARDINALS, CONNECTORS, DIRECTIONS, FILLERS, KEYBOARD_ROWS,
  MERIDIEMS, MONTH_ABBR, MONTHS_GEN, MONTHS_NOM, MONTHS_PREP, ORDINALS,
  ORD_QUARTER, PERIOD_NOUNS, QUARTER_FORMS, RELDAYS, REL_ACC, REL_FORMS,
  REL_GEN, REL_INS, REL_NOM, SEASONS, TENS, TYPO_MAP, UNIT_COUNT, UNIT_FORMS,
  WEEKDAYS, WEEKEND_FORMS,
} from "./data.js";
```

```ts
// ---------- accessible formatting (screen-reader phrasing; NOT re-parseable) ----------

/** genitive anchor — after "после"/"до"/"с" */
function accAnchorGen(a: Anchor): string {
  if (a.kind === "weekday") {
    const w = WEEKDAYS[a.day]!;
    return a.which ? `${REL_GEN[a.which][w.gender]} ${w.gen}` : w.gen;
  }
  return accessibleAnchor(a); // reldays are indeclinable; calendar forms already read naturally
}

/** accusative anchor — after "по" */
function accAnchorAcc(a: Anchor): string {
  if (a.kind === "weekday") {
    const w = WEEKDAYS[a.day]!;
    return a.which ? `${REL_ACC[a.which][w.gender]} ${w.acc}` : w.acc;
  }
  return accessibleAnchor(a);
}

const accGen = (e: DateExpr): string => (e.type === "anchor" ? accAnchorGen(e.anchor) : accessible(e));
const accAcc = (e: DateExpr): string => (e.type === "anchor" ? accAnchorAcc(e.anchor) : accessible(e));

function accessibleAnchor(a: Anchor): string {
  switch (a.kind) {
    case "now": return "сегодня";
    case "relday": {
      const word = RELDAY_WORDS[a.offset];
      if (word) return word;
      return a.offset > 0 ? `через ${count("day", a.offset)}` : `${count("day", -a.offset)} назад`;
    }
    case "weekday": {
      const w = WEEKDAYS[a.day]!;
      return a.which ? `${REL_NOM[a.which][w.gender]} ${w.nom}` : w.nom;
    }
    case "calendar": {
      const { y, m, d } = a;
      if (m !== undefined && d !== undefined) {
        return `${d} ${MONTHS_GEN[m]}${y !== undefined ? ` ${y} года` : ""}`;
      }
      if (d !== undefined) return `${d}-е число`;
      if (m !== undefined) return `${MONTHS_NOM[m]}${y !== undefined ? ` ${y} года` : ""}`;
      return `${y} год`;
    }
    case "holiday": return a.year !== undefined ? `${a.id} ${a.year}` : a.id;
  }
}

function accessible(expr: DateExpr): string {
  switch (expr.type) {
    case "anchor": return accessibleAnchor(expr.anchor);
    case "offset": {
      if (expr.base.type === "anchor" && expr.base.anchor.kind === "now") {
        return expr.dir === 1
          ? `через ${count(expr.unit, expr.n)}`
          : `${count(expr.unit, expr.n)} назад`;
      }
      return `${count(expr.unit, expr.n)} ${expr.dir === 1 ? "после" : "до"} ${accGen(expr.base)}`;
    }
    case "range": return `с ${accGen(expr.start)} по ${accAcc(expr.end)}`;
    case "period": {
      const p = expr.period;
      if (p.kind === "quarter" && p.q) {
        return `${ORD_QUARTER[p.q - 1]} квартал ${REL_GEN[expr.which].m} года`;
      }
      if (p.kind === "season" && p.s !== undefined) {
        const s = SEASONS[p.s]!;
        return `${REL_INS[expr.which][s.gender]} ${s.ins}`;
      }
      return format(expr); // "эта неделя", "прошлый квартал" — already natural
    }
    case "boundary": return format(expr); // "конец этого месяца" — already genitive
    case "withTime": return `${accessible(expr.base)} в ${expr.time.h}:${pad(expr.time.m)}`;
  }
}
```

and change the adapter line:
```ts
  formatAccessible: (expr) => accessible(expr),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run packages/locale-ru`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/locale-ru
git commit -m "feat(locale-ru): screen-reader formatAccessible with case agreement"
```

---

### Task 5: fast-check round-trip property

Same property as locale-en (spec §9.3): random `DateExpr` → `ru.format` → `engine.parse` → identical resolved dates. `weekStart: 1` on both sides; `allowPast: true` on both sides; seasons always generated with an index (the no-index fallback "сезон" is deliberately not vocabulary — same caveat as en).

**Files:**
- Create: `packages/locale-ru/test/roundtrip.property.test.ts`

- [ ] **Step 1: Write the property test**

```ts
import { describe, expect, test } from "vitest";
import fc from "fast-check";
import {
  createEngine, resolveExpr,
  type DateExpr, type ParseContext, type Wall,
} from "@saywhen/core";
import { ru } from "../src/index.js";

const engine = createEngine({ locale: ru });
const CTX: ParseContext = {
  now: new Date("2026-06-12T08:00:00Z"),
  timeZone: "Europe/Moscow",
  allowPast: true,
};
const RESOLVE_OPTS = {
  now: CTX.now, timeZone: CTX.timeZone, weekStart: 1 as const, allowPast: true,
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
        const text = ru.format(expr, { now: CTX.now, timeZone: CTX.timeZone });
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

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/locale-ru/test/roundtrip.property.test.ts`
Expected: PASS. **If it fails**, fast-check prints a shrunk `{expr, text}` counterexample — a real data/formatter drift bug:
1. Add the shrunk case as a named regression test (formatter output drift → `format.test.ts`; missing inflection → fix data.ts and cover in `e2e.test.ts`).
2. Fix the data/formatter (the formatter must emit lexicon vocabulary that re-parses to an AST resolving to the same dates; never weaken the property).
3. Re-run with the printed seed (`fc.assert(..., { seed: <seed> })`) to confirm, then drop the explicit seed.
If a fix exceeds ~30 lines, stop and surface it to your human partner.

- [ ] **Step 3: Commit**

```bash
git add packages/locale-ru/test/roundtrip.property.test.ts
git commit -m "test(locale-ru): fast-check round-trip property"
```

---

### Task 6: Dependency guard for all locales + full verification

**Files:**
- Modify: `packages/core/test/deps.test.ts`

- [ ] **Step 1: Generalize the peer-dependency guard**

In `packages/core/test/deps.test.ts`, replace the locale-en-specific test:

```ts
  test("@saywhen/locale-en depends on core as a peer only", () => {
    const en = pkg("packages/locale-en");
    expect(Object.keys(en.dependencies ?? {})).toEqual([]);
    expect(Object.keys(en.peerDependencies ?? {})).toEqual(["@saywhen/core"]);
  });
```

with a loop over every locale package:

```ts
  test.each(["locale-en", "locale-ru"])("%s depends on core as a peer only", (name) => {
    const p = pkg(`packages/${name}`);
    expect(Object.keys(p.dependencies ?? {})).toEqual([]);
    expect(Object.keys(p.peerDependencies ?? {})).toEqual(["@saywhen/core"]);
  });
```

- [ ] **Step 2: Run the guard**

Run: `pnpm vitest run packages/core/test/deps.test.ts`
Expected: PASS — 4 tests (core zero-dep, en peer, ru peer, no cross-package imports in core src).

- [ ] **Step 3: Full verification**

Run: `pnpm vitest run && pnpm typecheck && pnpm build`
Expected:
- vitest: all suites pass — core, conformance, locale-en (incl. its conformance/property/perf), locale-ru (e2e, format, conformance, accessible, property), oracle units + must-agree; the ORACLE-gated sweep skipped.
- typecheck: clean across `packages/*` and `tools/*` (locale-ru included automatically).
- build: dist emitted for core, locale-en, AND locale-ru (`ls packages/locale-ru/dist` → `index.js`, `index.d.ts`).

Run the dist smoke check:
```bash
node --input-type=module -e "const m = await import('./packages/locale-ru/dist/index.js'); if (m.ru?.id !== 'ru') throw new Error('dist missing ru adapter'); console.log('locale-ru dist OK');"
```
Expected: `locale-ru dist OK`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/deps.test.ts
git commit -m "test(core): extend dependency guard to all locale packages"
git status --short   # should be clean; commit anything left over with an appropriate message
```

---

## Done — definition of success for plan 03

- `@saywhen/locale-ru` parses natural Russian: inflected weekdays/months ("в среду", "21 марта"), compound number words ("двадцать первое марта"), relative phrases ("через 2 недели", "2 недели назад", "прошлые 2 недели"), periods with Monday weeks ("следующая неделя"), ranges ("с понедельника по пятницу"), times ("в 5 вечера", "полдень"), DMY slash dates, and ЙЦУКЕН-weighted typos ("пятнца") — all e2e-tested.
- The canonical formatter emits grammatically agreeing, re-parseable Russian (string-exact tests).
- **locale-ru passes `@saywhen/conformance` UNCHANGED** — 25 semantic AST cases + the 12-seed variation matrix. This is the plugability proof for the whole architecture.
- `formatAccessible` produces natural case-agreeing phrasing ("2 недели после следующей пятницы", "этим летом") — string-exact tests.
- fast-check round-trip (300 runs) green for ru.
- The deps guard enforces peer-only-core for every locale package; `pnpm build` emits dist for locale-ru.

**Known gaps, deliberate (record, don't fix here):**
- "через месяц" / "через неделю" (bare-unit offsets without a number) don't parse — the core grammar's `numUnit` requires an explicit NUMBER. Same gap exists in en ("in a week"). Fix belongs in core grammar, scheduled alongside plan 04+ work.
- "первый квартал" (masculine ordinal + quarter) doesn't parse — no ordinal+PERIOD grammar rule; "кв1"/"q1" cover the input side.
- chrono oracle stays en-only (chrono's ru support differs structurally; extending the oracle is not planned).

**Out of scope (later plans):** holiday packs + ru holiday names (04); suggest/ghost text (05); controller/react/registry/playground + RU demo (06).
