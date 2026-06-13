import type { Candidate, Correction, Engine, ParseContext } from "./types.js";
import type { Suggestion, SuggestEngine } from "./suggest.js";
import { normalizeText } from "./normalize.js";

export type Phase = "EMPTY" | "TYPING" | "PARSED" | "RANGE_BUILDING" | "RESOLVED";
export type KeyName = "ArrowDown" | "ArrowUp" | "Tab" | "Enter" | "Escape";

export interface ControllerContextPatch {
  timeZone?: string;
  now?: () => Date;
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
}

export interface ControllerOptions {
  engine: Engine;
  /** optional — without it, suggestions and ghost text stay empty (spec §1.3, §6) */
  suggest?: SuggestEngine;
  timeZone: string; // IANA — validated by engine.parse on first use (spec §8)
  now?: () => Date; // injectable clock; defaults to () => new Date()
  weekStart?: 0 | 1;
  dateOrder?: "MDY" | "DMY" | "YMD";
  allowPast?: boolean;
  enableTime?: boolean;
  suggestionLimit?: number;
  onChange?: (state: ControllerState) => void;
  onCommit?: (value: string, candidate: Candidate) => void;
  onClear?: () => void;
}

export interface ControllerState {
  rawInput: string;
  phase: Phase;
  candidates: Candidate[];
  alternatives: Candidate[]; // the non-top candidates when ambiguous
  suggestions: Suggestion[];
  activeSuggestionIndex: number; // -1 when none active
  ghostText: string; // "" when none
  value: string; // committed wire value; "" when cleared
  announcement: string; // pre-localized screen-reader string
  corrections: Correction[];
  isOpen: boolean; // suggestion list visibility (drives aria-expanded)
}

export interface DateInputController {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;
  setInput(text: string): void;
  commit(): void;
  acceptSuggestion(index?: number): void;
  cycleSuggestion(delta: 1 | -1): void;
  resolveAmbiguity(candidateIndex: number): void;
  clear(): void;
  setContext(patch: ControllerContextPatch): void;
  keymap(key: KeyName): boolean;
}

function wireValue(c: Candidate, enableTime: boolean): string {
  if (enableTime) return c.isRange ? `${c.start.utcIso}/${c.end.utcIso}` : c.start.utcIso;
  return c.isRange ? `${c.start.date}/${c.end.date}` : c.start.date;
}

