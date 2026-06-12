import * as chrono from "chrono-node";
import type { Engine } from "@saywhen/core";

export const ORACLE_TZ = "America/New_York";
/** Friday 2026-06-12, 08:00 EDT. */
export const ORACLE_NOW = new Date("2026-06-12T12:00:00Z");

export interface OracleResult {
  text: string;
  ours: string | null;
  chrono: string | null;
  agree: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORACLE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export function localDateString(d: Date): string {
  return DATE_FMT.format(d); // en-CA renders YYYY-MM-DD
}

export function compareOne(engine: Engine, text: string, now: Date = ORACLE_NOW): OracleResult {
  const r = engine.parse(text, { now, timeZone: ORACLE_TZ, allowPast: true });
  const ours = r.candidates[0]?.start.date ?? null;
  const parsed = chrono.parseDate(text, { instant: now, timezone: ORACLE_TZ });
  const theirs = parsed ? localDateString(parsed) : null;
  return { text, ours, chrono: theirs, agree: ours !== null && ours === theirs };
}
