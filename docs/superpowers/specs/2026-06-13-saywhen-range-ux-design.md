# saywhen — Range-input UX (design spec)

**Date:** 2026-06-13
**Status:** approved
**Builds on:** plans 01–08 (core engine + en/ru/kk locales + playground), merged to `main`
**Spec for plan:** `docs/superpowers/plans/2026-06-13-saywhen-09-range-ux.md` (to be written)

## Goal

Make natural date **ranges** parse the way users actually type them — `from feb 24 to june 30`, `between … and …`, the Russian `с … по …` / `между … и …`, the month-elided `march 1 to 15` / `1 по 15 марта` — and infer years sensibly (`feb 24 to june 30 2026` should not error; a bare past range should land in the current year, not next). One core grammar/resolve change driven by per-locale vocabulary, across en/ru/kk, with typeahead and clearer errors.

## Context — verified current state (clock = Fri 2026-06-12, locale `en` unless noted)

Probed against `main`:

| Input | Today | Note |
|---|---|---|
| `feb 24 to june 30` | `2027-02-24 … 2027-06-30` | works; bare → **forward-rolls to next year** |
| `feb 24 2026 to june 30 2026` | `2026-02-24 … 2026-06-30` | year-pinned works |
| `nov 1 to feb 28` | `2026-11-01 … 2027-02-28` | **wrap already works** (end re-anchors to start) |
| `the 21st to the 25th` | `2026-06-21 … 2026-06-25` | monthless d-only ranges anchor to **today's month** |
| `from feb 24 to june 30` | ❌ no parse | leading opener unsupported; also blanks typeahead |
| `between feb 24 and june 30` | ❌ no parse | `between` / `and` absent |
| `march 1 to 15` | ❌ no parse | bare-day endpoint unsupported |
| `feb 24 to june 30 2026` | ❌ `Range ends before it starts.` | bare start rolls to 2027, pinned end 2026 |
| `3 to 5` | ❌ no parse | bare NUMBER not a date (keep this) |
| ru `1 марта по 15 марта` | `2027-03-01 … 2027-03-15` | medial `по` works |
| ru `с 1 по 15 марта` | ❌ no parse | `с` opener + front-elision absent |
| ru `между 1 марта и 15 марта` | ❌ no parse | `между` / `и` absent |
| kk `X-тен Y-ке дейін` (postpositional) | works | via existing `rangePostfixP` |

**Architecture facts (verified):** `Lexicon = Record<string, SemPayload[]>` and `add()` *appends*, so one surface form can carry several payloads; `lattice.ts` turns each payload into a stream alternative and `expandStreams` parses them all (this is how `-` is both `OP` and `CONNECTOR`). `Anchor` has a `kind: "calendar"; y?; m?; d?` discriminant. Combinator parsers return `PRes[]` (`[]` = no parse); `map` cannot drop a result. Only two range cases exist in shared conformance (weekday range, lookback span); **no test anywhere pins a calendar-range's year**, so changing bare-calendar-range year semantics regresses nothing.

## Approach

**Core-first hybrid (chosen).** One marker payload kind + two grammar rules + a rewritten `resolve` range-case live in **core** and are driven by **lexicon words** each locale supplies. Locale rules are the escape hatch for genuinely divergent grammar (kk stays postpositional). Rejected: per-locale duplication of the prepositional rule; a phased/partial scope.

---

## §1 — Prepositional openers (`from … to …`, `between … and …`, `с … по …`, `между … и …`)

Add a marker `SemPayload` kind **`RANGE_OPEN`** (no fields):

```ts
// types.ts — SemPayload union
| { kind: "RANGE_OPEN" }
```

Extend the **existing** `rangeP` with an optional leading opener (no parallel rule):

```ts
// grammar.ts
const rangeP: P = map(
  seq(opt(tok("RANGE_OPEN")), exprP, tok("CONNECTOR"), exprP),
  ([, a, , b]) => buildRange(a, b),   // buildRange defined in §2
);
```

- The opener is **consumed when present**; when absent, `opt` yields the empty branch and behaviour is identical to today. When a `RANGE_OPEN` token *is* present, the non-consuming branch dies (the following `exprP` rejects a `RANGE_OPEN`), so **no duplicate parse**.
- `rangePostfixP` (Kazakh postpositional) is unchanged.
- Words carrying `RANGE_OPEN` are added per-locale (§5). `from` additionally keeps its `DIRECTION` payload (the lattice carries both), so `2 weeks from X` is unaffected.

## §2 — Month elision (`march 1 to 15`, `1 to 15 march`, `1 по 15 марта`)

Add a low-specificity **bare-day endpoint** and an elision-aware range rule. Add one small combinator:

```ts
// combinators.ts
export function filter<T>(p: Parser<T>, keep: (v: T) => boolean): Parser<T> {
  return (s, i, ex) => p(s, i, ex).filter((r) => keep(r.v));
}
```

