import type { Anchor, DateExpr, PeriodRef, Rel } from "./types.js";
import {
  addDays, addMinutes, addMonths, addYears, compareWallDate, daysInMonth,
  endOfMonth, startOfMonth, startOfWeek, utcToWall, weekdayOf, type Wall,
} from "./zoned-date.js";

export interface ResolveOptions {
  now: Date;
  timeZone: string;
  weekStart: 0 | 1;
  allowPast: boolean;
  holidays?: Map<string, (year: number) => { m: number; d: number } | null>;
}

export interface Resolved {
  start: Wall;
  end: Wall; // inclusive; === start for points
  hasExplicitTime: boolean;
}

export type ResolveOutcome = { ok: true; value: Resolved } | { ok: false; error: string };

interface Ctx {
  /** reference day for underspecified anchors; range ends re-anchor it to the range start */
  today: Wall; // 00:00 local
  /** the actual current day — never re-anchored; "now"/relday anchors resolve from here */
  clockToday: Wall;
  weekStart: 0 | 1;
  allowPast: boolean;
  holidays: NonNullable<ResolveOptions["holidays"]>;
}

export function resolveExpr(expr: DateExpr, opts: ResolveOptions): ResolveOutcome {
  const nowWall = utcToWall(opts.now, opts.timeZone);
  const today: Wall = { ...nowWall, h: 0, mi: 0 };
  const ctx: Ctx = {
    today,
    clockToday: today,
    weekStart: opts.weekStart,
    allowPast: opts.allowPast,
    holidays: opts.holidays ?? new Map(),
  };
  try {
    return { ok: true, value: rec(expr, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function rec(expr: DateExpr, ctx: Ctx): Resolved {
  switch (expr.type) {
    case "anchor":
      return resolveAnchor(expr.anchor, ctx);

    case "offset": {
      const base = rec(expr.base, ctx);
      const n = expr.n * expr.dir;
      const shift = (w: Wall): Wall => {
        switch (expr.unit) {
          case "day": return addDays(w, n);
          case "week": return addDays(w, n * 7);
          case "month": return addMonths(w, n);
          case "year": return addYears(w, n);
          case "hour": return addMinutes(w, n * 60);
          case "minute": return addMinutes(w, n);
        }
      };
      const timed = expr.unit === "hour" || expr.unit === "minute";
      return {
        start: shift(base.start),
        end: shift(base.end),
        hasExplicitTime: base.hasExplicitTime || timed,
      };
    }

    case "range": {
      const start = rec(expr.start, ctx);
      // end is interpreted relative to where the range starts
      const end = rec(expr.end, { ...ctx, today: { ...start.start, h: 0, mi: 0 } });
      if (compareWallDate(end.end, start.start) < 0) throw new Error("Range ends before it starts.");
      return {
        start: start.start,
        end: end.end,
        hasExplicitTime: start.hasExplicitTime || end.hasExplicitTime,
      };
    }

    case "period":
      return resolvePeriod(expr.period, expr.which, ctx);

    case "boundary": {
      const of = rec(expr.of, ctx);
      const w = expr.edge === "start" ? of.start : of.end;
      return { start: w, end: w, hasExplicitTime: false };
    }

    case "withTime": {
      const base = rec(expr.base, ctx);
      if (compareWallDate(base.start, base.end) !== 0) {
        throw new Error("Cannot attach a time of day to a range.");
      }
      const w: Wall = { ...base.start, h: expr.time.h, mi: expr.time.m };
      return { start: w, end: w, hasExplicitTime: true };
    }
  }
}

function point(w: Wall): Resolved {
  return { start: w, end: w, hasExplicitTime: false };
}

function resolveAnchor(a: Anchor, ctx: Ctx): Resolved {
  switch (a.kind) {
    case "now":
      return point(ctx.clockToday);

    case "relday":
      return point(addDays(ctx.clockToday, a.offset));

    case "weekday": {
      const inThisWeek = addDays(
        startOfWeek(ctx.today, ctx.weekStart),
        (a.day - ctx.weekStart + 7) % 7,
      );
      if (a.which === undefined) {
        return point(addDays(ctx.today, (a.day - weekdayOf(ctx.today) + 7) % 7));
      }
      if (a.which === "this") return point(inThisWeek);
      if (a.which === "next") return point(addDays(inThisWeek, 7));
      return point(addDays(inThisWeek, -7));
    }

    case "calendar":
      return resolveCalendar(a, ctx);

    case "holiday": {
      const compute = ctx.holidays.get(a.id);
      if (!compute) throw new Error(`Unknown holiday "${a.id}".`);
      if (a.year !== undefined) {
        const md = compute(a.year);
        if (!md) throw new Error(`No date for holiday "${a.id}" in ${a.year}.`);
        return point({ y: a.year, m: md.m, d: md.d, h: 0, mi: 0 });
      }
      for (const y of [ctx.today.y, ctx.today.y + 1]) {
        const md = compute(y);
        if (md) {
          const w: Wall = { y, m: md.m, d: md.d, h: 0, mi: 0 };
          if (compareWallDate(w, ctx.today) >= 0) return point(w);
        }
      }
      throw new Error(`No upcoming date for holiday "${a.id}".`);
    }
  }
}

function resolveCalendar(a: Extract<Anchor, { kind: "calendar" }>, ctx: Ctx): Resolved {
  const { y, m, d } = a;

  if (m !== undefined && d !== undefined) {
    const tryYear = (yy: number): Wall => {
      if (d > daysInMonth(yy, m)) throw new Error(`Invalid date: that month has no day ${d}.`);
      return { y: yy, m, d, h: 0, mi: 0 };
    };
    if (y !== undefined) return point(tryYear(y));
    const thisYear = tryYear(ctx.today.y);
    if (!ctx.allowPast && compareWallDate(thisYear, ctx.today) < 0) return point(tryYear(ctx.today.y + 1));
    return point(thisYear);
  }

  if (d !== undefined) {
    const cur: Wall = { y: ctx.today.y, m: ctx.today.m, d, h: 0, mi: 0 };
    const valid = d <= daysInMonth(cur.y, cur.m);
    if (valid && (ctx.allowPast || compareWallDate(cur, ctx.today) >= 0)) return point(cur);
    const next = addMonths({ ...ctx.today, d: 1 }, 1);
    if (d > daysInMonth(next.y, next.m)) throw new Error(`No day ${d} in the coming month.`);
    return point({ y: next.y, m: next.m, d, h: 0, mi: 0 });
  }

  if (m !== undefined) {
    let yy = y ?? ctx.today.y;
    if (y === undefined && !ctx.allowPast && m < ctx.today.m) yy += 1;
    const start: Wall = { y: yy, m, d: 1, h: 0, mi: 0 };
    return { start, end: endOfMonth(start), hasExplicitTime: false };
  }

  if (y !== undefined) {
    return {
      start: { y, m: 0, d: 1, h: 0, mi: 0 },
      end: { y, m: 11, d: 31, h: 0, mi: 0 },
      hasExplicitTime: false,
    };
  }

  throw new Error("Empty calendar anchor.");
}

function resolvePeriod(p: PeriodRef, which: Rel, ctx: Ctx): Resolved {
  const off = which === "this" ? 0 : which === "next" ? 1 : -1;

  switch (p.kind) {
    case "week": {
      const start = addDays(startOfWeek(ctx.today, ctx.weekStart), off * 7);
      return { start, end: addDays(start, 6), hasExplicitTime: false };
    }
    case "month": {
      const start = startOfMonth(addMonths(ctx.today, off));
      return { start, end: endOfMonth(start), hasExplicitTime: false };
    }
    case "year": {
      const y = ctx.today.y + off;
      return {
        start: { y, m: 0, d: 1, h: 0, mi: 0 },
        end: { y, m: 11, d: 31, h: 0, mi: 0 },
        hasExplicitTime: false,
      };
    }
    case "weekend": {
      const weekBase = addDays(startOfWeek(ctx.today, ctx.weekStart), off * 7);
      const sat = addDays(weekBase, (6 - weekdayOf(weekBase) + 7) % 7);
      return { start: sat, end: addDays(sat, 1), hasExplicitTime: false };
    }
    case "quarter": {
      let y = ctx.today.y;
      let q: number;
      if (p.q !== undefined) {
        q = p.q - 1;
        y += off;
      } else {
        q = Math.floor(ctx.today.m / 3) + off;
        y += Math.floor(q / 4);
        q = ((q % 4) + 4) % 4;
      }
      return {
        start: { y, m: q * 3, d: 1, h: 0, mi: 0 },
        end: endOfMonth({ y, m: q * 3 + 2, d: 1, h: 0, mi: 0 }),
        hasExplicitTime: false,
      };
    }
    case "season": {
      // meteorological: 0 spring Mar–May, 1 summer, 2 autumn, 3 winter Dec–Feb
      const curSeason = ctx.today.m === 11 || ctx.today.m <= 1 ? 3 : Math.floor((ctx.today.m - 2) / 3);
      let s: number;
      let y = ctx.today.y;
      if (p.s !== undefined) {
        s = p.s;
        y += off;
      } else {
        if (curSeason === 3 && ctx.today.m <= 1) y -= 1; // current winter started last December
        s = curSeason + off;
        y += Math.floor(s / 4);
        s = ((s % 4) + 4) % 4;
      }
      if (s === 3) {
        return {
          start: { y, m: 11, d: 1, h: 0, mi: 0 },
          end: endOfMonth({ y: y + 1, m: 1, d: 1, h: 0, mi: 0 }),
          hasExplicitTime: false,
        };
      }
      return {
        start: { y, m: 2 + s * 3, d: 1, h: 0, mi: 0 },
        end: endOfMonth({ y, m: 4 + s * 3, d: 1, h: 0, mi: 0 }),
        hasExplicitTime: false,
      };
    }
  }
}
