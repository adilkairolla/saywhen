import type { HolidayPack } from "@saywhen/core";

const fixed = (m: number, d: number) => () => ({ m, d });

/**
 * Orthodox Easter Sunday as a Gregorian-calendar date.
 * Meeus' Julian-calendar algorithm + the 13-day Julian→Gregorian offset, which is
 * only correct for 1900–2099 → null outside that range (spec §4.5: entries return
 * null when uncovered; the engine drops the candidate with an explanatory error).
 */
export function orthodoxEaster(year: number): { m: number; d: number } | null {
  if (year < 1900 || year > 2099) return null;
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // Julian-calendar month (1-based: 3 or 4)
  const day = ((d + e + 114) % 31) + 1;
  const dt = new Date(Date.UTC(year, month - 1, day + 13)); // shift to Gregorian; overflow absorbed
  return { m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

export const ru: HolidayPack = {
  id: "ru",
  entries: [
    // same rule as holidays-us "new-year" — sharing the id is deliberate (identical date)
    { id: "new-year", compute: fixed(0, 1),
      names: { ru: ["новый год", "нового года", "новым годом"], en: ["new year's day", "new year"] } },
    { id: "orthodox-christmas", compute: fixed(0, 7),
      names: { ru: ["рождество", "рождества", "рождество христово"], en: ["orthodox christmas"] } },
    { id: "old-new-year", compute: fixed(0, 14),
      names: { ru: ["старый новый год"], en: ["old new year"] } },
    { id: "defender-day", compute: fixed(1, 23),
      names: { ru: ["день защитника отечества"], en: ["defender of the fatherland day"] } },
    { id: "womens-day", compute: fixed(2, 8),
      names: { ru: ["международный женский день", "женский день"],
               en: ["international women's day", "women's day"] } },
    { id: "orthodox-easter", compute: orthodoxEaster,
      names: { ru: ["пасха", "пасхи", "пасху"], en: ["orthodox easter"] } },
    { id: "spring-labor-day", compute: fixed(4, 1),
      names: { ru: ["праздник весны и труда", "первомай"], en: ["may day"] } },
    { id: "victory-day", compute: fixed(4, 9),
      names: { ru: ["день победы", "дня победы", "днём победы", "днем победы"], en: ["victory day"] } },
    { id: "russia-day", compute: fixed(5, 12),
      names: { ru: ["день россии", "дня россии"], en: ["russia day"] } },
    { id: "unity-day", compute: fixed(10, 4),
      names: { ru: ["день народного единства"], en: ["unity day"] } },
  ],
};
