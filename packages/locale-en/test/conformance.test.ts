import { runLocaleConformance } from "@saywhen/conformance";
import { en } from "../src/index.js";

runLocaleConformance({
  locale: en,
  seeds: [
    { text: "tomorrow", start: "2026-06-13" },
    { text: "next friday", start: "2026-06-19" },
    { text: "march 21st", start: "2027-03-21" },
    { text: "the 21st of march", start: "2027-03-21" },
    { text: "march 4 2026", start: "2026-03-04" },
    { text: "in 2 weeks", start: "2026-06-26" },
    { text: "next friday + 2 weeks", start: "2026-07-03" },
    { text: "monday to friday", start: "2026-06-15", end: "2026-06-19" },
    { text: "next week", start: "2026-06-14", end: "2026-06-20" },
    { text: "this weekend", start: "2026-06-13", end: "2026-06-14" },
    { text: "end of next month", start: "2026-07-31" },
    { text: "friday at 5pm", start: "2026-06-12" },
  ],
});
