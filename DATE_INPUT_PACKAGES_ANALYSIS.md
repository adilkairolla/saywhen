# Human-Text Date Input Packages — Full Analysis & Comparison

> Two web components in `.var/`, both solving the same problem — letting a user type a date in
> **natural language** ("next friday", "christmas 2026", "march 4 to 28") and getting back a
> canonical machine date. They take **opposite architectural approaches**.

| | `.var/hot-date` | `.var/package` |
|---|---|---|
| **npm name** | `@stolinski/hot-date` | `@w3cj/magic-date-picker` |
| **Version** | 0.1.2 | 0.1.1 |
| **Author** | Scott Tolinski | w3cj (CJ) |
| **One-liner** | "A date input web component." | "A magical date picker with natural language input." |
| **Element tag** | `<hot-date>` | `<magic-date-picker>` |
| **Framework** | **None** — vanilla custom element | **Lit 3** |
| **Parser** | **Hand-rolled** grammar (ordered rules) | **chrono-node** + custom layers |
| **Runtime deps** | **0** (Temporal polyfill bundled in) | `lit`, `chrono-node`, `date-fns`, `open-props` |
| **What ships** | Source repo + single bundled ESM | Compiled `dist/` only (no `src`) |
| **Form-associated** | ✅ Yes (`ElementInternals`) | ❌ No |
| **UI surface** | Text input + ghost completion overlay | Text input + suggestion list + **calendar grid** + **time picker** + preview |

---

## Part 1 — `@stolinski/hot-date`

### 1.1 What it is

A **minimal, dependency-free** date input. It renders as a single `<input>` inside a shadow DOM with a
"ghost" overlay that shows an inline completion suffix (like an editor autocomplete) plus the resolved
date label. The whole thing is a **vanilla custom element** — no framework, no Lit, no virtual DOM. The
published artifact is one self-contained ES module (`dist/hot-date.js`).

### 1.2 Architecture — the parse pipeline

Every keystroke runs the input through a strictly downward, **stateless** pipeline. There is no cached
state in the parser — context (`now`, timezone, locale, week-start) is passed explicitly on every call.

```
raw text
   │
   ▼  normalizeFuzzyInput()        string-utils.ts
   │    lowercase, collapse whitespace,
   │    Damerau-Levenshtein 1-edit typo fix per token,
   │    hard-coded substitutions (b4→before, tmrw→tomorrow, wknd→weekend…)
   ▼
JsParserEngine.parse()             js-parser-engine.ts
   │    builds RuleContext { normalizedInput, now, timeZone, parseContext, factory }
   │
   ▼  Ordered rule list — FIRST MATCH WINS (no backtracking):
   │    1.  parseExplicitRange            "X to/through/until/- Y"
   │    2.  parseAnchorPlusDurationPoint  "anchor + N unit" / "anchor plus N unit"
   │    3.  parseDurationBeforeAfterAnchor "N before/after anchor"
   │    4.  parseInDurationPoint          "in N units"
   │    5.  parseAgoShorthand             "N ago"
   │    6.  parseBoundaryOfPeriod         "start/end of [this/next/last] week/month/year"
   │    7.  parseThisNextLastPeriod       "this/next/last week/month/year" → range
   │    8.  parseLookbackWindow           "[the] last/past N units" → range
   │    9.  parseAnchorRange              anchors that yield ranges ("labor day weekend")
   │    10. parsePastDurationPoint        "N in the past"
   │    11. parseFutureDurationPoint      "N from anchor/now"
   │    12. parsePointValue   (fallback)  parseAnchor() → parseDateEndpoint()
   │            │
   │            ├─ parseAnchor()      anchors.ts  — today/tomorrow, ordinals,
   │            │                     weekdays, "next X in Y month", holidays
   │            └─ parseDateEndpoint() endpoints.ts — M/D/Y numeric, "month day year"
   ▼
CandidateFactory.createPoint/createRange   candidates.ts
   │    stamps utcIso + local isoDate (YYYY-MM-DD via Temporal) + human label
   ▼
ParseResult                          parser-types.ts
   │
   ▼
HotDateElement.renderAll()           hot-date.ts — ghost overlay, label, events
```

