# saywhen — Design Spec

**Date:** 2026-06-11
**Status:** Approved (brainstorming complete)
**Scope name:** `@saywhen/*` is a working placeholder; final npm scope TBD by owner before first publish. No code identifier depends on the name.

## 1. What we're building

A **headless natural-language date-input engine** with **pluggable languages**, plus React bindings and shadcn-style copy-paste UI components. It is the feature superset of the two reference libraries analyzed in `DATE_INPUT_PACKAGES_ANALYSIS.md`:

- `@stolinski/hot-date` — zero-dep vanilla component, hand-rolled deterministic parser
- `@w3cj/magic-date-picker` — Lit component wrapping chrono-node, rich suggestions/a11y

### Goals (v1)

1. Parse natural-language dates: single dates, ranges, arithmetic ("next friday + 2 weeks"), periods ("next week"), boundaries ("end of month"), time-of-day ("friday at 5pm"), holidays.
2. **Languages are plugins.** English + Russian ship in v1 with identical feature coverage. Adding a language never requires touching the core.
3. **Every feature is composable**: suggestions, holidays, typo correction, ambiguity are separable modules; consumers who only want `parse()` pay for nothing else.
4. Typo correction with per-keyboard-layout weighting (QWERTY / ЙЦУКЕН).
5. Suggestions + ghost completion **generated from the grammar and lexicon** (no hand-maintained string catalog).
6. Structured, scored ambiguity ("3/4" → two candidates).
7. Zero-dependency core with its own timezone-aware date math.
8. Headless controller usable from any framework; React hooks with downshift-style prop getters; APG-compliant accessibility baked into the prop getters.

### Non-goals (v1)

