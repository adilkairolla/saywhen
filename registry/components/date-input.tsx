import { useDateInput } from "@saywhen/react";
import type { Engine } from "@saywhen/core";
import type { SuggestEngine } from "@saywhen/core/suggest";

export interface DateInputProps {
  engine: Engine;
  suggest?: SuggestEngine;
  timeZone: string;
  now?: () => Date;
  name?: string; // hidden input for form posts
  placeholder?: string;
  /** accessible name for the combobox (required by APG; defaults to "Date") */
  ariaLabel?: string;
  enableTime?: boolean;
  allowPast?: boolean;
  onCommit?: (value: string) => void;
}

export function DateInput({
  engine, suggest, timeZone, now, name, placeholder, ariaLabel, enableTime, allowPast, onCommit,
}: DateInputProps) {
  const d = useDateInput({
    engine,
    timeZone,
    ...(suggest ? { suggest } : {}),
    ...(now ? { now } : {}),
    ...(enableTime !== undefined ? { enableTime } : {}),
    ...(allowPast !== undefined ? { allowPast } : {}),
    ...(onCommit ? { onCommit: (value) => onCommit(value) } : {}),
  });
  const { state } = d;
  return (
    <div className="relative w-full">
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute inset-0 whitespace-pre px-3 py-2 text-sm">
          <span className="invisible">{state.rawInput}</span>
          <span className="text-muted-foreground">{state.ghostText}</span>
        </span>
        <input
          {...d.getInputProps()}
          aria-label={ariaLabel ?? "Date"}
          placeholder={placeholder}
          onBlur={() => d.controller.commit()}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {state.isOpen && state.suggestions.length > 0 && (
        <ul
          {...d.getListboxProps()}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {state.suggestions.map((s, i) => (
            <li
              key={s.text}
              {...d.getOptionProps(i)}
              className={`cursor-pointer rounded px-3 py-1.5 text-sm ${
                i === state.activeSuggestionIndex ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
      {name !== undefined && <input type="hidden" name={name} value={state.value} readOnly />}
      <span role="status" aria-live="polite" className="sr-only">
        {state.announcement}
      </span>
    </div>
  );
}
