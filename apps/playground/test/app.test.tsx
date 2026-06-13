// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

afterEach(cleanup);

describe("playground App", () => {
  test("mounts a working date input", () => {
    render(<App />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "tomorrow" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("committed").textContent).toBe("2026-06-13");
  });

  test("switching locale re-renders in Russian", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /русский/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "за" } });
    expect(screen.getByText("втра")).toBeDefined(); // ghost of "завтра"
  });

  test("switching to Kazakh re-renders in Cyrillic", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /қазақша/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ер" } });
    expect(screen.getByText("тең")).toBeDefined(); // ghost of "ертең"
  });

  test("Kazakh script sub-toggle switches canonical output to Latin", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /қазақша/i }));
    fireEvent.click(screen.getByRole("button", { name: /latyn/i }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "er" } });
    expect(screen.getByText("teñ")).toBeDefined(); // ghost of "erteñ" = cyrToLat("ертең")
  });
});
