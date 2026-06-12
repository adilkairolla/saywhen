import type {
  Candidate, Correction, Engine, HolidayPack, Lexicon, LocaleAdapter,
  ParseContext, ParseResult,
} from "./types.js";
import { normalizeText } from "./normalize.js";
import { validateLocale } from "./lexicon.js";
import { buildLattice, expandStreams, type PhraseEntry } from "./lattice.js";
import { buildGrammar } from "./grammar.js";
import { buildKeyboardAdjacency, correctToken } from "./typo.js";
import { resolveExpr } from "./resolve.js";
import { scoreAndRank, statusFor, type ScoreInput, type ScoredParse } from "./score.js";
import { assertValidTimeZone, utcToWall, wallToUtc, type Wall } from "./zoned-date.js";

export interface CreateEngineOptions {
  locale: LocaleAdapter;
  holidays?: HolidayPack[];
}

const MAX_CANDIDATES = 8;

export function createEngine(options: CreateEngineOptions): Engine {
  const { locale, holidays = [] } = options;
  validateLocale(locale);

  // merge holiday vocabulary for THIS locale (spec §4.5): single-word aliases become
  // lexicon entries (and get typo correction for free); multi-word aliases become
  // phrase entries merged in the lattice. Tokenize aliases with the locale tokenizer
  // so phrase tokens match user input exactly ("new year's day" → ["new","year's","day"]).
  const lexicon: Lexicon = { ...locale.lexicon };
  const phrases: PhraseEntry[] = [];
  const holidayComputes = new Map<string, (y: number) => { m: number; d: number } | null>();
  for (const pack of holidays) {
    if (!pack.id || !Array.isArray(pack.entries)) {
      throw new Error(`Malformed holiday pack: expected { id, entries[] }.`);
    }
    for (const entry of pack.entries) {
      holidayComputes.set(entry.id, entry.compute);
      for (const alias of entry.names[locale.id] ?? []) {
        const words = locale.tokenize(normalizeText(alias)).map((t) => t.text);
        if (words.length === 1) {
          const form = words[0]!;
          lexicon[form] = [...(lexicon[form] ?? []), { kind: "HOLIDAY", id: entry.id }];
        } else if (words.length > 1) {
          phrases.push({ tokens: words, payload: { kind: "HOLIDAY", id: entry.id } });
        }
      }
    }
  }

  const grammar = buildGrammar(locale.rules ?? []);
  const adjacency = locale.keyboard ? buildKeyboardAdjacency(locale.keyboard) : null;
  const lexiconKeys = Object.keys(lexicon);

  function parse(text: string, ctx: ParseContext): ParseResult {
    assertValidTimeZone(ctx.timeZone); // config error → throws (spec §8)
    const normalized = normalizeText(text);
    if (normalized.trim() === "") {
      return { status: "idle", candidates: [], corrections: [], errors: [] };
    }

    const weekStart = ctx.weekStart ?? locale.defaults.weekStart;
    const dateOrder = ctx.dateOrder ?? locale.defaults.dateOrder;
    const allowPast = ctx.allowPast ?? false;

    const corrections: Correction[] = [];
    const cells = buildLattice(locale.tokenize(normalized), lexicon, {
      dateOrder,
      parseNumber: (words: string[]) => locale.parseNumber(words),
      phrases,
      ...(adjacency
        ? {
            correct: (raw: { text: string; span: [number, number] }) => {
              const hit = correctToken(raw.text, lexiconKeys, locale.typoMap, adjacency);
              if (hit) corrections.push({ span: raw.span, from: raw.text, to: hit.to });
              return hit;
            },
          }
        : {}),
    });

    const errors: string[] = [];
    const inputs: ScoreInput[] = [];
    const seenExprs = new Set<string>();
    for (const stream of expandStreams(cells)) {
      const { parses } = grammar.parseStream(stream);
      const tokenConfidence = stream.reduce((p, t) => p * t.confidence, 1);
      for (const p of parses) {
        const key = JSON.stringify(p.expr);
        if (seenExprs.has(key)) continue;
        seenExprs.add(key);
        const r = resolveExpr(p.expr, {
          now: ctx.now, timeZone: ctx.timeZone, weekStart, allowPast,
          holidays: holidayComputes,
        });
        if (!r.ok) {
          errors.push(r.error);
          continue;
        }
        inputs.push({ expr: p.expr, specificity: p.specificity, tokenConfidence, resolved: r.value });
      }
    }

    const today: Wall = { ...utcToWall(ctx.now, ctx.timeZone), h: 0, mi: 0 };
    const ranked = scoreAndRank(inputs, { today, allowPast }).slice(0, MAX_CANDIDATES);
    const candidates = ranked.map((s) => toCandidate(s, ctx, locale));
    const status = statusFor(ranked);
    if (status === "invalid" && errors.length === 0) {
      errors.push(`Could not interpret "${text}" as a date.`);
    }
    return { status, candidates, corrections, errors };
  }

  return { locale, parse };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toCandidate(s: ScoredParse, ctx: ParseContext, locale: LocaleAdapter): Candidate {
  const fmtDate = (w: Wall) => `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`;
  const startDate = fmtDate(s.resolved.start);
  const endDate = fmtDate(s.resolved.end);
  return {
    expr: s.expr,
    start: { utcIso: wallToUtc(s.resolved.start, ctx.timeZone).toISOString(), date: startDate },
    end: { utcIso: wallToUtc(s.resolved.end, ctx.timeZone).toISOString(), date: endDate },
    isRange: startDate !== endDate,
    hasExplicitTime: s.resolved.hasExplicitTime,
    confidence: s.confidence,
    text: locale.format(s.expr, { now: ctx.now, timeZone: ctx.timeZone }),
  };
}