The rule **ordering is load-bearing**: `parseExplicitRange` must run before `parsePointValue`,
otherwise "X to Y" would parse only its left half.

### 1.3 The web component (`src/hot-date.ts`, 666 lines)

- **Vanilla custom element.** A `<template>` is stamped once and `cloneNode`d per instance. Shadow
  root is `"open"`.
- **Form-associated:** `static formAssociated = true`. `ElementInternals` (lazily acquired) drives
  `setFormValue()` / `setValidity()` so the element participates in `<form>` submit and validation.
- **Observed attributes:** `value`, `timezone`, `locale`, `week-start`, `mode`, `allow-past`,
  `placeholder`, `name`, `disabled`, `required`.
- **Properties:** `rawInput`, `value`, `valueKind`, `status`, `parseResult`, `candidates`,
  `suggestions`, `activeSuggestionIndex`.
- **Methods:** `focus()`, `clear()`, `confirm()`, `acceptSuggestion(i?)`, `cycleSuggestion(±1)`,
  `resolveAmbiguity(groupId, optionId)`, `setContext(partial)`.
- **Events** (all `bubbles + composed`): `raw-input-change`, `parse-change`, `suggestions-change`,
  `ambiguity-change`, `value-change`, `value-commit`, `commit-blocked`, `suggestion-accept`, `clear`.
- **Keyboard:** `↓/↑` cycle suggestions, `Tab` accepts the active completion (only when the caret is at
  the end and a completion tail exists), `Enter` commits, `Esc` resets.
- **Ghost overlay:** a transparent mirror of the typed text plus a half-opacity completion tail and a
  `Tab` hint chip — so the suggestion visually trails the cursor.
- **Styling:** all CSS lives inside the shadow `<style>`. Exposes `::part(field|input|ghost|hint)`.
  Ambiguity chips render in **light DOM** (`<div slot="ambiguity">`) so outer `button {}` rules cascade.

