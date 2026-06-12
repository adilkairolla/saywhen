import type { HolidayPack } from "@saywhen/core";

// ---------- date rules (0-based month; Date.UTC only for weekday/overflow math) ----------

const fixed = (m: number, d: number) => () => ({ m, d });

/** nth <weekday> of a month: nthWeekday(2026, 10, 4, 4) = 4th Thursday of November */
function nthWeekday(y: number, m: number, weekday: number, nth: number): { m: number; d: number } {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return { m, d: 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7 };
}

function lastWeekday(y: number, m: number, weekday: number): { m: number; d: number } {
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lastDow = new Date(Date.UTC(y, m, lastDay)).getUTCDay();
  return { m, d: lastDay - ((lastDow - weekday + 7) % 7) };
}

/** Western (Gregorian) Easter Sunday — anonymous Meeus/Jones/Butcher algorithm. */
export function westernEaster(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based: 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month - 1, d: day };
}

const easterOffset = (days: number) => (year: number) => {
  const e = westernEaster(year);
  const dt = new Date(Date.UTC(year, e.m, e.d + days)); // Date.UTC absorbs month under/overflow
  return { m: dt.getUTCMonth(), d: dt.getUTCDate() };
};

export const us: HolidayPack = {
  id: "us",
  entries: [
    { id: "new-year", compute: fixed(0, 1),
      names: { en: ["new year's day", "new years day", "new year"], ru: ["новый год"] } },
    { id: "mlk-day", compute: (y) => nthWeekday(y, 0, 1, 3),
      names: { en: ["mlk day", "martin luther king day"], ru: ["день мартина лютера кинга"] } },
    { id: "valentines-day", compute: fixed(1, 14),
      names: { en: ["valentine's day", "valentines day", "valentines"],
               ru: ["день святого валентина", "день влюблённых", "день влюбленных"] } },
    { id: "presidents-day", compute: (y) => nthWeekday(y, 1, 1, 3),
      names: { en: ["presidents day", "presidents' day", "president's day"], ru: ["день президентов"] } },
    { id: "good-friday", compute: easterOffset(-2),
      names: { en: ["good friday"], ru: ["страстная пятница"] } },
    { id: "easter", compute: westernEaster,
      names: { en: ["easter", "easter sunday"], ru: ["пасха"] } },
    { id: "mothers-day", compute: (y) => nthWeekday(y, 4, 0, 2),
      names: { en: ["mother's day", "mothers day"], ru: ["день матери"] } },
    { id: "memorial-day", compute: (y) => lastWeekday(y, 4, 1),
      names: { en: ["memorial day"], ru: ["день памяти"] } },
    { id: "fathers-day", compute: (y) => nthWeekday(y, 5, 0, 3),
      names: { en: ["father's day", "fathers day"], ru: ["день отца"] } },
    { id: "juneteenth", compute: fixed(5, 19),
      names: { en: ["juneteenth"] } },
    { id: "independence-day", compute: fixed(6, 4),
      names: { en: ["independence day", "fourth of july", "4th of july"], ru: ["день независимости"] } },
    { id: "labor-day", compute: (y) => nthWeekday(y, 8, 1, 1),
      names: { en: ["labor day"], ru: ["день труда"] } },
    { id: "columbus-day", compute: (y) => nthWeekday(y, 9, 1, 2),
      names: { en: ["columbus day", "indigenous peoples day"] } },
    { id: "halloween", compute: fixed(9, 31),
      names: { en: ["halloween"], ru: ["хэллоуин", "хеллоуин"] } },
    { id: "veterans-day", compute: fixed(10, 11),
      names: { en: ["veterans day", "veteran's day"], ru: ["день ветеранов"] } },
    { id: "thanksgiving", compute: (y) => nthWeekday(y, 10, 4, 4),
      names: { en: ["thanksgiving", "thanksgiving day", "turkey day"], ru: ["день благодарения"] } },
    { id: "christmas-eve", compute: fixed(11, 24),
      names: { en: ["christmas eve"] } },
    { id: "christmas", compute: fixed(11, 25),
      names: { en: ["christmas", "christmas day", "xmas"], ru: ["рождество"] } },
    { id: "new-years-eve", compute: fixed(11, 31),
      names: { en: ["new year's eve", "new years eve", "nye"], ru: ["канун нового года"] } },
  ],
};
