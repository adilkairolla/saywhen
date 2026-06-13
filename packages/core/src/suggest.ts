import type { DateExpr, ParseContext, SemKind, SemToken } from "./types.js";
import { createEngine, type CreateEngineOptions } from "./engine.js";
import { buildVocabulary } from "./vocab.js";
import { buildCatalog, buildSurfaceIndex, categoryWeight, CLOSED_KINDS } from "./suggest-catalog.js";
import { buildGrammar } from "./grammar.js";
import { buildLattice, expandStreams } from "./lattice.js";
import { normalizeText } from "./normalize.js";
import { buildKeyboardAdjacency, correctToken, weightedDamerau } from "./typo.js";
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
const RANGE_END_BONUS = 0.1;       // range mode: clean ends (periods, boundaries)
const COMPLETION_POPULARITY = 0.5; // grammar-path completions have no table entry
const MAX_FRAGMENT_MATCHES = 12;   // surface matches tried per fragment split
const MAX_K0_CONTINUATIONS = 24;   // continuations tried after a complete word
const MAX_REPARSE = 24;            // total validation parses per suggest() call

const RANGE_END_KINDS = new Set<SemKind>([
  "WEEKDAY", "RELDAY", "MONTH", "HOLIDAY", "PERIOD", "BOUNDARY", "REL",
]);

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
  const grammar = buildGrammar(locale.rules ?? []);
  const lexiconKeys = Object.keys(vocab.lexicon);
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

    if (input !== "") {
      // ---- grammar continuations: parse the head, complete at the expectation frontier ----
      const tokens = locale.tokenize(input);
      const correct = adjacency
        ? (raw: { text: string; span: [number, number] }) =>
            correctToken(raw.text, lexiconKeys, locale.typoMap, adjacency)
        : undefined;
      let parses = 0;
      const tryCompletion = (completion: string, bonus: number, requireRange: boolean) => {
        if (parses >= MAX_REPARSE) return;
        parses++;
        const r = engine.parse(completion, {
          now: ctx.now, timeZone: ctx.timeZone, weekStart, dateOrder, allowPast,
        });
        const cand = r.candidates[0];
        if (!cand) return;
        if (requireRange && cand.start.date === cand.end.date) return;
        const resolved = resolveOk(cand.expr);
        if (!resolved) return;
        // prefer the locale's canonical rendering when it still completes the typed input AND
        // is no longer than the literal completion — otherwise a holiday's first (canonical)
        // alias would overwrite a shorter matched alias ("new year" → "new year's day") and a
        // bare period would gain a redundant determiner ("weekend" → "this weekend").
        const canon = locale.format(cand.expr, fmtOpts);
        const final = canon.startsWith(input) && canon.length <= completion.length ? canon : completion;
        hits.push({
          expr: cand.expr, text: final, ratio: input.length / final.length,
          popularity: COMPLETION_POPULARITY, bonus, resolved,
        });
      };

      const lastToken = tokens[tokens.length - 1];
      const startK = lastToken !== undefined && lastToken.text in vocab.lexicon ? 0 : 1;
      const maxK = Math.min(3, tokens.length - 1);
      for (let k = startK; k <= maxK; k++) {
        const head = tokens.slice(0, tokens.length - k);
        if (k > 0 && head.length === 0) break; // whole-input fragments are the catalog's job
        const cells = buildLattice(head, vocab.lexicon, {
          dateOrder,
          parseNumber: (words: string[]) => locale.parseNumber(words),
          phrases: vocab.phrases,
          ...(correct ? { correct } : {}),
        });
        const kinds = new Set<SemKind>();
        let rangeMode = false;
        for (const stream of expandStreams(cells)) {
          const { expectations } = grammar.parseStream(stream);
          if (expectations.frontier !== stream.length) continue; // this reading broke earlier
          for (const kk of expectations.kinds) kinds.add(kk);
          const lastSem = [...stream].reverse().find((tk: SemToken) => tk.kind !== "FILLER");
          if (lastSem?.kind === "CONNECTOR") rangeMode = true;
        }
        if (kinds.size === 0) continue;
        const isEndKind = (kind: SemKind) => !rangeMode || RANGE_END_KINDS.has(kind);
        const endBonus = (kind: SemKind) =>
          rangeMode && (kind === "PERIOD" || kind === "BOUNDARY") ? RANGE_END_BONUS : 0;
        if (k === 0) {
          let tried = 0;
          for (const kind of CLOSED_KINDS) {
            if (!kinds.has(kind) || !isEndKind(kind)) continue;
            for (const s of surfaces.canonicalByKind.get(kind) ?? []) {
              if (tried >= MAX_K0_CONTINUATIONS) break;
              tried++;
              tryCompletion(`${input} ${s.text}`, endBonus(kind), rangeMode);
            }
          }
        } else {
          const fragment = input.slice(tokens[tokens.length - k]!.span[0]);
          const headText = input.slice(0, tokens[tokens.length - k]!.span[0]);
          let tried = 0;
          for (const s of surfaces.matchable) {
            if (tried >= MAX_FRAGMENT_MATCHES) break;
            if (!kinds.has(s.payload.kind) || !isEndKind(s.payload.kind)) continue;
            if (!s.text.startsWith(fragment) || s.text === fragment) continue;
            tried++;
            tryCompletion(headText + s.text, endBonus(s.payload.kind), rangeMode);
          }
        }
      }

      // ---- fallbacks (spec §6) — only when completions ran dry ----
      if (hits.length < 2) {
        const addExpr = (expr: DateExpr, popularity: number) => {
          const resolved = resolveOk(expr);
          if (!resolved) return;
          const t = locale.format(expr, fmtOpts);
          if (t === input) return;
          const ratio = t.startsWith(input) ? input.length / t.length : 0;
          hits.push({ expr, text: t, ratio, popularity, bonus: 0, resolved });
        };
        // bare day-of-month → this occurrence + next month's
        if (/^\d{1,2}$/.test(input)) {
          const n = Number(input);
          if (n >= 1 && n <= 31) {
            addExpr({ type: "anchor", anchor: { kind: "calendar", d: n } }, 0.45);
            addExpr({ type: "anchor", anchor: { kind: "calendar", m: (today.m + 1) % 12, d: n } }, 0.4);
          }
        }
        // weekday prefix → this AND next weekday; month prefix → "Month 1"
        if (/^[^\s\d]{2,}$/.test(input)) {
          for (const s of surfaces.matchable) {
            if (!s.text.startsWith(input)) continue;
            if (s.payload.kind === "WEEKDAY") {
              addExpr({ type: "anchor", anchor: { kind: "weekday", day: s.payload.day } }, 0.45);
              addExpr(
                { type: "anchor", anchor: { kind: "weekday", day: s.payload.day, which: "next" } },
                0.45,
              );
            } else if (s.payload.kind === "MONTH") {
              addExpr({ type: "anchor", anchor: { kind: "calendar", m: s.payload.month, d: 1 } }, 0.4);
            }
          }
        }
        // time-like input → today/tomorrow at that time
        let time: { h: number; m: number } | null = null;
        const hm = /^(\d{1,2}):(\d{2})$/.exec(input);
        const first = tokens[0];
        const second = tokens[1];
        if (hm) {
          time = { h: Number(hm[1]), m: Number(hm[2]) };
        } else if (tokens.length === 1 && first) {
          const p = (vocab.lexicon[first.text] ?? []).find((pl) => pl.kind === "TIME");
          if (p && p.kind === "TIME") time = { h: p.h, m: p.m };
        } else if (tokens.length === 2 && first && second && /^\d{1,2}$/.test(first.text)) {
          const mer = (vocab.lexicon[second.text] ?? []).find((pl) => pl.kind === "MERIDIEM");
          const h = Number(first.text);
          if (mer && mer.kind === "MERIDIEM" && h >= 1 && h <= 12) {
            time = mer.value === "pm"
              ? { h: h === 12 ? 12 : h + 12, m: 0 }
              : { h: h === 12 ? 0 : h, m: 0 };
          }
        }
        if (time !== null && time.h <= 23 && time.m <= 59) {
          const t = time;
          const at = (offset: number): DateExpr =>
            ({ type: "withTime", base: { type: "anchor", anchor: { kind: "relday", offset } }, time: t });
          addExpr(at(0), 0.45);
          addExpr(at(1), 0.45);
        }
      }
    }

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
