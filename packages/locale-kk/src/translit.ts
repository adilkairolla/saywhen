// Deterministic Kazakh Cyrillic → 2021 Latin transliteration.
// Used for BOTH directions of the dual-script design: every Cyrillic lexicon form is
// registered alongside cyrToLat(form) as an input alias, and kkLatn.format(expr) =
// cyrToLat(kk.format(expr)). The system is internally consistent for any self-consistent
// map (the round-trip/conformance tests pass regardless of official-2021 fidelity).
//
// Verification (2026-06-13): the NATIVE Kazakh letters below — ä ğ q ñ ö ū ü i y and й→ı —
// match the January 2021 Latin-alphabet decree. The Russian-LOAN letters (и ц ч щ ю я ё э в
// ъ ь) are NOT in the official 31-letter Kazakh Latin alphabet; they occur only in borrowed
// words (e.g. holiday names рождество/конституция/республика) and use reasonable
// transliteration conventions, not decree-backed forms. и→ï is the one debatable near-native
// choice (some sources merge it to i); kept as ï to stay distinct from і→i.
const MAP: Record<string, string> = {
  а: "a", ә: "ä", б: "b", в: "v", г: "g", ғ: "ğ", д: "d", е: "e",
  ж: "j", з: "z", и: "ï", й: "ı", к: "k", қ: "q", л: "l", м: "m",
  н: "n", ң: "ñ", о: "o", ө: "ö", п: "p", р: "r", с: "s", т: "t",
  у: "u", ұ: "ū", ү: "ü", ф: "f", х: "h", һ: "h", ц: "ts", ч: "ç",
  ш: "ş", щ: "şş", ъ: "", ы: "y", і: "i", ь: "", э: "e", ю: "ıu", я: "ıa",
  ё: "ıo",
};

// Per-letter overrides for the loan/ambiguous letters noted above — set a Cyrillic→Latin
// pair here and both the input aliases and the Latin output follow automatically. Empty by
// default (the MAP values are the chosen convention).
const OVERRIDES: Record<string, string> = {};

const TABLE: Record<string, string> = { ...MAP, ...OVERRIDES };

/** Transliterate Kazakh Cyrillic to 2021 Latin. Non-Cyrillic chars pass through. */
export function cyrToLat(s: string): string {
  let out = "";
  for (const ch of s) out += ch in TABLE ? TABLE[ch]! : ch;
  return out;
}
