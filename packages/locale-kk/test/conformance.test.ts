import { runLocaleConformance, type ConformanceSeed } from "@saywhen/conformance";
import { kk, kkLatn } from "../src/index.js";
import { cyrToLat } from "../src/translit.js";

// Cyrillic seeds under the fixed conformance clock (Fri 2026-06-12, America/New_York) with
// kk's Monday weekStart. The Latin seeds are the same phrases through cyrToLat (DRY) — proving
// both scripts resolve identically.
const SEEDS: ConformanceSeed[] = [
  { text: "бүгін", start: "2026-06-12" },
  { text: "ертең", start: "2026-06-13" },
  { text: "сәрсенбі", start: "2026-06-17" },
  { text: "келесі жұма", start: "2026-06-19" },
  { text: "21 наурыз", start: "2027-03-21" },
  { text: "4 наурыз 2026", start: "2026-03-04" },
  { text: "қыркүйек", start: "2026-09-01", end: "2026-09-30" }, // bare month = whole-month range
  { text: "2 аптадан кейін", start: "2026-06-26" },
  { text: "келесі жұма + 2 апта", start: "2026-07-03" },
  { text: "келесі апта", start: "2026-06-15", end: "2026-06-21" },
  { text: "осы демалыс", start: "2026-06-13", end: "2026-06-14" },
  { text: "дүйсенбіден жұмаға дейін", start: "2026-06-15", end: "2026-06-19" },
];

runLocaleConformance({ locale: kk, seeds: SEEDS });
runLocaleConformance({
  locale: kkLatn,
  seeds: SEEDS.map((s) => ({ ...s, text: cyrToLat(s.text) })),
});
