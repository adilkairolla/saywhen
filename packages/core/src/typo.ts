import type { KeyboardLayout } from "./types.js";

export type Adjacency = Map<string, Set<string>>;

/** Keys within one row/column step on the physical layout are "adjacent". */
export function buildKeyboardAdjacency(layout: KeyboardLayout): Adjacency {
  const pos = new Map<string, { r: number; c: number }>();
  layout.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => pos.set(ch, { r, c }));
  });
  const adj: Adjacency = new Map();
  for (const [ch, p] of pos) {
    const set = new Set<string>();
    for (const [other, q] of pos) {
      if (other !== ch && Math.abs(p.r - q.r) <= 1 && Math.abs(p.c - q.c) <= 1) set.add(other);
    }
    adj.set(ch, set);
  }
  return adj;
}

/** Damerau-Levenshtein; substitution 0.5 for keyboard-adjacent keys, transposition 0.5. */
export function weightedDamerau(a: string, b: string, adj: Adjacency): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const ca = a[i - 1]!;
      const cb = b[j - 1]!;
      const subCost = ca === cb ? 0 : adj.get(ca)?.has(cb) ? 0.5 : 1;
      let best = Math.min(
        dp[i - 1]![j]! + 1,          // delete
        dp[i]![j - 1]! + 1,          // insert
        dp[i - 1]![j - 1]! + subCost, // substitute
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, dp[i - 2]![j - 2]! + 0.5); // transpose
      }
      dp[i]![j] = best;
    }
  }
  return dp[m]![n]!;
}

export interface CorrectionHit {
  to: string;
  cost: number;
}

function thresholdFor(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

export function correctToken(
  text: string,
  lexiconKeys: string[],
  typoMap: Record<string, string> | undefined,
  adj: Adjacency,
): CorrectionHit | null {
  const curated = typoMap?.[text];
  if (curated) return { to: curated, cost: 0 };
  if (/\d/.test(text)) return null;

  const threshold = thresholdFor(text.length);
  if (threshold === 0) return null;

  let best: CorrectionHit | null = null;
  for (const key of lexiconKeys) {
    if (Math.abs(key.length - text.length) > threshold) continue;
    const cost = weightedDamerau(text, key, adj);
    if (cost <= threshold && (best === null || cost < best.cost)) best = { to: key, cost };
  }
  return best;
}
