// Deterministic Kazakh Cyrillic → 2021 official Latin transliteration.
// Used for BOTH directions of the dual-script design: every Cyrillic lexicon form is
// registered alongside cyrToLat(form) as an input alias, and kkLatn.format(expr) =
// cyrToLat(kk.format(expr)). The system is internally consistent for any self-consistent
// map (see plan "internal-consistency property"); OVERRIDES is the single place to tune
// the handful of letters whose official 2021 glyph is ambiguous/loan-only — verify these
// against the official alphabet for real-world Latin-input fidelity.
const MAP: Record<string, string> = {
  а: "a", ә: "ä", б: "b", в: "v", г: "g", ғ: "ğ", д: "d", е: "e",
  ж: "j", з: "z", и: "ï", й: "ı", к: "k", қ: "q", л: "l", м: "m",
  н: "n", ң: "ñ", о: "o", ө: "ö", п: "p", р: "r", с: "s", т: "t",
  у: "u", ұ: "ū", ү: "ü", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ç",
  ш: "ş", щ: "şş", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "ıu", я: "ıa",
  ё: "ıo",
};

// Letters whose 2021 official glyph is ambiguous/loan-only — tune here, then the whole
// system (lexicon aliases + Latin output) follows automatically. Empty by default.
const OVERRIDES: Record<string, string> = {};

const TABLE: Record<string, string> = { ...MAP, ...OVERRIDES };

/** Transliterate Kazakh Cyrillic to 2021 Latin. Non-Cyrillic chars pass through. */
export function cyrToLat(s: string): string {
  let out = "";
  for (const ch of s) out += ch in TABLE ? TABLE[ch]! : ch;
  return out;
}
