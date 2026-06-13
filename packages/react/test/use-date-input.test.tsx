// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { useDateInput } from "../src/index.js";

afterEach(cleanup);

const engine = createEngine({ locale: en });
const suggest = createSuggest({ locale: en });

function Combo() {
  const d = useDateInput({
    engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z"),
  });
  return (
    <div>
      <label htmlFor={d.getInputProps().id}>Date</label>
      <input {...d.getInputProps()} />
      <ul {...d.getListboxProps()}>
        {d.state.suggestions.map((s, i) => (
          <li key={s.text} {...d.getOptionProps(i)}>{s.text}</li>
        ))}
      </ul>
    </div>
  );
}

describe("useDateInput", () => {
  test("typing shows suggestions and opens the listbox", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tom" } });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("tomorrow")).toBeDefined();
  });

  test("ArrowDown moves aria-activedescendant", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "next w" } });
    const first = input.getAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBe(first);
  });

  test("Enter on a parsed date commits the canonical text", () => {
    render(<Combo />);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("tomorrow");
  });

  test("no axe violations while open", async () => {
    const { container } = render(<Combo />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
