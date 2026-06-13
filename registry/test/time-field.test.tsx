// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimeField } from "../components/time-field.js";

afterEach(cleanup);

describe("TimeField", () => {
  test("clamps out-of-range entries via clampTime", () => {
    const onChange = vi.fn();
    render(<TimeField value={{ h: 9, m: 0 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledWith({ h: 23, m: 0 });
  });
});
