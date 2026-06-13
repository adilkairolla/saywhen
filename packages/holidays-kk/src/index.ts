import type { HolidayPack } from "@saywhen/core";

const fixed = (m: number, d: number) => () => ({ m, d });

/**
 * Kurban Ait (Eid al-Adha, 10 Dhu al-Hijjah) as officially observed in Kazakhstan.
 * Lunar — the Gregorian date is set by sighting/decree, so it is tabulated rather than
 * computed (spec §6). Bounded; returns null outside the table → the engine drops the
 * candidate with an explanatory error (spec §4.5 / §8). Verified against the calculated
 * Eid al-Adha (10 Dhu al-Hijjah) dates for 2023–2030, ±1 day vs official sighting/decree;
 * extend the table as new years are declared.
 */
export function kurbanAit(year: number): { m: number; d: number } | null {
  const TABLE: Record<number, [number, number]> = {
    2023: [5, 28], 2024: [5, 16], 2025: [5, 6], 2026: [4, 27],
    2027: [4, 16], 2028: [4, 5], 2029: [3, 24], 2030: [3, 13],
  };
  const hit = TABLE[year];
  return hit ? { m: hit[0], d: hit[1] } : null;
}

// kk = Cyrillic canonical (first), kk-latn = Latin canonical (first) = cyrToLat of it (the
// kk-latn[0] strings are the exact transliterator output — see compute.test consistency check).
// The kk adapter resolves Cyrillic names; kkLatn resolves Latin (cross-script holiday-name
// input is a deferred fast-follow — the general date grammar is already dual-script).
export const kk: HolidayPack = {
  id: "kk",
  entries: [
    { id: "new-year", compute: fixed(0, 1),
      names: { kk: ["жаңа жыл"], "kk-latn": ["jaña jyl"], ru: ["новый год"], en: ["new year's day", "new year"] } },
    { id: "orthodox-christmas", compute: fixed(0, 7),
      names: { kk: ["рождество"], "kk-latn": ["rojdestvo"], ru: ["рождество"], en: ["orthodox christmas"] } },
    { id: "intl-womens-day", compute: fixed(2, 8),
      names: { kk: ["әйелдер күні"], "kk-latn": ["äıelder küni"], ru: ["женский день"], en: ["international women's day", "women's day"] } },
    { id: "nauryz", compute: fixed(2, 22),
      names: { kk: ["наурыз", "наурыз мейрамы"], "kk-latn": ["nauryz", "nauryz meıramy"], ru: ["наурыз"], en: ["nauryz"] } },
    { id: "unity-day", compute: fixed(4, 1),
      names: { kk: ["бірлік күні"], "kk-latn": ["birlik küni"], ru: ["день единства народа казахстана"], en: ["people's unity day", "unity day"] } },
    { id: "defenders-day", compute: fixed(4, 7),
      names: { kk: ["отан қорғаушы күні"], "kk-latn": ["otan qorğauşy küni"], ru: ["день защитника отечества"], en: ["defenders day"] } },
    { id: "victory-day", compute: fixed(4, 9),
      names: { kk: ["жеңіс күні"], "kk-latn": ["jeñis küni"], ru: ["день победы"], en: ["victory day"] } },
    { id: "capital-day", compute: fixed(6, 6),
      names: { kk: ["астана күні"], "kk-latn": ["astana küni"], ru: ["день столицы"], en: ["capital day", "astana day"] } },
    { id: "constitution-day", compute: fixed(7, 30),
      names: { kk: ["конституция күні"], "kk-latn": ["konstïtutsïıa küni"], ru: ["день конституции"], en: ["constitution day"] } },
    { id: "republic-day", compute: fixed(9, 25),
      names: { kk: ["республика күні"], "kk-latn": ["respublïka küni"], ru: ["день республики"], en: ["republic day"] } },
    { id: "independence-day", compute: fixed(11, 16),
      names: { kk: ["тәуелсіздік күні"], "kk-latn": ["täuelsizdik küni"], ru: ["день независимости"], en: ["independence day"] } },
    { id: "kurban-ait", compute: kurbanAit,
      names: { kk: ["құрбан айт"], "kk-latn": ["qūrban aıt"], ru: ["курбан айт"], en: ["kurban ait", "eid al-adha"] } },
  ],
};
