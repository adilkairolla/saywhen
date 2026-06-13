import type { DateExpr, PeriodRef, Rel, SemKind, SemPayload, Unit } from "./types.js";
import type { Vocabulary } from "./vocab.js";

/** one suggestible meaning — language-free; rendered per-locale with locale.format */
export interface SemanticEntry {
  expr: DateExpr;
  /** 0..1 — how often humans mean this (spec §6 semantic popularity table) */
  popularity: number;
}

const relday = (offset: number): DateExpr =>
  ({ type: "anchor", anchor: { kind: "relday", offset } });
const period = (p: PeriodRef, which: Rel): DateExpr => ({ type: "period", period: p, which });
const inUnits = (n: number, unit: Unit): DateExpr =>
  ({ type: "offset", base: { type: "anchor", anchor: { kind: "now" } }, n, unit, dir: 1 });
const endOf = (of: DateExpr): DateExpr => ({ type: "boundary", of, edge: "end" });

export function buildCatalog(vocab: Vocabulary): SemanticEntry[] {
  const entries: SemanticEntry[] = [
    { expr: relday(1), popularity: 0.95 },                          // spec: RELDAY(+1) 0.95
    { expr: period({ kind: "week" }, "next"), popularity: 0.9 },    // spec: PERIOD(week, next) 0.9
    { expr: relday(0), popularity: 0.85 },
    { expr: period({ kind: "weekend" }, "this"), popularity: 0.8 },
    { expr: period({ kind: "month" }, "next"), popularity: 0.7 },
    { expr: period({ kind: "week" }, "this"), popularity: 0.65 },
    { expr: inUnits(1, "week"), popularity: 0.6 },
    { expr: inUnits(2, "week"), popularity: 0.55 },
    { expr: endOf(period({ kind: "month" }, "this")), popularity: 0.55 },
    { expr: endOf(period({ kind: "week" }, "this")), popularity: 0.5 },
    { expr: period({ kind: "month" }, "this"), popularity: 0.5 },
  ];
  for (let day = 0; day <= 6; day++) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "weekday", day } }, popularity: 0.55 });
    entries.push({
      expr: { type: "anchor", anchor: { kind: "weekday", day, which: "next" } },
      popularity: 0.45,
    });
  }
  for (let m = 0; m <= 11; m++) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "calendar", m } }, popularity: 0.35 });
  }
  // holiday packs contribute automatically (spec §6)
  for (const id of Object.keys(vocab.holidayNames)) {
    entries.push({ expr: { type: "anchor", anchor: { kind: "holiday", id } }, popularity: 0.55 });
  }
  return entries;
}

/** category weight (the 25% score term) — how "suggestion-shaped" a meaning is */
export function categoryWeight(expr: DateExpr): number {
  switch (expr.type) {
    case "anchor": {
      const k = expr.anchor.kind;
      if (k === "relday") return 1.0;
      if (k === "weekday") return 0.8;
      if (k === "holiday") return 0.7;
      if (k === "calendar") return 0.55;
      return 0.5; // now
    }
    case "period": return 0.9;
    case "boundary": return 0.75;
    case "offset": return 0.6;
    case "range": return 0.5;
    case "withTime": return 0.5;
  }
}

// ---- surfaces (concrete words/phrases) for grammar-continuation completions ----

export interface Surface {
  text: string;
  payload: SemPayload;
}

export interface SurfaceIndex {
  /** canonical lexicon surfaces (first data-order form per payload) + EVERY phrase —
   *  matched against typed fragments */
  matchable: Surface[];
  /** canonical surfaces grouped by kind — enumerated after a complete word */
  canonicalByKind: Map<SemKind, Surface[]>;
}

/** kinds that never stand alone as a suggestion surface */
const SKIP_KINDS = new Set<SemKind>(["FILLER", "LITERAL", "OP", "CONNECTOR", "MERIDIEM", "DIRECTION"]);

/** closed-class kinds whose surfaces can be enumerated as continuations; the order is the
 *  enumeration priority — small, high-signal families first, because the try budget is capped */
export const CLOSED_KINDS: SemKind[] = [
  "RELDAY", "WEEKDAY", "PERIOD", "BOUNDARY", "HOLIDAY", "UNIT", "REL", "MONTH",
];

export function buildSurfaceIndex(vocab: Vocabulary): SurfaceIndex {
  const matchable: Surface[] = [];
  const seen = new Set<string>();
  for (const [text, payloads] of Object.entries(vocab.lexicon)) {
    for (const payload of payloads) {
      if (SKIP_KINDS.has(payload.kind)) continue;
      const key = JSON.stringify(payload);
      if (seen.has(key)) continue; // first data-order form is the canonical spelling
      seen.add(key);
      matchable.push({ text, payload });
    }
  }
  const canonical = [...matchable];
  for (const ph of vocab.phrases) {
    const surface: Surface = { text: ph.tokens.join(" "), payload: ph.payload };
    matchable.push(surface); // ALL phrases stay matchable — inflected aliases are distinct surfaces
    const key = JSON.stringify(ph.payload);
    if (!seen.has(key)) {
      seen.add(key);
      canonical.push(surface);
    }
  }
  const canonicalByKind = new Map<SemKind, Surface[]>();
  for (const s of canonical) {
    if (!CLOSED_KINDS.includes(s.payload.kind)) continue;
    const list = canonicalByKind.get(s.payload.kind) ?? [];
    list.push(s);
    canonicalByKind.set(s.payload.kind, list);
  }
  return { matchable, canonicalByKind };
}