```ts
// grammar.ts
// a bare day number 1–31 (cardinal or ordinal) → calendar{ d }
const bareDayP: P = map(
  tok("NUMBER", (t) => t.n >= 1 && t.n <= 31),
  (t) => A(anchor({ kind: "calendar", d: t.n }), 0.3),
);
const rangeEndpoint: P = alt(exprP, bareDayP);

// fires only when SOME endpoint carries an explicit month, so "3 to 5" (no month) yields no
// candidate — matching today. The all-exprP, month-bearing overlap with rangeP is deduped.
const elidedRangeP: P = filter(
  map(
    seq(opt(tok("RANGE_OPEN")), rangeEndpoint, tok("CONNECTOR"), rangeEndpoint),
    ([, a, , b]) => buildRange(a, b),
  ),
  (r) => hasExplicitMonth(r.expr),   // r.expr is the range; true iff an endpoint anchor has m
);
```

`buildRange(a, b)` produces `A({ type: "range", start: a.expr, end: b.expr }, a.spec * b.spec)`; it does **not** mutate years or months (that is §3). `elidedRangeP` joins the `topP` alt after `rangeP`. `rangeP` (plain `exprP CONNECTOR exprP`) still handles every all-`exprP` range, including monthless ones like `the 21st to the 25th`; `elidedRangeP`'s only added value is admitting a bare-`NUMBER` endpoint, gated on a month being present. Dedupe-by-AST removes the month-bearing overlap between the two rules.

Month inheritance for a `calendar{ d }`-only endpoint is handled in §3 (resolve), uniformly covering both the bare-`NUMBER` case (`15`) and the ordinal case (`the 21st`).

## §3 — Year inference for ranges (`resolve.ts`, range case) — *prefer the current year*

**Boundary condition.** The new logic applies to a `range` **only when at least one endpoint is a `calendar` anchor with an explicit month** (`m !== undefined`). Every other range — weekday (`monday to friday`), monthless ordinal-day (`the 21st to the 25th`), period, offset/lookback, or mixed — keeps **today's exact behaviour** (resolve start, then resolve end with `today` re-anchored to the start).

**Month-bearing path.** Let `start`/`end` be the endpoint anchors. The *month source* is whichever endpoint has an explicit `m` (prefer the start if both do).

