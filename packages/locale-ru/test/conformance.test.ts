import { runLocaleConformance } from "@saywhen/conformance";
import { ru } from "../src/index.js";

// Expectations under the fixed conformance clock (Fri 2026-06-12, America/New_York)
// with ru's Monday weekStart.
runLocaleConformance({
  locale: ru,
  seeds: [
    { text: "завтра", start: "2026-06-13" },
    { text: "следующая пятница", start: "2026-06-19" },
    { text: "21 марта", start: "2027-03-21" },
    { text: "двадцать первое марта", start: "2027-03-21" },
    { text: "4 марта 2026", start: "2026-03-04" },
    { text: "через 2 недели", start: "2026-06-26" },
    { text: "следующая пятница + 2 недели", start: "2026-07-03" },
    { text: "с понедельника по пятницу", start: "2026-06-15", end: "2026-06-19" },
    { text: "следующая неделя", start: "2026-06-15", end: "2026-06-21" },
    { text: "эти выходные", start: "2026-06-13", end: "2026-06-14" },
    { text: "конец следующего месяца", start: "2026-07-31" },
    { text: "пятница в 5 вечера", start: "2026-06-12" },
  ],
});
