import type { HolidayPack, Lexicon, LocaleAdapter } from "./types.js";
import type { PhraseEntry } from "./lattice.js";
import { normalizeText } from "./normalize.js";

export interface Vocabulary {
  lexicon: Lexicon;
  phrases: PhraseEntry[];
  /** holiday id → canonical display name for the active locale (first alias, normalized) */
  holidayNames: Record<string, string>;
  holidayComputes: Map<string, (y: number) => { m: number; d: number } | null>;
}

/**
 * Merge holiday vocabulary for ONE locale (spec §4.5): single-word aliases become
 * lexicon entries (and get typo correction for free); multi-word aliases become
 * phrase entries merged in the lattice. Aliases are tokenized with the locale
 * tokenizer so phrase tokens match user input exactly ("new year's day" →
 * ["new","year's","day"]). Throws on malformed packs (spec §8: config throws).
 */
export function buildVocabulary(locale: LocaleAdapter, holidays: HolidayPack[]): Vocabulary {
  const lexicon: Lexicon = { ...locale.lexicon };
  const phrases: PhraseEntry[] = [];
  const holidayNames: Record<string, string> = {};
  const holidayComputes = new Map<string, (y: number) => { m: number; d: number } | null>();
  for (const pack of holidays) {
    if (!pack.id || !Array.isArray(pack.entries)) {
      throw new Error(`Malformed holiday pack: expected { id, entries[] }.`);
    }
    for (const entry of pack.entries) {
      holidayComputes.set(entry.id, entry.compute);
      for (const alias of entry.names[locale.id] ?? []) {
        const words = locale.tokenize(normalizeText(alias)).map((t) => t.text);
        if (words.length === 1) {
          const form = words[0]!;
          lexicon[form] = [...(lexicon[form] ?? []), { kind: "HOLIDAY", id: entry.id }];
        } else if (words.length > 1) {
          phrases.push({ tokens: words, payload: { kind: "HOLIDAY", id: entry.id } });
        }
      }
      const canonical = (entry.names[locale.id] ?? [])[0];
      if (canonical !== undefined) holidayNames[entry.id] = normalizeText(canonical);
    }
  }
  return { lexicon, phrases, holidayNames, holidayComputes };
}