1. **Inherit month:** a `calendar{ d }`-only endpoint takes the month source's `m`.
2. **Resolution year for each endpoint** = its own explicit `y` if present; else the *other* endpoint's explicit `y` if present; else `ctx.today.y`. (Bare sides therefore **prefer the current year**, and an explicit year on one side **propagates** to the other.)
3. Resolve both endpoints as calendar dates in their resolution year **allowing past** (so a bare endpoint does not forward-roll).
4. **Wrap or throw** if `end < start`:
   - if the **end has no explicit year** → `end.year += 1` (covers `nov 1 → feb 28`, `dec 1 → jan 5`);
   - else (end's year is explicit and still inverted) → throw the §4 error.

**Worked outcomes** (today = 2026-06-12):

| Input | Result |
|---|---|
| `feb 24 to june 30` | `2026-02-24 … 2026-06-30` *(was 2027)* |
| `feb 24 to march 5` | `2026-02-24 … 2026-03-05` *(was 2027)* |
| `nov 1 to feb 28` | `2026-11-01 … 2027-02-28` *(unchanged)* |
| `feb 24 to june 30 2026` | `2026-02-24 … 2026-06-30` *(was an error)* |
| `feb 24 2026 to june 30` | `2026-02-24 … 2026-06-30` |
| `march 1 to 15` | `2026-03-01 … 2026-03-15` |
| `june 30 2026 to feb 24 2026` | throws (genuinely inverted) |
| `the 21st to the 25th` | `2026-06-21 … 2026-06-25` *(unchanged — no explicit month)* |
| `monday to friday` | `2026-06-15 … 2026-06-19` *(unchanged)* |

**Accepted consequence:** a bare *single* month/date still forward-rolls (`march` → 2027), but a bare *range* prefers the current year (`march to june` → 2026). Single and range diverge by design.

## §4 — Error UX

Replace the bare `"Range ends before it starts."` and `"Invalid date: that month has no day N."` throws (when they occur inside a range) with an **endpoint-attributed** message naming the side and reason:

- `"The end date (June 31) isn't valid — June has only 30 days."`
- `"That range ends before it starts (June 30 2026 → February 24 2026)."`

The whole parse still fails cleanly (no salvaged half-range — behaviour stays predictable). Implementation: the range case catches/annotates the endpoint error with `start`/`end` context before rethrowing.

## §5 — Locale vocabulary

- **en** (`locale-en/src/index.ts`): `add(["between"], { kind: "RANGE_OPEN" })`; `add(["and"], { kind: "CONNECTOR" })`; `add(["from"], { kind: "RANGE_OPEN" })` (in addition to its existing `DIRECTION`). `to/until/till/through/thru/-` already `CONNECTOR`.
- **ru** (`locale-ru/src/{data,index}.ts`): `с`, `между` → `RANGE_OPEN`; `и` → `CONNECTOR` (joins `по`/`до`/`-`). Front-elision (`1 по 15 марта`, `с 1 по 15 марта`) needs no extra rule — it falls out of §2 + §3.
- **kk** (`locale-kk/src/{data,index}.ts`): postpositional ranges already work via `rangePostfixP` (`дейін`/`шейін`). Add **between** as a postpositional locale rule — `X пен Y аралығы/арасы` → `range` — modelled on the existing `kkBoundaryRule` (a `LocaleRule`, isolated to kk). New data: the `пен/бен/мен` conjunction + `арасы/аралығы` boundary noun. This is the single heaviest locale item.

`RANGE_OPEN` and `и`/`and` flow through the lattice exactly like existing multi-payload words; verify no `MAX_STREAMS` pressure in the locale e2e suite.

## §6 — Suggest / typeahead

Fixing §1 automatically un-blanks typeahead after `from …` (today it returns nothing, because the stream fails to parse). Verify and lock with tests:

- `from feb 24 to ` and `between ` produce completions; `feb 24 to jun` → `… june` still works; ru `с 1 по ` completes.
- `RANGE_OPEN` newly appears among the position-0 expectation kinds, so `from`/`between` may surface as **starter** suggestions — acceptable, but must not perturb existing rankings. Re-run the full suggest suite (the plan-07 `suggest` regression is the tripwire).

## §7 — Testing & conformance

- **Core** (`packages/core/test`): grammar tests for the opener (`opt(RANGE_OPEN)`, no duplicate parse), `bareDayP`/`elidedRangeP` (both elision directions; `3 to 5` → no candidate; `filter`), and resolve tests for the §3 month-bearing path (prefer-current-year, propagate, wrap, throw-on-inverted-explicit, d-only month inheritance) and for the **untouched** monthless path (`the 21st to the 25th`, `monday to friday`). Use synthetic `SemToken` streams as in `grammar-range.test.ts`.
- **Shared conformance** (`packages/conformance/src/cases.ts`): add **expr-based** calendar↔calendar and elided-day `range` cases. Because conformance round-trips each locale's *own* `format`, kk satisfies them via its postpositional rendering — no English openers forced on kk.
- **Per-locale e2e:** en (`from…to`, `between…and`, `march 1 to 15`, mixed-year fix, prefer-current-year); ru (`с…по…`, `между…и…`, `1 по 15 марта`); kk (postpositional still round-trips; `X пен Y арасы`).
- **Error UX:** assert the §4 endpoint-attributed messages.
- **Whole-repo gate:** `pnpm vitest run` + `pnpm typecheck` + `pnpm build` + `pnpm --filter playground build` all green (plan-07 discipline). Test count rises; no existing assertion changes.

## §8 — Files touched

```
packages/core/src/types.ts          +RANGE_OPEN kind
packages/core/src/combinators.ts    +filter()
packages/core/src/grammar.ts        rangeP opener; bareDayP/elidedRangeP; buildRange
packages/core/src/resolve.ts        range case: §3 year-inference + §4 errors
packages/core/test/*                grammar + resolve tests
packages/conformance/src/cases.ts   +range semantic cases
packages/locale-en/src/index.ts     +between/and/from-open  (+ e2e test)
packages/locale-ru/src/{data,index}.ts  +с/между/и          (+ e2e test)
packages/locale-kk/src/{data,index}.ts  +пен/арасы between rule  (+ e2e test)
```

Sizable enough that writing-plans may split it into two sequential plans: **(A) core engine** (§1–§4 + core tests + conformance cases) and **(B) locale rollout** (§5–§6 + per-locale e2e). (A) is independently green and demoable in `en`; (B) layers ru/kk vocabulary on top.

## §9 — Non-goals

- No time-of-day ranges (`5 to 9` is not a time range), no recurrence, no new period/holiday vocabulary.
- No cross-script holiday-name input (a separate known gap).
- No salvaged half-range on an invalid endpoint (errors stay whole-parse, just clearer).
- No `between`-without-`and` or mismatched opener/connector validation (any opener + any connector is accepted; harmless).
- No controller / `@saywhen/react` / registry changes — they already accept any adapter.
- No publishing/versioning.

## Success criteria

- `from … to …`, `between … and …`, `с … по …`, `между … и …`, and month-elided ranges (`march 1 to 15`, `1 по 15 марта`) parse to the correct ranges; typeahead completes them.
- `feb 24 to june 30 2026` resolves (no error); a bare past range prefers the current year; `nov 1 to feb 28`, `the 21st to the 25th`, `monday to friday` are unchanged.
- Invalid/inverted ranges produce endpoint-attributed messages.
- All three locales covered (en/ru prepositional, kk postpositional incl. `арасы` between); shared conformance holds every locale to the new range round-trips.
- Full suite + typecheck + all builds green; **no existing assertion changed**.
