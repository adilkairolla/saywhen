// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { CalendarGrid } from "../components/calendar-grid.js";

afterEach(cleanup);

describe("CalendarGrid", () => {
  test("renders the month and selects a day", () => {
    const onSelect = vi.fn();
    render(<CalendarGrid year={2026} month={5} weekStart={0} onSelect={onSelect} />); // June 2026
    const cell = screen.getByRole("button", { name: "15" });
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith("2026-06-15");
  });

  test("no axe violations", async () => {
    const { container } = render(<CalendarGrid year={2026} month={5} weekStart={0} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
