# saywhen — `locale-kk` + `holidays-kk` Design Spec

> Extension spec for Kazakh-language support. Builds on the approved core design
> (`docs/superpowers/specs/2026-06-11-saywhen-design.md`, §4.1 `LocaleAdapter`,
> §4.5 holiday packs, §9 testing). The core engine, suggest, and controller are
> **unchanged** — this adds two data packages that plug into existing contracts.

## 1. What we're building

Two new packages that make saywhen understand Kazakh dates in **both scripts**:

- **`@saywhen/locale-kk`** — a Kazakh `LocaleAdapter`, shipped as **two adapters built from one shared data source**: `kk` (canonical output in Cyrillic) and `kkLatn` (canonical output in the 2021 official Latin alphabet). Both accept either script on input.
- **`@saywhen/holidays-kk`** — a Kazakh `HolidayPack`: fixed-date national holidays plus the one moveable feast (Kurban Ait), with names in Cyrillic, Latin, Russian, and English.

The main spec (§11) already scopes this: *"more locales (Kazakh next — agglutinative morphology stays 'enumerate inflections' since date vocab is finite)."* This spec settles the script question that line left open.

**One core-grammar change is required** (see §2.1): Kazakh is *postpositional*, so its range connector (`дейін`) trails both endpoints (`X Y дейін`) rather than sitting between them (`X CONNECTOR Y`, as in en/ru). The core grammar gains **one locale-neutral postpositional-range rule** — the same precedent as plan 04's `inBareP` (the core gained a rule to serve a locale need). It is verified safe for en/ru (their medial connector means the rule never misfires). The Kazakh forward-offset (`кейін`) needs no core change — it is a `LocaleAdapter.rules` entry (a designed extension point). Suggest and controller are unchanged.

### Goals

- Parse the full Kazakh date feature set already proven for `en`/`ru`: relative days, weekdays (± this/next/last), calendar dates, month names, ordinals, unit offsets, periods/seasons, boundaries, ranges, times.
- Accept **both Cyrillic and Latin** input; emit a script-appropriate, **re-parseable** canonical form per adapter.
- Pass the shared `@saywhen/conformance` harness **unchanged** for each adapter (the pluggability proof, like `ru`).
- Holidays as a separate region pack, mirroring `holidays-ru`/`holidays-us`.

### Non-goals (recorded)

- A third "accepts-both, emits-both" merged output — output is one script per adapter.
- Generated/algorithmic morphology (no stemmer, no suffix synthesis at parse time — surface forms are enumerated, per main spec §4.1 / §5).
- Oracle (chrono) coverage stays English-only.
- Sighting-exact Kurban Ait (we use declared/tabulated dates over a bounded range; see §6).
- Wiring `kk`/`kkLatn` into the playground UI toggle — optional fast-follow, not required for this plan.

## 2. Architecture decision — two adapters, one package, shared data

Script has **two independent axes**, and conflating them is the trap:

- **Input** — which scripts we *recognize* (tokenizer + lexicon).
- **Output** — which script the formatter *emits* (what the user sees on commit; must be re-parseable).

A single "accept both, emit Cyrillic" adapter serves Cyrillic readers but echoes Cyrillic at a Latin-first user. Treating Latin as a first-class **output** audience requires a Latin-emitting formatter. We therefore ship two adapters that differ **only in output**:

| adapter | `id` | input | output |
|---|---|---|---|
| `kk` (primary) | `"kk"` | both scripts | Cyrillic |
| `kkLatn` | `"kk-latn"` | both scripts | Latin (2021) |

They are **not** duplicated code. Both are thin wrappers over one shared data source:

