import type { Rel, SemPayload, SemToken, Unit, PeriodRef } from "../../src/types.js";

let cursor = 0;
/** Build a SemToken with auto-advancing fake spans. Call reset() per test if spans matter. */
function t(payload: SemPayload, source = payload.kind.toLowerCase()): SemToken {
  const span: [number, number] = [cursor, cursor + source.length];
  cursor += source.length + 1;
  return { ...payload, span, source, confidence: 1 };
}

export const toks = {
  reset: () => { cursor = 0; },
  weekday: (day: number) => t({ kind: "WEEKDAY", day }),
  month: (month: number) => t({ kind: "MONTH", month }),
  num: (n: number, ordinal?: boolean) => t(ordinal ? { kind: "NUMBER", n, ordinal } : { kind: "NUMBER", n }, String(n)),
  year: (year: number) => t({ kind: "YEAR", year }, String(year)),
  time: (h: number, m: number) => t({ kind: "TIME", h, m }, `${h}:${String(m).padStart(2, "0")}`),
  meridiem: (value: "am" | "pm") => t({ kind: "MERIDIEM", value }, value),
  relday: (offset: number) => t({ kind: "RELDAY", offset }),
  rel: (which: Rel) => t({ kind: "REL", which }, which),
  unit: (unit: Unit) => t({ kind: "UNIT", unit }, unit),
  op: (op: 1 | -1) => t({ kind: "OP", op }, op === 1 ? "+" : "-"),
  dir: (dir: "before" | "after" | "from" | "ago" | "in") => t({ kind: "DIRECTION", dir }, dir),
  connector: () => t({ kind: "CONNECTOR" }, "to"),
  boundary: (edge: "start" | "end") => t({ kind: "BOUNDARY", edge }, edge),
  period: (period: PeriodRef) => t({ kind: "PERIOD", period }),
  holiday: (id: string) => t({ kind: "HOLIDAY", id }, id),
  filler: () => t({ kind: "FILLER" }, "the"),
  literal: (source: string) => t({ kind: "LITERAL" }, source),
};
