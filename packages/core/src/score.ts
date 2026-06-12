import type { DateExpr } from "./types.js";
import { compareWallDate, type Wall } from "./zoned-date.js";
import type { Resolved } from "./resolve.js";

export interface ScoreInput {
  expr: DateExpr;
  specificity: number;
  tokenConfidence: number;
  resolved: Resolved;
}

export interface ScoredParse {
  expr: DateExpr;
  resolved: Resolved;
  confidence: number;
}

const PAST_PENALTY = 0.6;
const AMBIGUITY_RATIO = 0.8;

export function scoreAndRank(
  inputs: ScoreInput[],
  opts: { today: Wall; allowPast: boolean },
): ScoredParse[] {
  const byDates = new Map<string, ScoredParse>();
  for (const inp of inputs) {
    const isPast = compareWallDate(inp.resolved.end, opts.today) < 0;
    const plausibility = isPast && !opts.allowPast ? PAST_PENALTY : 1;
    const confidence = inp.tokenConfidence * inp.specificity * plausibility;
    const key = JSON.stringify([inp.resolved.start, inp.resolved.end]);
    const prior = byDates.get(key);
    if (!prior || confidence > prior.confidence) {
      byDates.set(key, { expr: inp.expr, resolved: inp.resolved, confidence });
    }
  }
  return [...byDates.values()].sort((a, b) => b.confidence - a.confidence);
}

export function statusFor(ranked: Array<{ confidence: number }>): "valid" | "ambiguous" | "invalid" {
  if (ranked.length === 0) return "invalid";
  if (ranked.length >= 2 && ranked[1]!.confidence / ranked[0]!.confidence > AMBIGUITY_RATIO) {
    return "ambiguous";
  }
  return "valid";
}