- `data.ts` — Cyrillic morphology tables (the single source of truth).
- `translit.ts` — a deterministic **Cyrillic→Latin (2021)** function plus an override map for ambiguous/loan letters.
- The **input lexicon is the union** (every Cyrillic surface form is registered alongside its Latin transliteration → same payload), shared by both adapters. Either script parses under either adapter (paste-tolerant).
- `kk.format` reads the Cyrillic tables. `kkLatn.format(expr, opts) = translit(kk.format(expr, opts))` — the Latin formatter is literally the Cyrillic formatter piped through the transliterator, so the two **cannot drift**, and every Latin string emitted is itself a lexicon entry (re-parseable). Same for `formatAccessible`.

Rejected alternatives: parse-time Latin→Cyrillic transliteration (a generative parse-time transform, lossy across the 2017/2018/2021 Latin revisions, against §5); two fully-separate packages (duplicates data, no shared transliterator).

### 2.1 Postpositional grammar (one core rule + one locale rule)

Kazakh places its relational words *after* the phrase. Two consequences:

- **Forward offset** — "екі аптадан кейін" (in two weeks) = `NUMBER UNIT кейін`. The core has prepositional `in` (`inP`: `DIRECTION NUMBER UNIT`) and postpositional `ago` (`agoP`: `NUMBER UNIT DIRECTION(ago)`), but no postpositional *forward* offset. This is supplied by a **`locale-kk` rule** (`LocaleAdapter.rules`, a designed extension point — **no core change**): match `NUMBER UNIT DIRECTION(after)` at the top level → `offset(now, n, unit, +1)`. It wins only when nothing follows `кейін` (otherwise the core's `relOffsetP` consumes the trailing base — "екі аптадан кейін X" = two weeks after X). `бұрын` (ago) maps to `DIRECTION ago` **and** `before`, so it reaches both the core `agoP` (bare, from now) and `relOffsetP` (with a base) with no rule. Because `LocaleRule.match` receives raw tokens and the core exports no combinators, the rule is a small hand-written `SemToken[]` walk (manual filler-skipping).
- **Range** — "дүйсенбіден жұмаға дейін" (from Monday to Friday) = `X Y дейін`, connector trailing. The core's `rangeP` needs the connector *between* endpoints, and a locale rule cannot fix this (it cannot recursively re-parse the two endpoint expressions). So the **core grammar gains one rule**, `rangePostfixP` = `seq(exprP, exprP, tok("CONNECTOR")) → range`, added to `topP`. It is locale-neutral and **cannot misfire on en/ru**: their connector is medial, so after the first endpoint the second `exprP` would have to start on a `CONNECTOR` token and fails. Verified by an en/ru regression test plus a synthetic trailing-connector test. `дейін`/`шейін` → `CONNECTOR`; ablative/dative endpoint forms (дүйсенбіден, жұмаға) are plain WEEKDAY surface entries in the lexicon.

## 3. Package layout

```
packages/locale-kk/
  src/data.ts        Cyrillic morphology tables (weekdays, months, rel, units, periods, numbers, function words, keyboard, typoMap)
  src/translit.ts    cyrToLat(s): deterministic 2021 mapping + OVERRIDES; used for both lexicon aliases and Latin output
  src/index.ts       buildLexicon (union), tokenize (both scripts), parseNumber, format/formatAccessible (Cyrillic), exports `kk` + `kkLatn`
  test/{conformance,e2e,format,accessible,roundtrip.property,suggest}.test.ts
  package.json, tsconfig.json, tsdown.config.ts
packages/holidays-kk/
  src/index.ts       HolidayPack `kk`; fixed-date entries + kurbanAit(year); names in kk/kk-latn/ru/en
  test/{compute,e2e}.test.ts
  package.json, tsconfig.json, tsdown.config.ts
```

Mirrors `packages/locale-ru/` and `packages/holidays-ru/` exactly, plus the new `translit.ts`. Both packages are added to the deps guard. `@saywhen/locale-kk` exports `cyrToLat` so `holidays-kk` (and tests) can reuse it if useful, though holiday names are small enough to hand-list (§6).

## 4. `locale-kk` — morphology enumerated as data

Implements the §4.1 `LocaleAdapter` contract: `{ id, tokenize, lexicon, parseNumber, format, formatAccessible, keyboard?, typoMap?, defaults }`. Feature coverage equals `ru`'s; surface forms are Kazakh. Indexing follows the core day model (weekday index 0 = Sunday).

### 4.1 Vocabulary (Cyrillic source; Latin via `translit`)

- **reldays:** бүгін (today, 0), ертең (tomorrow, +1), бүрсігүні (+2), кеше (yesterday, −1), алдыңғы күні (−2)
- **weekdays** (0=Sun…6=Sat): жексенбі, дүйсенбі, сейсенбі, сәрсенбі, бейсенбі, жұма, сенбі + abbreviations (жс, дс, сс, ср, бс, жм, сб)
- **this / next / last:** осы, бұл (this) · келесі, алдағы (next) · өткен (last)
- **months** (0–11): қаңтар, ақпан, наурыз, сәуір, мамыр, маусым, шілде, тамыз, қыркүйек, қазан, қараша, желтоқсан + abbreviations
- **units:** күн (day), апта (week), ай (month), жыл (year), сағат (hour), минут (minute)
- **periods / seasons:** апта соңы / демалыс (weekend), тоқсан (quarter — **also "90"**, a legal homonym carried as dual lattice readings, exactly like `ru`'s дня), көктем (spring), жаз (summer), күз (autumn), қыс (winter)
- **boundaries:** басы (start), соңы (end)
- **time words:** таңертең/таңғы (am), кешке/кешкі (pm), түс/түскі (noon), түн ортасы (midnight)

### 4.2 Agglutinative case forms (the Kazakh-specific work)

Kazakh marks grammatical relations with vowel-harmonic suffixes. The constructions date phrases need are **enumerated as surface strings** — no synthesis:

- **locative** (`-да/-де/-та/-те`): "келесі аптада" (next week / in the week), "наурызда" (in March)
- **ablative** (`-дан/-ден/-тан/-тен`): "екі аптадан кейін" (after/in two weeks — `unit-ABL + кейін`), range starts "дүйсенбіден" (from Monday)
- **dative** (`-ға/-ге/-қа/-ке`): range ends "жұмаға дейін" (to/until Friday)
- **"ago":** "N unit бұрын" (бұрын = before/ago)
- **ordinal day:** `-ыншы/-інші` (бірінші…) and numeric ordinals `21-і`, `21-ші`

Function words: `кейін` (after) → DIRECTION in; `бұрын` (ago); `дейін`/`шейін` (until) → CONNECTOR for ranges; ablative case-ending acts as the range "from" marker. Vowel harmony means each lemma lists *its* correct suffixed form (e.g. апта→аптада but ай→айда, күн→күні/күнде) — the same "list the agreeing form" discipline as `ru`'s case tables, with **no new engine machinery**. The formatter reads the same tables to emit agreeing forms.

### 4.3 Tokenizer

Extend `ru`'s `TOKEN_RE` to recognize both scripts: a Cyrillic class `[а-яёәғқңөұүһі]` **and** a Latin-with-diacritics class `[a-zäöüūıñğşç…]`. Keep `ru`'s mixed digit/letter split logic (e.g. "21-і", "2апта") and the date/time/number patterns. Cyrillic and Latin occupy disjoint Unicode ranges, so no cross-script token collision is possible.

### 4.4 Numbers — `parseNumber`

- **cardinals:** бір(1) екі(2) үш(3) төрт(4) бес(5) алты(6) жеті(7) сегіз(8) тоғыз(9) он(10) … жиырма(20) отыз(30) қырық(40) елу(50) алпыс(60) жетпіс(70) сексен(80) тоқсан(90) жүз(100)
- **compound:** "жиырма бір" (21) = tens + unit (same two-word rule as `ru`)
- **ordinals:** бірінші(1) екінші(2) үшінші(3) … and `N-ыншы/-інші`, plus numeric date ordinals `21-і`
- Both scripts: cardinals/ordinals are registered in both spellings (Latin "bir", "eki" …) so `parseNumber` and the lexicon resolve either.

### 4.5 Formatting

- **`kk.format`** emits canonical Cyrillic (every emitted form is lexicon data → re-parseable), following `ru`'s structure: relday words, "N unit"-counted offsets (Kazakh has no Slavic-style plural triples — a single counted form per unit), genitive-equivalent constructions for ranges/boundaries built from the case tables, `withTime` as `base сағат H:MM`.
- **`kkLatn.format`** = `cyrToLat(kk.format(...))`. Because the Cyrillic output is a closed set of known strings, transliteration is total and stable.
- **`formatAccessible`** (screen-reader phrasing, not necessarily re-parseable): natural Kazakh — ranges as "X-тан Y-ке дейін", offsets as "X-тан кейін / бұрын". Latin accessible = `cyrToLat(...)` of the Cyrillic accessible string.

### 4.6 Adapter config

`defaults: { weekStart: 1, dateOrder: "DMY" }` (Kazakhstan convention, Monday-start). `keyboard`: the Kazakh Cyrillic ЙЦУКЕН layout rows (Kazakh letters on the number row) for typo-adjacency; Latin typos rely on the curated `typoMap`. `typoMap`: a small curated set of common misspellings (both scripts) — e.g. ертен→ертең.

## 5. `translit.ts` — Cyrillic → Latin (2021)

A pure `cyrToLat(s: string): string` over the **2021 official Kazakh Latin alphabet**, applied per-character with a leading **override map** for multi-char and ambiguous cases. Unambiguous core letters (a, b, d, e, g, k, l, m, n, o, p, r, s, t, u, z and the Kazakh-specific ә→ä, ғ→ğ, қ→q, ң→ñ, ө→ö, ұ→ū, ү→ü, і→i, ш→ş, ж→j, ч→ç) cover essentially all date vocabulary. The override map pins the letters whose 2021 mapping is context-dependent or loan-only (и, й, у, ё, ю, я, ц, щ, ъ, ь, х/һ) and any irregular date words, finalized in the plan against the official alphabet table. Because it only ever runs over a **closed set of known Cyrillic forms** (our own tables and formatter output), full coverage is verifiable by test, not by handling arbitrary text.

## 6. `holidays-kk` — Kazakh holiday pack

Implements §4.5 `HolidayPack`: `{ id: "kk", entries: [{ id, compute, names }] }`. Names are keyed by locale id and include **`kk` (Cyrillic), `kk-latn` (Latin), `ru`, `en`** so each adapter resolves native names (the engine merges only names whose key equals `locale.id`; main spec §4.5).

**Fixed-date entries** (`compute: () => ({ m, d })`):

| id | date | kk |
|---|---|---|
| `orthodox-christmas` | Jan 7 | Рождество (observed) |
| `intl-womens-day` | Mar 8 | Халықаралық әйелдер күні |
| `nauryz` | Mar 22 | Наурыз мейрамы |
| `unity-day` | May 1 | Қазақстан халқының бірлігі күні |
| `defenders-day` | May 7 | Отан қорғаушы күні |
| `victory-day` | May 9 | Жеңіс күні |
| `capital-day` | Jul 6 | Астана күні |
| `constitution-day` | Aug 30 | Конституция күні |
| `republic-day` | Oct 25 | Республика күні |
| `independence-day` | Dec 16 | Тәуелсіздік күні |

**Moveable feast — Kurban Ait** (Eid al-Adha, 10 Dhu al-Hijjah): a `kurbanAit(year)` that returns the **officially declared Gregorian date from a bounded lookup table** (initially ~2020–2035), `null` outside the range. This mirrors `holidays-ru`'s `orthodoxEaster` pattern (bounded, returns `null` when uncovered → the engine drops the candidate with an explanatory error, §4.5 / §8), but is **table-driven** rather than algorithmic because the lunar→Gregorian date is set by sighting/decree, not cleanly computable. Recorded limitation: tabulated to declared dates; the range is extended as new years are announced.

## 7. Testing strategy (mirrors `ru` = plans 03 + 04)

Run from repo root; fixed conformance clock is Friday 2026-06-12, `America/New_York` (the harness default), with the adapter's `weekStart`. Kazakh-specific e2e/format tests may use `Asia/Almaty` (UTC+5).

- **Shared conformance, per adapter:** `runLocaleConformance({ locale: kk, seeds: [...≥12 Cyrillic phrases] })` and `runLocaleConformance({ locale: kkLatn, seeds: [...same phrases in Latin] })` — both pass the existing harness **unchanged** (semantic contract + must-pass case/whitespace matrix + fuzzy-typo tier ≥ 0.7). This is the dual-script pluggability proof.
- **Cross-script e2e:** a handful of cases asserting Latin input under `kk` and Cyrillic input under `kkLatn` resolve to identical dates (input tolerance), and that `kkLatn.format(expr)` round-trips under both adapters.
- **Round-trip property test:** 300 fast-check runs (random `DateExpr` → `format` → `parse` → same dates), like `en`/`ru`, for each adapter.
- **format + accessible + suggest tests:** canonical strings, screen-reader phrasing, and generated suggestion starters/ghost (suggest is generated from the locale per main spec §6 — `kk` gets autocomplete for free; assert top starters render in Kazakh).
- **holidays-kk:** `compute` tests (fixed dates; `kurbanAit` in-range value + `null` outside range exercised) and e2e through the engine (holiday by name resolves and rolls forward; cross-language: `kk` locale + a `ru`-name lookup; Latin holiday name under `kkLatn`).
- **deps guard** extended to `@saywhen/locale-kk` and `@saywhen/holidays-kk` (externalization / dist shape).

## 8. Defaults, conventions, build

- TS strict, `exactOptionalPropertyTypes` (conditional-spread optional ctx fields), `moduleResolution: bundler`, Vitest 3, tsdown (`fixedExtension: false`) — identical to the existing packages.
- `@saywhen/locale-kk` depends on `@saywhen/core` (peer/dev as the other locales do); `@saywhen/holidays-kk` depends on `@saywhen/core`; tests use `@saywhen/conformance` + `fast-check`.
- Env quirk unchanged (nvm lazy-load PATH prefix).

## 9. Success criteria

- `@saywhen/locale-kk` exports `kk` and `kkLatn`; both pass the shared conformance harness unchanged and a 300-run round-trip property test; either script parses under either adapter; each emits its own script canonically and re-parseably.
- `@saywhen/holidays-kk` resolves all fixed holidays and in-range Kurban Ait, returns explanatory invalids outside range, and works cross-language.
- Full repo suite + typecheck + builds + dist smokes green. The **only** core change is one locale-neutral `rangePostfixP` grammar rule (§2.1), covered by an en/ru regression test; suggest and controller code are unchanged.

## 10. Known limitations (deliberate)

- **Boundaries deferred:** Kazakh boundaries (`ай соңы` = end of month) are *postpositional* (the boundary word trails), like ranges — so they would need a **second** locale-neutral core rule (`boundaryPostfixP`, the same shape as `rangePostfixP`). Only the range rule was approved for v1, so `басы`/`соңы` are a fast-follow; they are excluded from the round-trip arbitrary. This is the one §4.2 construction not in kk v1.
- Latin output is the 2021 official alphabet only; earlier Latin variants (2017 apostrophe / 2018 acute) are not emitted (may be accepted as `typoMap`/alias input if cheap).
- Kurban Ait is tabulated to declared dates over a bounded range, not sighting-computed.
- Oracle stays English-only; no Kazakh chrono cross-check.
- Transliteration is defined over our closed Cyrillic form set, not arbitrary Kazakh text.
