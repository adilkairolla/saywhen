import { DateInput, type DateInputProps } from "./date-input.js";

/** Range-oriented preset of {@link DateInput}: same combobox, range-y placeholder.
 *  Natural-language ranges ("next mon to fri") are handled by the engine itself. */
export function DateRangeInput(props: DateInputProps) {
  return <DateInput placeholder="e.g. next monday to friday" {...props} />;
}