**Canonical value format** (the element's `value`):
- Point → `YYYY-MM-DD`
- Range → `YYYY-MM-DD/YYYY-MM-DD`

### 1.4 The parser engine

**Key types** (`parser-types.ts`):

```ts
type ParseStatus = "idle" | "valid" | "ambiguous" | "invalid";
type ValueKind   = "point" | "range" | null;

interface Candidate {
  id: string;
  kind: "point" | "range";
  utcIso?: string;             // exact moment, UTC
  isoDate?: string;            // calendar date in local tz (YYYY-MM-DD)
  range?: { startUtcIso; endUtcIso; startDate; endDate };
  label: string;
  confidence: number;
  source: "rule" | "fallback";
}

interface ParseResult {
  status: ParseStatus;
  rawInput: string;
  valueKind: ValueKind;
  candidates: Candidate[];
  suggestions: CompletionSuggestion[];
  ambiguityGroups: AmbiguityGroup[];   // ⚠ always [] — see limitations
  selectedCandidateId: string | null;
  previewLabel: string | null;
  canonicalValue: string | null;
  errors: string[];
}
```

**What it understands** (from `grammar.ts` 562 lines, `anchors.ts`, `endpoints.ts`):

- Absolute dates: `4/15/2026`, `march 14`, `march 14 2026`, `march 14th, 2026` (2-digit years: ≤49 → 20xx, ≥50 → 19xx).
- Relative: `today`, `tomorrow`, `yesterday`, `the day after tomorrow`, ordinals (`the 15th`).
- Weekdays: `friday`, `next friday`, `this monday`, `last tuesday`, `next monday in march`.
- Arithmetic: `tomorrow + 3 days`, `3 days before christmas`, `2 weeks from monday`, `5 days ago`, `in 2 weeks`, `3 weeks in the past`.
- Periods (→ ranges): `this week`, `next month`, `last year`, `the past 2 weeks`, `start/end of month`.
- Ranges: `march 14 to 28`, `monday through friday`, `4/1 - 4/15` (note: needs spaces around `-`).
- **Holidays** (`holidays.ts`, 15 entries): Christmas(+Eve), New Year's(+Eve), Halloween, Valentine's,
  Independence Day, Labor Day, Memorial Day, Thanksgiving, Mother's/Father's Day, and the **Easter
  cycle** (Good Friday, Easter Monday, Palm Sunday) computed via the **Gregorian/Butcher Computus
  algorithm** inlined in `date-utils.ts`. Holiday-relative ("fri before christmas") and weekends
  ("labor day weekend" → range) are supported. Holidays always roll forward to the *upcoming* occurrence.

**Ambiguity:** The `AmbiguityGroup` type is fully designed (weekday scope, week-start convention, etc.)
but the engine **never populates it** — parsing is purely deterministic, one candidate or none. The
status `"ambiguous"` is effectively unreachable in the current build.

### 1.5 Date math

- Uses **`@js-temporal/polyfill`** (`Temporal.ZonedDateTime`) for *all* arithmetic and boundary ops, so
  it is **DST-correct** (adding "1 day" across a DST seam, calendar-aware month/year add).
- Each candidate carries **both** `utcIso` (exact instant) and `isoDate` (local calendar day).
- `now` is injected via `ParseContext.nowIso` → fully deterministic & testable (tests pin
  `2026-04-15T12:00:00Z`).
- Week start configurable (`week-start="monday"`). Default timezone = `Intl…resolvedOptions().timeZone`;
  default locale = `navigator.language`.
- ⚠ Human labels are hardcoded to `"en-US"` formatting, ignoring the context `locale`.

### 1.6 Completion / fuzzy input

- `complete.ts` holds a ~90-term `VOCABULARY` and does **word-boundary-aware prefix matching** tolerating
  1 edit, returning the top 5 suggestions. The ghost tail is `insertText.slice(typed.length)`.
- `string-utils.ts` does **per-token Damerau-Levenshtein** typo correction (full DP with transpositions),
  guarded by a `|len diff| ≤ 1` filter, plus a hard map of abbreviations. So `tomorow`, `teusday`,
  `marhc`, `febuary`, `b4`, `tmrw`, `wknd` all resolve.

### 1.7 Dependencies & tooling

- **Zero runtime dependencies** in `package.json` (no `dependencies` key). The Temporal polyfill is a
  **devDependency bundled into** `dist/hot-date.js` by Vite (`inlineDynamicImports`, ESM-only, es2022).
- Tooling: Vite 5, Vitest 2 (jsdom), TypeScript 5.6, tinybench (parser micro-bench), tsx, jsdom.
- **Tests:** 3 suites — direct engine tests (25+ cases incl. all holidays & fuzzing), element tests in
  JSDOM (14 cases, fake timers, polyfilled ElementInternals), and a **generated variation matrix**
  (~133 must-pass + ~594 fuzzy + 5 must-reject cases) asserting canonical outputs. A
  `variation-coverage` script reports coverage.

### 1.8 Strengths & limitations

**Strengths:** tiny & dependency-free (self-contained single file); fast & predictable (first-match, no
backtracking); Temporal correctness; dual UTC/local outputs; injectable `now`; native form association;
generous fuzz tolerance.

**Limitations / dead code:**
- Ambiguity system is a **stub** (`ambiguityGroups` always `[]`).
- `mode` attribute observed but **never used**.
- `productRules.allowPast` / `defaultTime` / `timeOnlyPolicy` are built into context but **never
  enforced** by any rule.
- Labels hardcoded to `en-US`.
- `" - "` range delimiter **requires surrounding spaces**.
- Number words cap at **12** ("thirteen weeks" fails).
- `next friday` on a Friday returns the *following* Friday (current day always skipped).
- No IANA timezone validation (bad tz string → Temporal throws).
- Ghost overlay has minimal screen-reader semantics.

---

## Part 2 — `@w3cj/magic-date-picker`

### 2.1 What it is

A **full-featured, "magical"** date picker built on **Lit 3**. Beyond a text input it ships a popup
**suggestion list**, a **calendar grid** (W3C APG pattern), a **time picker**, and a live **preview**
region. Natural-language parsing is powered by **chrono-node** wrapped in several custom layers
(normalization, holidays, periods, ranges, compounds, year-anchoring). Only the compiled `dist/` is
present — the architecture below is reconstructed from its `.d.ts` files and bundled JS.

### 2.2 Architecture — modules & data flow

```
src/
  components/   Lit web components (UI)
  parsing/      chrono-node pipeline (pure logic)
  suggestions/  autocomplete engine (pure logic)
  models/       output + event shapes
  styles/       3-tier CSS design tokens
  utils/        formatting
  magic-date-picker.ts   public shell
  index.ts / cdn.ts      entry points
```

**Flow: typed text → output**

1. User types into `<magic-dp-text-input>` (a combobox). Debounced → `SuggestionEngine.update(input)`.
2. `update()` calls `parse(input, refDate)` and derives a **phase**
   (`EMPTY → SUGGESTING / PARSED / RANGE_BUILDING / MODIFYING / RESOLVED`).
3. `parse()` (`parsing/parser.ts`) runs a **layered pipeline** (see 2.4), returning one of
   `ParseResult` | `RangeBuildingResult` | `YearContextResult` | `null`.
4. The engine builds `RankedSuggestion[]` (`matcher` + `scorer`, plus `fallbacks` if < 2 results),
   stores `EngineState`, and hands it to the component.
5. `DatePicker` (`<magic-dp-core>`) orchestrates: in `PARSED` it fires **`date-parse`**; on acceptance
   (Enter / suggestion click / calendar click / time change) it calls `engine.resolve()` → `RESOLVED`,
   dispatches **`date-change`** with a `DatePickerOutput`, and **rewrites the input** to the canonical text.
6. `MagicDatePicker` shell catches domain events, updates the reflected `value` attribute, and
   re-dispatches standard **`input` / `change` / `value-commit`** for framework consumers.

**Component composition** (all `<magic-dp-*>` are internal, self-registered with a guard):

```
<magic-date-picker>            → public shell (MagicDatePicker)
  └ <magic-dp-core>            → orchestrator (DatePicker)
       ├ <magic-dp-text-input>       combobox + inline ghost text
       │    └ <magic-dp-suggestion-list>   ARIA listbox (grouped options)
       ├ <magic-dp-calendar-grid>    W3C APG date-grid
       ├ <magic-dp-date-preview>     ARIA live region (SR announcements)
       └ <magic-dp-time-picker>      spinbutton controls (hidden unless enable-time)
```

### 2.3 The web components (Lit 3.3.2)

- All extend `LitElement`; reactive props use the `accessor` keyword (Lit 3 / TS standard decorators);
  `@state`, `@query`, `@customElement`.
- **Public shell props:** `theme` ("light"|"dark"|auto, reflected), `enableTime` (`enable-time`),
  `placeholder`, `disabled`, `readonly`, `locale`, `value` (reflected ISO 8601, two-way), plus full ARIA
  pass-through (`aria-label/describedby/invalid/errormessage` tunnel down to the real `<input>`).
- **Theming — 3-tier CSS tokens** under `@layer magic-dp.defaults`:
  1. **Open Props primitives** inlined via `unsafeCSS()` into `:host` (shadow-local).
  2. **Semantic** `--magic-dp-color-*` using `light-dark()` + `color-scheme: light dark`.
  3. **Component** tokens (`--magic-dp-calendar-radius`, etc.).
  Consumers override any `--magic-dp-*` from outside the shadow without `!important`.
- **Accessibility-first:** forced-colors (`@media (forced-colors: active)` remaps to system colors),
  `prefers-reduced-motion` zeroes durations, WCAG AA contrast, full APG keyboard patterns.

### 2.4 The parsing layer (chrono-node + custom)

`parse(text, refDate?)` is the single entry point. Pipeline:

1. **Normalize** (`normalize.ts`): Unicode NFKC fold, smart-quote/dash replacement, then a 4-pass
   per-token correction — exact-vocab hit → curated typo map (`tmrw→tomorrow`, `xmas→christmas`,
   `feburary→february`, …) → abbreviation map (`wk→week`, `3d→3 days`) → **QWERTY-weighted
   Damerau-Levenshtein** (`keyboard.ts`: adjacent-key substitutions cost 0.5). Records `Correction[]`.
2. **Connector scan**: trailing ` to / through / until / thru / - / …` ⇒ `RangeBuildingResult`.
3. **Compound modifiers** (`compound.ts`): trailing `+2 weeks`, `plus 3 months` ⇒ parse base, then
   `applyModifier`.
4. **Bare year** (`isBareYear`) ⇒ `YearContextResult`. Year ranges (`2020-2025`) and year extraction
   (`christmas 1999`) handled here too.
5. **Holidays** (`holidays.ts`, **43 entries**) and **period patterns** (`ranges.ts`: weeks/months/
   quarters/seasons/"rest of month").
6. **chrono-node** (`chrono-instance.ts`): `chrono.en.casual.clone()` plus a **custom parser +
   refiner** that fix `"N <unit> from <date>"` (chrono natively gets the direction wrong). Uses
   `forwardDate` when a date-only expression is > 30 days in the past, producing **two ambiguous
   interpretations**.
7. **Connector-split fallback** when chrono returns nothing but both halves parse.

Confidence is bucketed high/medium/low; corrected inputs are downgraded one level.

**Holiday catalog is far larger than hot-date's:** all US federal holidays + Juneteenth, Election Day,
Black Friday/Cyber Monday, the full **Easter cycle (Meeus/Jones/Butcher)**, and **lunar/Islamic dates
(Chinese New Year, Diwali, Eid al-Fitr/Adha)** via **hardcoded 2020–2035 lookup tables**.

### 2.5 The suggestions layer

A `SuggestionEngine` class (not a component) owns a catalog + bigram index + state machine.

- **Catalog** (`catalog.ts`): ~140 entries built relative to `refDate` — relative days, 14 day-of-week
  phrases, periods, Q1–Q4, seasons, next-30-calendar-days, all 43 holidays, month full-ranges,
  colloquial ("end of month"), times, "N days ago", modifiers.
- **Matcher** (`matcher.ts`): bigram fast-path for two-word prefixes, exact prefix first, then
  Damerau-Levenshtein fuzzy.
- **Scorer** (`scorer.ts`): composite 0–100 from input-match-ratio (40%), category weight (25%),
  temporal proximity (20%), popularity (15%). In `RANGE_BUILDING` mode a **range-end boost** (30%)
  rewards full-week / full-month end alignment.
- **Fallbacks** (`fallbacks.ts`): when < 2 matches, infer intent from partial input (bare number →
  "Nth of month", day prefix → weekday, month prefix, time-like token → "Today at …").
- **Year anchors** (`year-anchors.ts`): on `YearContextResult`, offer "Jan 1 / today-in-year / Dec 31 /
  All of {year}" pinned to the top.
- **Ghost text** inline completion + an 11-phrase **rotating placeholder** ("Thanksgiving 2026",
  "tmrrow + 5 days", "05/08/1985 to 05/08/2028", …).
- In `PARSED` phase it injects two synthetic rows (echo of input + canonical form) above the suggestions.

### 2.6 Output model

```ts
type DatePickerOutput = {
  start: { iso: string; unix: number };
  end:   { iso: string; unix: number };   // always present; == start for single dates
  isRange: boolean;
  includesTime: boolean;
  text: string;                            // canonical, round-trip-safe display string
};

type ParsedDateSpan = {
  start: Date; end: Date;
  isRange: boolean; hasExplicitTime: boolean;
  humanReadable: string; confidence: number;   // 0–1
};

type ParseResult = {
  spans: ParsedDateSpan[];
  alternativesDescription?: string;        // when > 1 interpretation
  normalizedInput?: string; corrections?: Correction[];
};
```

- `value` formats: `"2026-04-20"`, range `"2026-04-20/2026-04-25"`, or full ISO timestamps when
  `enable-time`. Empty string clears.
- **Events:** `date-change` (`DatePickerOutput`), `date-clear`, `date-parse` (`DateParseDetail` — fires
  *before* resolve, exposing ambiguous alternates), plus re-dispatched `input`/`change`/`value-commit`.
- `text` is the **canonical** rendering ("Mon, Apr 20, 2026 at 3:00 PM") — also written back into the
  input — **not** the user's original text. Round-trip safe.

### 2.7 Build outputs & dependencies

| File | Format | Notes |
|---|---|---|
| `date-picker.mjs` | ESM | deps **externalized** (`lit`, `chrono-node`, `date-fns`); open-props inlined |
| `date-picker.cjs` | CJS | same externalization |
| `date-picker.bundled.mjs` | ESM | **all deps bundled** (`/bundled` export) |
| `magic-date-picker.cdn.js` | IIFE | everything bundled, self-registers, `window.MagicDatePicker` |
| `dist/types/**` | `.d.ts` | full declarations |

- **`lit`** ^3.3.2 — component framework.
- **`chrono-node`** ^2.9.0 — base NLP date engine (`en.casual` preset, custom parser/refiner).
- **`date-fns`** ^4.1.0 — calendar arithmetic / range boundaries (ISO weeks, quarters, seasons).
- **`open-props`** ^1.7.23 — design-token primitives, **inlined (bundled) even in the .mjs build**.
- `"sideEffects": true` (it calls `customElements.define` at import).

### 2.8 Strengths & limitations

**Strengths:** layered parsing with graceful degradation; forward-date ambiguity surfaced to the user;
fixes chrono's `"from"` bug; canonical round-trip guarantee; **excellent accessibility** (APG combobox /
grid / listbox / spinbutton, live region, forced-colors, full ARIA tunneling); rich UI (calendar + time
+ suggestions); three consumption modes (externalized / bundled / CDN); overridable design tokens; emits
standard form events.

