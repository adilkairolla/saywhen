import type { Lexicon, RawToken, SemPayload, SemToken } from "./types.js";
import { lookupLexicon } from "./lexicon.js";
import type { CorrectionHit } from "./typo.js";

export interface LatticeCell {
  raw: RawToken;
  /** each alternative is a SEQUENCE of semantic tokens */
  alternatives: SemToken[][];
}

const MAX_STREAMS = 16;

function sem(p: SemPayload, raw: RawToken, confidence = 1): SemToken {
  return { ...p, span: raw.span, source: raw.text, confidence };
}

/** Language-neutral digit-shape classification. Returns null when not digit-shaped. */
function classifyDigits(raw: RawToken, dateOrder: "MDY" | "DMY" | "YMD"): SemToken[][] | null {
  const t = raw.text;

  const time = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h <= 23 && m <= 59) return [[sem({ kind: "TIME", h, m }, raw)]];
    return [[sem({ kind: "LITERAL" }, raw)]];
  }

  const slash = /^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/.exec(t);
  if (slash) return classifySlashDate(Number(slash[1]), Number(slash[2]), slash[3] === undefined ? null : Number(slash[3]), raw, dateOrder);

  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (t.length === 4 && n >= 1900 && n <= 2100) return [[sem({ kind: "YEAR", year: n }, raw)]];
    return [[sem({ kind: "NUMBER", n }, raw)]];
  }

  return null;
}

function classifySlashDate(
  a: number,
  b: number,
  c: number | null,
  raw: RawToken,
  dateOrder: "MDY" | "DMY" | "YMD" = "MDY",
): SemToken[][] {
  const alts: SemToken[][] = [];
  const yearTok = (y: number) => sem({ kind: "YEAR", year: y < 100 ? y + 2000 : y }, raw);

  if (a >= 1900 && a <= 2100 && c !== null) {
    // YMD: 2026/3/4
    if (b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      alts.push([yearTok(a), sem({ kind: "MONTH", month: b - 1 }, raw), sem({ kind: "NUMBER", n: c }, raw)]);
    }
  } else {
    // the locale's dispreferred reading carries reduced token confidence (spec §5.4)
    const mdConf = dateOrder === "DMY" ? 0.95 : 1;
    const dmConf = dateOrder === "DMY" ? 1 : 0.95;
    // M/D reading
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const seq = [
        sem({ kind: "MONTH", month: a - 1 }, raw, mdConf),
        sem({ kind: "NUMBER", n: b }, raw, mdConf),
      ];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
    // D/M reading — skip when identical to M/D (e.g. "3/3")
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31 && a !== b) {
      const seq = [
        sem({ kind: "NUMBER", n: a }, raw, dmConf),
        sem({ kind: "MONTH", month: b - 1 }, raw, dmConf),
      ];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
  }

  if (alts.length === 0) alts.push([sem({ kind: "LITERAL" }, raw)]);
  return alts;
}

export interface LatticeOptions {
  /** returns a corrected lexicon key for an unknown word, or null */
  correct?: (raw: RawToken) => CorrectionHit | null;
  dateOrder?: "MDY" | "DMY" | "YMD";
  /** locale compound-number reader; enables merging adjacent number-word cells */
  parseNumber?: (words: string[]) => number | null;
}

export function buildLattice(
  rawTokens: RawToken[],
  lexicon: Lexicon,
  opts: LatticeOptions = {},
): LatticeCell[] {
  const cells = rawTokens.map((raw) => {
    const digits = classifyDigits(raw, opts.dateOrder ?? "MDY");
    if (digits) return { raw, alternatives: digits };
    const payloads = lookupLexicon(lexicon, raw.text);
    if (payloads) return { raw, alternatives: payloads.map((p) => [sem(p, raw)]) };
    const hit = opts.correct?.(raw);
    if (hit) {
      const corrected = lookupLexicon(lexicon, hit.to);
      if (corrected) {
        const confidence = Math.max(0.5, 1 - 0.2 * Math.max(hit.cost, 0.5));
        return { raw, alternatives: corrected.map((p) => [sem(p, raw, confidence)]) };
      }
    }
    return { raw, alternatives: [[sem({ kind: "LITERAL" }, raw)]] };
  });
  return opts.parseNumber ? mergeNumberWords(cells, opts.parseNumber) : cells;
}

function wordNumberInfo(cell: LatticeCell): { n: number; ordinal: boolean } | null {
  if (/\d/.test(cell.raw.text)) return null; // digit tokens never merge
  if (cell.alternatives.length !== 1) return null;
  const alt = cell.alternatives[0]!;
  if (alt.length !== 1 || alt[0]!.kind !== "NUMBER") return null;
  return { n: alt[0]!.n, ordinal: alt[0]!.ordinal === true };
}

/** Merge maximal runs of word-NUMBER cells that the locale reads as one number. */
export function mergeNumberWords(
  cells: LatticeCell[],
  parseNumber: (words: string[]) => number | null,
): LatticeCell[] {
  const out: LatticeCell[] = [];
  let i = 0;
  while (i < cells.length) {
    if (!wordNumberInfo(cells[i]!)) {
      out.push(cells[i]!);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < cells.length && wordNumberInfo(cells[j]!)) j++;
    let merged = false;
    for (let k = j; k > i + 1 && !merged; k--) { // longest window first, ≥ 2 words
      const slice = cells.slice(i, k);
      const n = parseNumber(slice.map((c) => c.raw.text));
      if (n !== null) {
        const last = wordNumberInfo(slice[slice.length - 1]!)!;
        const raw: RawToken = {
          text: slice.map((c) => c.raw.text).join(" "),
          span: [slice[0]!.raw.span[0], slice[slice.length - 1]!.raw.span[1]],
        };
        const confidence = Math.min(...slice.map((c) => c.alternatives[0]![0]!.confidence));
        out.push({
          raw,
          alternatives: [[
            sem(last.ordinal ? { kind: "NUMBER", n, ordinal: true } : { kind: "NUMBER", n }, raw, confidence),
          ]],
        });
        i = k;
        merged = true;
      }
    }
    if (!merged) {
      out.push(cells[i]!);
      i++;
    }
  }
  return out;
}

/** Cartesian product of cell alternatives → flat token streams, capped at MAX_STREAMS. */
export function expandStreams(cells: LatticeCell[]): SemToken[][] {
  let streams: SemToken[][] = [[]];
  for (const cell of cells) {
    const next: SemToken[][] = [];
    for (const stream of streams) {
      for (const alt of cell.alternatives) {
        next.push([...stream, ...alt]);
        if (next.length >= MAX_STREAMS) break;
      }
      if (next.length >= MAX_STREAMS) break;
    }
    streams = next;
  }
  return streams;
}
