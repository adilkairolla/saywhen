import { useMemo, useState } from "react";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { ru } from "@saywhen/locale-ru";
import { us } from "@saywhen/holidays-us";
import { ru as ruHolidays } from "@saywhen/holidays-ru";
import { DateInput } from "@saywhen/registry/date-input";

type LocaleId = "en" | "ru";

// Fixed clock so the demo (and its tests) are deterministic; swap for () => new Date() in real use.
const NOW = () => new Date("2026-06-12T08:00:00Z");

export function App() {
  const [locale, setLocale] = useState<LocaleId>("en");
  const [withHolidays, setWithHolidays] = useState(true);
  const [enableTime, setEnableTime] = useState(false);
  const [committed, setCommitted] = useState("");

  const { engine, suggest } = useMemo(() => {
    const adapter = locale === "en" ? en : ru;
    const packs = withHolidays ? (locale === "en" ? [us] : [ruHolidays]) : [];
    const opts = { locale: adapter, holidays: packs };
    return { engine: createEngine(opts), suggest: createSuggest(opts) };
  }, [locale, withHolidays]);

  const timeZone = locale === "en" ? "America/New_York" : "Europe/Moscow";

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
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={withHolidays} onChange={(e) => setWithHolidays(e.target.checked)} />
          holidays
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={enableTime} onChange={(e) => setEnableTime(e.target.checked)} />
          time
        </label>
      </div>

      <DateInput
        key={`${locale}-${withHolidays}-${enableTime}`}
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
