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
