import type { Lexicon, RawToken, SemPayload, SemToken } from "./types.js";
import { lookupLexicon } from "./lexicon.js";

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
function classifyDigits(raw: RawToken): SemToken[][] | null {
  const t = raw.text;

  const time = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (time) {
    const h = Number(time[1]);
    const m = Number(time[2]);
    if (h <= 23 && m <= 59) return [[sem({ kind: "TIME", h, m }, raw)]];
    return [[sem({ kind: "LITERAL" }, raw)]];
  }

  const slash = /^(\d{1,4})\/(\d{1,2})(?:\/(\d{1,4}))?$/.exec(t);
  if (slash) return classifySlashDate(Number(slash[1]), Number(slash[2]), slash[3] === undefined ? null : Number(slash[3]), raw);

  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (t.length === 4 && n >= 1900 && n <= 2100) return [[sem({ kind: "YEAR", year: n }, raw)]];
    return [[sem({ kind: "NUMBER", n }, raw)]];
  }

  return null;
}

function classifySlashDate(a: number, b: number, c: number | null, raw: RawToken): SemToken[][] {
  const alts: SemToken[][] = [];
  const yearTok = (y: number) => sem({ kind: "YEAR", year: y < 100 ? y + 2000 : y }, raw);

  if (a >= 1900 && a <= 2100 && c !== null) {
    // YMD: 2026/3/4
    if (b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      alts.push([yearTok(a), sem({ kind: "MONTH", month: b - 1 }, raw), sem({ kind: "NUMBER", n: c }, raw)]);
    }
  } else {
    // M/D reading
    if (a >= 1 && a <= 12 && b >= 1 && b <= 31) {
      const seq = [sem({ kind: "MONTH", month: a - 1 }, raw), sem({ kind: "NUMBER", n: b }, raw)];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
    // D/M reading — skip when identical to M/D (e.g. "3/3")
    if (b >= 1 && b <= 12 && a >= 1 && a <= 31 && a !== b) {
      const seq = [sem({ kind: "NUMBER", n: a }, raw), sem({ kind: "MONTH", month: b - 1 }, raw)];
      if (c !== null) seq.push(yearTok(c));
      alts.push(seq);
    }
  }

  if (alts.length === 0) alts.push([sem({ kind: "LITERAL" }, raw)]);
  return alts;
}

export function buildLattice(rawTokens: RawToken[], lexicon: Lexicon): LatticeCell[] {
  return rawTokens.map((raw) => {
    const digits = classifyDigits(raw);
    if (digits) return { raw, alternatives: digits };
    const payloads = lookupLexicon(lexicon, raw.text);
    if (payloads) return { raw, alternatives: payloads.map((p) => [sem(p, raw)]) };
    return { raw, alternatives: [[sem({ kind: "LITERAL" }, raw)]] };
  });
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
