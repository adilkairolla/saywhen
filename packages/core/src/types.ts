// ---------- units & periods ----------

export type Unit = "day" | "week" | "month" | "year" | "hour" | "minute";

export type PeriodRef =
  | { kind: "week" }
  | { kind: "month" }
  | { kind: "year" }
  | { kind: "weekend" }
  | { kind: "quarter"; q?: 1 | 2 | 3 | 4 }
  | { kind: "season"; s?: 0 | 1 | 2 | 3 }; // 0 spring, 1 summer, 2 autumn, 3 winter

// ---------- semantic tokens (spec §4.2) ----------

export type Rel = "this" | "next" | "last";

export type SemPayload =
  | { kind: "WEEKDAY"; day: number }              // 0 Sunday … 6 Saturday
  | { kind: "MONTH"; month: number }              // 0 January … 11 December
  | { kind: "NUMBER"; n: number; ordinal?: boolean }
  | { kind: "YEAR"; year: number }
  | { kind: "TIME"; h: number; m: number }        // 24h wall clock
  | { kind: "MERIDIEM"; value: "am" | "pm" }
  | { kind: "RELDAY"; offset: number }            // today 0, tomorrow +1, …
  | { kind: "REL"; which: Rel }
  | { kind: "UNIT"; unit: Unit }
  | { kind: "OP"; op: 1 | -1 }
  | { kind: "DIRECTION"; dir: "before" | "after" | "from" | "ago" | "in" }
  | { kind: "CONNECTOR" }
  | { kind: "BOUNDARY"; edge: "start" | "end" }
  | { kind: "PERIOD"; period: PeriodRef }
  | { kind: "HOLIDAY"; id: string }
  | { kind: "FILLER" }
  | { kind: "LITERAL" };

export type SemKind = SemPayload["kind"];

export interface TokenMeta {
  span: [number, number]; // into the NORMALIZED input string
  source: string;         // the normalized surface text
  confidence: number;     // 1.0; lowered by typo correction
}

export type SemToken = SemPayload & TokenMeta;

// ---------- AST (spec §4.3) — parsed, UNRESOLVED ----------

export type Anchor =
  | { kind: "now" }
  | { kind: "relday"; offset: number }
  | { kind: "weekday"; day: number; which?: Rel }
  | { kind: "calendar"; y?: number; m?: number; d?: number }
  | { kind: "holiday"; id: string; year?: number };

export type DateExpr =
  | { type: "anchor"; anchor: Anchor }
  | { type: "offset"; base: DateExpr; n: number; unit: Unit; dir: 1 | -1 }
  | { type: "range"; start: DateExpr; end: DateExpr }
  | { type: "period"; period: PeriodRef; which: Rel }
  | { type: "boundary"; of: DateExpr; edge: "start" | "end" }
  | { type: "withTime"; base: DateExpr; time: { h: number; m: number } };

// ---------- locale contract (spec §4.1) ----------

export interface RawToken {
  text: string;           // normalized surface
  span: [number, number]; // into the normalized input
}

/** normalized surface form → semantic payload(s) */
export type Lexicon = Record<string, SemPayload[]>;

export interface KeyboardLayout {
  /** physical rows, e.g. ["qwertyuiop", "asdfghjkl", "zxcvbnm"] */
  rows: string[];
}

export interface FormatOptions {
  now: Date;
  timeZone: string;
}

export interface LocaleRule {
  name: string;
  /** extension point this rule is injected at (spec §5.3) */
  at: "anchor" | "expression";
  /** try to match tokens starting at i; return null or the parse */
  match(toks: SemToken[], i: number): { expr: DateExpr; next: number } | null;
}

export interface LocaleAdapter {
  id: string;
  tokenize(text: string): RawToken[];
  lexicon: Lexicon;
  parseNumber(words: string[]): number | null;
  rules?: LocaleRule[];
  format(expr: DateExpr, opts: FormatOptions): string;
  formatAccessible(expr: DateExpr, opts: FormatOptions): string;
  keyboard?: KeyboardLayout;
  /** curated typo/abbreviation map, runs before edit-distance (spec §5.2) */
  typoMap?: Record<string, string>;
  defaults: { weekStart: 0 | 1; dateOrder: "MDY" | "DMY" | "YMD" };
}

// ---------- holiday pack contract (spec §4.5) ----------

export interface HolidayPack {
  id: string;
  entries: Array<{
    id: string;
    compute(year: number): { m: number; d: number } | null;
    names: Record<string, string[]>;
  }>;
}

// ---------- engine API (spec §4.4) ----------

export interface ParseContext {
  now: Date;
  timeZone: string;
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
}

export interface Correction {
  span: [number, number];
  from: string;
  to: string;
}

export interface Candidate {
  expr: DateExpr;
  start: { utcIso: string; date: string };
  end: { utcIso: string; date: string };
  isRange: boolean;
  hasExplicitTime: boolean;
  confidence: number;
  text: string;
}

export type ParseStatus = "valid" | "ambiguous" | "invalid" | "idle";

export interface ParseResult {
  status: ParseStatus;
  candidates: Candidate[];
  corrections: Correction[];
  errors: string[];
}

export interface Engine {
  locale: LocaleAdapter;
  parse(text: string, ctx: ParseContext): ParseResult;
}
