import type { SemKind, SemToken } from "./types.js";

export interface Expectations {
  /** furthest token index any parser failed at */
  frontier: number;
  /** kinds expected at the frontier (suggest-engine hook, plan 05) */
  kinds: Set<SemKind>;
}

export function newExpectations(): Expectations {
  return { frontier: -1, kinds: new Set() };
}

function expectAt(ex: Expectations, i: number, kind: SemKind): void {
  if (i > ex.frontier) {
    ex.frontier = i;
    ex.kinds = new Set([kind]);
  } else if (i === ex.frontier) {
    ex.kinds.add(kind);
  }
}

export interface PRes<T> {
  v: T;
  i: number;
}

export type Parser<T> = (s: SemToken[], i: number, ex: Expectations) => Array<PRes<T>>;

export function skipFiller(s: SemToken[], i: number): number {
  while (i < s.length && s[i]!.kind === "FILLER") i++;
  return i;
}

export function tok<K extends SemKind>(
  kind: K,
  pred?: (t: Extract<SemToken, { kind: K }>) => boolean,
): Parser<Extract<SemToken, { kind: K }>> {
  return (s, i, ex) => {
    const j = skipFiller(s, i);
    const t = s[j];
    if (t?.kind === kind) {
      const typed = t as Extract<SemToken, { kind: K }>;
      if (!pred || pred(typed)) return [{ v: typed, i: j + 1 }];
    }
    expectAt(ex, j, kind);
    return [];
  };
}

export function seq<A, B>(pa: Parser<A>, pb: Parser<B>): Parser<[A, B]>;
export function seq<A, B, C>(pa: Parser<A>, pb: Parser<B>, pc: Parser<C>): Parser<[A, B, C]>;
export function seq<A, B, C, D>(pa: Parser<A>, pb: Parser<B>, pc: Parser<C>, pd: Parser<D>): Parser<[A, B, C, D]>;
export function seq(...ps: Array<Parser<unknown>>): Parser<unknown[]> {
  return (s, i, ex) => {
    let acc: Array<PRes<unknown[]>> = [{ v: [], i }];
    for (const p of ps) {
      const next: Array<PRes<unknown[]>> = [];
      for (const a of acc) {
        for (const r of p(s, a.i, ex)) next.push({ v: [...a.v, r.v], i: r.i });
      }
      acc = next;
      if (acc.length === 0) return [];
    }
    return acc;
  };
}

export function alt<T>(...ps: Array<Parser<T>>): Parser<T> {
  return (s, i, ex) => ps.flatMap((p) => p(s, i, ex));
}

export function opt<T>(p: Parser<T>): Parser<T | null> {
  return (s, i, ex) => [{ v: null, i }, ...p(s, i, ex)];
}

export function many<T>(p: Parser<T>): Parser<T[]> {
  return (s, i, ex) => {
    const out: Array<PRes<T[]>> = [{ v: [], i }];
    let frontier: Array<PRes<T[]>> = out.slice();
    while (frontier.length > 0) {
      const next: Array<PRes<T[]>> = [];
      for (const f of frontier) {
        for (const r of p(s, f.i, ex)) {
          if (r.i > f.i) next.push({ v: [...f.v, r.v], i: r.i }); // progress guard
        }
      }
      out.push(...next);
      frontier = next;
    }
    return out;
  };
}

export function map<T, U>(p: Parser<T>, f: (v: T) => U): Parser<U> {
  return (s, i, ex) => p(s, i, ex).map((r) => ({ v: f(r.v), i: r.i }));
}

/** lazy reference for recursive grammars */
export function lazy<T>(get: () => Parser<T>): Parser<T> {
  return (s, i, ex) => get()(s, i, ex);
}
