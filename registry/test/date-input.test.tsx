// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { createEngine } from "@saywhen/core";
import { createSuggest } from "@saywhen/core/suggest";
import { en } from "@saywhen/locale-en";
import { DateInput } from "../components/date-input.js";
import { DateRangeInput } from "../components/date-range-input.js";

afterEach(cleanup);

const engine = createEngine({ locale: en });
const suggest = createSuggest({ locale: en });
const common = { engine, suggest, timeZone: "America/New_York", now: () => new Date("2026-06-12T08:00:00Z") };

describe("DateInput component", () => {
  test("renders a combobox and posts the wire value via a hidden input", () => {
    const { container } = render(<DateInput {...common} name="when" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.blur(input); // commit on blur
    const hidden = container.querySelector('input[type="hidden"][name="when"]') as HTMLInputElement;
    expect(hidden.value).toBe("2026-06-13");
  });

  test("ghost overlay shows the completion", () => {
    render(<DateInput {...common} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    expect(screen.getByText("orrow")).toBeDefined();
  });

  test("no axe violations", async () => {
    const { container } = render(<DateInput {...common} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tom" } });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

describe("DateRangeInput component", () => {
  test("is a range-oriented preset of DateInput", () => {
    render(<DateRangeInput {...common} />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });
});
