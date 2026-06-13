import { describe, expect, test, vi } from "vitest";
import type { HolidayPack } from "../src/types.js";
import { createEngine } from "../src/engine.js";
import { createSuggest } from "../src/suggest.js";
import { createDateInputController } from "../src/controller.js";
import { suggestLocale } from "./fixtures/suggest-locale.js";

const pack: HolidayPack = {
  id: "p",
  entries: [{ id: "christmas", compute: () => ({ m: 11, d: 25 }), names: { test: ["christmas"] } }],
};
const now = () => new Date("2026-06-12T08:00:00Z"); // Fri
function make(opts: Partial<Parameters<typeof createDateInputController>[0]> = {}) {
  const engine = createEngine({ locale: suggestLocale, holidays: [pack] });
  const suggest = createSuggest({ locale: suggestLocale, holidays: [pack] });
  return createDateInputController({ engine, suggest, timeZone: "Asia/Almaty", now, ...opts });
}

describe("controller — input, phase, value", () => {
  test("starts EMPTY with a stable snapshot", () => {
    const c = make();
    const s = c.getState();
    expect(s.phase).toBe("EMPTY");
    expect(s.rawInput).toBe("");
    expect(s.value).toBe("");
    expect(s.suggestions).toEqual([]);
    expect(c.getState()).toBe(s); // identity stable until a mutation
  });

  test("typing a partial enters TYPING with suggestions + ghost", () => {
    const c = make();
    c.setInput("tom");
    const s = c.getState();
    expect(s.phase).toBe("TYPING"); // "tom" is not yet a parseable date
    expect(s.suggestions[0]!.text).toBe("tomorrow");
    expect(s.ghostText).toBe("orrow");
    expect(s.activeSuggestionIndex).toBe(0);
    expect(s.isOpen).toBe(true);
  });

  test("a complete date enters PARSED and exposes a wire value on commit", () => {
    const c = make();
    c.setInput("tomorrow");
    expect(c.getState().phase).toBe("PARSED");
    expect(c.getState().candidates[0]!.start.date).toBe("2026-06-13");
  });

  test("a dangling connector enters RANGE_BUILDING", () => {
    const c = make();
    c.setInput("tomorrow to");
    expect(c.getState().phase).toBe("RANGE_BUILDING");
  });

  test("date-only wire value vs range", () => {
    const c = make();
    c.setInput("tomorrow");
    c.commit();
    expect(c.getState().value).toBe("2026-06-13");
    c.setInput("tomorrow to weekend");
    c.commit();
    expect(c.getState().value).toBe("2026-06-13/2026-06-14");
  });

  test("enableTime emits ISO instants", () => {
    const c = make({ enableTime: true });
    c.setInput("tomorrow");
    c.commit();
    expect(c.getState().value).toMatch(/^2026-06-1\dT\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("clear resets and fires onClear", () => {
    const onClear = vi.fn();
    const c = make({ onClear });
    c.setInput("tomorrow");
    c.clear();
    expect(onClear).toHaveBeenCalledOnce();
    expect(c.getState().phase).toBe("EMPTY");
    expect(c.getState().value).toBe("");
  });

  test("subscribe + onChange fire on mutation, unsubscribe stops them", () => {
    const onChange = vi.fn();
    const c = make({ onChange });
    const listener = vi.fn();
    const off = c.subscribe(listener);
    c.setInput("tom");
    expect(listener).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    off();
    c.setInput("tomorrow");
    expect(listener).toHaveBeenCalledOnce(); // no more after unsubscribe
  });

  test("no suggest engine ⇒ no suggestions, parsing still works", () => {
    const engine = createEngine({ locale: suggestLocale, holidays: [pack] });
    const c = createDateInputController({ engine, timeZone: "Asia/Almaty", now });
    c.setInput("tomorrow");
    expect(c.getState().suggestions).toEqual([]);
    expect(c.getState().phase).toBe("PARSED");
  });
});

describe("controller — navigation, commit, ambiguity, keymap", () => {
  test("cycleSuggestion wraps and Tab accepts the ghost", () => {
    const c = make();
    c.setInput("next w"); // "next week", "next weekend", "next wednesday", ...
    expect(c.getState().activeSuggestionIndex).toBe(0);
    c.cycleSuggestion(1);
    expect(c.getState().activeSuggestionIndex).toBe(1);
    c.cycleSuggestion(-1);
    expect(c.getState().activeSuggestionIndex).toBe(0);
    expect(c.keymap("Tab")).toBe(true);
    expect(c.getState().rawInput).toBe("next week"); // ghost accepted
  });

  test("acceptSuggestion fills the input and re-parses", () => {
    const c = make();
    c.setInput("tom");
    c.acceptSuggestion(); // active = tomorrow
    expect(c.getState().rawInput).toBe("tomorrow");
    expect(c.getState().phase).toBe("PARSED");
  });

  test("Enter commits a parsed date and fires onCommit once", () => {
    const onCommit = vi.fn();
    const c = make({ onCommit });
    c.setInput("tomorrow");
    expect(c.keymap("Enter")).toBe(true);
    expect(c.getState().phase).toBe("RESOLVED");
    expect(onCommit).toHaveBeenCalledWith("2026-06-13", expect.objectContaining({ text: "tomorrow" }));
  });

  test("announcement uses formatAccessible (capitalized), not format", () => {
    const c = make();
    c.setInput("tomorrow");
    expect(c.getState().announcement).toBe("Tomorrow. Press Enter to select.");
    c.commit();
    expect(c.getState().announcement).toBe("Selected Tomorrow.");
  });

  test("resolveAmbiguity picks a candidate and commits it", () => {
    const c = make();
    c.setInput("3/4"); // MDY default → Mar 4; alt Apr 3
    const st = c.getState();
    expect(st.candidates.length).toBeGreaterThan(1);
    c.resolveAmbiguity(1);
    expect(c.getState().phase).toBe("RESOLVED");
    expect(c.getState().value).toBe(c.getState().candidates[1]!.start.date);
  });

  test("Escape closes the list, then clears", () => {
    const c = make();
    c.setInput("tom");
    expect(c.getState().isOpen).toBe(true);
    expect(c.keymap("Escape")).toBe(true); // closes list
    expect(c.getState().isOpen).toBe(false);
    c.commit();                            // value set... but "tom" has no candidate, so:
    c.setInput("tomorrow");
    c.commit();
    expect(c.keymap("Escape")).toBe(true); // value set → clears
    expect(c.getState().value).toBe("");
  });

  test("keymap returns false when it has nothing to do", () => {
    const c = make();
    expect(c.keymap("ArrowDown")).toBe(false); // no suggestions
    expect(c.keymap("Enter")).toBe(false);     // nothing parsed
    expect(c.keymap("Escape")).toBe(false);    // nothing open, no value
  });

  test("setContext re-parses with the new flags", () => {
    const c = make();
    c.setInput("tomorrow");
    c.setContext({ enableTime: true });
    c.commit();
    expect(c.getState().value).toMatch(/T\d{2}:\d{2}:\d{2}/); // now an instant
  });
});
