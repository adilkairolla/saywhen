import type { OracleResult } from "./compare.js";

export function renderReport(results: OracleResult[]): string {
  const diffs = results.filter((r) => !r.agree);
  return [
    "# chrono differential report",
    "",
    `Agreement: ${results.length - diffs.length}/${results.length}`,
    "",
    "| phrase | ours | chrono |",
    "| --- | --- | --- |",
    ...diffs.map((d) => `| ${d.text} | ${d.ours ?? "—"} | ${d.chrono ?? "—"} |`),
    "",
    "Triage every row into `triage/bugs.md` or `triage/wontfix.md` (see Task 8).",
    "",
  ].join("\n");
}