**Limitations:**
- **US-centric** holidays; **lunar/Islamic dates hardcoded to 2020–2035** (null outside).
- **English-only parsing** — `locale` affects display only, not parsing ("demain"/"mardi" fail).
- `open-props` bundled even in the externalized build (extra weight, not tree-shakeable).
- **No form association** (no `ElementInternals`, can't join native `<form>` validation).
- `SuggestionList.alternatives` is `@deprecated` dead API; `lazy` prop not wired to the public shell.
- Pre-1.0 (0.1.1) — API not yet stable.

---

## Part 3 — Head-to-Head Comparison

### 3.1 Philosophy

| | `hot-date` | `magic-date-picker` |
|---|---|---|
| **Design ethos** | Minimal, embeddable, form-native primitive | Full-featured, polished, accessible picker |
| **Footprint** | Tiny, single self-contained file, **0 deps** | Larger, 4 deps (or bundled) |
| **UI** | Just input + ghost completion | Input + suggestions + **calendar** + **time** + preview |
| **Parsing power** | Hand-rolled, ~15 holidays, deterministic | chrono-node + layers, **43 holidays**, ambiguity-aware |

### 3.2 Feature matrix

| Feature | hot-date | magic-date-picker |
|---|---|---|
| Natural-language single dates | ✅ | ✅ |
| Ranges ("X to Y") | ✅ | ✅ (with range-building UX) |
| Relative / arithmetic ("tomorrow + 3 days") | ✅ | ✅ (compound modifiers) |
| Holidays | ✅ ~15 (US + Easter) | ✅ 43 (US + Easter + lunar/Islamic 2020–35) |
| Typo / fuzzy correction | ✅ Damerau-Lev + abbrev map | ✅ **QWERTY-weighted** Damerau-Lev + typo/abbrev maps |
| Inline ghost completion | ✅ | ✅ |
| Suggestion list (popup) | ⚠ data only, no built-in list UI | ✅ ARIA listbox |
| **Calendar grid UI** | ❌ | ✅ W3C APG |
| **Time picker** | ❌ (parses time, no UI) | ✅ (`enable-time`) |
| Ambiguity surfaced to user | ❌ (type exists, unused) | ✅ (`date-parse` + alternatives) |
| **Form association** | ✅ `ElementInternals` | ❌ |
| Theming tokens | ⚠ `::part()` only | ✅ 3-tier `--magic-dp-*` + light/dark |
| Accessibility depth | ⚠ basic | ✅ extensive (APG, forced-colors, live region) |
| DST-correct math | ✅ Temporal | ✅ date-fns / chrono |
| Injectable `now` (testability) | ✅ `nowIso` in context | ⚠ `refDate` internal, less exposed |
| Build variants | 1 (ESM) | 4 (ESM / CJS / bundled / CDN) |
| i18n of **parsing** | ❌ en-only | ❌ en-only |
| i18n of **display** | ⚠ hardcoded en-US | ✅ via `locale` / `Intl` |

### 3.3 Parser approach — hand-rolled vs chrono-node

- **hot-date** owns its grammar end-to-end: an **ordered, first-match rule list** with explicit regexes.
  Predictable, fast, no backtracking, fully auditable — but you pay for every new phrase by hand, and
  its surface is narrower (caps at 12 number-words, `-` needs spaces, no ambiguity output).
- **magic-date-picker** stands on **chrono-node** and wraps it with normalization, holidays, periods,
  compounds, and year-anchoring. Broader linguistic coverage out of the box and genuine ambiguity
  handling (it even *patches* a chrono direction bug for "from"), at the cost of a heavier dependency
  and less transparent internals.

### 3.4 When to pick which

**Choose `hot-date` when:**
- You want a **lightweight, zero-dependency** primitive.
- **Native form integration** matters (it's `formAssociated`; submits & validates in `<form>`).
- You'll supply your **own UI chrome** and just need a smart text field + parser.
- Determinism, small bundle, and auditability beat breadth.

**Choose `magic-date-picker` when:**
- You want a **complete, polished, accessible** picker (calendar + time + suggestions) with little work.
- You need **broad natural-language coverage**, more holidays, and **ambiguity disambiguation** UX.
- **Theming / dark mode / a11y** are first-class requirements.
- You can accept the dependency weight (or use the bundled/CDN builds), and you don't need native form
  association (you'll wire `value`/`change` yourself).

### 3.5 Shared traits & shared gaps

- Both are **standards-based custom elements** emitting **`YYYY-MM-DD` / `YYYY-MM-DD/YYYY-MM-DD`**
  canonical values and exposing a reflected `value`.
- Both do **per-token fuzzy typo correction** and **inline ghost completion**.
- Both compute **Easter via the same class of Computus algorithm** and roll holidays forward.
- Both are **English-only for parsing** and **pre-1.0** (0.1.x) — neither guarantees API stability yet.
- Neither parses non-English natural language; `magic-date-picker` localizes display only.

---

*Generated from a full read of `.var/hot-date` source (~4,000 LOC) and the `.var/package`
`dist/` type declarations + bundled JS.*
