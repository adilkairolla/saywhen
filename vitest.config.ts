import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .var/ holds vendored reference libraries — never run their suites
    exclude: ["**/node_modules/**", ".var/**"],
  },
});
