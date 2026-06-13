import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(__dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "registry.json"), "utf8")) as {
  items: Array<{ name: string; files: Array<{ path: string }> }>;
};

describe("registry.json manifest", () => {
  test("every listed file exists on disk", () => {
    for (const item of manifest.items) {
      for (const f of item.files) {
        expect(existsSync(join(root, f.path)), `${item.name}: ${f.path}`).toBe(true);
      }
    }
  });

  test("declares the four v1 components", () => {
    expect(manifest.items.map((i) => i.name).sort()).toEqual([
      "calendar-grid", "date-input", "date-range-input", "time-field",
    ]);
  });
});
