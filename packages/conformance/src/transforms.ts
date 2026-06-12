export type Transform = (s: string) => string;

export const MUST_PASS_TRANSFORMS: Array<[string, Transform]> = [
  ["identity", (s) => s],
  ["uppercase", (s) => s.toUpperCase()],
  ["capitalized", (s) => s.replace(/\b[a-zа-яё]/g, (c) => c.toUpperCase())],
  ["extra-spaces", (s) => s.replace(/ /g, "  ")],
  ["padded", (s) => `  ${s} `],
];

function longestAlphaWord(s: string): string | null {
  const words = s.match(/[a-zа-яё]+/g) ?? [];
  let best: string | null = null;
  for (const w of words) if (best === null || w.length > best.length) best = w;
  return best;
}

function replaceWord(s: string, word: string, repl: string): string {
  return s.replace(word, repl);
}

/** Swap the first distinct adjacent letter pair (from index 1) in the longest word ≥ 5 chars. */
export function swapInLongestWord(s: string): string | null {
  const w = longestAlphaWord(s);
  if (!w || w.length < 5) return null;
  for (let i = 1; i + 1 < w.length; i++) {
    if (w[i] !== w[i + 1]) {
      return replaceWord(s, w, w.slice(0, i) + w[i + 1]! + w[i]! + w.slice(i + 2));
    }
  }
  return null;
}

/** Drop the final character of the longest word ≥ 5 chars. */
export function dropLastCharOfLongestWord(s: string): string | null {
  const w = longestAlphaWord(s);
  if (!w || w.length < 5) return null;
  return replaceWord(s, w, w.slice(0, -1));
}

export const FUZZY_TRANSFORMS: Array<[string, (s: string) => string | null]> = [
  ["swap-adjacent", swapInLongestWord],
  ["drop-last-char", dropLastCharOfLongestWord],
];
