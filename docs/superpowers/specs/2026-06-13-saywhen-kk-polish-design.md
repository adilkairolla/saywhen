# saywhen — Kazakh polish & demo (design spec)

**Date:** 2026-06-13
**Status:** approved
**Builds on:** plan 07 (`@saywhen/locale-kk` + `@saywhen/holidays-kk`, merged to main at `f36e683`)
**Spec for plan:** `docs/superpowers/plans/2026-06-13-saywhen-08-kk-polish.md` (to be written)

## Goal

Make the just-shipped Kazakh support **visible and demoable** in the Vite playground (it currently works only in tests), and **capture the verification** of the 2021 Latin glyphs and the Kurban Ait dates as code documentation. No new engine/locale/holiday behavior.

## Context

Plan 07 delivered two adapters from one shared data source — `kk` (Cyrillic canonical output) and `kkLatn` (2021 Latin canonical output = `cyrToLat ∘ kk.format`), both accepting **either** script as input — plus `@saywhen/holidays-kk`. The playground (`apps/playground/src/App.tsx`) wires only `en`/`ru`. The controller, `@saywhen/react`, and the registry components already accept any `LocaleAdapter`, so **no changes are needed there** — this is purely a playground + docs task.

## §1 — Playground wiring

Single file: `apps/playground/src/App.tsx` (plus its `package.json` deps and test).

**State.** Add `"kk"` to the `LocaleId` union and a new `script` state:
```ts
type LocaleId = "en" | "ru" | "kk";
const [script, setScript] = useState<"cyr" | "latn">("cyr");
```

**Engine/suggest selection** (inside the existing `useMemo`, dependency list gains `script`):
```ts
const adapter =
  locale === "en" ? en :
  locale === "ru" ? ru :
  script === "cyr" ? kk : kkLatn;
const packs = withHolidays
  ? (locale === "en" ? [us] : locale === "ru" ? [ruHolidays] : [kkHolidays])
  : [];
```

**Timezone.** `locale === "kk" ? "Asia/Almaty" : locale === "ru" ? "Europe/Moscow" : "America/New_York"`.

**UI.** A `Қазақша` button joins the existing flat row. A script sub-toggle renders **only when `locale === "kk"`**:
```
[English] [Русский] [Қазақша]   ☐ holidays  ☐ time
                     └ [ Кирил | Latyn ]   ← only when KK active
```
`Кирил`/`Latyn` are two `aria-pressed` buttons setting `script`. The `DateInput` remount `key` gains `script`: `` key={`${locale}-${script}-${withHolidays}-${enableTime}`} `` (so flipping script rebuilds the engine — only the canonical OUTPUT script changes; input stays union).

**The demo payload.** Because suggestions/ghost/echo are produced by the active adapter's `format`, typing the same text under `Кирил` vs `Latyn` resolves to the **same date** but renders suggestions in the chosen script (type `kel` → `келесі …` vs `kelesi …`). That contrast is the point of the dual-script architecture, made tangible.

**Deps.** `apps/playground/package.json` gains `@saywhen/locale-kk` and `@saywhen/holidays-kk` (`workspace:*`).

## §2 — Verification capture (documentation only, no behavior change)

The user asked to verify the 2021 Latin glyphs and the Kurban Ait table. Findings:

**Kurban Ait (`packages/holidays-kk/src/index.ts`).** The table matches the standard calculated Eid al-Adha (10 Dhu al-Hijjah) dates for 2023–2030, ±1 day vs sighting/decree (already noted): 2023 Jun 28, 2024 Jun 16, 2025 Jun 6, 2026 May 27, 2027 May 16, 2028 May 5, 2029 Apr 24, 2030 Apr 13. **No data change.** Update the doc comment from "VERIFY each entry…" to "verified against calculated Eid al-Adha 2023–2030 (±1 day vs official sighting/decree)."

**2021 Latin glyphs (`packages/locale-kk/src/translit.ts`).** Two honest categories:
- **Native Kazakh letters** — `ä ğ q ñ ö ū ü i y` and `й→ı` — match the January 2021 decree's 31-letter alphabet. Correct; no change.
- **Russian-loan letters** — `и ц ч щ ю я ё э в ъ ь` — are **not** in the official 31-letter Kazakh Latin alphabet. They occur only in borrowed words (in our data: holiday names `рождество`, `конституция`, `республика`). Their Latin forms (`ts ç şş ıu ıa v` …) are reasonable transliteration **conventions**, not decree-backed. `и→ï` is the one debatable near-native choice (some sources merge to `i`); kept as `ï` to stay distinct from `і→i`.

**Action:** add a doc comment to `translit.ts` splitting `MAP` conceptually into "official 2021 letters (verified)" and "loan-letter conventions (not in the official alphabet; tune via `OVERRIDES`)." `OVERRIDES` stays empty (the tuning hook). No mapping values change — so the internal-consistency property and every existing test are unaffected.

## §3 — Testing

`apps/playground/test/app.test.tsx` gains one Kazakh test; existing en/ru tests stay untouched:
1. Click `Қазақша`; type `ер` into the combobox → ghost is `тең` (completes `ертең`), mirroring the existing `за`→`втра` Russian test.
2. With Kazakh active, click `Latyn`; type `er` → ghost is `teñ` (suggestion `erteñ` = `cyrToLat("ертең")`), proving the sub-toggle swapped to the Latin-output adapter. `ертең`/`erteñ` (tomorrow) is the guaranteed top starter, so both assertions are stable.

No other test files change. `holidays-kk`/`locale-kk` unit/e2e/conformance suites already cover the engine behavior; this only tests the playground wiring.

## §4 — Non-goals

- No new locale or holiday **features** (no recurrence, no new vocabulary, no `-2` relday).
- No controller / `@saywhen/react` / registry changes (they already accept any adapter).
- **Cross-script holiday-name input** stays unsupported (a known plan-07 gap; the general date grammar is already dual-script).
- No change to any `translit.ts` mapping **value** or the Kurban Ait **dates** — verification confirmed both; only comments change.
- No publish/versioning work.

## Success criteria

- Playground builds and runs; `Қазақша` + the `Кирил`/`Latyn` sub-toggle work; KK holidays toggle on; the same input under each script resolves to the same date with script-appropriate suggestions.
- New Kazakh playground test passes; all existing tests stay green (≈ 886 + the new case); typecheck + all builds + dist smokes green.
- `translit.ts` and `holidays-kk` carry the verification findings as comments; no behavior change.
