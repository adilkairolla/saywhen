import type { Lexicon, LocaleAdapter, SemPayload } from "./types.js";

export function lookupLexicon(lex: Lexicon, form: string): SemPayload[] | null {
  const hit = lex[form];
  return hit && hit.length > 0 ? hit : null;
}

/**
 * Dev-mode completeness/consistency assertion for a LocaleAdapter (spec §4.1).
 * Throws with an actionable message; never call on user input paths.
 */
export function validateLocale(locale: LocaleAdapter): void {
  const seen = {
    weekdays: new Set<number>(),
    months: new Set<number>(),
    units: new Set<string>(),
    rels: new Set<string>(),
    reldays: 0,
  };

  for (const [form, payloads] of Object.entries(locale.lexicon)) {
    // duplicate form mapping to two payloads of the SAME kind with different
    // values is a data bug (ambiguity across kinds, e.g. "may", is legal)
    const byKind = new Map<string, string>();
    for (const p of payloads) {
      const value = JSON.stringify(p);
      const prior = byKind.get(p.kind);
      if (prior !== undefined && prior !== value) {
        throw new Error(
          `Locale "${locale.id}": form "${form}" has conflicting ${p.kind} meanings.`,
        );
      }
      byKind.set(p.kind, value);

      if (p.kind === "WEEKDAY") seen.weekdays.add(p.day);
      if (p.kind === "MONTH") seen.months.add(p.month);
      if (p.kind === "UNIT") seen.units.add(p.unit);
      if (p.kind === "REL") seen.rels.add(p.which);
      if (p.kind === "RELDAY") seen.reldays++;
    }
  }

  const missing: string[] = [];
  if (seen.weekdays.size < 7) missing.push(`weekdays (${seen.weekdays.size}/7)`);
  if (seen.months.size < 12) missing.push(`months (${seen.months.size}/12)`);
  if (seen.units.size < 6) missing.push(`units (${seen.units.size}/6)`);
  if (seen.rels.size < 3) missing.push(`this/next/last (${seen.rels.size}/3)`);
  if (seen.reldays < 1) missing.push("at least one RELDAY (today)");
  if (missing.length > 0) {
    throw new Error(`Locale "${locale.id}" lexicon is incomplete: missing ${missing.join(", ")}.`);
  }
}