- Recurrence ("every monday") — excluded, but the AST is designed so it lands later as one new node type.
- Finding dates inside free paragraphs (chrono's use case). We parse *input-field* text: the whole input, with skippable filler words.
- Locales beyond en/ru, non-Gregorian calendars, web-component wrapper, Vue/Svelte bindings — all future work the architecture must not block.

### Why not chrono-node (decided)

Chrono cannot provide: partial-input parsing (suggestions/ghost), introspectable vocabulary, typo correction, holidays, structured ambiguity, round-trip formatting, or equal-quality locales — `magic-date-picker` wrapped it and still built ~85% of its system outside it, with a duplicated vocabulary. Chrono survives in this project **only** as a dev-time differential-testing oracle (`tools/oracle`), never as a runtime dependency.

## 2. Architecture decision

**Approach C — two-layer engine with a semantic-token boundary and an unresolved AST:**

```
raw text
  │
  ▼  LOCALE LAYER (plugin: @saywhen/locale-en, locale-ru …)
  │   tokenize (Unicode/script-aware) → raw tokens
  │   lexicon lookup (inflections enumerated as data) + filler-word marking
  │
  ▼  language-neutral SEMANTIC TOKEN LATTICE
  │
  ▼  CORE LAYER (@saywhen/core — identical for every language)
  │   typo correction (core algorithm, locale lexicon + keyboard data)
  │   universal grammar (parser combinators, ALL parses) → DateExpr AST(s)
  │   locale escape-hatch rules merge in as extra alternatives
  │
  ▼  score + dedupe → ranked candidates
  ▼  resolver (zero-dep ZonedDate math, injected now) → concrete dates
```

Rejected alternatives: (A) chrono-style "each locale ships full parsers" — duplicates every feature per language; (B) pure data-driven grammar — cannot express real cross-language syntax differences.

The acid test that drives all contracts: *"next friday + 2 weeks"* and *"через две недели после следующей пятницы"* must produce the **same AST**.

## 3. Monorepo & package layout

```
ask-me-out/
├─ packages/
│  ├─ core/           @saywhen/core        — zero-dep engine. Subpath exports:
│  │                     .            parse / resolve / format / createEngine
│  │                     ./suggest    suggestion + ghost engine
│  │                     ./controller headless input state machine (no DOM)
│  ├─ locale-en/      @saywhen/locale-en
│  ├─ locale-ru/      @saywhen/locale-ru
│  ├─ holidays-us/    @saywhen/holidays-us — US holiday rules + names in en & ru
│  ├─ holidays-ru/    @saywhen/holidays-ru — RU holiday rules + names in ru & en
│  └─ react/          @saywhen/react       — hooks + prop getters over ./controller
├─ registry/          shadcn-style React components (copy-paste via registry JSON;
│                     NOT an npm package)
├─ apps/playground/   Vite playground / demo site
└─ tools/oracle/      dev-only, unpublished chrono-node differential harness
```

**Dependency rules (enforced in CI):**

- `core`: **zero** runtime dependencies; no DOM APIs anywhere.
- `locale-*`, `holidays-*`: peer-dep on `core` for types only; ~95% data.
- `react`: peer-deps `core` + `react`; hooks only, no logic.
- chrono-node appears only in `tools/oracle` devDeps.

**Deliberate splits:**

1. **Holidays ≠ locale.** Region and language are independent axes (a Russian speaker in the US wants US holidays with Russian names). Holiday packs compute dates and carry per-language name lexicons.
2. **Controller lives in core** as a subpath export — it is zero-dep pure logic; fewer packages to version, still tree-shakeable.

**Tooling:** pnpm workspaces, TypeScript strict, tsdown builds, Vitest, Changesets.

## 4. Core contracts

### 4.1 `LocaleAdapter`

```ts
interface LocaleAdapter {
  id: string;                                   // BCP-47: "en", "ru"
  tokenize(text: string): RawToken[];           // NFKC fold, dash/quote normalize,
                                                // script-aware segmentation
  lexicon: Lexicon;                             // inflected surface form → semantic entry
                                                // ru: "пятницу","пятнице","пятницей" → WEEKDAY(5)
                                                // filler words marked skippable: "on","the" / "в","на"
  parseNumber(words: string[]): number | null;  // "twenty one", "двадцать одна"
  rules?: LocaleRule[];                         // escape hatch: token-sequence → AST,
                                                // merged into grammar as extra alternatives
  format(expr: DateExpr, opts: FormatOptions): string;  // canonical round-trip text
  formatAccessible(expr: DateExpr, opts): string;       // screen-reader phrasing
  keyboard?: KeyboardLayout;                    // key-adjacency for typo weighting
  defaults: { weekStart: 0 | 1; dateOrder: "MDY" | "DMY" | "YMD" };
}
```

Morphology is handled by **enumerating inflections in lexicon data** (date vocabulary is ~100 lemmas; 7 weekdays × 6 Russian cases = 42 strings). No stemmer, ever. A dev-mode `validateLocale(adapter)` checks completeness (all weekdays/months/units present, no duplicate inflections mapping to different meanings).

### 4.2 Semantic tokens (the language-neutral boundary)

```
WEEKDAY(0–6) · MONTH(0–11) · NUMBER(n, ordinal?) · YEAR(n) · TIME(h, m) · MERIDIEM(am|pm)
RELDAY(offset)                    today/tomorrow/послезавтра (offset in days)
REL(this | next | last)
UNIT(day|week|month|year|hour|minute, plural?)
OP(+ | -) · DIRECTION(before | after | from | ago | in)
CONNECTOR                         to/through/until/—/до
BOUNDARY(start | end)
PERIOD(weekend | quarter(1–4) | season(0–3))
HOLIDAY(id)                       ids contributed by holiday packs
FILLER                            skippable noise words
LITERAL(text)                     unknown word (kills a parse unless skipped as trailing noise)
```

Every token carries `span: [start, end]` into the original string, `source: string`, and `confidence: number` (1.0, lowered by typo correction).

### 4.3 AST — `DateExpr` (parsed, **unresolved**)

```ts
type DateExpr =
  | { type: "anchor";   anchor: Anchor }
  | { type: "offset";   base: DateExpr; n: number; unit: Unit; dir: 1 | -1 }
  | { type: "range";    start: DateExpr; end: DateExpr }
  | { type: "period";   period: PeriodRef; which: "this" | "next" | "last" }
  | { type: "boundary"; of: DateExpr; edge: "start" | "end" }
  | { type: "withTime"; base: DateExpr; time: { h: number; m: number } };

type Anchor =
  | { kind: "now" }
  | { kind: "relday";   offset: number }                          // today/tomorrow/…
  | { kind: "weekday";  day: number; which?: "this" | "next" | "last" }
  | { kind: "calendar"; y?: number; m?: number; d?: number }      // partial calendar dates
  | { kind: "holiday";  id: string; year?: number };
```

The AST does not know what date "next friday" is. A separate **resolver** evaluates it against `ResolveContext`. This split provides: deterministic tests (inject `now`), ambiguity (multiple ASTs, scored), round-trip (`AST → locale.format`), and future recurrence (one new node type; tokens, grammar plumbing, resolver, formatter extend without breaking the contract).

### 4.4 Engine API & resolve context

```ts
import { createEngine } from "@saywhen/core";
import { en } from "@saywhen/locale-en";
import { us } from "@saywhen/holidays-us";

const engine = createEngine({ locale: en, holidays: [us] });
// One locale per engine instance (an input field is in one language).
// Switching language = create a new engine (creation is cheap; lexicon indexes built once).

const r = engine.parse("next friday + 2 weeks", {
  now: new Date(),            // ALWAYS injectable
  timeZone: "Asia/Almaty",    // IANA; validated at createEngine/context creation — throws if bad
  weekStart: undefined,       // defaults from locale (en: 0/Sunday, ru: 1/Monday)
  dateOrder: undefined,       // defaults from locale (en: MDY, ru: DMY)
  allowPast: false,
  enableTime: false,
});

r: {
  status: "valid" | "ambiguous" | "invalid" | "idle";
  candidates: Candidate[];        // ranked; [0] is the answer, rest are alternatives
  corrections: Correction[];      // typo fixes applied, with spans
  errors: string[];
}

interface Candidate {
  expr: DateExpr;
  start: { utcIso: string; date: string };   // exact instant + local calendar date
  end:   { utcIso: string; date: string };   // === start for points
  isRange: boolean;
  hasExplicitTime: boolean;
  confidence: number;                         // 0–1 composite (see §5.4)
  text: string;                               // canonical via locale.format — round-trip safe
}
```

**Wire value format** (controller `value`): date-only point `YYYY-MM-DD`; range `YYYY-MM-DD/YYYY-MM-DD`; with `enableTime`, full ISO-8601 UTC instants joined by `/`. Empty string = cleared.

### 4.5 Holiday pack contract

```ts
interface HolidayPack {
  id: string;                                       // "us", "ru"
  entries: Array<{
    id: string;                                     // "christmas", "victory-day"
    compute(year: number): { m: number; d: number } | null;  // fixed, nth-weekday,
                                                    // Easter-derived (Computus), or
                                                    // lookup-table (lunar; null outside range)
    names: Record<string, string[]>;                // localeId → aliases (inflected forms allowed)
  }>;
}
```

At `createEngine`, holiday names for the active locale merge into the lexicon as `HOLIDAY(id)` entries; the resolver calls `compute` and rolls forward to the next occurrence unless a year is given. Lookup-table entries (lunar calendars) return `null` outside their covered range → candidate dropped with an explanatory error string.

## 5. Parsing pipeline (algorithms)

Five pure stages: `tokenize → lexicon/typo → grammar → score → resolve`.

### 5.1 Tokenize + lexicon lookup → token **lattice**

The locale splits normalized text into raw tokens. Each raw token may map to **multiple** semantic tokens (`"3/4"` → `MONTH(3)+DAY(4)` and `DAY(3)+MONTH(4)`; `"may"` → `MONTH(4)` and `LITERAL`). Stage output is a lattice — each position holds one or more candidates. Ambiguity is born here and carried forward, never destroyed early.

### 5.2 Typo correction (core algorithm, locale data)

Tokens with no lexicon hit run **Damerau-Levenshtein with keyboard-weighted substitution costs** (adjacent keys on the locale's layout cost 0.5; transpositions 0.5). Thresholds: length ≥ 4 → ≤ 1 edit; length ≥ 8 → ≤ 2; tokens ≤ 3 chars and pure numbers are never corrected. A curated per-locale typo/abbreviation map (e.g. `tmrw → tomorrow`, `b4 → before`) runs before edit-distance search. Corrected tokens keep reduced confidence; corrections are reported with spans.

### 5.3 Grammar — parser combinators over the lattice, **all parses**

~15 universal rules built from `seq / alt / opt / many` combinators that return **every** `(AST, rest)` pair, not the first. Inputs are short (< 15 tokens) so blowup is bounded; hard cap of 8 candidate ASTs. Locale escape-hatch rules are extra `alt` branches injected at documented extension points (anchor position, full-expression position). Chosen over an Earley chart parser deliberately: equivalent ambiguity power at this grammar size, but every rule remains a readable, individually testable function. `FILLER` tokens are skippable between rule elements; a parse that leaves non-filler tokens unconsumed fails.

Rule inventory (universal): explicit range (`X CONNECTOR Y`), offset (`X OP n UNIT` / `n UNIT DIRECTION X`), in/ago (`DIRECTION n UNIT` / `n UNIT ago`), period (`REL PERIOD-or-UNIT`), lookback (`last n UNIT` → range), boundary (`BOUNDARY of X`), anchor (relday, weekday±REL, calendar dates in locale `dateOrder`, ordinal day, holiday, holiday-relative weekday, holiday weekend), with-time (`X at TIME`), bare year, year-qualified anchor.

### 5.4 Score + dedupe

`confidence = Π(token confidences) × rule specificity × plausibility`, where plausibility comes from a cheap resolve: future preferred unless `allowPast`; locale `dateOrder` breaks `3/4`-style ties; calendar-invalid candidates (Feb 30) dropped. Candidates resolving to identical `(start, end)` merge, keeping the higher confidence. Output ranked; `status = "ambiguous"` when ≥ 2 survive with near scores (ratio > 0.8), else `"valid"` / `"invalid"`.

### 5.5 Resolve — zero-dep `ZonedDate`

Internal module; no Temporal, no date-fns. IANA offsets derived via `Intl.DateTimeFormat(..., { timeZone }).formatToParts` (the proven date-fns-tz technique). Calendar arithmetic on wall-clock fields, re-anchored to the zone afterward — DST-correct by construction. Policies (documented, tested): nonexistent local times (spring-forward gap) shift forward; ambiguous local times (fall-back) take the earlier offset; month-end overflow clamps (Jan 31 + 1 month = Feb 28/29). `now` always comes from context. Candidates expose both UTC instant and local calendar date.

## 6. Suggestions & ghost completion (`@saywhen/core/suggest`)

Generated, not curated — correct-by-construction and language-free:

- **Completions = grammar expectations.** When parsing stops mid-input, combinators report the expected-token set ("after `REL(next)`: `WEEKDAY | UNIT | PERIOD`"). Expected kinds map back through the lexicon to concrete continuations, rendered with `locale.format`. Typo-corrected prefixes still complete (matching runs through stage 5.2).
- **Ghost text** = remaining characters of the top-ranked completion.
- **Starters** (empty/short input) from a **semantic popularity table** keyed by meaning (`RELDAY(+1)`: 0.95, `PERIOD(week, next)`: 0.9, …), rendered per-locale. Holiday packs contribute automatically.
- **Scoring:** `prefix-match ratio (40%) + category weight (25%) + temporal proximity (20%) + popularity (15%)`, computed on semantic entries.
- **Range-building mode** after a `CONNECTOR`: only end-anchors suggested; boosts for clean ends (full week, end of month).
- **Fallbacks** when < 2 hits: bare number → "Nth of this/next month"; weekday prefix → this/next weekday; month prefix → "Month 1"; time-like token → "today/tomorrow at T".

Separate subpath export; `parse()`-only consumers never load it.

## 7. Headless controller & React

### 7.1 `@saywhen/core/controller`

Framework-agnostic subscribable store (binds to React via `useSyncExternalStore`; Vue/Svelte later for free):

```ts
const c = createDateInputController({ engine, timeZone?, now?, allowPast?, enableTime?,
                                      onCommit?, onChange?, onClear? });
c.getState();  // { rawInput, phase, candidates, alternatives, suggestions,
               //   activeSuggestionIndex, ghostText, value, announcement, corrections }
c.subscribe(listener);
c.actions: setInput(s) | commit() | acceptSuggestion(i?) | cycleSuggestion(±1)
         | resolveAmbiguity(candidateId) | clear() | setContext(partial);
c.keymap(key: "ArrowDown" | "ArrowUp" | "Tab" | "Enter" | "Escape"): boolean; // handled?
```

Phases: `EMPTY → TYPING → PARSED | RANGE_BUILDING → RESOLVED` (`AMBIGUOUS` is `PARSED` with alternatives > 0). `announcement` is a pre-localized screen-reader string via `locale.formatAccessible`. Pure UI helpers exported alongside: `getMonthGrid(y, m, weekStart)`, `clampTime`.

### 7.2 `@saywhen/react`

`useDateInput(options)` wraps the controller and returns state plus **prop getters** (downshift-style): `getInputProps()` (value/onChange/onKeyDown + full APG combobox ARIA: `role`, `aria-expanded`, `aria-activedescendant`, generated ids), `getListboxProps()`, `getOptionProps(i)`, `getGhostProps()` (aria-hidden). Accessibility is implemented once, in the getters — registry components cannot get it wrong.

### 7.3 Registry (shadcn-style)

Copy-paste Tailwind components users own, containing zero logic: `<DateInput>` (input + ghost overlay + suggestion popover + hidden `<input name>` for form posts), `<DateRangeInput>`, `<CalendarGrid>` (on `getMonthGrid`), `<TimeField>`. Distributed as registry JSON consumable by `npx shadcn add`.

## 8. Error handling

- **User input never throws.** Any string → a `ParseResult`; failures are `status: "invalid"` with `errors`.
- **Config always throws, at creation:** invalid IANA zone, unknown locale shape, malformed holiday pack → immediate `Error` with actionable message. `validateLocale()` available as a dev assertion.
- Calendar-impossible candidates filtered at resolve (with error strings), DST policies fixed per §5.5.
- Engine and controller are side-effect-free except controller subscriptions; no globals, no wall-clock reads outside injected `now` defaults.

## 9. Testing strategy

1. **Unit** — every grammar rule, tokenizer, typo-corrector, scorer; `ZonedDate` against a DST matrix (America/New_York, Europe/Moscow, Asia/Almaty, Australia/Lord_Howe half-hour DST), including gap/overlap instants and month-end clamps.
2. **Locale conformance suite** — a shared behavioral contract defined *semantically* ("locale's 'tomorrow' equivalent resolves to now+1d") that `locale-en` and `locale-ru` must both pass; plus per-locale variation matrices (seed phrases × case/whitespace/typo transforms; must-pass and fuzzy-target tiers — hot-date's proven approach). This suite is the quality gate for future community locales.
3. **Round-trip property tests** (fast-check): random `DateExpr` → `locale.format` → `engine.parse` → identical resolved dates, both locales. Catches parser/formatter drift structurally.
4. **Differential oracle** (`tools/oracle`): template-generated English phrases through chrono-node and our engine; diffs triaged into `bugs.md` / `wontfix.md`. Inherits chrono's edge-case decade as tests, not as code.
5. **Bench & a11y:** tinybench on challenge phrases, p99 < 1 ms/parse budget; axe + testing-library checks on registry components.

All tests inject `now`; zero wall-clock flakiness.

## 10. Build order (high level — implementation plan will refine)

1. `core`: ZonedDate math → tokens/lexicon infra → combinators + grammar → resolver → scoring (with `locale-en` minimal lexicon developed in lockstep).
2. `locale-en` complete + conformance suite + oracle harness.
3. `locale-ru` (validates every contract; expect small, contained contract fixes here).
4. `holidays-us`, `holidays-ru`.
5. `core/suggest` (expectation sets need grammar hooks landed in step 1).
6. `core/controller` → `react` → registry components → playground.

## 11. Future extensions (designed-for, not built)

Recurrence (`every monday` → new AST node + RRULE-ish output), more locales (Kazakh next — agglutinative morphology stays "enumerate inflections" since date vocab is finite), web-component wrapper over the controller, Vue/Svelte bindings, non-Gregorian display calendars.
