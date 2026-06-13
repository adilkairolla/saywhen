import type { DateExpr, ParseContext } from "./types.js";
import { createEngine, type CreateEngineOptions } from "./engine.js";
import { buildVocabulary } from "./vocab.js";
import { buildCatalog, buildSurfaceIndex, categoryWeight } from "./suggest-catalog.js";
import { normalizeText } from "./normalize.js";
import { buildKeyboardAdjacency, weightedDamerau } from "./typo.js";
import { resolveExpr } from "./resolve.js";
import { validateLocale } from "./lexicon.js";
import { assertValidTimeZone, utcToWall, wallToUtc, type Wall } from "./zoned-date.js";

export interface SuggestContext extends ParseContext {
  /** max suggestions returned (default 5) */
  limit?: number;
}

export interface Suggestion {
  /** full replacement text — canonical where possible, always re-parseable */
  text: string;
  expr: DateExpr;
  start: { utcIso: string; date: string };
  end: { utcIso: string; date: string };
  isRange: boolean;
  score: number;
}

export interface SuggestResult {
  suggestions: Suggestion[];
  /** remaining characters of the top suggestion when it extends the typed input */
  ghost: string | null;
}

export interface SuggestEngine {
  suggest(text: string, ctx: SuggestContext): SuggestResult;
}

// scoring weights (spec §6): prefix 40% + category 25% + proximity 20% + popularity 15%
const W_PREFIX = 0.4;
const W_CATEGORY = 0.25;
const W_PROXIMITY = 0.2;
const W_POPULARITY = 0.15;
const PROXIMITY_HORIZON_DAYS = 60;
const FUZZY_RATIO_PENALTY = 0.7; // typo-matched prefixes count less than typed ones
const DEFAULT_LIMIT = 5;

interface Hit {
  expr: DateExpr;
  text: string;
  /** typed-prefix ratio, already penalized for fuzzy matches; 0 when not a prefix */
  ratio: number;
  popularity: number;
  /** additive boost (range-end bonus) */
  bonus: number;
  resolved: { start: Wall; end: Wall };
}

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (w: Wall) => `${w.y}-${pad(w.m + 1)}-${pad(w.d)}`;
const dayNumber = (w: Wall) => Date.UTC(w.y, w.m, w.d) / 86_400_000;

export function createSuggest(options: CreateEngineOptions): SuggestEngine {
  const { locale, holidays = [] } = options;
  validateLocale(locale);
  const vocab = buildVocabulary(locale, holidays);
  const catalog = buildCatalog(vocab);
  const surfaces = buildSurfaceIndex(vocab);
  const adjacency = locale.keyboard ? buildKeyboardAdjacency(locale.keyboard) : null;
  const engine = createEngine(options); // validates grammar-path completions by re-parsing

  function suggest(text: string, ctx: SuggestContext): SuggestResult {
    assertValidTimeZone(ctx.timeZone); // config error → throws (spec §8)
    const input = normalizeText(text).trim();
    const weekStart = ctx.weekStart ?? locale.defaults.weekStart;
    const dateOrder = ctx.dateOrder ?? locale.defaults.dateOrder;
    const allowPast = ctx.allowPast ?? false;
    const limit = ctx.limit ?? DEFAULT_LIMIT;
    const fmtOpts = { now: ctx.now, timeZone: ctx.timeZone, holidayNames: vocab.holidayNames };
    const resOpts = {
      now: ctx.now, timeZone: ctx.timeZone, weekStart, allowPast,
      holidays: vocab.holidayComputes,
    };
    const today: Wall = { ...utcToWall(ctx.now, ctx.timeZone), h: 0, mi: 0 };
    const resolveOk = (expr: DateExpr) => {
      const r = resolveExpr(expr, resOpts);
      return r.ok ? r.value : null;
    };

    const hits: Hit[] = [];

    // ---- catalog matching: starters (empty input) + typed-prefix completions ----
    const typoExpansion = input === "" ? undefined : locale.typoMap?.[input];
    for (const entry of catalog) {
      const t = locale.format(entry.expr, fmtOpts);
      let ratio: number | null = null;
      if (input === "") ratio = 0;
      else if (t.startsWith(input) && t !== input) ratio = input.length / t.length;
      else if (typoExpansion !== undefined && t === typoExpansion) {
        ratio = (input.length / t.length) * FUZZY_RATIO_PENALTY;
      }
      if (ratio === null) continue;
      const resolved = resolveOk(entry.expr);
      if (!resolved) continue;
      hits.push({ expr: entry.expr, text: t, ratio, popularity: entry.popularity, bonus: 0, resolved });
    }
    // typo-corrected prefixes still complete: weighted keyboard distance against the
    // target's prefixes at input length ±1 (a dropped letter — "tomorow" — is distance 1
    // from the full "tomorrow" but distance 2 from its same-length slice "tomorro")
    if (hits.length === 0 && input.length >= 3 && adjacency) {
      for (const entry of catalog) {
        const t = locale.format(entry.expr, fmtOpts);
        if (t.length <= input.length) continue;
        let dist = Infinity;
        for (const len of [input.length - 1, input.length, input.length + 1]) {
          if (len < 1 || len > t.length) continue;
          dist = Math.min(dist, weightedDamerau(input, t.slice(0, len), adjacency));
        }
        if (dist > 1) continue;
        const resolved = resolveOk(entry.expr);
        if (!resolved) continue;
        hits.push({
          expr: entry.expr, text: t, ratio: (input.length / t.length) * FUZZY_RATIO_PENALTY,
          popularity: entry.popularity, bonus: 0, resolved,
        });
      }
    }

    // [Task 3 inserts the grammar-continuation block here; Task 4 appends fallbacks inside it]

    // ---- score, dedupe, rank ----
    const scored: Suggestion[] = hits.map((h) => {
      const days = Math.max(0, dayNumber(h.resolved.start) - dayNumber(today));
      const proximity = Math.max(0, 1 - days / PROXIMITY_HORIZON_DAYS);
      const score =
        W_PREFIX * h.ratio + W_CATEGORY * categoryWeight(h.expr) +
        W_PROXIMITY * proximity + W_POPULARITY * h.popularity + h.bonus;
      const startDate = dateStr(h.resolved.start);
      const endDate = dateStr(h.resolved.end);
      return {
        text: h.text,
        expr: h.expr,
        start: { utcIso: wallToUtc(h.resolved.start, ctx.timeZone).toISOString(), date: startDate },
        end: { utcIso: wallToUtc(h.resolved.end, ctx.timeZone).toISOString(), date: endDate },
        isRange: startDate !== endDate,
        score,
      };
    });
    scored.sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    const seenText = new Set<string>();
    const seenDates = new Set<string>();
    const suggestions: Suggestion[] = [];
    for (const s of scored) {
      const dates = `${s.start.date}|${s.end.date}|${s.isRange}`;
      if (seenText.has(s.text) || seenDates.has(dates)) continue; // one suggestion per meaning
      seenText.add(s.text);
      seenDates.add(dates);
      suggestions.push(s);
      if (suggestions.length >= limit) break;
    }
    const top = suggestions[0];
    const ghost =
      top !== undefined && input !== "" && top.text.startsWith(input) && top.text !== input
        ? top.text.slice(input.length)
        : null;
    return { suggestions, ghost };
  }

  return { suggest };
}