export function createDateInputController(options: ControllerOptions): DateInputController {
  const { engine, suggest } = options;
  let timeZone = options.timeZone;
  let nowFn = options.now ?? (() => new Date());
  let weekStart = options.weekStart;
  let dateOrder = options.dateOrder;
  let allowPast = options.allowPast ?? false;
  let enableTime = options.enableTime ?? false;
  const limit = options.suggestionLimit ?? 5;

  let rawInput = "";
  let candidates: Candidate[] = [];
  let alternatives: Candidate[] = [];
  let suggestions: Suggestion[] = [];
  let corrections: Correction[] = [];
  let activeSuggestionIndex = -1;
  let chosenIndex = 0;
  let rangeMode = false;
  let committed = false;
  let committedCandidate: Candidate | null = null;
  let value = "";
  let isOpen = false;

  const listeners = new Set<() => void>();

  function parseCtx(): ParseContext {
    return {
      now: nowFn(),
      timeZone,
      allowPast,
      enableTime,
      ...(weekStart !== undefined ? { weekStart } : {}),
      ...(dateOrder !== undefined ? { dateOrder } : {}),
    };
  }

  function runParse(): void {
    const ctx = parseCtx();
    const result = engine.parse(rawInput, ctx);
    candidates = result.candidates;
    corrections = result.corrections;
    chosenIndex = 0;
    alternatives = result.status === "ambiguous" ? candidates.slice(1) : [];
    const s =
      suggest && rawInput.trim() !== ""
        ? suggest.suggest(rawInput, { ...ctx, limit })
        : { suggestions: [] as Suggestion[], ghost: null, rangeMode: false };
    suggestions = s.suggestions;
    rangeMode = s.rangeMode;
    if (activeSuggestionIndex >= suggestions.length) activeSuggestionIndex = suggestions.length - 1;
  }

  function phaseNow(): Phase {
    if (committed) return "RESOLVED";
    if (rawInput.trim() === "") return "EMPTY";
    if (candidates.length > 0) return "PARSED";
    if (rangeMode) return "RANGE_BUILDING";
    return "TYPING";
  }

  function activeSuggestion(): Suggestion | undefined {
    return activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] : suggestions[0];
  }

  function ghostNow(): string {
    const a = activeSuggestion();
    if (!a) return "";
    const input = normalizeText(rawInput).trim();
    return input !== "" && a.text.length > input.length && a.text.startsWith(input)
      ? a.text.slice(input.length)
      : "";
  }

  function announce(phase: Phase): string {
    if (phase === "RESOLVED") {
      return committedCandidate
        ? `Selected ${engine.formatAccessible(committedCandidate.expr, { now: nowFn(), timeZone })}.`
        : "Cleared.";
    }
    if (phase === "PARSED") {
      const c = candidates[chosenIndex] ?? candidates[0]!;
      const text = engine.formatAccessible(c.expr, { now: nowFn(), timeZone });
      return alternatives.length > 0
        ? `${candidates.length} possible dates. ${text}. Use arrow keys to review alternatives.`
        : `${text}. Press Enter to select.`;
    }
    if (phase === "RANGE_BUILDING") return `Building a date range. ${suggestions.length} options.`;
    if (phase === "TYPING") {
      if (suggestions.length === 0) return "No matching date.";
      const a = activeSuggestion();
      return `${suggestions.length} suggestions.${a ? ` ${a.text} highlighted.` : ""}`;
    }
    return "";
  }

  function build(): ControllerState {
    const phase = phaseNow();
    return {
      rawInput,
      phase,
      candidates,
      alternatives,
      suggestions,
      activeSuggestionIndex,
      ghostText: ghostNow(),
      value,
      announcement: announce(phase),
      corrections,
      isOpen: isOpen && !committed && suggestions.length > 0,
    };
  }

  let snapshot: ControllerState = build();

  function notify(): void {
    snapshot = build();
    options.onChange?.(snapshot);
    for (const l of listeners) l();
  }

  function setInput(text: string): void {
    rawInput = text;
    committed = false;
    committedCandidate = null;
    isOpen = true;
    activeSuggestionIndex = -1;
    runParse();
    if (suggestions.length > 0) activeSuggestionIndex = 0;
    notify();
  }

  function clear(): void {
    rawInput = "";
    candidates = [];
    alternatives = [];
    suggestions = [];
    corrections = [];
    activeSuggestionIndex = -1;
    chosenIndex = 0;
    rangeMode = false;
    committed = false;
    committedCandidate = null;
    value = "";
    isOpen = false;
    notify();
    options.onClear?.();
  }

  function commit(): void {
    const c = candidates[chosenIndex] ?? candidates[0];
    if (!c) return;
    value = wireValue(c, enableTime);
    rawInput = c.text;
    committedCandidate = c;
    committed = true;
    isOpen = false;
    activeSuggestionIndex = -1;
    notify();
    options.onCommit?.(value, c);
  }
  function acceptSuggestion(index?: number): void {
    // Task 4
    void index;
  }
  function cycleSuggestion(delta: 1 | -1): void {
    // Task 4
    void delta;
  }
  function resolveAmbiguity(candidateIndex: number): void {
    // Task 4
    void candidateIndex;
  }
  function setContext(patch: ControllerContextPatch): void {
    // Task 4
    void patch;
  }
  function keymap(key: KeyName): boolean {
    // Task 4
    void key;
    return false;
  }

  return {
    getState: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setInput,
    commit,
    acceptSuggestion,
    cycleSuggestion,
    resolveAmbiguity,
    clear,
    setContext,
    keymap,
  };
}

export { getMonthGrid, clampTime, type MonthCell } from "./calendar-grid.js";
