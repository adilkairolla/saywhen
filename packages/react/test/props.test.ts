import { describe, expect, test } from "vitest";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { createDateInputController } from "@saywhen/core/controller";
import { en } from "@saywhen/locale-en";
import { makeGhostProps, makeInputProps, makeListboxProps, makeOptionProps } from "../src/props.js";

const ids = { input: "x-input", listbox: "x-listbox", option: (i: number) => `x-option-${i}` };
function controller() {
  const engine = createEngine({ locale: en });
  const suggest = createSuggest({ locale: en });
  return createDateInputController({
    engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z"),
  });
}

describe("APG combobox prop getters", () => {
  test("input props carry the combobox ARIA and the active descendant", () => {
    const c = controller();
    c.setInput("tom");
    const p = makeInputProps(c.getState(), c, ids);
    expect(p.role).toBe("combobox");
    expect(p["aria-expanded"]).toBe(true);
    expect(p["aria-controls"]).toBe("x-listbox");
    expect(p["aria-autocomplete"]).toBe("list");
    expect(p["aria-activedescendant"]).toBe("x-option-0");
    expect(p.value).toBe("tom");
  });

  test("onChange drives the controller", () => {
    const c = controller();
    const p = makeInputProps(c.getState(), c, ids);
    p.onChange({ target: { value: "tomorrow" } } as never);
    expect(c.getState().rawInput).toBe("tomorrow");
  });

  test("onKeyDown delegates to keymap and preventDefaults when handled", () => {
    const c = controller();
    c.setInput("next w"); // 4 suggestions, so ArrowDown moves 0 → 1 (deviation: "tom" yields only 1)
    let prevented = false;
    const ev = { key: "ArrowDown", preventDefault: () => { prevented = true; } };
    makeInputProps(c.getState(), c, ids).onKeyDown(ev as never);
    expect(prevented).toBe(true);
    expect(c.getState().activeSuggestionIndex).toBe(1);
  });

  test("listbox + option + ghost props", () => {
    const c = controller();
    c.setInput("tom");
    expect(makeListboxProps(ids)).toEqual({ id: "x-listbox", role: "listbox" });
    const op = makeOptionProps(c.getState(), c, ids, 0);
    expect(op.role).toBe("option");
    expect(op.id).toBe("x-option-0");
    expect(op["aria-selected"]).toBe(true);
    expect(makeGhostProps(c.getState())).toEqual({ "aria-hidden": true, children: "orrow" });
  });

  test("option onMouseDown accepts the suggestion (and blocks blur)", () => {
    const c = controller();
    c.setInput("tom");
    let prevented = false;
    makeOptionProps(c.getState(), c, ids, 0).onMouseDown({ preventDefault: () => { prevented = true; } } as never);
    expect(prevented).toBe(true);
    expect(c.getState().rawInput).toBe("tomorrow");
  });
});
