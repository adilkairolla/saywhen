import type {
  Candidate, Correction, DateExpr, Engine, HolidayPack, LocaleAdapter,
  ParseContext, ParseResult,
} from "./types.js";
import { normalizeText } from "./normalize.js";
import { validateLocale } from "./lexicon.js";
import { buildLattice, expandStreams } from "./lattice.js";
import { buildVocabulary } from "./vocab.js";
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

  const { lexicon, phrases, holidayNames, holidayComputes } = buildVocabulary(locale, holidays);

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
    const candidates = ranked.map((s) => toCandidate(s, ctx, locale, holidayNames));
    const status = statusFor(ranked);
    if (status === "invalid" && errors.length === 0) {
      errors.push(`Could not interpret "${text}" as a date.`);
    }
    return { status, candidates, corrections, errors };
  }

  function formatAccessible(expr: DateExpr, fctx: { now: Date; timeZone: string }): string {
    return locale.formatAccessible(expr, { now: fctx.now, timeZone: fctx.timeZone, holidayNames });
  }

  return { locale, parse, formatAccessible };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toCandidate(
  s: ScoredParse, ctx: ParseContext, locale: LocaleAdapter, holidayNames: Record<string, string>,
): Candidate {
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
    text: locale.format(s.expr, { now: ctx.now, timeZone: ctx.timeZone, holidayNames }),
  };
}
