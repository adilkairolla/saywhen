export interface Wall {
  y: number;
  m: number; // 0-based
  d: number;
  h: number;
  mi: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    getDtf(timeZone);
  } catch {
    throw new Error(
      `Invalid IANA time zone: "${timeZone}". Use a name like "America/New_York".`,
    );
  }
}

export function utcToWall(date: Date, timeZone: string): Wall {
  const parts = getDtf(timeZone).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  const h = get("hour");
  return {
    y: get("year"),
    m: get("month") - 1,
    d: get("day"),
    h: h === 24 ? 0 : h, // some ICU versions render midnight as 24
    mi: get("minute"),
  };
}

/** Offset in minutes east of UTC at the given instant. */
export function offsetAt(date: Date, timeZone: string): number {
  const w = utcToWall(date, timeZone);
  const asUtc = Date.UTC(w.y, w.m, w.d, w.h, w.mi, date.getUTCSeconds(), date.getUTCMilliseconds());
  return Math.round((asUtc - date.getTime()) / 60_000);
}

function sameWall(a: Wall, b: Wall): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d && a.h === b.h && a.mi === b.mi;
}

/**
 * Wall time in a zone → UTC instant.
 * Gap (nonexistent local time): shift forward by the gap size.
 * Overlap (repeated local time): take the earlier instant.
 */
export function wallToUtc(w: Wall, timeZone: string): Date {
  const utcGuess = Date.UTC(w.y, w.m, w.d, w.h, w.mi);
  // Probe offsets a day before/after the guess: any transition near the
  // target produces two distinct candidate offsets.
  const o1 = offsetAt(new Date(utcGuess - 86_400_000), timeZone);
  const o2 = offsetAt(new Date(utcGuess + 86_400_000), timeZone);
  const c1 = new Date(utcGuess - o1 * 60_000);
  const c2 = new Date(utcGuess - o2 * 60_000);
  const ok1 = sameWall(utcToWall(c1, timeZone), w);
  const ok2 = sameWall(utcToWall(c2, timeZone), w);
  if (ok1 && ok2) return c1.getTime() <= c2.getTime() ? c1 : c2; // overlap → earlier
  if (ok1) return c1;
  if (ok2) return c2;
  // Gap: the pre-transition offset is the smaller one; using it lands just
  // past the gap, i.e. the wall time shifted forward.
  return new Date(utcGuess - Math.min(o1, o2) * 60_000);
}
