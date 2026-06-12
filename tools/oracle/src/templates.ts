const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Fixed template corpus; deterministic, duplicate-free. */
export function generatePhrases(): string[] {
  const out = new Set<string>();
  for (const wd of WEEKDAYS) {
    out.add(wd);
    out.add(`next ${wd}`);
    out.add(`last ${wd}`);
    out.add(`this ${wd}`);
  }
  for (const mo of MONTHS) {
    for (const d of [1, 15, 28]) {
      out.add(`${mo} ${d}`);
      out.add(`${mo} ${d} 2027`);
    }
  }
  for (const n of [1, 2, 3, 10]) {
    for (const u of ["day", "week", "month"]) {
      const unit = n === 1 ? u : `${u}s`;
      out.add(`in ${n} ${unit}`);
      out.add(`${n} ${unit} ago`);
    }
  }
  out.add("today");
  out.add("tomorrow");
  out.add("yesterday");
  out.add("3/4/2026");
  out.add("12/25/2026");
  out.add("friday at 5pm");
  out.add("monday at 9:30am");
  return [...out];
}
